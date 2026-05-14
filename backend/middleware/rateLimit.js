// Rate limiters for money-spending and general /api endpoints.
// Limits are configurable via env vars; defaults are sensible for a
// private app. Window is a fixed 15 minutes.

const rateLimit = require('express-rate-limit');

const WINDOW_MS = 15 * 60 * 1000;

function envInt(name, fallback) {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function build(name, defaultMax, message) {
  return rateLimit({
    windowMs: WINDOW_MS,
    max: envInt(name, defaultMax),
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: message },
  });
}

const oracleLimiter   = build('ORACLE_RATE_LIMIT',   30,  'Too many Oracle requests. Slow down.');
const ttsLimiter      = build('TTS_RATE_LIMIT',      30,  'Too many TTS requests. Slow down.');
const merchantLimiter = build('MERCHANT_RATE_LIMIT', 60,  'Too many merchant requests. Slow down.');
const generalLimiter  = build('API_RATE_LIMIT',      600, 'Too many requests. Slow down.');

module.exports = {
  oracleLimiter,
  ttsLimiter,
  merchantLimiter,
  generalLimiter,
};
