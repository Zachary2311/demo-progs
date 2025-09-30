import { createReadStream } from 'fs';
import { SlashCommandBuilder, EmbedBuilder, AttachmentBuilder, bold } from 'discord.js';
import { setGuildListening } from './database.js';
import { guildSettingsCache } from './settingsCache.js';
import { cleanupDownload, extractBlueskyPostLinks, fetchBlueskyVideo } from './bluesky.js';

export const commandDefinitions = [
  new SlashCommandBuilder()
    .setName('bluesky-listener')
    .setDescription('Enable or disable automatic Bluesky video downloads for this server.')
    .addBooleanOption((option) =>
      option
        .setName('enabled')
        .setDescription('Enable automatic downloads when Bluesky links are posted.')
        .setRequired(true)
    ),
  new SlashCommandBuilder()
    .setName('bluesky-download')
    .setDescription('Download a video from a specific Bluesky post.')
    .addStringOption((option) =>
      option
        .setName('url')
        .setDescription('The Bluesky post URL to download the video from.')
        .setRequired(true)
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
  await interaction.deferReply({ ephemeral: true });
  await setGuildListening(interaction.guildId, enabled);
  guildSettingsCache.set(interaction.guildId, enabled);
  const embed = new EmbedBuilder()
    .setTitle('Bluesky listener updated')
    .setDescription(`Automatic downloads are now ${enabled ? bold('enabled') : bold('disabled')} for this server.`)
    .setColor(enabled ? 0x2ecc71 : 0xe74c3c);
  await interaction.editReply({ embeds: [embed] });
}

async function handleDownloadCommand(interaction) {
  const url = interaction.options.getString('url', true);
  await interaction.deferReply({ ephemeral: false });
  let download;
  try {
    download = await fetchBlueskyVideo(url);
    const embed = buildVideoEmbed(download, interaction.user.username, url);
    const attachment = new AttachmentBuilder(createReadStream(download.filePath), { name: download.fileName });
    await interaction.editReply({ embeds: [embed], files: [attachment] });
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
  const shouldListen = await guildSettingsCache.get(message.guildId);
  if (!shouldListen) return;

  const links = extractBlueskyPostLinks(message.content);
  if (!links.length) return;

  for (const link of links) {
    let download;
    try {
      download = await fetchBlueskyVideo(link);
      const embed = buildVideoEmbed(download, message.author.username, link.url);
      const attachment = new AttachmentBuilder(createReadStream(download.filePath), { name: download.fileName });
      await message.channel.send({ embeds: [embed], files: [attachment] });
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
