'use strict';

const TTL = 30 * 60 * 1000;
const sessions = new Map();

function set(id, data) {
  sessions.set(id, data);
  const timer = setTimeout(() => sessions.delete(id), TTL);
  if (typeof timer.unref === 'function') timer.unref();
}

function get(id) {
  return sessions.get(id) ?? null;
}

function remove(id) {
  sessions.delete(id);
}

module.exports = { set, get, remove, TTL };
