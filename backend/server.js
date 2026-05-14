require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

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

const app = express();
const PORT = process.env.PORT || 3001;
const isDev = process.env.NODE_ENV !== 'production';

// Allow localhost + private LAN ranges (RFC1918) so other devices on the same
// Wi-Fi can reach the dev server when Vite is run with --host.
function isAllowedOrigin(origin) {
  if (!origin) return true; // same-origin / curl / proxied requests
  try {
    const host = new URL(origin).hostname;
    if (host === 'localhost' || host === '127.0.0.1') return true;
    if (/^10\./.test(host)) return true;
    if (/^192\.168\./.test(host)) return true;
    if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(host)) return true;
  } catch {}
  return false;
}

app.use(cors({
  origin: (origin, cb) => {
    if (isAllowedOrigin(origin)) return cb(null, true);
    cb(new Error('Not allowed by CORS'));
  },
}));

app.use(express.json({ limit: '2mb' }));
app.use('/api', oracleRoutes);
app.use('/api', ttsRoutes);
app.use('/api', campaignRoutes);
app.use('/api', partyRoutes);
app.use('/api', sessionRoutes);
app.use('/api', invocationRoutes);
app.use('/api', healthRoutes);
app.use('/api', merchantRoutes);

app.use((err, req, res, _next) => {
  console.error('Unhandled error:', err.message);
  res.status(500).json({ error: 'Internal server error.' });
});

// HTTP server wraps Express so Socket.IO can share the same port.
const server = http.createServer(app);

const io = new SocketIOServer(server, {
  cors: {
    origin: (origin, cb) => cb(null, isAllowedOrigin(origin)),
    credentials: true,
  },
});

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
    console.error('Migration failed — DB unavailable, continuing without it:', err.message);
  }
  // 0.0.0.0 lets devices on the LAN reach the backend directly if needed.
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Oracle backend running on http://localhost:${PORT}`);
  });
}

start();
