// Shared-token bearer auth. Suitable for a private app — not full user
// auth. The single ORACLE_ACCESS_TOKEN value is compared to the value
// the client sends in `Authorization: Bearer <token>`. Socket.IO handshakes
// accept the same token via `auth.token`, `query.token`, or the
// Authorization header.
//
// In development, auth is OFF by default so local testing stays friction-free.
// Set ORACLE_REQUIRE_AUTH=true to exercise the auth path locally. In
// production (NODE_ENV=production) auth is always required; if
// ORACLE_ACCESS_TOKEN is missing the server fails closed (503).

const isProd = process.env.NODE_ENV === 'production';
const authRequired = isProd || process.env.ORACLE_REQUIRE_AUTH === 'true';

function getConfiguredToken() {
  return (process.env.ORACLE_ACCESS_TOKEN || '').trim();
}

function extractBearerFromHeader(headerValue) {
  if (!headerValue) return '';
  const m = /^Bearer\s+(.+)$/i.exec(String(headerValue).trim());
  return m ? m[1].trim() : '';
}

function constantTimeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function tokenIsValid(token) {
  const configured = getConfiguredToken();
  if (!configured) return false;
  return constantTimeEqual(String(token || ''), configured);
}

function requireAccessToken(req, res, next) {
  if (!authRequired) return next();

  const configured = getConfiguredToken();
  if (!configured) {
    return res
      .status(503)
      .json({ error: 'Oracle access not configured on server.' });
  }

  const presented = extractBearerFromHeader(req.get('authorization'));
  if (!tokenIsValid(presented)) {
    return res
      .status(401)
      .json({ error: 'Unauthorized. Provide a valid Oracle access token.' });
  }

  next();
}

function verifySocketToken(socket, next) {
  if (!authRequired) return next();

  const configured = getConfiguredToken();
  if (!configured) {
    return next(new Error('Oracle access not configured on server.'));
  }

  const handshake = socket.handshake || {};
  const headers = handshake.headers || {};
  const headerToken = extractBearerFromHeader(
    headers.authorization || headers.Authorization
  );
  const presented =
    (handshake.auth && handshake.auth.token) ||
    (handshake.query && handshake.query.token) ||
    headerToken ||
    '';

  if (!tokenIsValid(presented)) {
    return next(new Error('unauthorized'));
  }
  next();
}

module.exports = {
  requireAccessToken,
  verifySocketToken,
  authRequired,
};
