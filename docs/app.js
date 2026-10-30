(function () {
  'use strict';

  const MAX = {
    title: 256,
    description: 4096,
    fieldName: 256,
    fieldValue: 1024,
    fields: 25,
    footer: 2048,
    author: 256,
    total: 6000,
    embeds: 10,
  };

  const DEFAULT_COLOR = '#5865f2';
  const STORAGE_KEY = 'embedforge.state';
  const STORAGE_THEME = 'embedforge.theme';
  const STORAGE_API = 'embedforge.api';
  const STORAGE_TOKEN = 'embedforge.token';

  let session = null;

  const blank = () => ({
    title: '',
    url: '',
    description: '',
    color: DEFAULT_COLOR,
    author: { name: '', url: '', icon_url: '' },
    thumbnail: '',
    image: '',
    footer: { text: '', icon_url: '' },
    timestamp: false,
    fields: [],
  });

  const doc = { embeds: [blank()], active: 0 };
  let state = doc.embeds[0];

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

  const escHtml = (value) =>
    String(value).replace(/[&<>"']/g, (ch) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    }[ch]));

  const escAttr = escHtml;

  function md(text) {
    let html = escHtml(text);
    html = html.replace(
      /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,
      '<a href="$2" target="_blank" rel="noopener">$1</a>',
    );
    html = html.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>');
    html = html.replace(/__([^_\n]+)__/g, '<u>$1</u>');
    html = html.replace(/~~([^~\n]+)~~/g, '<s>$1</s>');
    html = html.replace(/`([^`\n]+)`/g, '<code>$1</code>');
    return html.replace(/\n/g, '<br>');
  }

  const isUrl = (value) => /^https?:\/\/\S+$/i.test(String(value ?? '').trim());

  /** Tenor / Giphy / Imgur : Discord exige le fichier, pas la page. */
  function gifify(value) {
    const url = String(value ?? '').trim();
    if (!url) return '';

    const giphyMedia = url.match(/^(https?:\/\/media\d*\.giphy\.com\/media\/([a-zA-Z0-9]+)\/[^\s?#]*)/i);
    if (giphyMedia) return `https://media.giphy.com/media/${giphyMedia[2]}/giphy.gif`;

    const giphyPage = url.match(
      /^https?:\/\/(?:www\.)?giphy\.com\/(?:gifs|stickers)\/(?:[^?#]*?-)?([a-zA-Z0-9]+)\/?(?:[?#].*)?$/i,
    );
    if (giphyPage) return `https://media.giphy.com/media/${giphyPage[1]}/giphy.gif`;

    const imgurPage = url.match(/^https?:\/\/(?:www\.|i\.)?imgur\.com\/([a-zA-Z0-9]+)\/?(?:[?#].*)?$/i);
    if (imgurPage && !/\.(png|jpe?g|gif|webp)$/i.test(url)) {
      return `https://i.imgur.com/${imgurPage[1]}.gif`;
    }

    return url;
  }

  function hexToInt(value) {
    const match = String(value ?? '').trim().match(/^#?([0-9a-f]{6})$/i);
    return match ? parseInt(match[1], 16) : null;
  }

  const intToHex = (value) => `#${Number(value).toString(16).padStart(6, '0')}`;

  function toLocalInput(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    const pad = (number) => String(number).padStart(2, '0');
    return (
      `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
      `T${pad(date.getHours())}:${pad(date.getMinutes())}`
    );
  }

  function setPath(object, path, value) {
    const parts = path.split('.');
    let current = object;
    for (let i = 0; i < parts.length - 1; i += 1) current = current[parts[i]];
    current[parts[parts.length - 1]] = value;
  }

  const getPath = (object, path) =>
    path.split('.').reduce((acc, key) => (acc ? acc[key] : undefined), object);

  function totalLength(embed) {
    return (
      (embed.title?.length || 0) +
      (embed.description?.length || 0) +
      (embed.footer?.text?.length || 0) +
      (embed.author?.name?.length || 0) +
      (embed.fields || []).reduce((sum, field) => sum + field.name.length + field.value.length, 0)
    );
  }

  /* ---------------- construction des embeds ---------------- */

  function buildOne(data) {
    const embed = {};

    const title = String(data.title ?? '').trim();
    if (title) embed.title = title.slice(0, MAX.title);

    const description = String(data.description ?? '').replace(/\r\n/g, '\n').trim();
    if (description) embed.description = description.slice(0, MAX.description);

    if (isUrl(data.url)) embed.url = String(data.url).trim();

    const color = hexToInt(data.color);
    if (color !== null) embed.color = color;

    if (data.author?.name?.trim()) {
      embed.author = { name: data.author.name.trim().slice(0, MAX.author) };
      if (isUrl(data.author.url)) embed.author.url = data.author.url.trim();
      if (isUrl(data.author.icon_url)) embed.author.icon_url = data.author.icon_url.trim();
    }

    const thumbnail = gifify(data.thumbnail);
    if (isUrl(thumbnail)) embed.thumbnail = { url: thumbnail };

    const image = gifify(data.image);
    if (isUrl(image)) embed.image = { url: image };

    if (data.footer?.text?.trim()) {
      embed.footer = { text: data.footer.text.trim().slice(0, MAX.footer) };
      if (isUrl(data.footer.icon_url)) embed.footer.icon_url = data.footer.icon_url.trim();
    }

    if (data.timestamp) {
      const date = data.timestamp === true ? new Date() : new Date(data.timestamp);
      if (!Number.isNaN(date.getTime())) embed.timestamp = date.toISOString();
    }

    const fields = (data.fields || [])
      .filter((field) => field.name.trim() || field.value.trim())
      .slice(0, MAX.fields)
      .map((field) => ({
        name: (field.name.trim() || '\u200b').slice(0, MAX.fieldName),
        value: (field.value.trim() || '\u200b').slice(0, MAX.fieldValue),
        inline: Boolean(field.inline),
      }));
    if (fields.length) embed.fields = fields;

    return embed;
  }

  /** Tous les embeds non vides, avec l'index d'origine, dans le budget global de 6000. */
  function buildItems() {
    const items = [];
    doc.embeds.forEach((data, index) => {
      const embed = buildOne(data);
      if (Object.keys(embed).length) items.push({ index, embed });
    });

    let total = items.reduce((sum, item) => sum + totalLength(item.embed), 0);
    while (total > MAX.total && items.length > 1) {
      total -= totalLength(items.pop().embed);
    }

    if (total > MAX.total && items.length) {
      const last = items[items.length - 1].embed;
      while (totalLength(last) > MAX.total && last.fields && last.fields.length) {
        total -= last.fields[last.fields.length - 1].name.length +
          last.fields[last.fields.length - 1].value.length;
        last.fields.pop();
      }
      if (last.fields && !last.fields.length) delete last.fields;
      if (totalLength(last) > MAX.total && last.description) {
        const overflow = totalLength(last) - MAX.total;
        last.description = `${last.description.slice(0, Math.max(0, last.description.length - overflow - 3))}...`;
      }
    }

    return items;
  }

  const buildEmbeds = () => buildItems().map((item) => item.embed);

  function exportPayload() {
    const embeds = buildEmbeds();
    if (!embeds.length) return {};
    return embeds.length > 1 ? { embeds } : embeds[0];
  }

  /* ---------------- onglets ---------------- */

  function setActive(index) {
    doc.active = Math.min(Math.max(0, index), doc.embeds.length - 1);
    state = doc.embeds[doc.active];
    renderTabs();
    syncInputs();
    renderFields();
    updatePreview();
    save();
  }

  function setState(next) {
    doc.embeds[doc.active] = next;
    state = next;
  }

  function embeddingLabel(embed, index) {
    const title = String(embed.title ?? '').trim();
    return title ? title.slice(0, 24) : `Embed ${index + 1}`;
  }

  function renderTabs() {
    const tabs = $('#embed-tabs');
    if (!tabs) return;

    tabs.innerHTML = doc.embeds
      .map(
        (embed, index) =>
          `<div class="embed-tab${index === doc.active ? ' is-active' : ''}" data-embed="${index}" ` +
          `role="button" tabindex="0" title="${escAttr(embeddingLabel(embed, index))}">` +
          `<span class="embed-tab-index">${index + 1}</span>` +
          `<span class="embed-tab-name">${escHtml(embeddingLabel(embed, index))}</span>` +
          (doc.embeds.length > 1
            ? `<span class="embed-tab-x" data-remove="${index}" title="Supprimer cet embed">&times;</span>`
            : '') +
          '</div>',
      )
      .join('');

    const counter = $('#counter-embeds');
    if (counter) {
      counter.textContent = `${doc.embeds.length} / ${MAX.embeds} embeds`;
      counter.classList.toggle('over', doc.embeds.length > MAX.embeds);
    }

    const addButton = $('#add-embed');
    if (addButton) addButton.disabled = doc.embeds.length >= MAX.embeds;
    const removeButton = $('#remove-embed');
    if (removeButton) removeButton.disabled = doc.embeds.length <= 1;
  }

  function addEmbed(copyCurrent) {
    if (doc.embeds.length >= MAX.embeds) {
      toast('10 embeds maximum par message');
      return;
    }
    const next = copyCurrent ? JSON.parse(JSON.stringify(state)) : blank();
    doc.embeds.push(next);
    doc.active = doc.embeds.length - 1;
    state = next;
    renderTabs();
    syncInputs();
    renderFields();
    updatePreview();
    save();
    toast(copyCurrent ? 'Embed duplique' : 'Embed ajoute');
  }

  function removeEmbed(index) {
    if (doc.embeds.length <= 1) {
      toast('Il faut garder au moins un embed');
      return;
    }
    doc.embeds.splice(index, 1);
    doc.active = Math.min(doc.active >= index ? doc.active - 1 : doc.active, doc.embeds.length - 1);
    doc.active = Math.max(0, doc.active);
    state = doc.embeds[doc.active];
    renderTabs();
    syncInputs();
    renderFields();
    updatePreview();
    save();
    toast('Embed supprime');
  }

  /* ---------------- apercu ---------------- */

  function renderEmbed(embed, isActive, label) {
    const colorHex = typeof embed.color === 'number' ? intToHex(embed.color) : DEFAULT_COLOR;
    const parts = [];

    if (embed.author) {
      parts.push(
        `<div class="dc-author">${
          embed.author.icon_url ? `<img src="${escAttr(embed.author.icon_url)}" alt="">` : ''
        }<span>${md(embed.author.name)}</span></div>`,
      );
    }
    if (embed.title) parts.push(`<div class="dc-title">${md(embed.title)}</div>`);
    if (embed.description) parts.push(`<div class="dc-desc">${md(embed.description)}</div>`);

    if (embed.fields && embed.fields.length) {
      const fieldsHtml = embed.fields
        .map(
          (field) =>
            `<div class="dc-field${field.inline ? '' : ' wide'}">` +
            `<div class="dc-field-name">${md(field.name)}</div>` +
            `<div class="dc-field-value">${md(field.value)}</div>` +
            '</div>',
        )
        .join('');
      parts.push(`<div class="dc-fields">${fieldsHtml}</div>`);
    }

    if (embed.image) {
      parts.push(`<div class="dc-image"><img src="${escAttr(embed.image.url)}" alt=""></div>`);
    }

    if (embed.footer || embed.timestamp) {
      const text = embed.footer ? md(embed.footer.text) : '';
      const ts = embed.timestamp
        ? new Date(embed.timestamp).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })
        : '';
      parts.push(
        `<div class="dc-footer">${
          embed.footer && embed.footer.icon_url
            ? `<img src="${escAttr(embed.footer.icon_url)}" alt="">`
            : ''
        }<span>${text}${text && ts ? ' - ' : ''}${ts}</span></div>`,
      );
    }

    const thumb = embed.thumbnail
      ? `<div class="dc-thumb"><img src="${escAttr(embed.thumbnail.url)}" alt=""></div>`
      : '';

    return (
      `<div class="dc-embed-wrap${isActive ? ' is-active' : ''}">` +
      (label ? `<div class="dc-embed-flag">${escHtml(label)}</div>` : '') +
      `<div class="dc-embed" style="border-left-color:${colorHex}">` +
      `<div class="dc-embed-body">${thumb}<div class="dc-embed-main">${parts.join('')}</div></div>` +
      '</div></div>'
    );
  }

  function updatePreview() {
    const items = buildItems();
    const total = items.reduce((sum, item) => sum + totalLength(item.embed), 0);

    const badge = $('#char-badge');
    badge.textContent = `${total} / ${MAX.total}`;
    badge.classList.toggle('over', total > MAX.total);
    $('#footer-total').textContent =
      `${total} caractere${total > 1 ? 's' : ''} - ${doc.embeds.length} embed${doc.embeds.length > 1 ? 's' : ''}`;

    $('#counter-title').textContent = `${state.title.length} / ${MAX.title}`;
    $('#counter-description').textContent = `${state.description.length} / ${MAX.description}`;
    $('#counter-fields').textContent = `${state.fields.length} / ${MAX.fields} champs`;
    $('#counter-fields').classList.toggle('over', state.fields.length > MAX.fields);

    const preview = $('#preview');

    if (!items.length) {
      preview.innerHTML =
        '<div class="dc-empty">L\'apercu s\'affiche ici<br><span>Commence par un titre ou une description.</span></div>';
      return;
    }

    preview.innerHTML = items
      .map((item) =>
        renderEmbed(
          item.embed,
          item.index === doc.active,
          items.length > 1 ? `Embed ${item.index + 1}` : '',
        ),
      )
      .join('');
  }

  /* ---------------- editeur de champs ---------------- */

  function renderFields() {
    const list = $('#fields-list');
    list.innerHTML = '';

    if (!state.fields.length) {
      list.innerHTML =
        '<p class="empty">Aucun champ pour l\'instant. Les champs inline s\'alignent par 3.</p>';
      return;
    }

    state.fields.forEach((field, index) => {
      const row = document.createElement('div');
      row.className = 'field-row';
      row.innerHTML =
        '<div class="field-row-head">' +
        `<span class="field-index">Champ ${index + 1}</span>` +
        '<div class="field-tools">' +
        `<label class="switch"><input type="checkbox" data-role="inline" ${
          field.inline ? 'checked' : ''
        }><span class="switch-track"></span><span class="switch-label">Inline</span></label>` +
        `<button class="btn btn-icon btn-sm btn-ghost" data-role="up" title="Monter" ${
          index === 0 ? 'disabled' : ''
        }>&#8593;</button>` +
        `<button class="btn btn-icon btn-sm btn-ghost" data-role="down" title="Descendre" ${
          index === state.fields.length - 1 ? 'disabled' : ''
        }>&#8595;</button>` +
        '<button class="btn btn-icon btn-sm btn-ghost" data-role="duplicate" title="Dupliquer">&#10697;</button>' +
        '<button class="btn btn-icon btn-sm btn-ghost danger" data-role="remove" title="Supprimer">&#10005;</button>' +
        '</div></div>' +
        `<input class="input" data-role="name" maxlength="${MAX.fieldName}" placeholder="Nom du champ" value="${escAttr(
          field.name,
        )}">` +
        `<textarea class="textarea" data-role="value" rows="2" maxlength="${
          MAX.fieldValue
        }" placeholder="Valeur du champ">${escHtml(field.value)}</textarea>`;

      const nameInput = row.querySelector('[data-role="name"]');
      const valueInput = row.querySelector('[data-role="value"]');

      nameInput.addEventListener('input', function () {
        state.fields[index].name = nameInput.value;
        updatePreview();
        renderTabs();
        save();
      });

      valueInput.addEventListener('input', function () {
        state.fields[index].value = valueInput.value;
        updatePreview();
        save();
      });

      row.querySelector('[data-role="inline"]').addEventListener('change', function (event) {
        state.fields[index].inline = event.target.checked;
        updatePreview();
        save();
      });

      row.querySelector('[data-role="remove"]').addEventListener('click', function () {
        state.fields.splice(index, 1);
        renderFields();
        updatePreview();
        renderTabs();
        save();
      });

      row.querySelector('[data-role="duplicate"]').addEventListener('click', function () {
        if (state.fields.length >= MAX.fields) {
          toast('25 champs maximum');
          return;
        }
        state.fields.splice(index + 1, 0, JSON.parse(JSON.stringify(state.fields[index])));
        renderFields();
        updatePreview();
        save();
      });

      row.querySelector('[data-role="up"]').addEventListener('click', function () {
        if (index === 0) return;
        const moved = state.fields.splice(index, 1)[0];
        state.fields.splice(index - 1, 0, moved);
        renderFields();
        updatePreview();
        save();
      });

      row.querySelector('[data-role="down"]').addEventListener('click', function () {
        if (index === state.fields.length - 1) return;
        const moved = state.fields.splice(index, 1)[0];
        state.fields.splice(index + 1, 0, moved);
        renderFields();
        updatePreview();
        save();
      });

      list.appendChild(row);
    });
  }

  /* ---------------- inputs <-> state ---------------- */

  const bindings = [
    ['title', 'title'],
    ['url', 'url'],
    ['description', 'description'],
    ['author-name', 'author.name'],
    ['author-url', 'author.url'],
    ['author-icon', 'author.icon_url'],
    ['image', 'image'],
    ['thumbnail', 'thumbnail'],
    ['footer-text', 'footer.text'],
    ['footer-icon', 'footer.icon_url'],
  ];

  function syncInputs() {
    bindings.forEach(function (pair) {
      const element = document.getElementById(pair[0]);
      if (element) element.value = getPath(state, pair[1]) ?? '';
    });
    $('#color-hex').value = state.color;
    $('#color-picker').value = /^#[0-9a-f]{6}$/i.test(state.color) ? state.color : DEFAULT_COLOR;
    $('#timestamp').checked = Boolean(state.timestamp);
    $('#timestamp-date').value = typeof state.timestamp === 'string' ? toLocalInput(state.timestamp) : '';
    $('#timestamp-date').disabled = !state.timestamp;
  }

  function bindInputs() {
    bindings.forEach(function (pair) {
      const element = document.getElementById(pair[0]);
      if (!element) return;
      element.addEventListener('input', function () {
        setPath(state, pair[1], element.value);
        if (pair[0] === 'title') renderTabs();
        updatePreview();
        save();
      });
    });

    ['image', 'thumbnail'].forEach(function (id) {
      const element = document.getElementById(id);
      if (!element) return;
      element.addEventListener('change', function () {
        const next = gifify(element.value);
        if (next !== element.value) {
          element.value = next;
          state[id] = next;
          updatePreview();
          save();
          toast('Lien GIF converti en fichier direct');
        }
      });
    });

    $('#color-hex').addEventListener('input', function (event) {
      state.color = event.target.value;
      if (/^#[0-9a-f]{6}$/i.test(state.color)) $('#color-picker').value = state.color;
      updatePreview();
      save();
    });

    $('#color-picker').addEventListener('input', function (event) {
      state.color = event.target.value;
      $('#color-hex').value = event.target.value;
      updatePreview();
      save();
    });

    $('#timestamp').addEventListener('change', function (event) {
      const enabled = event.target.checked;
      const dateInput = $('#timestamp-date');
      dateInput.disabled = !enabled;
      if (!enabled) {
        state.timestamp = false;
        dateInput.value = '';
      } else if (dateInput.value) {
        const date = new Date(dateInput.value);
        state.timestamp = Number.isNaN(date.getTime()) ? true : date.toISOString();
      } else {
        state.timestamp = true;
        dateInput.value = toLocalInput(new Date().toISOString());
      }
      updatePreview();
      save();
    });

    $('#timestamp-date').addEventListener('input', function (event) {
      if (!state.timestamp) return;
      const date = new Date(event.target.value);
      state.timestamp = Number.isNaN(date.getTime()) ? true : date.toISOString();
      updatePreview();
      save();
    });

    $('#add-field').addEventListener('click', function () {
      if (state.fields.length >= MAX.fields) {
        toast('25 champs maximum');
        return;
      }
      state.fields.push({ name: '', value: '', inline: true });
      renderFields();
      updatePreview();
      save();
      const rows = $$('.field-row');
      const last = rows[rows.length - 1];
      if (last) {
        const input = last.querySelector('[data-role="name"]');
        if (input) input.focus();
      }
    });

    $('#swatches').addEventListener('click', function (event) {
      const swatch = event.target.closest('[data-color]');
      if (!swatch) return;
      state.color = swatch.dataset.color;
      $('#color-hex').value = state.color;
      $('#color-picker').value = state.color;
      updatePreview();
      save();
    });
  }

  /* ---------------- actions ---------------- */

  async function copy(text, label) {
    try {
      await navigator.clipboard.writeText(text);
      toast(label);
    } catch (error) {
      const area = document.createElement('textarea');
      area.value = text;
      document.body.appendChild(area);
      area.select();
      document.execCommand('copy');
      area.remove();
      toast(label);
    }
  }

  function download() {
    const blob = new Blob([JSON.stringify(exportPayload(), null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = doc.embeds.length > 1 ? 'embeds.json' : 'embed.json';
    link.click();
    URL.revokeObjectURL(url);
    toast('Fichier telecharge');
  }

  function fromApi(candidate) {
    const next = blank();
    next.title = candidate.title || '';
    next.description = candidate.description || '';
    next.url = candidate.url || '';
    next.color =
      typeof candidate.color === 'number'
        ? intToHex(candidate.color)
        : typeof candidate.color === 'string'
          ? candidate.color
          : DEFAULT_COLOR;
    if (candidate.author) {
      next.author.name = candidate.author.name || '';
      next.author.url = candidate.author.url || '';
      next.author.icon_url = candidate.author.icon_url || '';
    }
    next.thumbnail =
      (candidate.thumbnail && candidate.thumbnail.url) ||
      (typeof candidate.thumbnail === 'string' ? candidate.thumbnail : '') ||
      '';
    next.image =
      (candidate.image && candidate.image.url) ||
      (typeof candidate.image === 'string' ? candidate.image : '') ||
      candidate.gif ||
      '';
    if (candidate.footer) {
      next.footer.text = candidate.footer.text || '';
      next.footer.icon_url = candidate.footer.icon_url || '';
    }
    next.timestamp = Boolean(candidate.timestamp);
    next.fields = Array.isArray(candidate.fields)
      ? candidate.fields.map(function (field) {
          return {
            name: field && field.name === '\u200b' ? '' : (field && field.name) || '',
            value: field && field.value === '\u200b' ? '' : (field && field.value) || '',
            inline: Boolean(field && field.inline),
          };
        })
      : [];
    return next;
  }

  function importJson(raw) {
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (error) {
      toast('JSON invalide');
      return;
    }

    let candidates = [];
    if (Array.isArray(parsed)) candidates = parsed;
    else if (Array.isArray(parsed && parsed.embeds)) candidates = parsed.embeds;
    else if (parsed && parsed.embed && typeof parsed.embed === 'object') candidates = [parsed.embed];
    else if (parsed && typeof parsed === 'object') candidates = [parsed];

    candidates = candidates.filter((item) => item && typeof item === 'object');

    if (!candidates.length) {
      toast('Aucun embed trouve');
      return;
    }
    if (candidates.length > MAX.embeds) {
      toast(`10 embeds maximum : ${candidates.length} trouves`);
      candidates = candidates.slice(0, MAX.embeds);
    }

    doc.embeds = candidates.map(fromApi);
    doc.active = 0;
    state = doc.embeds[0];
    renderTabs();
    syncInputs();
    renderFields();
    updatePreview();
    save();
    toast(`${doc.embeds.length} embed${doc.embeds.length > 1 ? 's' : ''} importe${doc.embeds.length > 1 ? 's' : ''}`);
  }

  function save() {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ v: 2, embeds: doc.embeds, active: doc.active }),
      );
    } catch (error) {
      /* stockage indisponible */
    }
  }

  function hydrate(raw) {
    const base = blank();
    return Object.assign({}, base, raw, {
      author: Object.assign({}, base.author, raw.author || {}),
      footer: Object.assign({}, base.footer, raw.footer || {}),
      fields: Array.isArray(raw.fields) ? raw.fields : [],
      color: typeof raw.color === 'string' ? raw.color : DEFAULT_COLOR,
    });
  }

  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);

      if (parsed && parsed.v === 2 && Array.isArray(parsed.embeds) && parsed.embeds.length) {
        doc.embeds = parsed.embeds.slice(0, MAX.embeds).map(hydrate);
        doc.active = Math.min(Math.max(0, parsed.active | 0), doc.embeds.length - 1);
      } else if (parsed && typeof parsed === 'object') {
        doc.embeds = [hydrate(parsed)];
        doc.active = 0;
      }
      state = doc.embeds[doc.active];
    } catch (error) {
      doc.embeds = [blank()];
      doc.active = 0;
      state = doc.embeds[0];
    }
  }

  let toastTimer = null;
  function toast(message) {
    const element = $('#toast');
    element.textContent = message;
    element.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      element.classList.remove('show');
    }, 1800);
  }

  /* ---------------- envoi direct via l'API du bot ---------------- */

  function apiBase() {
    const stored = (localStorage.getItem(STORAGE_API) || '').trim().replace(/\/+$/, '');
    if (stored) return stored;
    if (/(^|\.)(localhost|127\.0\.0\.1)$/.test(location.hostname)) return 'http://localhost:3000';
    return '';
  }

  function setSendStatus(message, kind) {
    const element = $('#send-status');
    if (!element) return;
    element.textContent = message;
    element.dataset.kind = kind || '';
  }

  async function apiFetch(path, options) {
    const base = apiBase();
    if (!base) throw new Error("Renseigne l'adresse de l'API du bot.");
    const token = localStorage.getItem(STORAGE_TOKEN) || '';
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers.Authorization = 'Bearer ' + token;
    const response = await fetch(base + path, Object.assign({ headers }, options || {}));
    let data = {};
    try {
      data = await response.json();
    } catch (error) {
      data = {};
    }
    if (!response.ok) throw new Error(data.message || data.error || 'Erreur ' + response.status);
    return data;
  }

  function renderSession(payload) {
    session = payload || null;
    const login = $('#send-login');
    const ready = $('#send-ready');
    if (!login || !ready) return;

    if (!session) {
      login.hidden = false;
      ready.hidden = true;
      return;
    }

    login.hidden = true;
    ready.hidden = false;

    const user = session.user || {};
    const guilds = session.guilds || [];
    $('#send-user').innerHTML =
      (user.avatar ? `<img src="${escAttr(user.avatar)}" alt="">` : '') +
      '<div><strong>' +
      escHtml(user.globalName || user.username || 'Compte Discord') +
      '</strong><span>' +
      guilds.length +
      ' serveur' +
      (guilds.length > 1 ? 's' : '') +
      ' disponible' +
      (guilds.length > 1 ? 's' : '') +
      '</span></div>';

    const guildSelect = $('#guild-select');
    guildSelect.innerHTML = guilds.length
      ? guilds
          .map((guild) => `<option value="${escAttr(guild.id)}">${escHtml(guild.name)}</option>`)
          .join('')
      : '<option value="">Aucun serveur disponible</option>';

    loadChannels();
  }

  async function loadChannels() {
    const guildId = $('#guild-select').value;
    const select = $('#channel-select');
    if (!guildId) {
      select.innerHTML = '<option value="">-</option>';
      setSendStatus("Aucun serveur disponible : invite le bot et verifie tes droits.", 'error');
      return;
    }
    select.innerHTML = '<option value="">Chargement...</option>';
    try {
      const data = await apiFetch('/api/guilds/' + encodeURIComponent(guildId) + '/channels');
      select.innerHTML = data.channels.length
        ? data.channels
            .map((channel) => `<option value="${escAttr(channel.id)}">#${escHtml(channel.name)}</option>`)
            .join('')
        : '<option value="">Aucun salon disponible</option>';
      setSendStatus(
        data.channels.length ? 'Pret a envoyer.' : 'Le bot ne peut ecrire dans aucun salon de ce serveur.',
        data.channels.length ? 'ok' : 'error',
      );
    } catch (error) {
      select.innerHTML = '';
      setSendStatus(error.message, 'error');
    }
  }

  async function sendMessage() {
    const embeds = buildEmbeds();
    if (!embeds.length) {
      toast("Ajoute du contenu avant d'envoyer");
      return;
    }
    const button = $('#send-message');
    button.disabled = true;
    setSendStatus('Envoi en cours...');
    try {
      const data = await apiFetch('/api/send', {
        method: 'POST',
        body: JSON.stringify({
          guildId: $('#guild-select').value,
          channelId: $('#channel-select').value,
          embeds,
        }),
      });
      const link = $('#send-link');
      if (link && data.url) {
        link.href = data.url;
        link.hidden = false;
      }
      const warnings = Array.isArray(data.warnings) ? data.warnings : [];
      setSendStatus(
        warnings.length ? 'Envoye, avec avertissement : ' + warnings[0] : 'Message envoye sur Discord.',
        warnings.length ? 'warn' : 'ok',
      );
      toast('Message envoye');
    } catch (error) {
      setSendStatus(error.message, 'error');
      toast('Envoi impossible');
    } finally {
      button.disabled = false;
    }
  }

  function readHashSession() {
    const hash = location.hash.replace(/^#/, '');
    if (!hash) return;
    const params = new URLSearchParams(hash);
    const token = params.get('token');
    const error = params.get('error');
    if (token) localStorage.setItem(STORAGE_TOKEN, token);
    if (error) setSendStatus(decodeURIComponent(error), 'error');
    if (token || error) history.replaceState(null, '', location.pathname + location.search);
  }

  async function initSend() {
    if (!$('#api-url')) return;
    $('#api-url').value = apiBase();
    readHashSession();

    $('#discord-login').addEventListener('click', function () {
      const base = ($('#api-url').value || '').trim().replace(/\/+$/, '');
      if (!base) {
        toast("Indique l'adresse de l'API du bot");
        return;
      }
      localStorage.setItem(STORAGE_API, base);
      window.location.href = base + '/auth/discord';
    });

    $('#guild-select').addEventListener('change', loadChannels);
    $('#send-message').addEventListener('click', sendMessage);

    $('#discord-logout').addEventListener('click', async function () {
      try {
        await apiFetch('/api/logout', { method: 'POST' });
      } catch (error) {
        /* deja deconnecte */
      }
      localStorage.removeItem(STORAGE_TOKEN);
      renderSession(null);
      setSendStatus('Deconnecte.');
    });

    if (!localStorage.getItem(STORAGE_TOKEN) || !apiBase()) {
      renderSession(null);
      return;
    }
    try {
      renderSession(await apiFetch('/api/me'));
    } catch (error) {
      localStorage.removeItem(STORAGE_TOKEN);
      renderSession(null);
      setSendStatus(error.message, 'error');
    }
  }

  /* ---------------- modeles ---------------- */

  const templates = {
    annonce: function () {
      const data = blank();
      data.title = 'Grande annonce';
      data.description =
        'Nous avons le plaisir de vous annoncer **une nouveaute** sur le serveur.\n\n' +
        '> *Plus d infos ci-dessous.*\n\n' +
        'Merci de votre soutien !';
      data.color = '#5865f2';
      data.author = { name: 'Equipe du serveur', url: '', icon_url: '' };
      data.fields = [
        { name: 'Quand ?', value: 'Samedi 20h00', inline: true },
        { name: 'Ou ?', value: 'Salon vocal principal', inline: true },
        { name: 'Bonus', value: 'Role exclusif pour les participants', inline: true },
      ];
      data.footer = { text: 'EmbedForge', icon_url: '' };
      data.timestamp = true;
      return data;
    },
    reglement: function () {
      const data = blank();
      data.title = 'Reglement du serveur';
      data.description = 'En restant sur ce serveur, tu acceptes les regles suivantes.';
      data.color = '#ed4245';
      data.fields = [
        { name: '1. Respect', value: 'Aucune insulte, harcelement ou discrimination.', inline: false },
        { name: '2. Spam', value: 'Pas de flood, de publicite ou de liens douteux.', inline: false },
        { name: '3. Salons', value: 'Chaque salon a un sujet : reste dans le theme.', inline: false },
        { name: '4. Sanctions', value: 'Avertissement, puis mute, puis ban.', inline: false },
      ];
      data.footer = { text: 'Bonne visite !', icon_url: '' };
      return data;
    },
    maj: function () {
      const data = blank();
      data.title = 'Mise a jour v1.0';
      data.description =
        '**Nouveautes**\n- Constructeur d embeds `/embed`\n- Apercu prive avant envoi\n- Import JSON depuis le site web';
      data.color = '#3ba55d';
      data.author = { name: 'Changelog', url: '', icon_url: '' };
      data.fields = [
        { name: 'Corrections', value: 'Divers correctifs de stabilite', inline: true },
        { name: 'A venir', value: 'Edition des embeds deja envoyes', inline: true },
      ];
      data.footer = { text: 'Version 1.0.0', icon_url: '' };
      data.timestamp = true;
      return data;
    },
    sondage: function () {
      const data = blank();
      data.title = 'Sondage de la semaine';
      data.description =
        'Quel evenement voulez-vous samedi ?\n\n1. Tournoi\n2. Soiree film\n3. Quiz';
      data.color = '#faa61a';
      data.fields = [{ name: 'Vote', value: 'Reagis avec l emoji de ton choix !', inline: false }];
      data.footer = { text: 'Resultats dimanche soir', icon_url: '' };
      return data;
    },
    profil: function () {
      const data = blank();
      data.title = 'Ma presentation';
      data.description = 'Salut, moi c est **Buffy** !';
      data.color = '#9b59b6';
      data.author = { name: 'Presentation', url: '', icon_url: '' };
      data.thumbnail = 'https://cdn.discordapp.com/embed/avatars/0.png';
      data.fields = [
        { name: 'Jeux', value: 'Minecraft, Valorant', inline: true },
        { name: 'Musique', value: 'Synthwave', inline: true },
        { name: 'Langues', value: 'FR / EN', inline: true },
      ];
      data.footer = { text: 'Bienvenue !', icon_url: '' };
      return data;
    },
  };

  /* ---------------- init ---------------- */

  function initTheme() {
    const stored = localStorage.getItem(STORAGE_THEME);
    const dark = stored ? stored === 'dark' : true;
    document.documentElement.classList.toggle('dark', dark);
    const button = $('#theme-toggle');
    button.textContent = dark ? '\u{1F319}' : '\u2600\uFE0F';
    button.addEventListener('click', function () {
      const isDark = document.documentElement.classList.toggle('dark');
      localStorage.setItem(STORAGE_THEME, isDark ? 'dark' : 'light');
      button.textContent = isDark ? '\u{1F319}' : '\u2600\uFE0F';
    });
  }

  function initSwatches() {
    const colors = [
      '#5865f2', '#ed4245', '#3ba55d', '#faa61a', '#9b59b6',
      '#eb459e', '#57f287', '#2b2d31', '#ffffff', '#000000',
    ];
    $('#swatches').innerHTML = colors
      .map(function (color) {
        return `<button class="swatch" data-color="${color}" style="background:${color}" title="${color}"></button>`;
      })
      .join('');
  }

  function init() {
    initTheme();
    initSwatches();
    load();
    renderTabs();
    syncInputs();
    bindInputs();
    renderFields();
    updatePreview();

    initSend();

    $('#templates').addEventListener('click', function (event) {
      const button = event.target.closest('[data-template]');
      if (!button) return;
      const factory = templates[button.dataset.template];
      if (!factory) return;
      setState(factory());
      renderTabs();
      syncInputs();
      renderFields();
      updatePreview();
      save();
      toast('Modele charge');
    });

    $('#embed-tabs').addEventListener('click', function (event) {
      const close = event.target.closest('[data-remove]');
      if (close) {
        event.stopPropagation();
        removeEmbed(Number(close.dataset.remove));
        return;
      }
      const tab = event.target.closest('[data-embed]');
      if (tab) setActive(Number(tab.dataset.embed));
    });

    $('#embed-tabs').addEventListener('keydown', function (event) {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      const tab = event.target.closest('[data-embed]');
      if (!tab) return;
      event.preventDefault();
      setActive(Number(tab.dataset.embed));
    });

    $('#add-embed').addEventListener('click', function () {
      addEmbed(false);
    });

    $('#duplicate-embed').addEventListener('click', function () {
      addEmbed(true);
    });

    $('#remove-embed').addEventListener('click', function () {
      removeEmbed(doc.active);
    });

    $('#copy-json').addEventListener('click', function () {
      copy(JSON.stringify(exportPayload(), null, 2), 'JSON copie');
    });

    $('#copy-code').addEventListener('click', function () {
      const embeds = buildEmbeds();
      const code =
        "const { EmbedBuilder } = require('discord.js');\n" +
        'await channel.send({\n  embeds: [\n' +
        embeds
          .map(function (embed) {
            return '    EmbedBuilder.from(' + JSON.stringify(embed, null, 2).replace(/\n/g, '\n    ') + ')';
          })
          .join(',\n') +
        '\n  ],\n});';
      copy(code, 'Code discord.js copie');
    });

    $('#download').addEventListener('click', download);

    $('#reset').addEventListener('click', function () {
      if (!window.confirm('Reinitialiser tout le message ?')) return;
      doc.embeds = [blank()];
      doc.active = 0;
      state = doc.embeds[0];
      $('#import-json').value = '';
      renderTabs();
      syncInputs();
      renderFields();
      updatePreview();
      save();
      toast('Reinitialise');
    });

    $('#import-btn').addEventListener('click', function () {
      const raw = $('#import-json').value.trim();
      if (!raw) {
        toast('Colle un JSON d abord');
        return;
      }
      importJson(raw);
    });

    $('#clear-btn').addEventListener('click', function () {
      $('#import-json').value = '';
    });
  }

  document.addEventListener('DOMContentLoaded', init);
})();
