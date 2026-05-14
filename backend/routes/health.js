const { Router } = require('express');
const { db } = require('../db/db');

const router = Router();

// Lightweight health probe. Returns 200 when the backend can reach the
// database, 503 otherwise. Intended for deployment health checks; safe to
// hit frequently (single SELECT 1).
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
