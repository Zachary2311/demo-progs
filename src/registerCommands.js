import { REST, Routes, SlashCommandBuilder } from 'discord.js';
import { config, validateConfig } from './config.js';
import { logger } from './logger.js';

validateConfig();

const commands = [
  new SlashCommandBuilder()
    .setName('xlistener')
    .setDescription('Enable or disable automatic X/Twitter video downloads in this server.')
    .addBooleanOption((option) =>
      option
        .setName('listen')
        .setDescription('Enable listener for X/Twitter links.')
        .setRequired(true)
    )
    .addBooleanOption((option) =>
      option
        .setName('silent')
        .setDescription('When enabled, automatic responses contain only the video link.')
    )
    .toJSON(),
  new SlashCommandBuilder()
    .setName('xdownload')
    .setDescription('Download a single X/Twitter video.')
    .addStringOption((option) =>
      option
        .setName('url')
        .setDescription('Tweet URL containing the video.')
        .setRequired(true)
    )
    .addBooleanOption((option) =>
      option
        .setName('silent')
        .setDescription('Only respond with the video link.')
    )
    .toJSON(),
  new SlashCommandBuilder()
    .setName('xdownloadbulk')
    .setDescription('Download multiple X/Twitter videos at once.')
    .addStringOption((option) =>
      option
        .setName('urls')
        .setDescription('Comma separated list of tweet URLs to download.')
        .setRequired(true)
    )
    .addBooleanOption((option) =>
      option
        .setName('silent')
        .setDescription('Only respond with the video links.')
    )
    .toJSON(),
];

const rest = new REST({ version: '10' }).setToken(config.discordToken);

try {
  await rest.put(Routes.applicationCommands(config.discordClientId), { body: commands });
  logger.info('Successfully registered application commands.');
} catch (error) {
  logger.error(`Failed to register commands: ${error.message}`);
  process.exit(1);
}
