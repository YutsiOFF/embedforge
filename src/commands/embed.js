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
        .setDescription('Importer un ou plusieurs embeds en JSON (exporte par le site web)'),
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
        '**1.** `/embed create` -> titre, description, couleur, image ou GIF, miniature.',
        '**2.** `Ajouter un champ` -> jusqu a 25 champs (inline ou non).',
        '**3.** `Ajouter un embed` -> empile un second bloc, jusqu a 10 par message.',
        '**4.** Fleches `◀ ▶` -> passe d un embed a l autre, `Modifier` edite le bloc courant.',
        '**5.** `Auteur / Footer` -> auteur, footer, horodatage.',
        '**6.** `JSON` -> recupere tout le message en JSON.',
        '**7.** `Envoyer` -> choisis le salon : les embeds partent ensemble.',
        '',
        '**GIF** : colle l URL directe du fichier (`.gif`, `.webp` ou `.apng`).',
        'Sur Tenor ou Giphy, clic droit sur le GIF -> *Copier l adresse de l image*.',
        'Les liens de page (`tenor.com/view/...`) ne s affichent pas : Discord veut le fichier.',
        '',
        `Constructeur visuel : ${SITE_URL}`,
        'Le JSON du site se colle directement via `/embed import`.',
      ].join('\n'),
    });
  },
};
