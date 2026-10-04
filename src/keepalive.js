'use strict';

const {
  joinVoiceChannel,
  VoiceConnectionStatus,
  entersState,
} = require('@discordjs/voice');

const { config } = require('./config');

let connection = null;
let stopping = false;
let pollTimer = null;
let joinedAt = null;

/** Introspection for /status — states only, never the token. */
function describe() {
  if (!connection) return 'disconnected';
  return String(connection.state.status ?? 'unknown');
}

function resolveChannel(client) {
  const channel = client.channels.cache.get(config.channelId);
  if (!channel) return null;
  if (typeof channel.join !== 'function' || !channel.guild) return null;
  return channel;
}

function tearDown() {
  if (!connection) return;
  try {
    connection.destroy();
  } catch {
    // destroy() throws when the underlying socket already closed; nothing to recover.
  }
  connection = null;
  joinedAt = null;
}

/** One join attempt. Resolves true only when the connection reaches Ready. */
async function joinOnce(client) {
  const channel = resolveChannel(client);
  if (!channel) {
    console.warn('[voice] target channel not visible yet (cold cache or wrong id)');
    return false;
  }

  tearDown();

  try {
    connection = joinVoiceChannel({
      channelId: channel.id,
      guildId: channel.guild.id,
      adapterCreator: channel.guild.voiceAdapterCreator,
      selfMute: config.selfMute,
      selfDeaf: config.selfDeaf,
    });
  } catch (err) {
    console.error('[voice] joinVoiceChannel threw:', err.message);
    connection = null;
    return false;
  }

  try {
    await entersState(connection, VoiceConnectionStatus.Ready, config.readyTimeoutMs);
  } catch (err) {
    console.error('[voice] never reached Ready:', err?.message ?? err);
    tearDown();
    return false;
  }

  joinedAt = Date.now();

  connection.on(VoiceConnectionStatus.Destroyed, () => {
    console.warn('[voice] connection destroyed — watchdog will rejoin');
    connection = null;
    joinedAt = null;
  });
  connection.on('error', (err) => console.error('[voice] socket error:', err?.message ?? err));
  connection.on(VoiceConnectionStatus.Signalling, () => {
    if (config.verbose) console.log('[voice] signalling');
  });
  connection.on(VoiceConnectionStatus.Connecting, () => {
    if (config.verbose) console.log('[voice] connecting');
  });

  console.log(`[voice] sitting in "${channel.name}" — muted, holding`);
  return true;
}

/**
 * Single-flight watchdog. Ticks every pollMs; any state other than a live
 * connection triggers exactly one rejoin attempt per tick.
 */
function start(client) {
  stopping = false;
  console.log(`[watch] polling every ${config.pollMs}ms`);

  const tick = async () => {
    if (stopping || client.destroyed) return;
    const live =
      connection !== null &&
      connection.state.status !== VoiceConnectionStatus.Destroyed &&
      connection.state.status !== VoiceConnectionStatus.Disconnected;

    if (!live) {
      try {
        await joinOnce(client);
      } catch (err) {
        console.error('[watch] join threw:', err?.message ?? err);
      }
    }
  };

  tick();
  pollTimer = setInterval(tick, config.pollMs);
}

function stop() {
  stopping = true;
  clearInterval(pollTimer);
  pollTimer = null;
  tearDown();
}

module.exports = { start, stop, describe };