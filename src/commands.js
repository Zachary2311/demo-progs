import {
  SlashCommandBuilder,
  EmbedBuilder,
  bold,
  AttachmentBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} from 'discord.js';
import { saveGuildSettings } from './database.js';
import { guildSettingsCache } from './settingsCache.js';
import { cleanupDownload, extractBlueskyPostLinks, fetchBlueskyVideo } from './bluesky.js';
import { uploadToR2 } from './storage.js';
import { config } from './config.js';

export const commandDefinitions = [
  new SlashCommandBuilder()
    .setName('bluesky-listener')
    .setDescription('Enable or disable automatic Bluesky video downloads for this server.')
    .addBooleanOption((option) =>
      option
        .setName('enabled')
        .setDescription('Enable automatic downloads when Bluesky links are posted.')
        .setRequired(true)
    )
    .addBooleanOption((option) =>
      option
        .setName('silent')
        .setDescription('Only post the video URL without embeds when downloads are posted.')
        .setRequired(false)
    ),
  new SlashCommandBuilder()
    .setName('bluesky-download')
    .setDescription('Download a video from a specific Bluesky post.')
    .addStringOption((option) =>
      option
        .setName('url')
        .setDescription('The Bluesky post URL to download the video from.')
        .setRequired(true)
    )
    .addBooleanOption((option) =>
      option
        .setName('silent')
        .setDescription('Only return the video URL without embeds.')
        .setRequired(false)
    ),
  new SlashCommandBuilder()
    .setName('bluesky-bulk')
    .setDescription('Download multiple Bluesky videos with a single command.')
    .addStringOption((option) =>
      option
        .setName('urls')
        .setDescription('Comma separated Bluesky post URLs.')
        .setRequired(true)
    )
    .addBooleanOption((option) =>
      option
        .setName('silent')
        .setDescription('Only return the video URLs without embeds.')
        .setRequired(false)
    ),
].map((builder) => builder.toJSON());

export async function handleCommandInteraction(interaction) {
  if (!interaction.inCachedGuild()) {
    await interaction.reply({
      content: 'This command can only be used within a server.',
      ephemeral: true,
    });
    return;
  }

  if (interaction.commandName === 'bluesky-listener') {
    await handleToggleCommand(interaction);
    return;
  }

  if (interaction.commandName === 'bluesky-download') {
    await handleDownloadCommand(interaction);
    return;
  }

  if (interaction.commandName === 'bluesky-bulk') {
    await handleBulkDownloadCommand(interaction);
  }
}

async function handleToggleCommand(interaction) {
  const enabled = interaction.options.getBoolean('enabled', true);
  const silent = interaction.options.getBoolean('silent');
  await interaction.deferReply({ ephemeral: true });
  const updated = await saveGuildSettings(interaction.guildId, {
    listenEnabled: enabled,
    silentMode: silent ?? undefined,
  });
  guildSettingsCache.set(interaction.guildId, updated);
  const embed = new EmbedBuilder()
    .setTitle('Bluesky listener updated')
    .setDescription(
      `Automatic downloads are now ${enabled ? bold('enabled') : bold('disabled')} for this server.\n` +
        `Silent mode is ${updated.silentMode ? bold('enabled') : bold('disabled')}.`
    )
    .setColor(enabled ? 0x2ecc71 : 0xe74c3c);
  await interaction.editReply({ embeds: [embed] });
}

async function handleDownloadCommand(interaction) {
  const url = interaction.options.getString('url', true);
  const silent = interaction.options.getBoolean('silent') ?? false;
  await interaction.deferReply({ ephemeral: false });
  let download;
  try {
    download = await fetchBlueskyVideo(url);
    const upload = await uploadToR2(download.filePath, {
      fileName: download.fileName,
      contentType: download.mimeType ?? download.videoInfo?.mimeType,
    });
    const attachFile = (download.fileSize ?? download.videoInfo?.size ?? 0) <= config.maxUploadBytes;
    const response = buildMessagePayload({
      download,
      requestedBy: interaction.user.username,
      postUrl: url,
      videoUrl: upload.publicUrl,
      silent,
      attachFile,
    });
    await interaction.editReply(response);
  } catch (error) {
    await interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setTitle('Unable to download video')
          .setDescription(error.message ?? 'An unexpected error occurred.')
          .setColor(0xe74c3c),
      ],
    });
  } finally {
    if (download?.cleanupDir) {
      await cleanupDownload(download.cleanupDir);
    }
  }
}

async function handleBulkDownloadCommand(interaction) {
  const urlsText = interaction.options.getString('urls', true);
  const silent = interaction.options.getBoolean('silent') ?? false;
  const matches = extractBlueskyPostLinks(urlsText);
  const uniqueLinks = [];
  const seen = new Set();
  for (const match of matches) {
    if (!seen.has(match.url)) {
      uniqueLinks.push(match);
      seen.add(match.url);
    }
  }

  if (!uniqueLinks.length) {
    await interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setTitle('No Bluesky links found')
          .setDescription('Provide a comma separated list of Bluesky post URLs to download.')
          .setColor(0xe74c3c),
      ],
      ephemeral: true,
    });
    return;
  }

  await interaction.deferReply({ ephemeral: false });

  const start = Date.now();
  const failures = [];
  let completed = 0;
  let successes = 0;

  await interaction.editReply({
    embeds: [
      buildBulkStatusEmbed({
        total: uniqueLinks.length,
        completed,
        successes,
        failures,
        start,
        silent,
        done: false,
      }),
    ],
  });

  for (const link of uniqueLinks) {
    let download;
    try {
      download = await fetchBlueskyVideo(link);
      const upload = await uploadToR2(download.filePath, {
        fileName: download.fileName,
        contentType: download.mimeType ?? download.videoInfo?.mimeType,
      });
      const attachFile = (download.fileSize ?? download.videoInfo?.size ?? 0) <= config.maxUploadBytes;
      const payload = buildMessagePayload({
        download,
        requestedBy: interaction.user.username,
        postUrl: link.url,
        videoUrl: upload.publicUrl,
        silent,
        attachFile,
      });
      await interaction.followUp(payload);
      successes += 1;
    } catch (error) {
      failures.push({ url: link.url, message: error.message ?? 'An unexpected error occurred.' });
      const errorEmbed = new EmbedBuilder()
        .setTitle('Bluesky download failed')
        .setDescription(`[Open post](${link.url})`)
        .addFields({ name: 'Error', value: error.message ?? 'An unexpected error occurred.' })
        .setColor(0xe67e22);
      await interaction.followUp({ embeds: [errorEmbed] });
    } finally {
      completed += 1;
      if (download?.cleanupDir) {
        await cleanupDownload(download.cleanupDir);
      }
      await interaction.editReply({
        embeds: [
          buildBulkStatusEmbed({
            total: uniqueLinks.length,
            completed,
            successes,
            failures,
            start,
            silent,
            done: completed === uniqueLinks.length,
          }),
        ],
      });
    }
  }
}

export async function handlePotentialBlueskyLinks(message) {
  if (!message.guild || message.author.bot) return;
  const settings = await guildSettingsCache.get(message.guildId);
  if (!settings.listenEnabled) return;

  const links = extractBlueskyPostLinks(message.content);
  if (!links.length) return;

  for (const link of links) {
    let download;
    try {
      download = await fetchBlueskyVideo(link);
      const upload = await uploadToR2(download.filePath, {
        fileName: download.fileName,
        contentType: download.mimeType ?? download.videoInfo?.mimeType,
      });
      const attachFile = (download.fileSize ?? download.videoInfo?.size ?? 0) <= config.maxUploadBytes;
      const payload = buildMessagePayload({
        download,
        requestedBy: message.author.username,
        postUrl: link.url,
        videoUrl: upload.publicUrl,
        silent: settings.silentMode,
        attachFile,
      });
      await message.channel.send(payload);
    } catch (error) {
      const embed = new EmbedBuilder()
        .setTitle('Bluesky download failed')
        .setDescription(error.message ?? 'An unexpected error occurred.')
        .setColor(0xe67e22);
      await message.channel.send({ embeds: [embed] });
    } finally {
      if (download?.cleanupDir) {
        await cleanupDownload(download.cleanupDir);
      }
    }
  }
}

function buildVideoEmbed(download, requestedBy, url, { fallbackOnly = false, videoUrl } = {}) {
  const { post, author } = download;
  const embed = new EmbedBuilder()
    .setTitle(`Video from ${author?.displayName ?? author?.handle ?? 'Bluesky'}`)
    .setDescription(post?.record?.text ?? 'Video attachment')
    .setURL(url)
    .setColor(0x3498db)
    .setTimestamp(new Date(post?.indexedAt ?? Date.now()));

  if (download.videoInfo?.thumbnail) {
    embed.setThumbnail(download.videoInfo.thumbnail);
  }

  if (requestedBy) {
    embed.setFooter({ text: `Requested by ${requestedBy}` });
  }

  if (fallbackOnly && videoUrl) {
    embed.addFields({
      name: 'Download link',
      value: `[Open video](${videoUrl}) (hosted via Cloudflare R2)`,
    });
  }

  return embed;
}

function buildMessagePayload({ download, requestedBy, postUrl, videoUrl, silent, attachFile = true }) {
  const components = [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setLabel('Download').setStyle(ButtonStyle.Link).setURL(videoUrl)
    ),
  ];

  const base = {
    components,
    allowedMentions: { parse: [] },
  };

  if (attachFile) {
    base.files = [new AttachmentBuilder(download.filePath).setName(download.fileName)];
  } else {
    base.content = videoUrl;
  }

  if (silent) {
    return base;
  }

  const embed = buildVideoEmbed(download, requestedBy, postUrl, {
    fallbackOnly: !attachFile,
    videoUrl,
  });
  return { ...base, embeds: [embed] };
}

function buildBulkStatusEmbed({ total, completed, successes, failures, start, silent, done }) {
  const durationSeconds = Math.max(0, (Date.now() - start) / 1000);
  const embed = new EmbedBuilder()
    .setTitle(done ? 'Bulk Bluesky download complete' : 'Bulk Bluesky download in progress')
    .setColor(done ? (failures.length ? 0xe67e22 : 0x2ecc71) : 0x3498db)
    .setDescription(
      `Processing ${total} link${total === 1 ? '' : 's'} in ${silent ? 'silent' : 'standard'} mode.`
    )
    .addFields(
      { name: 'Completed', value: `${completed}/${total}`, inline: true },
      { name: 'Succeeded', value: `${successes}`, inline: true },
      { name: 'Failed', value: `${failures.length}`, inline: true }
    )
    .addFields({ name: 'Elapsed', value: `${durationSeconds.toFixed(1)}s`, inline: true });

  if (failures.length) {
    const recent = failures.slice(-3).map((failure) => {
      const message = truncateForField(failure.message);
      return `• [Post](${failure.url}) — ${message}`;
    });
    embed.addFields({ name: 'Recent errors', value: recent.join('\n') });
  }

  return embed;
}

function truncateForField(text, maxLength = 256) {
  if (!text) return 'Unknown error';
  if (text.length <= maxLength) {
    return text;
  }
  return `${text.slice(0, maxLength - 1)}…`;
}
