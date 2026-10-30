'use strict';

const LIMITS = {
  title: 256,
  description: 4096,
  authorName: 256,
  footer: 2048,
  fieldName: 256,
  fieldValue: 1024,
  fields: 25,
  total: 6000,
};

function isUrl(value) {
  return /^https?:\/\/\S+$/i.test(String(value ?? '').trim());
}

function parseColor(value) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.max(0, Math.min(0xffffff, Math.trunc(value)));
  }
  const raw = String(value ?? '').trim();
  if (!raw) return null;
  const match = raw.match(/^#?([0-9a-f]{6})$/i);
  return match ? parseInt(match[1], 16) : null;
}

function intToHex(value) {
  return `#${Number(value).toString(16).padStart(6, '0')}`;
}

function totalLength(embed) {
  return (
    (embed.title?.length || 0) +
    (embed.description?.length || 0) +
    (embed.footer?.text?.length || 0) +
    (embed.author?.name?.length || 0) +
    (embed.fields || []).reduce((sum, field) => sum + field.name.length + field.value.length, 0)
  );
}

/**
 * Transforme un objet embed (format API Discord, celui genere par le site)
 * en embed sur a envoyer. Retourne { embed, warnings }.
 */
function sanitize(input = {}) {
  const warnings = [];
  const embed = {};
  const warn = (message) => {
    if (!warnings.includes(message)) warnings.push(message);
  };

  const title = String(input.title ?? '').trim();
  if (title) {
    if (title.length > LIMITS.title) warn('Titre tronque a 256 caracteres.');
    embed.title = title.slice(0, LIMITS.title);
  }

  const description = String(input.description ?? '').replace(/\r\n/g, '\n').trim();
  if (description) {
    if (description.length > LIMITS.description) warn('Description tronquee a 4096 caracteres.');
    embed.description = description.slice(0, LIMITS.description);
  }

  const url = String(input.url ?? '').trim();
  if (url) {
    if (isUrl(url)) embed.url = url;
    else warn('URL du titre ignoree : http(s) attendu.');
  }

  const color = parseColor(input.color);
  if (color !== null) embed.color = color;
  else if (String(input.color ?? '').trim()) warn('Couleur invalide : utilise #RRGGBB.');

  const authorName = String(input.author?.name ?? '').trim();
  if (authorName) {
    embed.author = { name: authorName.slice(0, LIMITS.authorName) };
    if (isUrl(input.author?.url)) embed.author.url = String(input.author.url).trim();
    if (isUrl(input.author?.icon_url)) embed.author.icon_url = String(input.author.icon_url).trim();
  }

  const thumbnail = String(input.thumbnail?.url ?? '').trim();
  if (thumbnail) {
    if (isUrl(thumbnail)) embed.thumbnail = { url: thumbnail };
    else warn('URL de miniature ignoree.');
  }

  const image = String(input.image?.url ?? '').trim();
  if (image) {
    if (isUrl(image)) embed.image = { url: image };
    else warn("URL d'image ignoree.");
  }

  const footerText = String(input.footer?.text ?? '').trim();
  if (footerText) {
    if (footerText.length > LIMITS.footer) warn('Footer tronque a 2048 caracteres.');
    embed.footer = { text: footerText.slice(0, LIMITS.footer) };
    if (isUrl(input.footer?.icon_url)) embed.footer.icon_url = String(input.footer.icon_url).trim();
  }

  if (input.timestamp) {
    const date = new Date(input.timestamp === true ? Date.now() : input.timestamp);
    if (!Number.isNaN(date.getTime())) embed.timestamp = date.toISOString();
  }

  const rawFields = Array.isArray(input.fields) ? input.fields : [];
  if (rawFields.length > LIMITS.fields) warn('25 champs maximum : les suivants sont ignores.');
  const fields = [];
  for (const field of rawFields.slice(0, LIMITS.fields)) {
    const name = String(field?.name ?? '').trim();
    const value = String(field?.value ?? '').trim();
    if (!name && !value) continue;
    fields.push({
      name: (name || '\u200b').slice(0, LIMITS.fieldName),
      value: (value || '\u200b').slice(0, LIMITS.fieldValue),
      inline: Boolean(field?.inline),
    });
  }
  if (fields.length) embed.fields = fields;

  if (totalLength(embed) > LIMITS.total) {
    warn('Embed tronque : Discord limite le total a 6000 caracteres.');
    while (totalLength(embed) > LIMITS.total && embed.fields?.length) embed.fields.pop();
    if (!embed.fields?.length) delete embed.fields;
    if (totalLength(embed) > LIMITS.total && embed.description) {
      const overflow = totalLength(embed) - LIMITS.total;
      const keep = Math.max(0, embed.description.length - overflow - 3);
      embed.description = `${embed.description.slice(0, keep)}...`;
    }
  }

  return { embed, warnings };
}

function isEmpty(embed) {
  return !embed || Object.keys(embed).length === 0;
}

module.exports = {
  LIMITS,
  sanitize,
  isEmpty,
  parseColor,
  intToHex,
  isUrl,
  totalLength,
};
