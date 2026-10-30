'use strict';

const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelSelectMenuBuilder,
  ChannelType,
  StringSelectMenuBuilder,
} = require('discord.js');

const { sanitizeMany, totalLength, LIMITS } = require('./lib/embed');

const PLACEHOLDER_EMBED = {
  title: 'Ton embed apparait ici',
  description:
    'Remplis le formulaire, ajoute des champs, un auteur ou un footer.\n' +
    '**Ajouter un embed** empile un second bloc (10 maximum, comme Discord).\n' +
    'Quand tout te plait, clique sur **Envoyer** et choisis le salon.',
  color: 0x5865f2,
  footer: { text: 'Apercu prive - expire apres 30 min' },
};

/**
 * Une session peut etre un embed seul (ancien format) ou un document
 * { embeds: [...], active: n }.
 */
function docOf(state) {
  if (state && Array.isArray(state.embeds)) {
    if (!state.embeds.length) state.embeds.push({});
    const active = Math.min(Math.max(0, Number(state.active) || 0), state.embeds.length - 1);
    state.active = active;
    return state;
  }
  return { embeds: [state ?? {}], active: 0 };
}

function buildPayload(state = {}, options = {}) {
  const doc = docOf(state);
  const active = doc.active;
  const current = doc.embeds[active] ?? {};
  const { embeds, warnings } = sanitizeMany(doc.embeds);
  const total = embeds.reduce((sum, embed) => sum + totalLength(embed), 0);
  const fields = Array.isArray(current.fields) ? current.fields : [];
  const count = doc.embeds.length;
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
        .setCustomId('emb:edit')
        .setLabel('Modifier')
        .setEmoji('✏️')
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

  rows.push(
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('emb:prev')
        .setEmoji('◀️')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(active === 0),
      new ButtonBuilder()
        .setCustomId('emb:noop')
        .setLabel(`Embed ${active + 1} / ${count}`)
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(true),
      new ButtonBuilder()
        .setCustomId('emb:next')
        .setEmoji('▶️')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(active >= count - 1),
      new ButtonBuilder()
        .setCustomId('emb:add')
        .setLabel('Ajouter un embed')
        .setEmoji('➕')
        .setStyle(ButtonStyle.Primary)
        .setDisabled(count >= LIMITS.embeds),
      new ButtonBuilder()
        .setCustomId('emb:removeEmbed')
        .setEmoji('🗑️')
        .setStyle(ButtonStyle.Danger)
        .setDisabled(count <= 1),
    ),
  );

  if (fields.length) {
    rows.push(
      new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId('emb:remove')
          .setPlaceholder(`🗑️ Retirer un champ de l'embed ${active + 1}...`)
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
          .setLabel("Vider cet embed")
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
  header.push(
    `-# Embed ${active + 1}/${count} · ${fields.length}/${LIMITS.fields} champs · ` +
      `${total}/${LIMITS.total} caracteres`,
  );

  return {
    content: header.join('\n'),
    embeds: embeds.length ? embeds : [PLACEHOLDER_EMBED],
    components: rows,
  };
}

module.exports = { buildPayload, docOf, PLACEHOLDER_EMBED };
