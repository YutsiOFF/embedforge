'use strict';

const { SlashCommandBuilder, MessageFlags } = require('discord.js');

const { createModal, importModal } = require('../modals');

const SITE_URL = process.env.SITE_URL || 'https://yutsioff.github.io/embedforge/';

module.exports = {
  data: new SlashCommandBuilder()
    .setName('embed')
    .setDescription('Cree, importe et envoie des embeds personnalises')
    .addSubcommand((sub) =>
      sub.setName('create').setDescription("Ouvre le constructeur d'embed"),
    )
    .addSubcommand((sub) =>
      sub
        .setName('import')
        .setDescription('Importer un embed en JSON (exporte par le site web)'),
    )
    .addSubcommand((sub) =>
      sub.setName('aide').setDescription('Mode emploi du constructeur + lien du site'),
    ),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();

    if (sub === 'create') {
      return interaction.showModal(createModal());
    }

    if (sub === 'import') {
      return interaction.showModal(importModal());
    }

    return interaction.reply({
      flags: MessageFlags.Ephemeral,
      content: [
        "**EmbedForge - mode d'emploi**",
        '',
        '**1.** `/embed create` -> titre, description, couleur, image, miniature.',
        '**2.** Bouton `Ajouter un champ` -> jusqu a 25 champs (inline ou non).',
        '**3.** Bouton `Auteur / Footer` -> auteur, footer, horodatage.',
        '**4.** Bouton `JSON` -> recupere le JSON de l embed courant.',
        '**5.** Bouton `Envoyer` -> choisis le salon de destination.',
        '',
        `Constructeur visuel : ${SITE_URL}`,
        'Le JSON du site se colle directement via `/embed import`.',
      ].join('\n'),
    });
  },
};
