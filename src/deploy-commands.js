'use strict';

require('dotenv').config();

const { REST, Routes } = require('discord.js');
const embedCommand = require('./commands/embed');

const { DISCORD_TOKEN, CLIENT_ID, GUILD_ID } = process.env;

if (!DISCORD_TOKEN || !CLIENT_ID) {
  console.error('DISCORD_TOKEN et CLIENT_ID sont requis dans .env');
  process.exit(1);
}

const rest = new REST().setToken(DISCORD_TOKEN);
const body = [embedCommand.data.toJSON()];

(async () => {
  try {
    const route = GUILD_ID
      ? Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID)
      : Routes.applicationCommands(CLIENT_ID);

    const data = await rest.put(route, { body });
    console.log(
      `${data.length} commande(s) enregistree(s) ${
        GUILD_ID ? `sur le serveur ${GUILD_ID} (instantane)` : 'globalement (jusqu a 1 h de propagation)'
      }.`,
    );
  } catch (error) {
    console.error('Echec du deploiement :', error);
    process.exit(1);
  }
})();
