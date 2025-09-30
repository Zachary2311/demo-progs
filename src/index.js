import { Client, GatewayIntentBits, Partials, REST, Routes } from 'discord.js';
import { config } from './config.js';
import { initDatabase, shutdownDatabase } from './database.js';
import { commandDefinitions, handleCommandInteraction, handlePotentialBlueskyLinks } from './commands.js';

process.on('unhandledRejection', (error) => {
  console.error('Unhandled promise rejection:', error);
});

async function main() {
  await initDatabase();

  const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
    partials: [Partials.Channel],
  });

  client.once('ready', async () => {
    console.log(`Logged in as ${client.user.tag}`);
    try {
      await registerCommands(client);
      console.log('Slash commands registered.');
    } catch (error) {
      console.error('Failed to register commands:', error);
    }
  });

  client.on('interactionCreate', async (interaction) => {
    if (!interaction.isChatInputCommand()) return;
    try {
      await handleCommandInteraction(interaction);
    } catch (error) {
      console.error('Command handling error:', error);
      if (interaction.deferred || interaction.replied) {
        await interaction.editReply({ content: 'Something went wrong while handling that command.' }).catch(() => {});
      } else {
        await interaction.reply({ content: 'Something went wrong while handling that command.', ephemeral: true }).catch(() => {});
      }
    }
  });

  client.on('messageCreate', async (message) => {
    try {
      await handlePotentialBlueskyLinks(message);
    } catch (error) {
      console.error('Message handling error:', error);
    }
  });

  client.login(config.discordToken).catch((error) => {
    console.error('Failed to log in to Discord:', error);
    process.exit(1);
  });

  const shutdown = async () => {
    console.log('Shutting down bot...');
    await client.destroy();
    await shutdownDatabase();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

async function registerCommands(client) {
  const rest = new REST({ version: '10' }).setToken(config.discordToken);
  const body = commandDefinitions;
  if (config.commandGuildIds?.length) {
    await Promise.all(
      config.commandGuildIds.map((guildId) =>
        rest.put(Routes.applicationGuildCommands(config.discordClientId, guildId), { body })
      )
    );
  } else {
    await rest.put(Routes.applicationCommands(config.discordClientId), { body });
  }
}

main().catch((error) => {
  console.error('Fatal error during startup:', error);
  process.exit(1);
});
