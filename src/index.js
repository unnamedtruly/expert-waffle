'use strict';

const { Client } = require('discord.js-selfbot-v13');
const { config, assertConfig } = require('./config');
const keepalive = require('./keepalive');
const healthserver = require('./healthserver');

process.on('unhandledRejection', (err) => console.error('[fatal]', err?.message ?? err));

const STARTED_AT = Date.now();

/** Read by /status only. Never includes the token. */
function getStatus() {
  return {
    ok: true,
    uptimeSec: Math.floor((Date.now() - STARTED_AT) / 1000),
    voice: keepalive.describe(),
    channel: config.channelId,
    pollMs: config.pollMs,
    selfMute: config.selfMute,
    selfDeaf: config.selfDeaf,
  };
}

function createClient() {
  // discord.js-selfbot-v13 is discord.js v13: makeCache must be a function, and
  // the fork ignores `intents` (voice states ride v13's fixed intent set).
  const client = new Client({
    allowedMentions: { parse: [] },
    // No makeCache override: v13 hands the factory a manager class, and any
    // custom version re-enters CachedManager before `client` exists. Default
    // cache is fine for a single-channel join.
  });

  client.on('ready', () => {
    console.log(`[ready] ${client.user.tag} (${client.user.id})`);
    console.log(`[ready] guilds=${client.guilds.cache.size} target=${config.channelId}`);
    keepalive.start(client);
  });

  client.on('disconnected', () => console.warn('[gateway] disconnected — lib retrying'));
  client.on('reconnecting', () => console.warn('[gateway] reconnecting'));
  client.on('error', (err) => console.error('[gateway]', err?.message ?? err));

  return client;
}

function main() {
  try {
    assertConfig();
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }

  // Listen before login: a failed login must still leave a reachable container
  // so the healthcheck passes and the process exits on its own terms.
  healthserver.start(getStatus);

  const client = createClient();

  const shutdown = (signal) => {
    console.log(`[shutdown] ${signal}`);
    keepalive.stop();
    // This fork's destroy() returns undefined, not a promise. Don't chain on it.
    try {
      client.destroy();
    } catch (err) {
      console.error('[shutdown] destroy threw:', err?.message ?? err);
    }
    process.exit(0);
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  client.login(config.token).catch((err) => {
    console.error('[login] failed:', err?.message ?? err);
    process.exit(1);
  });
}

main();