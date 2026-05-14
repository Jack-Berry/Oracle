const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const http = require('http');
const express = require('express');
const cors = require('cors');
const { Server: SocketIOServer } = require('socket.io');
const { runMigrations } = require('./db/db');
const oracleRoutes    = require('./routes/oracle');
const ttsRoutes       = require('./routes/tts');
const campaignRoutes  = require('./routes/campaigns');
const partyRoutes     = require('./routes/party');
const sessionRoutes   = require('./routes/sessions');
const invocationRoutes = require('./routes/invocations');
const healthRoutes    = require('./routes/health');
const merchantRoutes  = require('./routes/merchant');
const { requireAccessToken, verifySocketToken } = require('./middleware/auth');
const {
  oracleLimiter,
  ttsLimiter,
  merchantLimiter,
  generalLimiter,
} = require('./middleware/rateLimit');

const app = express();
const PORT = process.env.PORT || 3001;
const isProd = process.env.NODE_ENV === 'production';
const isDev = !isProd;

// Behind a TLS-terminating proxy (Cloudflare Tunnel on the Pi, or Render /
// Railway on the cloud) the real client IP arrives via X-Forwarded-For.
// Trust the immediate proxy so req.ip and the rate-limiter see it correctly.
app.set('trust proxy', 1);

// Production-safe CORS: an env-driven allowlist (ALLOWED_ORIGINS, comma-
// separated). In production *only* origins listed there are accepted — there
// is no wildcard and no LAN-range fallback. In development we additionally
// allow localhost + RFC1918 private LAN ranges so phones/tablets on the same
// Wi-Fi can reach the dev server when Vite is run with --host.
const explicitAllowed = new Set(
  (process.env.ALLOWED_ORIGINS || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean)
);

if (isProd && explicitAllowed.size === 0) {
  console.warn(
    '[cors] WARNING: NODE_ENV=production but ALLOWED_ORIGINS is empty — ' +
    'browser requests from the frontend will be rejected. Set ' +
    'ALLOWED_ORIGINS=https://your-domain (e.g. https://oraclednd.uk).'
  );
}

function isAllowedOrigin(origin) {
  // No-origin requests come from curl, same-origin XHR, and platform health
  // probes (Render/Railway). They are not browser cross-origin requests, so
  // the CORS allowlist doesn't apply to them — block-listing them would break
  // /api/healthz and /api/livez probes.
  if (!origin) return true;
  if (explicitAllowed.has(origin)) return true;
  if (isDev) {
    try {
      const host = new URL(origin).hostname;
      if (host === 'localhost' || host === '127.0.0.1') return true;
      if (/^10\./.test(host)) return true;
      if (/^192\.168\./.test(host)) return true;
      if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(host)) return true;
    } catch {}
  }
  return false;
}

app.use(cors({
  origin: (origin, cb) => {
    if (isAllowedOrigin(origin)) return cb(null, true);
    cb(new Error('Not allowed by CORS'));
  },
}));

app.use(express.json({ limit: '2mb' }));

// /api/healthz is mounted BEFORE auth and rate limiting so hosting platforms
// can probe without a token.
app.use('/api', healthRoutes);

// From here on every /api request is rate-limited and (in production)
// requires a valid bearer token.
app.use('/api', generalLimiter);
app.use('/api', requireAccessToken);

// Per-endpoint strict limits for money-spending routes.
app.use('/api/oracle',   oracleLimiter);
app.use('/api/tts',      ttsLimiter);
app.use('/api/merchant', merchantLimiter);

app.use('/api', oracleRoutes);
app.use('/api', ttsRoutes);
app.use('/api', campaignRoutes);
app.use('/api', partyRoutes);
app.use('/api', sessionRoutes);
app.use('/api', invocationRoutes);
app.use('/api', merchantRoutes);

// Static frontend (production only) — Pi / single-origin deploys serve the
// built React app from `frontend/dist` through the same Express process, so
// the browser and the API share an origin and Cloudflare Tunnel only has to
// point at one port. Dev keeps using Vite's dev server; we don't touch
// anything when NODE_ENV !== 'production'.
if (isProd) {
  const distDir = path.join(__dirname, '..', 'frontend', 'dist');
  const indexHtml = path.join(distDir, 'index.html');

  // Serve hashed assets aggressively; let index.html stay short-cached so
  // deploys roll out without users having to hard-refresh.
  app.use(
    express.static(distDir, {
      index: false,
      setHeaders(res, filePath) {
        if (filePath.endsWith('index.html')) {
          res.setHeader('Cache-Control', 'no-cache');
        } else if (filePath.includes(`${path.sep}assets${path.sep}`)) {
          res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        }
      },
    })
  );

  // SPA fallback: every GET that isn't /api/* or /socket.io/* returns
  // index.html so client-side routing (and direct deep links) work. Socket.IO
  // requests never reach here — they're intercepted by the SocketIOServer
  // attached to the http server below — but we guard the path anyway.
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api/') || req.path.startsWith('/socket.io')) {
      return next();
    }
    res.sendFile(indexHtml);
  });
}

app.use((err, req, res, _next) => {
  if (err && err.message === 'Not allowed by CORS') {
    return res.status(403).json({ error: 'Origin not allowed.' });
  }
  console.error('Unhandled error:', err.message);
  res.status(500).json({ error: 'Internal server error.' });
});

// HTTP server wraps Express so Socket.IO can share the same port.
const server = http.createServer(app);

const io = new SocketIOServer(server, {
  cors: {
    origin: (origin, cb) => {
      if (isAllowedOrigin(origin)) return cb(null, true);
      cb(new Error('Not allowed by CORS'));
    },
    credentials: true,
  },
});

// Reject socket connections in production unless they present a valid token.
io.use(verifySocketToken);

function socketCount() {
  return io.engine?.clientsCount ?? io.sockets.sockets.size ?? 0;
}

io.on('connection', (socket) => {
  if (isDev) {
    console.log(
      `[socket] connected id=${socket.id} transport=${socket.conn?.transport?.name || '?'} total=${socketCount()}`
    );
  }
  socket.on('disconnect', (reason) => {
    if (isDev) {
      console.log(
        `[socket] disconnected id=${socket.id} reason=${reason} total=${socketCount()}`
      );
    }
  });
});

// Routes call this after a successful Oracle response to broadcast to all
// connected clients. Display-mode clients show the overlay and speak it.
app.locals.io = io;
app.locals.broadcastOracleResponse = (payload) => {
  const count = socketCount();
  io.emit('oracle_response', payload);
  if (isDev) {
    console.log(
      `[socket] emit oracle_response sourceType=${payload.sourceType || 'normal'} clients=${count}`
    );
  }
};

async function start() {
  try {
    await runMigrations();
    console.log('DB migrations up to date.');
  } catch (err) {
    // In production a missing/broken DB is fatal — booting a half-working API
    // tends to surface as confusing 500s and masks the real issue. In dev we
    // keep the old behaviour so local UI work without Postgres still boots.
    if (isProd) {
      console.error('FATAL: migration failed in production:', err.message);
      process.exit(1);
    }
    console.error('Migration failed — DB unavailable, continuing without it:', err.message);
  }
  // 0.0.0.0 lets devices on the LAN reach the backend directly if needed.
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Oracle backend running on http://localhost:${PORT}`);
  });
}

start();
