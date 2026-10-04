'use strict';

// Token and IDs live outside source: a token pasted into a file ends up in git history.
require('dotenv').config();

function readInt(raw, fallback) {
  const n = Number.parseInt(raw ?? '', 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function load(env = process.env) {
  return {
    token: (env.DISCORD_TOKEN ?? '').trim(),
    channelId: (env.VOICE_CHANNEL_ID ?? '').trim(),
    // Optional. Narrows the channel search to one server and makes the log say
    // which servers are actually visible when the channel cannot be found.
    guildId: (env.GUILD_ID ?? '').trim(),
    selfMute: true,
    selfDeaf: false,
    // Poll interval doubles as the reconnect backoff.
    pollMs: readInt(env.POLL_MS, 5000),
    readyTimeoutMs: readInt(env.READY_TIMEOUT_MS, 30000),
    verbose: env.VERBOSE === '1',
  };
}

const config = load();

// Fail closed: a missing token must not boot a client that dies into a retry loop.
function assertConfig() {
  const missing = [];
  if (!config.token) missing.push('DISCORD_TOKEN');
  if (!config.channelId) missing.push('VOICE_CHANNEL_ID');
  if (config.channelId && !/^\d{17,20}$/.test(config.channelId)) {
    throw new Error('VOICE_CHANNEL_ID must be a snowflake id (digits only)');
  }
  if (config.guildId && !/^\d{17,20}$/.test(config.guildId)) {
    throw new Error('GUILD_ID must be a snowflake id (digits only) or left empty');
  }
  if (missing.length > 0) {
    throw new Error(`missing env: ${missing.join(', ')} — set them on the app's Environment tab`);
  }
}

module.exports = { config, assertConfig, load };