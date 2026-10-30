'use strict';

require('dotenv').config();

const {
  Client,
  Collection,
  Events,
  GatewayIntentBits,
  ActivityType,
  MessageFlags,
} = require('discord.js');

const embedCommand = require('./commands/embed');
const { handleButton, handleSelect, handleModal } = require('./interactions');

const token = process.env.DISCORD_TOKEN;
if (!token) {
  console.error('DISCORD_TOKEN manquant : cree un fichier .env a partir de .env.example.');
  process.exit(1);
}

const client = new Client({ intents: [GatewayIntentBits.Guilds] });
client.commands = new Collection([[embedCommand.data.name, embedCommand]]);

client.once(Events.ClientReady, (readyClient) => {
  console.log(`Connecte en tant que ${readyClient.user.tag}`);
  console.log(`   ${readyClient.guilds.cache.size} serveur(s)`);
  readyClient.user.setActivity('/embed', { type: ActivityType.Watching });
});

client.on(Events.InteractionCreate, async (interaction) => {
  try {
    if (interaction.isChatInputCommand()) {
      const command = client.commands.get(interaction.commandName);
      if (!command) return;
      await command.execute(interaction);
      return;
    }
    if (interaction.isButton()) return await handleButton(interaction);
    if (interaction.isModalSubmit()) return await handleModal(interaction);
    if (interaction.isStringSelectMenu() || interaction.isChannelSelectMenu()) {
      return await handleSelect(interaction);
    }
  } catch (error) {
    console.error('[interaction]', error);
    const payload = {
      content: `Erreur : ${error.message}`,
      flags: MessageFlags.Ephemeral,
    };
    if (interaction.deferred || interaction.replied) {
      await interaction.followUp(payload).catch(() => {});
    } else {
      await interaction.reply(payload).catch(() => {});
    }
  }
});

process.on('unhandledRejection', (error) => console.error('[unhandledRejection]', error));
process.on('uncaughtException', (error) => console.error('[uncaughtException]', error));
process.on('SIGINT', () => {
  client.destroy();
  process.exit(0);
});

client.login(token);
