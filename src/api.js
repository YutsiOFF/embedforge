'use strict';

/**
 * API HTTP du bot : connexion Discord (OAuth2), liste des serveurs/salons
 * et envoi direct des embeds construits sur le site.
 *
 * Le site est statique (GitHub Pages) : il ne peut pas garder un token.
 * Tout ce qui est secret (client secret, token du bot) reste ici.
 */

const http = require('node:http');
const crypto = require('node:crypto');
const { URL } = require('node:url');
const { PermissionsBitField } = require('discord.js');

const { sanitizeMany } = require('./lib/embed');
const codes = require('./lib/codes');

const VERSION = '1.0.0';
const BODY_LIMIT = 512 * 1024;
const SESSION_TTL = 6 * 60 * 60 * 1000;
const STATE_TTL = 10 * 60 * 1000;
const RATE_WINDOW = 60 * 1000;
const RATE_MAX = 20;
const TEXT_CHANNELS = new Set([0, 5]); // GuildText, GuildAnnouncement
const MANAGE_GUILD = 0x20n;
const ADMINISTRATOR = 0x8n;
const DISCORD_API = 'https://discord.com/api/v10';

const sessions = new Map();
const states = new Map();
const sends = new Map();

let cleanTimer = null;

function resolveConfig() {
  const port = Number(process.env.API_PORT || 3000);
  const safePort = Number.isFinite(port) && port > 0 ? port : 3000;
  const publicUrl = String(process.env.API_PUBLIC_URL || `http://localhost:${safePort}`).replace(/\/+$/, '');
  return {
    port: safePort,
    clientId: String(process.env.CLIENT_ID || '').trim(),
    clientSecret: String(process.env.DISCORD_CLIENT_SECRET || '').trim(),
    siteUrl: String(process.env.SITE_URL || '').trim().replace(/\/+$/, ''),
    publicUrl,
    // Doit correspondre EXACTEMENT a une Redirect URL du portail Discord.
    redirectUri: String(process.env.DISCORD_REDIRECT_URI || `${publicUrl}/auth/discord/callback`).trim(),
  };
}

/* ---------------- helpers HTTP ---------------- */

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
  });
  res.end(body);
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > BODY_LIMIT) {
        reject(new Error('payload_too_large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8').trim();
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch (error) {
        reject(new Error('invalid_json'));
      }
    });
    req.on('error', reject);
  });
}

function originAllowed(origin, config) {
  if (!origin) return true;
  if (origin === 'null') return true;
  let host = '';
  try {
    host = new URL(origin).hostname;
  } catch (error) {
    return false;
  }
  if (host === 'localhost' || host === '127.0.0.1') return true;
  if (config.siteUrl) {
    try {
      if (origin === new URL(config.siteUrl).origin) return true;
    } catch (error) {
      /* SITE_URL invalide : on ignore */
    }
  }
  return false;
}

/* ---------------- OAuth2 Discord ---------------- */

async function discordGet(path, accessToken) {
  const response = await fetch(`${DISCORD_API}${path}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw new Error(`discord_${response.status}`);
  return response.json();
}

function redirect(res, location) {
  res.writeHead(302, { Location: location, 'Cache-Control': 'no-store' });
  res.end();
}

function backToSite(res, config, fragment) {
  const base = config.siteUrl || 'http://localhost:8099';
  redirect(res, `${base}/#${fragment}`);
}

function startLogin(res, config) {
  if (!config.clientSecret) {
    return sendJson(res, 503, {
      error: 'oauth_not_configured',
      message: 'DISCORD_CLIENT_SECRET manquant dans le fichier .env du bot.',
    });
  }
  const state = crypto.randomBytes(16).toString('hex');
  states.set(state, { at: Date.now() });

  const target = new URL('https://discord.com/oauth2/authorize');
  target.searchParams.set('client_id', config.clientId);
  target.searchParams.set('redirect_uri', config.redirectUri);
  target.searchParams.set('response_type', 'code');
  target.searchParams.set('scope', 'identify guilds');
  target.searchParams.set('state', state);
  target.searchParams.set('prompt', 'none');
  redirect(res, target.toString());
}

async function finishLogin(res, url, config) {
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const entry = state ? states.get(state) : null;
  if (state) states.delete(state);

  if (url.searchParams.get('error')) {
    return backToSite(res, config, `error=${encodeURIComponent('Connexion Discord annulee')}`);
  }
  if (!code) return backToSite(res, config, `error=${encodeURIComponent('Code Discord absent')}`);
  if (!entry || Date.now() - entry.at > STATE_TTL) {
    return backToSite(res, config, `error=${encodeURIComponent('Session de connexion expiree, reessaie')}`);
  }
  if (!config.clientSecret) {
    return backToSite(res, config, `error=${encodeURIComponent('DISCORD_CLIENT_SECRET manquant')}`);
  }

  let token;
  try {
    const response = await fetch(`${DISCORD_API}/oauth2/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: config.clientId,
        client_secret: config.clientSecret,
        grant_type: 'authorization_code',
        code,
        redirect_uri: config.redirectUri,
      }),
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) {
      console.error('[api] oauth token', response.status, await response.text().catch(() => ''));
      return backToSite(
        res,
        config,
        `error=${encodeURIComponent('Discord a refuse la connexion : verifie le client secret et la Redirect URL')}`,
      );
    }
    token = await response.json();
  } catch (error) {
    console.error('[api] oauth', error);
    return backToSite(res, config, `error=${encodeURIComponent('Discord injoignable')}`);
  }

  try {
    const [user, guilds] = await Promise.all([
      discordGet('/users/@me', token.access_token),
      discordGet('/users/@me/guilds', token.access_token),
    ]);

    const id = crypto.randomBytes(24).toString('hex');
    sessions.set(id, {
      user: { id: user.id, username: user.username, globalName: user.global_name || '', avatar: avatarUrl(user) },
      guilds: Array.isArray(guilds) ? guilds : [],
      accessToken: token.access_token,
      expires: Date.now() + SESSION_TTL,
    });
    backToSite(res, config, `token=${id}`);
  } catch (error) {
    console.error('[api] profil', error);
    backToSite(res, config, `error=${encodeURIComponent('Impossible de lire ton profil Discord')}`);
  }
}

function avatarUrl(user) {
  if (!user || !user.avatar) return '';
  return `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=64`;
}

function currentSession(req) {
  const header = String(req.headers.authorization || '');
  if (!header.startsWith('Bearer ')) return null;
  const token = header.slice(7).trim();
  const entry = sessions.get(token);
  if (!entry) return null;
  if (entry.expires < Date.now()) {
    sessions.delete(token);
    return null;
  }
  entry.expires = Date.now() + SESSION_TTL;
  return { token, data: entry };
}

function logout(req, res) {
  const session = currentSession(req);
  if (session) sessions.delete(session.token);
  sendJson(res, 200, { ok: true });
}

/* ---------------- donnees Discord ---------------- */

function canManage(guild) {
  if (!guild) return false;
  if (guild.owner) return true;
  try {
    const permissions = BigInt(guild.permissions || '0');
    return (permissions & MANAGE_GUILD) !== 0n || (permissions & ADMINISTRATOR) !== 0n;
  } catch (error) {
    return false;
  }
}

function usableGuilds(session, client) {
  const list = session.data.guilds.filter((guild) => client.guilds.cache.has(guild.id) && canManage(guild));
  return list
    .map((guild) => ({
      id: guild.id,
      name: guild.name,
      icon: guild.icon ? `https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.png?size=64` : '',
    }))
    .sort((a, b) => a.name.localeCompare(b.name, 'fr'));
}

async function whoAmI(req, res, client) {
  const session = currentSession(req);
  if (!session) {
    return sendJson(res, 401, { error: 'not_authenticated', message: 'Reconnecte-toi avec Discord.' });
  }
  if (!session.data.computed && session.data.accessToken) {
    try {
      const guilds = await discordGet('/users/@me/guilds', session.data.accessToken);
      if (Array.isArray(guilds)) session.data.guilds = guilds;
    } catch (error) {
      /* on garde la liste mise en cache */
    }
  }
  if (session.data.computed) {
    session.data.guilds = await guildsForUser(client, session.data.user.id);
  }
  sendJson(res, 200, {
    user: session.data.user,
    guilds: session.data.computed ? session.data.guilds : usableGuilds(session, client),
    bot: client.user ? { tag: client.user.tag } : null,
  });
}

/** Serveurs ou cet utilisateur peut publier (droits calcules par le bot). */
async function guildsForUser(client, userId) {
  const result = [];
  for (const guild of client.guilds.cache.values()) {
    let member = guild.members.cache.get(userId);
    if (!member) {
      try {
        member = await guild.members.fetch(userId);
      } catch (error) {
        member = null;
      }
    }
    if (!member) continue;
    const allowed =
      member.permissions.has(PermissionsBitField.Flags.Administrator) ||
      member.permissions.has(PermissionsBitField.Flags.ManageGuild);
    if (!allowed) continue;
    result.push({
      id: guild.id,
      name: guild.name,
      icon: guild.icon ? `https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.png?size=64` : '',
    });
  }
  return result.sort((a, b) => a.name.localeCompare(b.name, 'fr'));
}

async function createCodeSession(req, res, client) {
  let body;
  try {
    body = await readJson(req);
  } catch (error) {
    return sendJson(res, 400, { error: 'bad_body', message: 'Corps JSON invalide.' });
  }

  const entry = codes.take(body.code);
  if (!entry) {
    return sendJson(res, 400, {
      error: 'bad_code',
      message: 'Code invalide ou expire : refais /embed lien dans Discord.',
    });
  }

  let user;
  try {
    const account = await client.users.fetch(entry.userId);
    user = {
      id: account.id,
      username: account.username,
      globalName: account.globalName || '',
      avatar: account.displayAvatarURL({ size: 64 }),
    };
  } catch (error) {
    return sendJson(res, 400, { error: 'unknown_user', message: 'Compte Discord introuvable.' });
  }

  const guilds = await guildsForUser(client, entry.userId);
  const token = crypto.randomBytes(24).toString('hex');
  sessions.set(token, {
    user,
    guilds,
    computed: true,
    accessToken: null,
    expires: Date.now() + SESSION_TTL,
  });

  sendJson(res, 200, { token, user, guilds });
}

async function botMember(guild, client) {
  if (guild.members.me) return guild.members.me;
  try {
    return await guild.members.fetch(client.user.id);
  } catch (error) {
    return null;
  }
}

function canPost(channel, member) {
  if (!member) return false;
  const permissions = channel.permissionsFor(member);
  if (!permissions) return false;
  return permissions.has([
    PermissionsBitField.Flags.ViewChannel,
    PermissionsBitField.Flags.SendMessages,
    PermissionsBitField.Flags.EmbedLinks,
  ]);
}

async function listChannels(req, res, client, guildId) {
  const session = currentSession(req);
  if (!session) return sendJson(res, 401, { error: 'not_authenticated', message: 'Reconnecte-toi avec Discord.' });

  const guild = client.guilds.cache.get(guildId);
  if (!guild) {
    return sendJson(res, 404, {
      error: 'bot_absent',
      message: 'Le bot n est pas sur ce serveur : invite-le d abord.',
    });
  }
  if (!session.data.guilds.some((entry) => entry.id === guildId)) {
    return sendJson(res, 403, { error: 'not_member', message: 'Tu n es pas membre de ce serveur.' });
  }

  const member = await botMember(guild, client);
  const channels = Array.from(guild.channels.cache.values())
    .filter((channel) => TEXT_CHANNELS.has(channel.type))
    .filter((channel) => canPost(channel, member))
    .map((channel) => ({ id: channel.id, name: channel.name, category: channel.parent ? channel.parent.name : '' }))
    .sort((a, b) => a.name.localeCompare(b.name, 'fr'));

  sendJson(res, 200, { guild: { id: guild.id, name: guild.name }, channels });
}

function rateLimited(token) {
  const now = Date.now();
  const hits = (sends.get(token) || []).filter((stamp) => now - stamp < RATE_WINDOW);
  if (hits.length >= RATE_MAX) {
    sends.set(token, hits);
    return true;
  }
  hits.push(now);
  sends.set(token, hits);
  return false;
}

async function sendMessage(req, res, client) {
  const session = currentSession(req);
  if (!session) return sendJson(res, 401, { error: 'not_authenticated', message: 'Reconnecte-toi avec Discord.' });
  if (rateLimited(session.token)) {
    return sendJson(res, 429, { error: 'rate_limited', message: 'Trop d envois : attends une minute.' });
  }

  let body;
  try {
    body = await readJson(req);
  } catch (error) {
    const message = error.message === 'payload_too_large' ? 'Message trop lourd.' : 'Corps JSON invalide.';
    return sendJson(res, 400, { error: 'bad_body', message });
  }

  const guildId = String(body.guildId || '').trim();
  const channelId = String(body.channelId || '').trim();
  if (!/^\d{5,25}$/.test(guildId) || !/^\d{5,25}$/.test(channelId)) {
    return sendJson(res, 400, { error: 'bad_params', message: 'Serveur ou salon manquant.' });
  }
  if (!session.data.guilds.some((entry) => entry.id === guildId)) {
    return sendJson(res, 403, { error: 'not_member', message: 'Tu n es pas membre de ce serveur.' });
  }

  const guild = client.guilds.cache.get(guildId);
  if (!guild) return sendJson(res, 404, { error: 'bot_absent', message: 'Le bot n est pas sur ce serveur.' });

  const channel = guild.channels.cache.get(channelId);
  if (!channel || !TEXT_CHANNELS.has(channel.type)) {
    return sendJson(res, 400, { error: 'bad_channel', message: 'Salon introuvable ou non textuel.' });
  }

  const member = await botMember(guild, client);
  if (!canPost(channel, member)) {
    return sendJson(res, 403, {
      error: 'missing_permissions',
      message: 'Le bot ne peut pas ecrire dans ce salon (Envoi de messages + Integrer des liens).',
    });
  }

  const { embeds, warnings } = sanitizeMany(Array.isArray(body.embeds) ? body.embeds : []);
  if (!embeds.length) {
    return sendJson(res, 400, { error: 'empty', message: 'Aucun embed a envoyer.' });
  }

  try {
    const message = await channel.send({ embeds, allowedMentions: { parse: [] } });
    sendJson(res, 200, {
      ok: true,
      guildId,
      channelId,
      messageId: message.id,
      url: `https://discord.com/channels/${guildId}/${channelId}/${message.id}`,
      warnings,
    });
  } catch (error) {
    console.error('[api] send', error);
    sendJson(res, 502, { error: 'send_failed', message: 'Discord a refuse l envoi (permissions ou limite de debit).' });
  }
}

/* ---------------- serveur ---------------- */

async function handle(req, res, client, config) {
  const url = new URL(req.url, 'http://localhost');
  const path = url.pathname.replace(/\/+$/, '') || '/';

  // Retour OAuth : si la Redirect URL enregistree est la racine du serveur,
  // Discord revient sur `/` avec code + state.
  if (path === '/' && (url.searchParams.has('code') || url.searchParams.has('error')) && url.searchParams.has('state')) {
    return finishLogin(res, url, config);
  }

  if (path === '/' || path === '/api/health') {
    return sendJson(res, 200, {
      ok: true,
      version: VERSION,
      bot: client.user ? client.user.tag : null,
      guilds: client.guilds.cache.size,
      oauth: Boolean(config.clientSecret),
      site: config.siteUrl || null,
    });
  }
  if (path === '/auth/discord') return startLogin(res, config);
  if (path === '/auth/discord/callback') return finishLogin(res, url, config);
  if (path === '/auth/callback') return finishLogin(res, url, config);
  if (path === '/api/me') return whoAmI(req, res, client);
  if (path === '/api/logout') return logout(req, res);
  if (path === '/api/session' && req.method === 'POST') return createCodeSession(req, res, client);

  const channels = path.match(/^\/api\/guilds\/(\d{5,25})\/channels$/);
  if (channels && req.method === 'GET') return listChannels(req, res, client, channels[1]);
  if (path === '/api/send' && req.method === 'POST') return sendMessage(req, res, client);

  sendJson(res, 404, { error: 'not_found' });
}

function startApi(client) {
  const config = resolveConfig();

  const server = http.createServer((req, res) => {
    const origin = req.headers.origin;
    if (origin && originAllowed(origin, config)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
      res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.setHeader('Access-Control-Max-Age', '86400');
    }
    if (req.method === 'OPTIONS') {
      res.writeHead(204).end();
      return;
    }
    handle(req, res, client, config).catch((error) => {
      console.error('[api]', error);
      if (!res.headersSent) sendJson(res, 500, { error: 'server_error', message: 'Erreur interne.' });
    });
  });

  server.on('error', (error) => {
    console.error(`[api] impossible d ecouter sur le port ${config.port} :`, error.message);
  });

  server.listen(config.port, () => {
    console.log(`[api] http://localhost:${config.port}`);
    console.log(
      config.clientSecret
        ? `[api] envoi web actif - redirect URI : ${config.redirectUri}`
        : '[api] envoi web desactive : ajoute DISCORD_CLIENT_SECRET dans .env',
    );
  });

  if (!cleanTimer) {
    cleanTimer = setInterval(() => {
      const now = Date.now();
      for (const [key, value] of states) if (now - value.at > STATE_TTL) states.delete(key);
      for (const [key, value] of sessions) if (value.expires < now) sessions.delete(key);
      for (const [key, value] of sends) {
        const hits = value.filter((stamp) => now - stamp < RATE_WINDOW);
        if (hits.length) sends.set(key, hits);
        else sends.delete(key);
      }
    }, 5 * 60 * 1000);
    if (typeof cleanTimer.unref === 'function') cleanTimer.unref();
  }

  return server;
}

module.exports = { startApi, VERSION };
