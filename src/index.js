import { Client, GatewayIntentBits, Partials, EmbedBuilder } from 'discord.js';
import fs from 'fs';
import { config, validateConfig, ensureDataDir } from './config.js';
import { initDb, getGuildSettings, updateGuildSettings } from './database.js';
import { downloadTweetVideo, uploadVideoToR2 } from './videoDownloader.js';
import { logger } from './logger.js';

validateConfig();
ensureDataDir();

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
  partials: [Partials.Channel],
});

try {
  await initDb();
} catch (error) {
  logger.error(`Failed to initialize database: ${error.message}`);
  process.exit(1);
}

client.once('ready', () => {
  logger.info(`Logged in as ${client.user.tag}`);
});

function extractTweetLinks(text) {
  const regex = /(https?:\/\/(?:www\.)?(?:x|twitter)\.com\/[A-Za-z0-9_]+\/status\/\d+(?:[^\s]*)?)/gi;
  const matches = [];
  let match;
  while ((match = regex.exec(text)) !== null) {
    matches.push(match[1]);
  }
  return matches;
}

function formatBytes(bytes) {
  const units = ['B', 'KB', 'MB', 'GB'];
  let size = bytes;
  let unit = 0;
  while (size >= 1024 && unit < units.length - 1) {
    size /= 1024;
    unit += 1;
  }
  return `${size.toFixed(unit === 0 ? 0 : 2)} ${units[unit]}`;
}

async function downloadAndUpload(tweetUrl) {
  const video = await downloadTweetVideo(tweetUrl);
  try {
    const remoteUrl = await uploadVideoToR2(video.localPath, `tweets/${video.tweetId}`);
    await fs.promises.unlink(video.localPath).catch(() => {});
    return { ...video, remoteUrl };
  } catch (error) {
    await fs.promises.unlink(video.localPath).catch(() => {});
    throw error;
  }
}

function buildVideoEmbed(video, tweetUrl, durationMs) {
  const embed = new EmbedBuilder()
    .setColor(0x1da1f2)
    .setTitle(video.title)
    .setURL(tweetUrl)
    .setDescription(`[Open video on Cloudflare R2](${video.remoteUrl})`)
    .addFields(
      { name: 'Size', value: formatBytes(video.size), inline: true },
      { name: 'Downloaded in', value: `${(durationMs / 1000).toFixed(2)}s`, inline: true }
    )
    .setFooter({ text: `@${video.authorScreenName || 'unknown'} via X` });
  return embed;
}

async function respondWithVideo({ responder, tweetUrl, silent }) {
  const startedAt = Date.now();
  const video = await downloadAndUpload(tweetUrl);
  const durationMs = Date.now() - startedAt;

  if (silent) {
    await responder({ content: video.remoteUrl });
  } else {
    const embed = buildVideoEmbed(video, tweetUrl, durationMs);
    await responder({ embeds: [embed], content: video.remoteUrl });
  }

  return { video, durationMs };
}

client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  if (interaction.commandName === 'xlistener') {
    const listen = interaction.options.getBoolean('listen', true);
    const silent = interaction.options.getBoolean('silent');
    if (!interaction.guildId) {
      await interaction.reply({ content: 'This command can only be used in a server.', ephemeral: true });
      return;
    }
    const updated = await updateGuildSettings(interaction.guildId, {
      listen_enabled: listen,
      silent_default: silent ?? undefined,
    });
    const embed = new EmbedBuilder()
      .setTitle('Listener configuration updated')
      .setColor(0x1da1f2)
      .addFields(
        { name: 'Listening for X/Twitter links', value: updated.listen_enabled ? 'Enabled' : 'Disabled', inline: true },
        { name: 'Silent mode', value: updated.silent_default ? 'Enabled' : 'Disabled', inline: true }
      );
    await interaction.reply({ embeds: [embed], ephemeral: true });
    return;
  }

  if (interaction.commandName === 'xdownload') {
    const url = interaction.options.getString('url', true);
    const silent = interaction.options.getBoolean('silent') ?? false;
    await interaction.deferReply();
    try {
      const result = await respondWithVideo({
        tweetUrl: url,
        silent,
        responder: (payload) => interaction.followUp({ ...payload }),
      });
      await interaction.editReply({ content: `Completed download in ${(result.durationMs / 1000).toFixed(2)}s.` });
    } catch (error) {
      logger.error(`Failed to download video: ${error.message}`);
      await interaction.editReply({ content: `Failed to download video: ${error.message}` });
    }
    return;
  }

  if (interaction.commandName === 'xdownloadbulk') {
    const urlsInput = interaction.options.getString('urls', true);
    const silent = interaction.options.getBoolean('silent') ?? false;
    const urls = urlsInput
      .split(',')
      .map((part) => part.trim())
      .filter((part) => part.length > 0);
    if (urls.length === 0) {
      await interaction.reply({ content: 'No URLs provided.', ephemeral: true });
      return;
    }
    const start = Date.now();
    await interaction.deferReply();
    const summaryEmbed = new EmbedBuilder()
      .setTitle('Bulk download started')
      .setDescription(`Processing ${urls.length} video${urls.length === 1 ? '' : 's'}...`)
      .setColor(0x1da1f2);
    await interaction.editReply({ embeds: [summaryEmbed] });

    let success = 0;
    let failure = 0;
    const errors = [];

    const successDetails = [];

    for (const url of urls) {
      try {
        const result = await respondWithVideo({
          tweetUrl: url,
          silent,
          responder: (payload) => interaction.followUp({ ...payload }),
        });
        success += 1;
        successDetails.push({ url, durationMs: result.durationMs });
      } catch (error) {
        failure += 1;
        errors.push(`${url}: ${error.message}`);
        logger.error(`Bulk download error for ${url}: ${error.message}`);
        await interaction.followUp({ content: `Failed to process ${url}: ${error.message}` });
      }
    }

    const totalDuration = Date.now() - start;
    const resultEmbed = new EmbedBuilder()
      .setTitle('Bulk download complete')
      .setColor(0x1da1f2)
      .addFields(
        { name: 'Success', value: `${success}`, inline: true },
        { name: 'Failed', value: `${failure}`, inline: true },
        { name: 'Total time', value: `${(totalDuration / 1000).toFixed(2)}s`, inline: true }
      );

    if (errors.length > 0) {
      resultEmbed.addFields({ name: 'Errors', value: errors.slice(0, 5).join('\n') + (errors.length > 5 ? '\n…' : '') });
    }

    if (successDetails.length > 0) {
      const lines = successDetails
        .slice(0, 5)
        .map((item) => `• ${item.url} – ${(item.durationMs / 1000).toFixed(2)}s`);
      resultEmbed.addFields({
        name: 'Sample timings',
        value: lines.join('\n') + (successDetails.length > 5 ? '\n…' : ''),
      });
    }

    await interaction.editReply({ embeds: [resultEmbed] });
    return;
  }
});

client.on('messageCreate', async (message) => {
  if (message.author.bot) return;
  if (!message.guildId) return;

  const urls = extractTweetLinks(message.content);
  if (urls.length === 0) return;

  try {
    const settings = await getGuildSettings(message.guildId);
    if (!settings.listen_enabled) return;

    for (const url of urls) {
      try {
        await respondWithVideo({
          tweetUrl: url,
          silent: settings.silent_default,
          responder: (payload) => message.reply({ ...payload }),
        });
      } catch (error) {
        logger.error(`Listener failed for ${url}: ${error.message}`);
        await message.reply({ content: `Failed to download ${url}: ${error.message}` });
      }
    }
  } catch (error) {
    logger.error(`Error handling listener: ${error.message}`);
  }
});

client.login(config.discordToken).catch((error) => {
  logger.error(`Login failed: ${error.message}`);
  process.exit(1);
});
