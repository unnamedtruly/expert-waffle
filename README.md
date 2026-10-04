# discord-voice-keepalive

Keeps a Discord user account sitting in one voice channel indefinitely — muted indicator on, auto-rejoin on every drop. Runs on Railway, survives redeploys, restarts, and gateway blips without a human.

Your PC can be closed. The container does the holding.

## What it does

- Logs in with a **user token** (`discord.js-selfbot-v13`, a discord.js v13 fork)
- Joins the configured voice channel with `selfMute: true`, `selfDeaf: false` — red mic icon, no audio ever sent
- Watchdog polls every `POLL_MS` and re-joins whenever the voice connection is not `ready`
- Exposes `/healthz` for Railway's healthcheck and `/status` for human inspection

## Deploy on Railway

```bash
git push -u origin main
```

1. railway.app → New Project → Deploy from GitHub repo → select this repo
2. Service **Variables** tab:

| Variable | Value |
|---|---|
| `DISCORD_TOKEN` | your bearer token — mark **SECRET** |
| `VOICE_CHANNEL_ID` | channel snowflake id |
| `POLL_MS` | `5000` |
| `READY_TIMEOUT_MS` | `30000` |
| `VERBOSE` | `1` |
| `NODE_ENV` | `production` |

`PORT` is injected by Railway — do not set it.

3. Settings → Networking → Generate Domain, then hit `https://<your-domain>/status`

CLI alternative:

```bash
npm i -g @railway/cli
railway login && railway init
railway variables set DISCORD_TOKEN="<bearer>" VOICE_CHANNEL_ID="1234567890123456789"
railway up
```

## Local run

```bash
npm ci
cp .env.example .env   # fill in DISCORD_TOKEN and VOICE_CHANNEL_ID
npm start
```

## Getting the two values

- **Token** — Discord web in a logged-in browser, F12 → Network → any request to `discord.com/api` → Request Headers → `authorization: Bearer <token>`
- **Channel ID** — User Settings → Advanced → Developer Mode on, then right-click the voice channel → Copy ID

## Routes

| Route | Returns |
|---|---|
| `/healthz` | `ok` + 200, always — this is what Railway checks |
| `/status` | JSON: `voice` state, uptime, channel id, poll interval |

`"voice": "ready"` means it is holding. Anything else means it has not joined yet.

## Gotchas

- **Healthcheck must stay `/healthz`.** Railway restarts the container on a failed healthcheck. `/status` reports voice state, so pointing the healthcheck there turns any Discord blip into a restart loop.
- **The HTTP server binds `0.0.0.0`.** A loopback-bound server is unreachable through Railway's proxy and crash-loops with no useful log line.
- **Wrong `VOICE_CHANNEL_ID` does not crash.** It shows as `"voice": "disconnected"` forever, with `[voice] target channel not visible yet` in the logs every poll.
- **`discord.js-selfbot-v13` is v13, not v14.** `intents` is ignored, `makeCache` must be a function, and `client.destroy()` returns `undefined` rather than a promise.
- **Railway never sleeps a web service**, so no external uptime pinger is needed.
- **Every push redeploys** and drops the voice connection for ~10–20s.

## Cost

Railway has no free tier: pay-as-you-go with a **$5/month minimum**. A muted idle process bills a few cents above that. Set a usage limit under Settings → Billing.

## Note

This logs in as a user account, which Discord's Terms of Service prohibit. A flagged token means the account is terminated. Use an account you can afford to lose, and do not run the same token on two machines at once.

## Layout

```
src/index.js         boot, client wiring, lifecycle
src/config.js        env parsing + fail-closed validation
src/keepalive.js     voice join + watchdog loop
src/healthserver.js  /healthz and /status
railway.toml         deploy + healthcheck + restart policy
nixpacks.toml        Node 22 build
```