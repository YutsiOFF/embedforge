'use strict';

const {
  ActionRowBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} = require('discord.js');

function input(id, label, options = {}) {
  const {
    style = TextInputStyle.Short,
    required = false,
    value = '',
    placeholder = '',
    maxLength = null,
  } = options;

  const builder = new TextInputBuilder()
    .setCustomId(id)
    .setLabel(label)
    .setStyle(style)
    .setRequired(required);

  if (value) builder.setValue(String(value).slice(0, maxLength ?? 4000));
  if (placeholder) builder.setPlaceholder(placeholder);
  if (maxLength) builder.setMaxLength(maxLength);

  return new ActionRowBuilder().addComponents(builder);
}

function createModal(data = {}) {
  return new ModalBuilder()
    .setCustomId('embmodal:create')
    .setTitle('Construire un embed')
    .addComponents(
      input('title', 'Titre', { value: data.title, maxLength: 256 }),
      input('description', 'Description', {
        style: TextInputStyle.Paragraph,
        value: data.description,
        maxLength: 4000,
        placeholder: '**gras**, *italique*, [lien](https://exemple.com)',
      }),
      input('color', 'Couleur hexadecimal', {
        value: data.color,
        maxLength: 7,
        placeholder: '#5865F2',
      }),
      input('image', 'Image (URL https://...)', { value: data.image?.url, maxLength: 512 }),
      input('thumbnail', 'Miniature (URL https://...)', {
        value: data.thumbnail?.url,
        maxLength: 512,
      }),
    );
}

function fieldModal() {
  return new ModalBuilder()
    .setCustomId('embmodal:field')
    .setTitle('Ajouter un champ')
    .addComponents(
      input('name', 'Nom du champ', { required: true, maxLength: 256 }),
      input('value', 'Valeur du champ', {
        style: TextInputStyle.Paragraph,
        required: true,
        maxLength: 1024,
      }),
      input('inline', 'Sur la meme ligne ? (oui / non)', {
        maxLength: 3,
        placeholder: 'oui',
      }),
    );
}

function metaModal(data = {}) {
  return new ModalBuilder()
    .setCustomId('embmodal:meta')
    .setTitle('Auteur, footer et horodatage')
    .addComponents(
      input('author_name', "Nom de l'auteur", { value: data.author?.name, maxLength: 256 }),
      input('author_icon', "Icone de l'auteur (URL)", {
        value: data.author?.icon_url,
        maxLength: 512,
      }),
      input('footer_text', 'Texte du footer', { value: data.footer?.text, maxLength: 2048 }),
      input('footer_icon', 'Icone du footer (URL)', {
        value: data.footer?.icon_url,
        maxLength: 512,
      }),
      input('timestamp', 'Horodatage automatique ? (oui / non)', {
        maxLength: 3,
        value: data.timestamp ? 'oui' : 'non',
        placeholder: 'oui',
      }),
    );
}

function importModal() {
  return new ModalBuilder()
    .setCustomId('embmodal:import')
    .setTitle('Importer un embed (JSON)')
    .addComponents(
      input('json', 'Colle le JSON exporte par le site', {
        style: TextInputStyle.Paragraph,
        required: true,
        maxLength: 4000,
        placeholder: '{ "title": "Mon annonce", "color": 5793266 }',
      }),
    );
}

module.exports = { createModal, fieldModal, metaModal, importModal };
