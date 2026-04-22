# The Oracle

A DnD Oracle companion tool for Dungeon Masters. Ask questions, get brief atmospheric (or practical) guidance from an AI advisor — without overruling your rulings.

## Project Structure

```
Oracle/
├── backend/          Node/Express API server
│   ├── routes/       Route handlers
│   ├── services/     Anthropic SDK wrapper
│   └── utils/        Prompt builder
├── frontend/         React app (Vite)
│   └── src/
│       └── components/
├── .env              Your API key (gitignored)
└── .env.example      Template
```

## Requirements

- Node.js 18+
- An Anthropic API key ([console.anthropic.com](https://console.anthropic.com))

## Setup

### 1. Environment

Copy `.env.example` to `.env` and fill in your API key:

```bash
cp .env.example .env
```

### 2. Install backend dependencies

```bash
cd backend
npm install
```

### 3. Install frontend dependencies

```bash
cd frontend
npm install
```

## Running

Open two terminals:

**Terminal 1 — Backend:**
```bash
cd backend
npm run dev
# Runs on http://localhost:3001
```

**Terminal 2 — Frontend:**
```bash
cd frontend
npm run dev
# Runs on http://localhost:5173
```

Then open [http://localhost:5173](http://localhost:5173) in your browser.

## Environment Variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `Anthropic-API-Key` | Yes | — | Your Anthropic API key |
| `ORACLE_MODEL` | No | `claude-haiku-4-5` | Claude model to use |
| `PORT` | No | `3001` | Backend port |

## Switching Claude Models

Set `ORACLE_MODEL` in `.env`:

```
# Fast and cheap (default)
ORACLE_MODEL=claude-haiku-4-5

# More capable, balanced cost
ORACLE_MODEL=claude-sonnet-4-6

# Most capable
ORACLE_MODEL=claude-opus-4-7
```

Restart the backend after changing this value.

## How It Works

- **Login screen** — enter your DM name and session name (both stored in `localStorage`)
- **Hidden Context** — private session notes (party level, secrets, etc.) injected into the system prompt; not shown to players
- **Tone Mode** — switches between mystical Oracle voice and practical DM Advice voice
- **Session History** — stored in `localStorage` keyed by session name; cleared per-session with the Clear button
- The API key **never leaves the backend** — the frontend only talks to `/api/oracle`

## Phase 2 Ideas

- Push-to-talk (Web Speech API → backend transcription)
- Text-to-speech Oracle responses
- Player role device (separate view for the table)
- Persistent history (database instead of localStorage)
- Session sharing / export
