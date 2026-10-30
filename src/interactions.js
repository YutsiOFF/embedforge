'use strict';

const { MessageFlags } = require('discord.js');

const sessions = require('./lib/sessions');
const { sanitize, isEmpty, intToHex } = require('./lib/embed');
const { buildPayload } = require('./ui');
const { fieldModal, metaModal } = require('./modals');

const blank = () => ({
  title: '',
  description: '',
  color: '#5865f2',
  fields: [],
  timestamp: false,
});

const yes = (value) => /^(oui|yes|true|1|o|y)$/i.test(String(value ?? '').trim());

function sessionOf(interaction) {
  const id = interaction.message?.id;
  return id ? sessions.get(id) : null;
}

async function expired(interaction) {
  const payload = {
    content: '⌛ Session expiree (30 min). Relance la commande `/embed create`.',
    flags: MessageFlags.Ephemeral,
  };
  if (interaction.replied || interaction.deferred) return interaction.followUp(payload);
  return interaction.reply(payload);
}

async function openBuilder(interaction, data) {
  const message = await interaction.reply({
    ...buildPayload(data),
    flags: MessageFlags.Ephemeral,
    fetchReply: true,
  });
  sessions.set(message.id, data);
}

async function upsert(interaction, data) {
  if (interaction.message?.id) {
    sessions.set(interaction.message.id, data);
    return interaction.update(buildPayload(data));
  }
  return openBuilder(interaction, data);
}

async function handleButton(interaction) {
  switch (interaction.customId) {
    case 'emb:field':
      return interaction.showModal(fieldModal());

    case 'emb:meta': {
      const data = sessionOf(interaction);
      if (!data) return expired(interaction);
      return interaction.showModal(metaModal(data));
    }

    case 'emb:json': {
      const data = sessionOf(interaction);
      if (!data) return expired(interaction);
      const { embed, warnings } = sanitize(data);
      const json = JSON.stringify(embed, null, 2);
      const body = json.length > 1850 ? `${json.slice(0, 1850)}\n...` : json;
      const note = warnings.length ? `\n⚠️ ${warnings.join(' · ')}` : '';
      return interaction.reply({
        content: `**JSON de l'embed**\n\`\`\`json\n${body}\n\`\`\`${note}`,
        flags: MessageFlags.Ephemeral,
      });
    }

    case 'emb:send': {
      const data = sessionOf(interaction);
      if (!data) return expired(interaction);
      return interaction.update(buildPayload(data, { showChannels: true }));
    }

    case 'emb:reset': {
      const data = sessionOf(interaction);
      if (!data) return expired(interaction);
      const fresh = blank();
      sessions.set(interaction.message.id, fresh);
      return interaction.update(buildPayload(fresh));
    }

    default:
      return undefined;
  }
}

async function handleSelect(interaction) {
  const data = sessionOf(interaction);
  if (!data) return expired(interaction);

  if (interaction.customId === 'emb:remove') {
    const index = Number(interaction.values[0]);
    if (Number.isInteger(index) && Array.isArray(data.fields) && data.fields[index]) {
      data.fields.splice(index, 1);
    }
    sessions.set(interaction.message.id, data);
    return interaction.update(buildPayload(data));
  }

  if (interaction.customId === 'emb:target') {
    const { embed } = sanitize(data);
    if (isEmpty(embed)) {
      return interaction.reply({
        content: "L'embed est vide : ajoute au moins un titre, une description ou un champ.",
        flags: MessageFlags.Ephemeral,
      });
    }

    const channel = await interaction.client.channels
      .fetch(interaction.values[0])
      .catch(() => null);

    if (!channel?.isTextBased()) {
      return interaction.reply({
        content: 'Salon introuvable ou non textuel.',
        flags: MessageFlags.Ephemeral,
      });
    }

    try {
      await channel.send({ embeds: [embed] });
    } catch (error) {
      return interaction.reply({
        content: `Envoi impossible : ${error.message}`,
        flags: MessageFlags.Ephemeral,
      });
    }

    return interaction.reply({
      content: `Embed envoye dans <#${channel.id}>.`,
      flags: MessageFlags.Ephemeral,
    });
  }

  return undefined;
}

async function handleModal(interaction) {
  const id = interaction.customId;

  if (id === 'embmodal:create') {
    const data = blank();
    data.title = interaction.fields.getTextInputValue('title') ?? '';
    data.description = interaction.fields.getTextInputValue('description') ?? '';
    data.color = interaction.fields.getTextInputValue('color') || '#5865f2';
    const image = (interaction.fields.getTextInputValue('image') ?? '').trim();
    const thumbnail = (interaction.fields.getTextInputValue('thumbnail') ?? '').trim();
    if (image) data.image = { url: image };
    if (thumbnail) data.thumbnail = { url: thumbnail };
    return openBuilder(interaction, data);
  }

  if (id === 'embmodal:import') {
    const raw = interaction.fields.getTextInputValue('json');
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return interaction.reply({
        content: 'JSON invalide : verifie les virgules et les guillemets.',
        flags: MessageFlags.Ephemeral,
      });
    }

    const candidate = Array.isArray(parsed?.embeds) ? parsed.embeds[0] : parsed?.embed ?? parsed;
    if (!candidate || typeof candidate !== 'object') {
      return interaction.reply({
        content: 'JSON invalide : aucun embed trouve.',
        flags: MessageFlags.Ephemeral,
      });
    }

    const data = {
      title: candidate.title ?? '',
      description: candidate.description ?? '',
      url: candidate.url ?? '',
      color:
        typeof candidate.color === 'number' ? intToHex(candidate.color) : candidate.color ?? '#5865f2',
      author: {
        name: candidate.author?.name ?? '',
        url: candidate.author?.url ?? '',
        icon_url: candidate.author?.icon_url ?? '',
      },
      thumbnail: { url: candidate.thumbnail?.url ?? '' },
      image: { url: candidate.image?.url ?? '' },
      footer: {
        text: candidate.footer?.text ?? '',
        icon_url: candidate.footer?.icon_url ?? '',
      },
      timestamp: Boolean(candidate.timestamp),
      fields: Array.isArray(candidate.fields)
        ? candidate.fields.map((field) => ({
            name: field?.name ?? '',
            value: field?.value ?? '',
            inline: Boolean(field?.inline),
          }))
        : [],
    };

    return openBuilder(interaction, data);
  }

  const data = sessionOf(interaction);
  if (!data) return expired(interaction);

  if (id === 'embmodal:field') {
    const name = interaction.fields.getTextInputValue('name');
    const value = interaction.fields.getTextInputValue('value');
    const inline = interaction.fields.getTextInputValue('inline');
    data.fields = Array.isArray(data.fields) ? data.fields : [];
    if (data.fields.length >= 25) {
      return interaction.reply({
        content: '25 champs maximum par embed.',
        flags: MessageFlags.Ephemeral,
      });
    }
    data.fields.push({ name, value, inline: yes(inline) });
    return upsert(interaction, data);
  }

  if (id === 'embmodal:meta') {
    const authorName = interaction.fields.getTextInputValue('author_name').trim();
    const authorIcon = interaction.fields.getTextInputValue('author_icon').trim();
    const footerText = interaction.fields.getTextInputValue('footer_text').trim();
    const footerIcon = interaction.fields.getTextInputValue('footer_icon').trim();
    const timestamp = interaction.fields.getTextInputValue('timestamp');

    data.author = authorName ? { name: authorName, icon_url: authorIcon } : undefined;
    data.footer = footerText ? { text: footerText, icon_url: footerIcon } : undefined;
    data.timestamp = yes(timestamp);
    return upsert(interaction, data);
  }

  return undefined;
}

module.exports = { handleButton, handleSelect, handleModal, blank };
