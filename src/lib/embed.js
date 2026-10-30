'use strict';

const LIMITS = {
  title: 256,
  description: 4096,
  authorName: 256,
  footer: 2048,
  fieldName: 256,
  fieldValue: 1024,
  fields: 25,
  embeds: 10,
  total: 6000,
};

const GIF_EXTENSIONS = /\.(gif|webp|apng)(\?\S*)?$/i;

function isUrl(value) {
  return /^https?:\/\/\S+$/i.test(String(value ?? '').trim());
}

function isGifUrl(value) {
  return isUrl(value) && GIF_EXTENSIONS.test(String(value).trim());
}

/**
 * Discord n'affiche pas les pages Giphy / Imgur : il faut l'URL directe du media.
 * On convertit ce qu'on sait convertir, le reste est signale a l'utilisateur.
 */
function gifify(value) {
  const url = String(value ?? '').trim();
  if (!url) return '';

  const giphyMedia = url.match(/^(https?:\/\/media\d*\.giphy\.com\/media\/([a-zA-Z0-9]+)\/[^\s?#]*)/i);
  if (giphyMedia) return `https://media.giphy.com/media/${giphyMedia[2]}/giphy.gif`;

  const giphyPage = url.match(/^https?:\/\/(?:www\.)?giphy\.com\/(?:gifs|stickers)\/(?:[^?#]*?-)?([a-zA-Z0-9]+)\/?(?:[?#].*)?$/i);
  if (giphyPage) return `https://media.giphy.com/media/${giphyPage[1]}/giphy.gif`;

  const imgurPage = url.match(/^https?:\/\/(?:www\.|i\.)?imgur\.com\/([a-zA-Z0-9]+)\/?(?:[?#].*)?$/i);
  if (imgurPage && !/\.(png|jpe?g|gif|webp)$/i.test(url)) {
    return `https://i.imgur.com/${imgurPage[1]}.gif`;
  }

  return url;
}

function isMediaPage(url) {
  return /^https?:\/\/(?:www\.)?(tenor\.com|giphy\.com|imgur\.com|gifer\.com|gifox?\.app)\//i.test(
    String(url ?? '').trim(),
  );
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

  const rawThumbnail = String(input.thumbnail?.url ?? input.thumbnail ?? '').trim();
  if (rawThumbnail) {
    const thumbnail = gifify(rawThumbnail);
    if (isUrl(thumbnail)) embed.thumbnail = { url: thumbnail };
    else warn('URL de miniature ignoree.');
    if (isMediaPage(thumbnail)) warn('Miniature : utilise l URL directe du GIF (clic droit > Copier l adresse de l image).');
  }

  const rawImage = String(input.image?.url ?? input.image ?? input.gif ?? '').trim();
  if (rawImage) {
    const image = gifify(rawImage);
    if (isUrl(image)) embed.image = { url: image };
    else warn("URL d'image ignoree.");
    if (isMediaPage(image)) {
      warn('GIF : Discord veut l URL directe du fichier, pas la page Tenor/Giphy.');
    }
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

/**
 * Plusieurs embeds dans un seul message (10 max, 6000 caracteres au total).
 */
function sanitizeMany(inputs = []) {
  const list = Array.isArray(inputs) ? inputs : [inputs];
  const warnings = [];
  const warn = (message) => {
    if (!warnings.includes(message)) warnings.push(message);
  };

  if (list.length > LIMITS.embeds) warn('10 embeds maximum par message : les suivants sont ignores.');

  const embeds = [];
  for (const input of list.slice(0, LIMITS.embeds)) {
    const { embed, warnings: local } = sanitize(input);
    local.forEach(warn);
    if (!isEmpty(embed)) embeds.push(embed);
  }

  let guard = 0;
  while (embeds.reduce((sum, embed) => sum + totalLength(embed), 0) > LIMITS.total && embeds.length > 1) {
    embeds.pop();
    warn('Trop de texte : les derniers embeds sont retires (6000 caracteres au total).');
    guard += 1;
    if (guard > LIMITS.embeds) break;
  }

  return { embeds, warnings };
}

function isEmpty(embed) {
  return !embed || Object.keys(embed).length === 0;
}

module.exports = {
  LIMITS,
  sanitize,
  sanitizeMany,
  isEmpty,
  parseColor,
  intToHex,
  isUrl,
  isGifUrl,
  gifify,
  totalLength,
};
