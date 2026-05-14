const { Router } = require('express');
const { db } = require('../db/db');

const router = Router();

// Liveness probe. Does NOT touch the database — answers as long as the Node
// process is up and the event loop is responsive. Use this for platform
// health checks that should keep the pod alive while Neon is cold-starting
// or briefly unreachable.
router.get('/livez', (req, res) => {
  res.status(200).json({
    status: 'live',
    timestamp: new Date().toISOString(),
  });
});

// Readiness probe. Returns 200 when the backend can reach the database, 503
// otherwise. Use for checks that need full-stack health (e.g. monitoring,
// not the platform's own pod-kill probe).
router.get('/healthz', async (req, res) => {
  let dbReachable = false;
  try {
    await db.raw('SELECT 1');
    dbReachable = true;
  } catch {
    dbReachable = false;
  }

  res.status(dbReachable ? 200 : 503).json({
    status: dbReachable ? 'ok' : 'degraded',
    db: dbReachable,
    timestamp: new Date().toISOString(),
  });
});

module.exports = router;
