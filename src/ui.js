'use strict';

const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelSelectMenuBuilder,
  ChannelType,
  StringSelectMenuBuilder,
} = require('discord.js');

const { sanitize, isEmpty, LIMITS } = require('./lib/embed');

const PLACEHOLDER_EMBED = {
  title: 'Ton embed apparait ici',
  description:
    'Remplis le formulaire, ajoute des champs, un auteur ou un footer.\n' +
    'Quand tout te plait, clique sur **Envoyer** et choisis le salon.',
  color: 0x5865f2,
  footer: { text: 'Apercu prive - expire apres 30 min' },
};

function buildPayload(data = {}, options = {}) {
  const { embed, warnings } = sanitize(data);
  const rows = [];

  rows.push(
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('emb:field')
        .setLabel('Ajouter un champ')
        .setEmoji('➕')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId('emb:meta')
        .setLabel('Auteur / Footer')
        .setEmoji('🖋️')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId('emb:json')
        .setLabel('JSON')
        .setEmoji('🧾')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId('emb:send')
        .setLabel('Envoyer')
        .setEmoji('📨')
        .setStyle(ButtonStyle.Success),
    ),
  );

  const fields = Array.isArray(data.fields) ? data.fields : [];

  if (fields.length) {
    rows.push(
      new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId('emb:remove')
          .setPlaceholder('🗑️ Retirer un champ...')
          .addOptions(
            fields.slice(0, LIMITS.fields).map((field, index) => ({
              label: (field.name || `Champ ${index + 1}`).slice(0, 100),
              description: (field.value || '-').slice(0, 100),
              value: String(index),
            })),
          ),
      ),
    );
  } else {
    rows.push(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('emb:reset')
          .setLabel('Tout effacer')
          .setEmoji('🧹')
          .setStyle(ButtonStyle.Secondary),
      ),
    );
  }

  if (options.showChannels) {
    rows.push(
      new ActionRowBuilder().addComponents(
        new ChannelSelectMenuBuilder()
          .setCustomId('emb:target')
          .setPlaceholder("Choisir le salon d'envoi...")
          .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement),
      ),
    );
  }

  const header = [];
  if (warnings.length) header.push(`⚠️ ${warnings.join(' · ')}`);
  header.push(`-# ${fields.length}/${LIMITS.fields} champs · JSON pret pour \`/embed import\``);

  return {
    content: header.join('\n'),
    embeds: [isEmpty(embed) ? PLACEHOLDER_EMBED : embed],
    components: rows,
  };
}

module.exports = { buildPayload, PLACEHOLDER_EMBED };
