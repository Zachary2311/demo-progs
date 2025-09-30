import { SlashCommandBuilder, EmbedBuilder, bold } from 'discord.js';
import { saveGuildSettings } from './database.js';
import { guildSettingsCache } from './settingsCache.js';
import { cleanupDownload, extractBlueskyPostLinks, fetchBlueskyVideo } from './bluesky.js';
import { uploadToR2 } from './storage.js';

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
      contentType: download.videoInfo?.mimeType,
    });
    const response = buildMessagePayload({
      download,
      requestedBy: interaction.user.username,
      postUrl: url,
      videoUrl: upload.publicUrl,
      silent,
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
        contentType: download.videoInfo?.mimeType,
      });
      const payload = buildMessagePayload({
        download,
        requestedBy: message.author.username,
        postUrl: link.url,
        videoUrl: upload.publicUrl,
        silent: settings.silentMode,
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

function buildVideoEmbed(download, requestedBy, url) {
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

  return embed;
}

function buildMessagePayload({ download, requestedBy, postUrl, videoUrl, silent }) {
  const base = {
    content: videoUrl,
    allowedMentions: { parse: [] },
  };

  if (silent) {
    return base;
  }

  const embed = buildVideoEmbed(download, requestedBy, postUrl);
  return { ...base, embeds: [embed] };
}
