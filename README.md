# The Oracle

A D&D 5e companion tool for Dungeon Masters. Ask questions, get brief atmospheric (or practical) guidance from an AI advisor — without overruling your rulings.

Features include voice input + TTS output, scripted invocations, party / campaign / session persistence in PostgreSQL, PDF character-sheet extraction, and a LAN Socket.IO "display mode" so a second device at the table can show and speak the Oracle's responses.

## Project Structure

```
Oracle/
├── backend/          Node/Express API server + Socket.IO
│   ├── routes/       Route handlers
│   ├── services/     Anthropic SDK wrapper
│   ├── utils/        Prompt builder, scripted invocation matcher
│   └── db/           Knex migrations + connection
├── frontend/         React app (Vite)
│   └── src/
│       ├── components/
│       ├── hooks/
│       └── utils/
├── .env              Your API keys + DB config (gitignored)
└── .env.example      Template
```

## Requirements

- Node.js 18+
- PostgreSQL 13+ (the backend will auto-create the `pgcrypto` extension on first boot)
- An Anthropic API key ([console.anthropic.com](https://console.anthropic.com))
- *Optional*: an ElevenLabs API key for high-quality Oracle TTS ([elevenlabs.io](https://elevenlabs.io)). Without it the app falls back to the browser's built-in speech synthesis.

## Setup

### 1. Create the database

Make sure PostgreSQL is running and create an empty database matching your `.env`:

```bash
createdb oracle
```

Migrations run automatically on backend startup — including a `CREATE EXTENSION IF NOT EXISTS pgcrypto` step, so no manual SQL is required.

### 2. Environment

Copy `.env.example` to `.env` and fill in your keys:

```bash
cp .env.example .env
```

### 3. Install dependencies

```bash
cd backend  && npm install
cd ../frontend && npm install
```

## Running

From the repo root you can run both at once:

```bash
npm run dev
```

…or run each side separately in two terminals:

```bash
# Terminal 1 — Backend
cd backend && npm run dev
# Runs on http://localhost:3001

# Terminal 2 — Frontend
cd frontend && npm run dev
# Runs on http://localhost:5173
```

Then open <http://localhost:5173> in your browser.

### Health check

`GET /api/healthz` returns `{ status, db, timestamp }`. Returns 200 when the DB is reachable, 503 otherwise.

### LAN access (display mode at the table)

The backend binds `0.0.0.0` and accepts requests from private network ranges (`10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`). Start Vite with `--host` so other devices on the same Wi-Fi can reach the frontend:

```bash
cd frontend && npm run dev -- --host
```

On the second device (e.g. a tablet on the table) open `http://<host-ip>:5173`, then toggle **Display Mode** in the settings drawer. The Oracle's response will appear on that device via Socket.IO and — if TTS is enabled — speak it aloud.

### Access protection (shared access code)

The app uses a single shared bearer token to keep random visitors from spending your API budget. In production the token is **required** on every protected endpoint and every Socket.IO connection; in development it is off by default to keep local iteration friction-free.

- **Local dev** (default): no token required. Run the app and use it as before.
- **Local dev, testing the auth path**: set `ORACLE_REQUIRE_AUTH=true` in `.env` and define `ORACLE_ACCESS_TOKEN`. The frontend will prompt for the code on first load.
- **Production** (`NODE_ENV=production`): `ORACLE_ACCESS_TOKEN` is required. The frontend shows an "Enter Oracle access code" screen on first load; the code is saved in `localStorage` under `oracle_access_token` and attached to every request. Use **Settings → Access → Lock Oracle** to clear it.

> The token is shared (no user accounts). Treat it like a password and rotate it if it leaks. Public endpoints: `/api/healthz` only.

## Environment Variables

### Backend (`.env` at repo root)

| Variable | Required | Default | Description |
|---|---|---|---|
| `ANTHROPIC_API_KEY` | Yes | — | Anthropic API key for the Oracle |
| `ELEVENLABS_API_KEY` | No | — | ElevenLabs key for premium TTS; without it the app uses browser TTS |
| `ORACLE_MODEL` | No | `claude-haiku-4-5` | Claude model: `claude-haiku-4-5`, `claude-sonnet-4-6`, `claude-opus-4-7` |
| `PORT` | No | `3001` | Backend port. Provider-managed on Render/Railway. |
| `DATABASE_URL` | Yes in prod | — | Single Postgres connection string. Neon's *pooled* endpoint (`...-pooler...`) is recommended. SSL is enabled automatically in production. |
| `DB_HOST` / `DB_PORT` / `DB_NAME` / `DB_USER` / `DB_PASSWORD` | No (local fallback) | sensible defaults | Used only when `DATABASE_URL` is unset. |
| `ORACLE_ACCESS_TOKEN` | Yes in prod | — | Shared bearer token. Generate one with `openssl rand -hex 24`. |
| `ORACLE_REQUIRE_AUTH` | No | `false` in dev / `true` in prod | Force the token requirement when not in production. |
| `ALLOWED_ORIGINS` | Yes in prod | — | Comma-separated list of permitted CORS origins. Dev allows localhost + LAN ranges automatically. |
| `ORACLE_RATE_LIMIT` | No | `30` | Max `/api/oracle` requests per IP per 15 min. |
| `TTS_RATE_LIMIT` | No | `30` | Max `/api/tts` requests per IP per 15 min. |
| `MERCHANT_RATE_LIMIT` | No | `60` | Max `/api/merchant/*` requests per IP per 15 min. |
| `API_RATE_LIMIT` | No | `600` | Generic limit on all other `/api/*` requests per IP per 15 min. |

The legacy hyphenated forms `Anthropic-API-Key` and `ElevenLabs-API-Key` are still read as fallbacks for compatibility with older local setups, but new setups should use the underscored names — most hosting platforms reject env keys containing hyphens.

### Frontend (Vite, `frontend/.env.local` or Vercel project env)

| Variable | Required | Default | Description |
|---|---|---|---|
| `VITE_API_BASE_URL` | Yes in prod | — | Backend origin. Required when frontend and backend are on different domains (Vercel → Render/Railway). Leave unset in local dev — Vite proxies `/api` and `/socket.io` to `localhost:3001`. |

## Deployment

The app is designed for a single-DM-group private deployment. The supported
production setup is a **Raspberry Pi behind Cloudflare Tunnel** — the
backend serves both `/api/*` and the built React app on one port, so a
single tunnel hostname covers everything. An alternative cloud setup
(Vercel + Render + Neon) is documented below it.

Access in either shape is gated by the shared `ORACLE_ACCESS_TOKEN`; there
are no per-user accounts.

### Health endpoints

| Path | Hits DB? | Use for |
|---|---|---|
| `GET /api/livez` | No | Liveness — answers as long as the Node event loop is up. Set this as Render/Railway's health-check path; harmless to poll on the Pi too. |
| `GET /api/healthz` | Yes (`SELECT 1`) | Readiness — returns 503 if Postgres is unreachable. Good for uptime monitors. |

Both are public (unauthenticated, not rate-limited beyond the global `API_RATE_LIMIT`).

### A — Raspberry Pi + Cloudflare Tunnel (recommended)

**Shape:**
- The Pi runs Node + Postgres locally.
- `backend/server.js` is started in production mode. In that mode it also
  serves `frontend/dist` from the same Express process, so the browser
  loads the React app and `/api` from the same origin.
- Cloudflare Tunnel maps `https://oraclednd.uk` → `http://localhost:3001`
  on the Pi. The browser never sees the Pi's IP and the Pi never opens an
  inbound port on the router.

Because the frontend and backend share an origin, **`VITE_API_BASE_URL` is
not needed for this deployment** — relative `/api/...` and `io()` calls
resolve to the same hostname as the page itself.

#### 1. Install prerequisites on the Pi

Pi OS Bookworm (Debian 12) or newer; arm64 recommended.

```bash
# Node 20 (use NodeSource or nvm — Pi OS default is too old)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs postgresql

# Cloudflared
sudo mkdir -p --mode=0755 /usr/share/keyrings
curl -fsSL https://pkg.cloudflare.com/cloudflare-main.gpg | sudo tee /usr/share/keyrings/cloudflare-main.gpg >/dev/null
echo "deb [signed-by=/usr/share/keyrings/cloudflare-main.gpg] https://pkg.cloudflare.com/cloudflared bookworm main" | sudo tee /etc/apt/sources.list.d/cloudflared.list
sudo apt-get update && sudo apt-get install -y cloudflared
```

#### 2. Create the database

```bash
sudo -u postgres createuser --pwprompt oracle      # set a strong password
sudo -u postgres createdb -O oracle oracle
```

Confirm the connection string works:

```bash
psql "postgresql://oracle:STRONG_PASSWORD@localhost:5432/oracle" -c '\dt'
```

#### 3. Clone and install

```bash
git clone <repo> /opt/oracle
cd /opt/oracle
(cd backend  && npm ci)
(cd frontend && npm ci && npm run build)
```

The frontend build writes `frontend/dist/` — the backend will read it from there.

#### 4. Configure `.env`

```bash
cp .env.example .env
nano .env
```

Set, at minimum:

```
NODE_ENV=production
PORT=3001
DATABASE_URL=postgresql://oracle:STRONG_PASSWORD@localhost:5432/oracle
ORACLE_ACCESS_TOKEN=          # openssl rand -hex 24
ALLOWED_ORIGINS=https://oraclednd.uk
ANTHROPIC_API_KEY=
ELEVENLABS_API_KEY=           # optional — browser TTS fallback otherwise
```

Note: local Postgres on the Pi serves connections without TLS, but our
knexfile only forces SSL when `DATABASE_URL` points off-host. The
default `pg_hba.conf` (`local` and `host 127.0.0.1`) accepts plain
connections — no extra config needed.

#### 5. Run as a service

The simplest path is a systemd unit. Create `/etc/systemd/system/oracle.service`:

```ini
[Unit]
Description=The Oracle (DnD companion)
After=network.target postgresql.service
Wants=postgresql.service

[Service]
Type=simple
WorkingDirectory=/opt/oracle/backend
ExecStart=/usr/bin/node server.js
Restart=on-failure
RestartSec=5
EnvironmentFile=/opt/oracle/.env
User=pi
Group=pi
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now oracle
sudo systemctl status oracle
curl http://localhost:3001/api/livez       # → {"status":"live",...}
curl http://localhost:3001/api/healthz     # → {"status":"ok","db":true,...}
curl -I http://localhost:3001/             # → 200, served from frontend/dist
```

#### 6. Wire up Cloudflare Tunnel

```bash
cloudflared tunnel login                    # opens browser; pick the zone for oraclednd.uk
cloudflared tunnel create oracle
cloudflared tunnel route dns oracle oraclednd.uk
```

Create `/etc/cloudflared/config.yml`:

```yaml
tunnel: oracle
credentials-file: /home/pi/.cloudflared/<tunnel-id>.json
ingress:
  - hostname: oraclednd.uk
    service: http://localhost:3001
  - service: http_status:404
```

Install + start as a service:

```bash
sudo cloudflared service install
sudo systemctl enable --now cloudflared
sudo systemctl status cloudflared
```

> **Cloudflare dashboard note:** In your zone, **disable Rocket Loader** for `oraclednd.uk` (Speed → Optimization). It rewrites script tags and breaks the Vite-built React bundle. WebSockets are on by default — leave them on; Socket.IO needs them.

#### 7. Smoke test

From any device:

```
https://oraclednd.uk            → access-code gate
                                → after entering ORACLE_ACCESS_TOKEN, the app loads
https://oraclednd.uk/api/livez  → {"status":"live",...}
```

Then walk through:
- **Oracle ask** — type a question; expect a response.
- **Merchant Mode** — try an Existing item and a Custom item.
- **Scripted invocation** — create one in Settings; type the trigger.
- **Display Mode** — open the URL on a tablet too, toggle Display Mode there, ask from the laptop; the tablet should overlay + speak.
- **Lock Oracle** — Settings → Access → Lock Oracle → gate re-appears.

#### Updating the Pi

```bash
cd /opt/oracle
git pull
(cd backend  && npm ci --omit=dev)
(cd frontend && npm ci && npm run build)
sudo systemctl restart oracle
```

#### Required env on the Pi (backend `.env`)

```
NODE_ENV=production
PORT=3001
DATABASE_URL=postgresql://oracle:STRONG_PASSWORD@localhost:5432/oracle
ORACLE_ACCESS_TOKEN=          # openssl rand -hex 24
ALLOWED_ORIGINS=https://oraclednd.uk
ANTHROPIC_API_KEY=sk-ant-...
ELEVENLABS_API_KEY=           # optional
ORACLE_MODEL=claude-haiku-4-5 # optional
```

`VITE_API_BASE_URL` is **not** required because the React bundle is
served from the same origin as `/api/...`. Leaving it unset means the
client uses relative paths and same-origin `io()` — exactly what
Cloudflare Tunnel needs.

### B — Alternative: Vercel + Render/Railway + Neon

If you'd rather not self-host, the cloud path still works.

1. **Create the Neon database.** Copy the *pooled* connection string (host ends in `-pooler.<region>.aws.neon.tech`).

2. **Deploy the backend** (Render Web Service or Railway Service):
   - Root: `backend`, build `npm install`, start `npm start`, health-check path `/api/livez`.

3. **Deploy the frontend on Vercel** with root `frontend`, build `npm run build`, output `dist`, and env `VITE_API_BASE_URL=https://your-backend.onrender.com`.

4. **Set CORS** on the backend: `ALLOWED_ORIGINS=https://oracle-xyz.vercel.app`.

#### Required env on Render / Railway

```
NODE_ENV=production
PORT=                          # leave blank — provider sets this
DATABASE_URL=postgresql://...  # Neon pooled string
ORACLE_ACCESS_TOKEN=...        # openssl rand -hex 24
ALLOWED_ORIGINS=https://oracle-xyz.vercel.app
ANTHROPIC_API_KEY=sk-ant-...
ELEVENLABS_API_KEY=...         # optional
ORACLE_MODEL=claude-haiku-4-5  # optional
```

#### Required env on Vercel

```
VITE_API_BASE_URL=https://your-backend.onrender.com
```

### Local pre-deploy test (same-origin, mimics the Pi)

To exercise the production code paths on your dev machine before pushing to the Pi:

```bash
cd frontend && npm run build && cd ..

NODE_ENV=production \
PORT=3001 \
ORACLE_ACCESS_TOKEN=test-token-123 \
ALLOWED_ORIGINS=http://localhost:3001 \
ANTHROPIC_API_KEY=... \
ELEVENLABS_API_KEY=... \
npm run backend

# open http://localhost:3001 — the access-code gate should appear,
# served by Express from frontend/dist, and `/api/...` plus Socket.IO
# come from the same origin (no VITE_API_BASE_URL needed).
```

The Vite dev workflow (`npm run dev`) is unchanged and still works — the
static-serving block only runs when `NODE_ENV=production`.

## How It Works

- **Login screen** — first time only; auto-boots from `localStorage` thereafter.
- **Campaign Context** — shared world / lore notes injected into the system prompt.
- **Hidden Context** — DM-private session notes; the Oracle can hint but should not quote them.
- **Party** — characters and their PDF/text character sheets; the Oracle references them when relevant.
- **Tone Mode** — switches between mystical Oracle voice and practical DM Advice voice.
- **Personality + Quirk** — coarser controls over voice and probabilistic flavour.
- **Scripted Invocations** — DM-authored triggers that either bypass the LLM with an exact script or steer it into a one-off creative response.
- **Display Mode** — second-device LAN broadcast over Socket.IO.
- The API key **never leaves the backend** — the frontend only talks to `/api/...`.
