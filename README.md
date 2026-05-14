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

> Note: there is currently no authentication. Don't run the backend on a network you don't trust.

## Environment Variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `ANTHROPIC_API_KEY` | Yes | — | Anthropic API key for the Oracle |
| `ELEVENLABS_API_KEY` | No | — | ElevenLabs key for premium TTS; without it the app uses browser TTS |
| `ORACLE_MODEL` | No | `claude-haiku-4-5` | Claude model: `claude-haiku-4-5`, `claude-sonnet-4-6`, `claude-opus-4-7` |
| `PORT` | No | `3001` | Backend port |
| `DB_HOST` | No | `localhost` | PostgreSQL host |
| `DB_PORT` | No | `5432` | PostgreSQL port |
| `DB_NAME` | No | `oracle` | PostgreSQL database |
| `DB_USER` | No | `postgres` | PostgreSQL user |
| `DB_PASSWORD` | No | *(empty)* | PostgreSQL password |

The legacy hyphenated forms `Anthropic-API-Key` and `ElevenLabs-API-Key` are still read as fallbacks for compatibility with older local setups, but new setups should use the underscored names — most hosting platforms reject env keys containing hyphens.

The frontend has no env vars; it talks to the backend through Vite's dev proxy.

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
