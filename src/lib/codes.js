'use strict';

/**
 * Codes de connexion a usage unique : `/embed lien` en genere un, le site
 * l'echange contre une session. Aucun client secret, aucune redirection OAuth.
 */

const crypto = require('node:crypto');

const TTL = 10 * 60 * 1000;
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const codes = new Map();

function create(userId, ttl = TTL) {
  let code = '';
  do {
    code = Array.from({ length: 8 }, () => ALPHABET[crypto.randomInt(ALPHABET.length)]).join('');
  } while (codes.has(code));

  codes.set(code, { userId, at: Date.now(), ttl });

  const timer = setTimeout(() => codes.delete(code), ttl);
  if (typeof timer.unref === 'function') timer.unref();

  return code;
}

function take(value) {
  const key = String(value || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
  if (!key) return null;

  const entry = codes.get(key);
  if (!entry) return null;

  codes.delete(key);
  if (Date.now() - entry.at > entry.ttl) return null;
  return entry;
}

module.exports = { create, take, TTL };
