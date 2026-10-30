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
  };

  const DEFAULT_COLOR = '#5865f2';
  const STORAGE_KEY = 'embedforge.state';
  const STORAGE_THEME = 'embedforge.theme';

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

  let state = blank();

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

  function hexToInt(value) {
    const match = String(value ?? '').trim().match(/^#?([0-9a-f]{6})$/i);
    return match ? parseInt(match[1], 16) : null;
  }

  const intToHex = (value) => `#${Number(value).toString(16).padStart(6, '0')}`;

  function setPath(object, path, value) {
    const parts = path.split('.');
    let current = object;
    for (let i = 0; i < parts.length - 1; i += 1) current = current[parts[i]];
    current[parts[parts.length - 1]] = value;
  }

  const getPath = (object, path) => path.split('.').reduce((acc, key) => (acc ? acc[key] : undefined), object);

  function totalLength(embed) {
    return (
      (embed.title?.length || 0) +
      (embed.description?.length || 0) +
      (embed.footer?.text?.length || 0) +
      (embed.author?.name?.length || 0) +
      (embed.fields || []).reduce((sum, field) => sum + field.name.length + field.value.length, 0)
    );
  }

  function buildEmbed() {
    const embed = {};

    const title = state.title.trim();
    if (title) embed.title = title.slice(0, MAX.title);

    const description = state.description.replace(/\r\n/g, '\n').trim();
    if (description) embed.description = description.slice(0, MAX.description);

    if (isUrl(state.url)) embed.url = state.url.trim();

    const color = hexToInt(state.color);
    if (color !== null) embed.color = color;

    if (state.author.name.trim()) {
      embed.author = { name: state.author.name.trim().slice(0, MAX.author) };
      if (isUrl(state.author.url)) embed.author.url = state.author.url.trim();
      if (isUrl(state.author.icon_url)) embed.author.icon_url = state.author.icon_url.trim();
    }

    if (isUrl(state.thumbnail)) embed.thumbnail = { url: state.thumbnail.trim() };
    if (isUrl(state.image)) embed.image = { url: state.image.trim() };

    if (state.footer.text.trim()) {
      embed.footer = { text: state.footer.text.trim().slice(0, MAX.footer) };
      if (isUrl(state.footer.icon_url)) embed.footer.icon_url = state.footer.icon_url.trim();
    }

    if (state.timestamp) embed.timestamp = new Date().toISOString();

    const fields = state.fields
      .filter((field) => field.name.trim() || field.value.trim())
      .slice(0, MAX.fields)
      .map((field) => ({
        name: (field.name.trim() || '\u200b').slice(0, MAX.fieldName),
        value: (field.value.trim() || '\u200b').slice(0, MAX.fieldValue),
        inline: Boolean(field.inline),
      }));
    if (fields.length) embed.fields = fields;

    if (totalLength(embed) > MAX.total) {
      while (totalLength(embed) > MAX.total && embed.fields?.length) embed.fields.pop();
      if (!embed.fields?.length) delete embed.fields;
      if (totalLength(embed) > MAX.total && embed.description) {
        const overflow = totalLength(embed) - MAX.total;
        embed.description = `${embed.description.slice(0, Math.max(0, embed.description.length - overflow - 3))}...`;
      }
    }

    return embed;
  }

  function updatePreview() {
    const embed = buildEmbed();
    const total = totalLength(embed);

    const badge = $('#char-badge');
    badge.textContent = `${total} / ${MAX.total}`;
    badge.classList.toggle('over', total > MAX.total);
    $('#footer-total').textContent = `${total} caractere${total > 1 ? 's' : ''}`;

    $('#counter-title').textContent = `${state.title.length} / ${MAX.title}`;
    $('#counter-description').textContent = `${state.description.length} / ${MAX.description}`;
    $('#counter-fields').textContent = `${state.fields.length} / ${MAX.fields} champs`;
    $('#counter-fields').classList.toggle('over', state.fields.length > MAX.fields);

    const preview = $('#preview');

    if (!Object.keys(embed).length) {
      preview.innerHTML =
        '<div class="dc-empty">L\'apercu s\'affiche ici<br><span>Commence par un titre ou une description.</span></div>';
      return;
    }

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

    preview.innerHTML =
      `<div class="dc-embed" style="border-left-color:${colorHex}">` +
      `<div class="dc-embed-body">${thumb}<div class="dc-embed-main">${parts.join('')}</div></div>` +
      '</div>';
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
  }

  function bindInputs() {
    bindings.forEach(function (pair) {
      const element = document.getElementById(pair[0]);
      if (!element) return;
      element.addEventListener('input', function () {
        setPath(state, pair[1], element.value);
        updatePreview();
        save();
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
      state.timestamp = event.target.checked;
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
    const blob = new Blob([JSON.stringify(buildEmbed(), null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'embed.json';
    link.click();
    URL.revokeObjectURL(url);
    toast('embed.json telecharge');
  }

  function importJson(raw) {
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (error) {
      toast('JSON invalide');
      return;
    }

    const candidate = Array.isArray(parsed && parsed.embeds) ? parsed.embeds[0] : (parsed && parsed.embed) || parsed;
    if (!candidate || typeof candidate !== 'object') {
      toast('Aucun embed trouve');
      return;
    }

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
    next.thumbnail = (candidate.thumbnail && candidate.thumbnail.url) || '';
    next.image = (candidate.image && candidate.image.url) || '';
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

    state = next;
    syncInputs();
    renderFields();
    updatePreview();
    save();
    toast('JSON importe');
  }

  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (error) {
      /* stockage indisponible */
    }
  }

  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      const base = blank();
      state = Object.assign({}, base, parsed, {
        author: Object.assign({}, base.author, parsed.author || {}),
        footer: Object.assign({}, base.footer, parsed.footer || {}),
        fields: Array.isArray(parsed.fields) ? parsed.fields : [],
      });
    } catch (error) {
      state = blank();
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
    syncInputs();
    bindInputs();
    renderFields();
    updatePreview();

    $('#templates').addEventListener('click', function (event) {
      const button = event.target.closest('[data-template]');
      if (!button) return;
      const factory = templates[button.dataset.template];
      if (!factory) return;
      state = factory();
      syncInputs();
      renderFields();
      updatePreview();
      save();
      toast('Modele charge');
    });

    $('#copy-json').addEventListener('click', function () {
      copy(JSON.stringify(buildEmbed(), null, 2), 'JSON copie');
    });

    $('#copy-code').addEventListener('click', function () {
      const code =
        "const { EmbedBuilder } = require('discord.js');\n" +
        'await channel.send({ embeds: [EmbedBuilder.from(' +
        JSON.stringify(buildEmbed(), null, 2) +
        ')] });';
      copy(code, 'Code discord.js copie');
    });

    $('#download').addEventListener('click', download);

    $('#reset').addEventListener('click', function () {
      if (!window.confirm('Reinitialiser le constructeur ?')) return;
      state = blank();
      $('#import-json').value = '';
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
