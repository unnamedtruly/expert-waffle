# discord-voice-keepalive

Keeps a Discord user account sitting in one voice channel indefinitely — muted indicator on, auto-rejoin on every drop. Runs on blitz.cloud in background mode, survives redeploys, restarts, and gateway blips without a human.

Your PC can be closed. The container does the holding.

## What it does

- Logs in with a **user token** (`discord.js-selfbot-v13`, a discord.js v13 fork)
- Joins the configured voice channel with `selfMute: true`, `selfDeaf: false` — red mic icon, no audio ever sent
- Watchdog polls every `POLL_MS` and re-joins whenever the voice connection is not `ready`
- Exposes `/healthz` and `/status` for local debugging; blitz runs it as a background app

## Deploy on blitz.cloud

Background-mode bot host. Free plan, no card, and it never sleeps.

1. Connect GitHub at blitz.cloud (Settings → Connect GitHub), allowing `expert-waffle`
2. Host something new → My own code → `unnamedtruly/expert-waffle` → Continue
3. Short name → subdomain, e.g. `voice` becomes `voice.<you>.blitz.cloud`
4. **Advanced settings → turn ON "Runs in the background"** ← the important one
5. Build it and put it online
6. Environment tab: `DISCORD_TOKEN`, `VOICE_CHANNEL_ID`, `POLL_MS`, `VERBOSE`, `NODE_ENV`
7. Restart from the Environment tab so the variables take effect

The repo is public, so you can also paste its URL and skip connecting GitHub. Without a
connection, use "Get the newest code" on the Settings tab to ship new commits.

| Variable | Value |
|---|---|
| `DISCORD_TOKEN` | your bearer token |
| `VOICE_CHANNEL_ID` | channel snowflake id |
| `POLL_MS` | `5000` |
| `READY_TIMEOUT_MS` | `30000` |
| `VERBOSE` | `1` |
| `NODE_ENV` | `production` |

Background mode gives the app no address and no port, so there is no URL to check. Read
state on the app's **Logs** tab — `[voice] sitting in "<channel>" — muted, holding` is the
line that means it joined. You can query `/status` locally, or use "Give it one" on the
Settings tab to restore an address.

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
| `/healthz` | `ok` + 200, always — liveness only, never readiness |
| `/status` | JSON: `voice` state, uptime, channel id, poll interval |

`"voice": "ready"` means it is holding. Anything else means it has not joined yet.

## Gotchas

- **Turn ON "Runs in the background".** It is the whole reason this works on the free plan: the app gets no address, is never probed, and never sleeps. Off, it sleeps after 30 minutes without visitors.
- **The HTTP server binds `0.0.0.0`.** If you switch background mode off and give it an address, a loopback-bound server is unreachable through the proxy.
- **Wrong `VOICE_CHANNEL_ID` does not crash.** It shows `[voice] target channel not visible yet` on every poll and never joins.
- **`discord.js-selfbot-v13` is v13, not v14.** `intents` is ignored, `makeCache` must be a function, and `client.destroy()` returns `undefined` rather than a promise.
- **The free plan stops a background app after 7 days** with no account activity — no sign-in, deploy, or dashboard visit. They email two days ahead. Sign in weekly, or hit Start on the app page to revive it without a rebuild.
- **Every push redeploys** and drops the voice connection briefly. The running version stays up until the new one works.

## Cost

Free: €0, no card, no time limit. Pro is €7/month and only buys an address, a custom domain,
and more apps — background bots get nothing extra from it. The free plan's 30-minute sleep
does not apply to background apps.

## Note

This logs in as a user account, which Discord's Terms of Service prohibit. A flagged token means the account is terminated. Use an account you can afford to lose, and do not run the same token on two machines at once.

## Layout

```
src/index.js         boot, client wiring, lifecycle
src/config.js        env parsing + fail-closed validation
src/keepalive.js     voice join + watchdog loop
src/healthserver.js  /healthz and /status
Dockerfile           node:22-slim image
```