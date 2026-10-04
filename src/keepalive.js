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
let lastDiagnosticAt = 0;
const DIAGNOSTIC_INTERVAL_MS = 60_000;

/** Introspection for /status — states only, never the token. */
function describe() {
  if (!connection) return 'disconnected';
  return String(connection.state.status ?? 'unknown');
}

/**
 * Find the target channel.
 *
 * client.channels.cache is not authoritative on this fork — the gateway payload
 * that populates it does not reliably include every voice channel. Guild channel
 * caches are walked instead, falling back to the client cache. GUILD_ID, when
 * set, narrows the walk to one server and lets us say "not in this server"
 * instead of "not found anywhere".
 */
function findInGuilds(client) {
  const guilds = config.guildId
    ? client.guilds.cache.filter((g) => g.id === config.guildId)
    : client.guilds.cache;

  for (const guild of guilds.values()) {
    const hit = guild.channels.cache.get(config.channelId);
    if (hit && hit.guild && typeof hit.join === 'function') return hit;
  }
  return null;
}

function resolveChannel(client) {
  return findInGuilds(client) ?? client.channels.cache.get(config.channelId) ?? null;
}

/** Human-readable inventory, so a wrong ID can be corrected from the logs. */
function listVoiceChannels(client) {
  const rows = [];
  for (const guild of client.guilds.cache.values()) {
    for (const channel of guild.channels.cache.values()) {
      if (channel.type !== 'GUILD_VOICE') continue;
      rows.push(`${guild.id}/${channel.id}  ${guild.name} / ${channel.name}`);
    }
  }
  return rows;
}

function diagnose(client, reason) {
  const guildIds = [...client.guilds.cache.keys()];
  const lines = [
    `[voice] cannot resolve channel ${config.channelId} (${reason})`,
    `[voice]   guilds visible: ${guildIds.length} ${guildIds.join(' ') || '(none)'}`,
    `[voice]   channels cache holds: ${client.channels.cache.size}`,
  ];
  if (config.guildId) lines.push(`[voice]   GUILD_ID filter: ${config.guildId}`);

  const voices = listVoiceChannels(client);
  if (voices.length === 0) {
    lines.push('[voice]   NO voice channels visible — token may lack guild access, or Discord sent none yet');
  } else {
    lines.push('[voice]   voice channels you can see (set VOICE_CHANNEL_ID to one of these ids):');
    for (const row of voices.slice(0, 25)) lines.push(`[voice]     ${row}`);
    if (voices.length > 25) lines.push(`[voice]     ...and ${voices.length - 25} more`);
  }
  return lines.join('\n');
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
    // The cache can fill a moment after ready, so retry quietly — but keep the
    // inventory readable: once a minute, not once every poll.
    if (Date.now() - lastDiagnosticAt > DIAGNOSTIC_INTERVAL_MS) {
      lastDiagnosticAt = Date.now();
      console.warn(
        diagnose(client, config.guildId ? 'GUILD_ID set but channel not in it' : 'no visible match')
      );
    }
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