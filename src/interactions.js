'use strict';

const { MessageFlags } = require('discord.js');

const sessions = require('./lib/sessions');
const { sanitizeMany, intToHex, LIMITS } = require('./lib/embed');
const { buildPayload, docOf } = require('./ui');
const { createModal, fieldModal, metaModal } = require('./modals');

const blankEmbed = () => ({
  title: '',
  description: '',
  url: '',
  color: '#5865f2',
  author: { name: '', url: '', icon_url: '' },
  thumbnail: { url: '' },
  image: { url: '' },
  footer: { text: '', icon_url: '' },
  timestamp: false,
  fields: [],
});

const blankDoc = () => ({ embeds: [blankEmbed()], active: 0 });

const yes = (value) => /^(oui|yes|true|1|o|y)$/i.test(String(value ?? '').trim());

function sessionOf(interaction) {
  const id = interaction.message?.id;
  if (!id) return null;
  const raw = sessions.get(id);
  return raw ? docOf(raw) : null;
}

function save(interaction, doc) {
  sessions.set(interaction.message.id, doc);
  return doc;
}

async function expired(interaction) {
  const payload = {
    content: '⌛ Session expiree (30 min). Relance la commande `/embed create`.',
    flags: MessageFlags.Ephemeral,
  };
  if (interaction.replied || interaction.deferred) return interaction.followUp(payload);
  return interaction.reply(payload);
}

async function notice(interaction, content) {
  const payload = { content, flags: MessageFlags.Ephemeral };
  if (interaction.replied || interaction.deferred) return interaction.followUp(payload);
  return interaction.reply(payload);
}

async function openBuilder(interaction, doc) {
  const message = await interaction.reply({
    ...buildPayload(doc),
    flags: MessageFlags.Ephemeral,
    fetchReply: true,
  });
  sessions.set(message.id, doc);
}

async function upsert(interaction, doc) {
  if (interaction.message?.id) {
    sessions.set(interaction.message.id, doc);
    return interaction.update(buildPayload(doc));
  }
  return openBuilder(interaction, doc);
}

function fromApi(candidate = {}) {
  const rawImage = candidate.image?.url ?? (typeof candidate.image === 'string' ? candidate.image : '') ?? '';
  const rawThumb =
    candidate.thumbnail?.url ?? (typeof candidate.thumbnail === 'string' ? candidate.thumbnail : '') ?? '';

  return {
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
    thumbnail: { url: rawThumb },
    image: { url: rawImage || candidate.gif || '' },
    footer: {
      text: candidate.footer?.text ?? '',
      icon_url: candidate.footer?.icon_url ?? '',
    },
    timestamp: Boolean(candidate.timestamp),
    fields: Array.isArray(candidate.fields)
      ? candidate.fields.map((field) => ({
          name: field?.name === '\u200b' ? '' : field?.name ?? '',
          value: field?.value === '\u200b' ? '' : field?.value ?? '',
          inline: Boolean(field?.inline),
        }))
      : [],
  };
}

function parseEmbeds(parsed) {
  if (Array.isArray(parsed)) return parsed;
  if (Array.isArray(parsed?.embeds)) return parsed.embeds;
  if (parsed?.embed && typeof parsed.embed === 'object') return [parsed.embed];
  if (parsed && typeof parsed === 'object') return [parsed];
  return [];
}

function applyBase(interaction, base) {
  const value = (id) => {
    try {
      return interaction.fields.getTextInputValue(id) ?? '';
    } catch {
      return '';
    }
  };

  return {
    ...base,
    title: value('title'),
    description: value('description'),
    color: value('color').trim() || '#5865f2',
    image: { url: value('image').trim() },
    thumbnail: { url: value('thumbnail').trim() },
  };
}

async function handleButton(interaction) {
  const doc = sessionOf(interaction);

  switch (interaction.customId) {
    case 'emb:noop':
      return undefined;

    case 'emb:field':
      if (!doc) return expired(interaction);
      return interaction.showModal(fieldModal());

    case 'emb:meta': {
      if (!doc) return expired(interaction);
      return interaction.showModal(metaModal(doc.embeds[doc.active]));
    }

    case 'emb:edit': {
      if (!doc) return expired(interaction);
      return interaction.showModal(
        createModal(doc.embeds[doc.active], {
          customId: 'embmodal:edit',
          title: `Modifier l'embed ${doc.active + 1}`,
        }),
      );
    }

    case 'emb:add': {
      if (!doc) return expired(interaction);
      if (doc.embeds.length >= LIMITS.embeds) {
        return notice(interaction, `Discord accepte ${LIMITS.embeds} embeds maximum par message.`);
      }
      return interaction.showModal(
        createModal({}, { customId: 'embmodal:add', title: `Embed ${doc.embeds.length + 1}` }),
      );
    }

    case 'emb:removeEmbed': {
      if (!doc) return expired(interaction);
      if (doc.embeds.length <= 1) {
        return notice(interaction, 'Il faut garder au moins un embed.');
      }
      doc.embeds.splice(doc.active, 1);
      doc.active = Math.min(doc.active, doc.embeds.length - 1);
      return upsert(interaction, doc);
    }

    case 'emb:prev': {
      if (!doc) return expired(interaction);
      doc.active = Math.max(0, doc.active - 1);
      return upsert(interaction, doc);
    }

    case 'emb:next': {
      if (!doc) return expired(interaction);
      doc.active = Math.min(doc.embeds.length - 1, doc.active + 1);
      return upsert(interaction, doc);
    }

    case 'emb:json': {
      if (!doc) return expired(interaction);
      const { embeds, warnings } = sanitizeMany(doc.embeds);
      const output = embeds.length > 1 ? { embeds } : embeds[0] ?? {};
      const json = JSON.stringify(output, null, 2);
      const body = json.length > 1800 ? `${json.slice(0, 1800)}\n...` : json;
      const note = warnings.length ? `\n⚠️ ${warnings.join(' · ')}` : '';
      return notice(interaction, `**JSON des embeds**\n\`\`\`json\n${body}\n\`\`\`${note}`);
    }

    case 'emb:send': {
      if (!doc) return expired(interaction);
      return interaction.update(buildPayload(doc, { showChannels: true }));
    }

    case 'emb:reset': {
      if (!doc) return expired(interaction);
      doc.embeds[doc.active] = blankEmbed();
      return upsert(interaction, doc);
    }

    default:
      return undefined;
  }
}

async function handleSelect(interaction) {
  const doc = sessionOf(interaction);
  if (!doc) return expired(interaction);

  if (interaction.customId === 'emb:remove') {
    const index = Number(interaction.values[0]);
    const embed = doc.embeds[doc.active];
    if (embed && Array.isArray(embed.fields) && embed.fields[index]) {
      embed.fields.splice(index, 1);
    }
    return upsert(interaction, doc);
  }

  if (interaction.customId === 'emb:target') {
    const { embeds, warnings } = sanitizeMany(doc.embeds);
    if (!embeds.length) {
      return notice(
        interaction,
        "Les embeds sont vides : ajoute au moins un titre, une description ou un champ.",
      );
    }

    const channel = await interaction.client.channels
      .fetch(interaction.values[0])
      .catch(() => null);

    if (!channel?.isTextBased()) {
      return notice(interaction, 'Salon introuvable ou non textuel.');
    }

    try {
      await channel.send({ embeds });
    } catch (error) {
      return notice(interaction, `Envoi impossible : ${error.message}`);
    }

    const note = warnings.length ? `\n⚠️ ${warnings.join(' · ')}` : '';
    return notice(
      interaction,
      `${embeds.length} embed${embeds.length > 1 ? 's' : ''} envoye${
        embeds.length > 1 ? 's' : ''
      } dans <#${channel.id}>.${note}`,
    );
  }

  return undefined;
}

async function handleModal(interaction) {
  const id = interaction.customId;

  if (id === 'embmodal:create') {
    const doc = { embeds: [applyBase(interaction, blankEmbed())], active: 0 };
    return openBuilder(interaction, doc);
  }

  if (id === 'embmodal:import') {
    const raw = interaction.fields.getTextInputValue('json');
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return notice(interaction, 'JSON invalide : verifie les virgules et les guillemets.');
    }

    const candidates = parseEmbeds(parsed);
    if (!candidates.length) {
      return notice(interaction, 'JSON invalide : aucun embed trouve.');
    }
    if (candidates.length > LIMITS.embeds) {
      return notice(
        interaction,
        `${candidates.length} embeds dans le JSON : Discord en accepte ${LIMITS.embeds} maximum.`,
      );
    }

    const doc = { embeds: candidates.map(fromApi), active: 0 };
    return openBuilder(interaction, doc);
  }

  const doc = sessionOf(interaction);
  if (!doc) return expired(interaction);

  if (id === 'embmodal:add') {
    if (doc.embeds.length >= LIMITS.embeds) {
      return notice(interaction, `Discord accepte ${LIMITS.embeds} embeds maximum par message.`);
    }
    doc.embeds.push(applyBase(interaction, blankEmbed()));
    doc.active = doc.embeds.length - 1;
    return upsert(interaction, doc);
  }

  if (id === 'embmodal:edit') {
    doc.embeds[doc.active] = applyBase(interaction, doc.embeds[doc.active]);
    return upsert(interaction, doc);
  }

  if (id === 'embmodal:field') {
    const embed = doc.embeds[doc.active];
    const name = interaction.fields.getTextInputValue('name');
    const value = interaction.fields.getTextInputValue('value');
    const inline = interaction.fields.getTextInputValue('inline');
    embed.fields = Array.isArray(embed.fields) ? embed.fields : [];
    if (embed.fields.length >= LIMITS.fields) {
      return notice(interaction, `${LIMITS.fields} champs maximum par embed.`);
    }
    embed.fields.push({ name, value, inline: yes(inline) });
    return upsert(interaction, doc);
  }

  if (id === 'embmodal:meta') {
    const embed = doc.embeds[doc.active];
    const authorName = interaction.fields.getTextInputValue('author_name').trim();
    const authorIcon = interaction.fields.getTextInputValue('author_icon').trim();
    const footerText = interaction.fields.getTextInputValue('footer_text').trim();
    const footerIcon = interaction.fields.getTextInputValue('footer_icon').trim();
    const timestamp = interaction.fields.getTextInputValue('timestamp');

    embed.author = authorName ? { name: authorName, icon_url: authorIcon } : undefined;
    embed.footer = footerText ? { text: footerText, icon_url: footerIcon } : undefined;
    embed.timestamp = yes(timestamp);
    return upsert(interaction, doc);
  }

  return undefined;
}

module.exports = { handleButton, handleSelect, handleModal, blankEmbed, blankDoc, fromApi };
