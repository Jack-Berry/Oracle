import { useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { getAccessToken, getApiBaseUrl } from '../utils/apiClient.js';

/**
 * Connects a single Socket.IO client to the configured backend and forwards
 * `oracle_response` events to the latest handler. Reconnects automatically.
 *
 * Connection target:
 *   - If VITE_API_BASE_URL is set (production / Vercel → Render), connect
 *     directly to that origin.
 *   - Otherwise fall back to window.location.origin so dev (Vite proxy with
 *     ws: true) and LAN access continue to work unchanged.
 *
 * Auth: the access token from localStorage is sent in the handshake `auth`
 * payload. The backend verifies it in production via socket.io middleware.
 * An `unauthorized` connect_error dispatches `oracle:unauthorized` so the
 * AccessGate can re-prompt.
 *
 * Transports are left at the Socket.IO default (polling → upgrade to
 * WebSocket). Forcing 'websocket' first breaks behind some HTTP proxies
 * because the upgrade handshake can fail before fallback kicks in.
 */
export function useOracleSocket(onOracleResponse) {
  const handlerRef = useRef(onOracleResponse);
  handlerRef.current = onOracleResponse;

  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const base = getApiBaseUrl();
    const target = base || `${window.location.origin}`;
    const token = getAccessToken();

    if (import.meta.env.DEV) {
      console.log(`[socket] connecting → ${target}/socket.io`);
    }

    const socketOpts = {
      path: '/socket.io',
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      auth: token ? { token } : {},
    };
    const socket = base ? io(base, socketOpts) : io(socketOpts);

    function handleConnect() {
      setConnected(true);
      if (import.meta.env.DEV) {
        console.log(
          `[socket] connected id=${socket.id} transport=${socket.io.engine?.transport?.name || '?'}`
        );
      }
    }
    function handleDisconnect(reason) {
      setConnected(false);
      if (import.meta.env.DEV) {
        console.log(`[socket] disconnected reason=${reason}`);
      }
    }
    function handleConnectError(err) {
      if (import.meta.env.DEV) {
        console.warn(
          `[socket] connect_error: ${err?.message || err} type=${err?.type || '?'}`
        );
      }
      const msg = String(err?.message || '').toLowerCase();
      if (msg.includes('unauthor')) {
        try {
          window.dispatchEvent(new CustomEvent('oracle:unauthorized'));
        } catch {}
      }
    }
    function handleResponse(payload) {
      if (import.meta.env.DEV) {
        console.log('[socket] oracle_response received:', payload);
      }
      handlerRef.current?.(payload);
    }

    socket.on('connect', handleConnect);
    socket.on('disconnect', handleDisconnect);
    socket.on('connect_error', handleConnectError);
    socket.on('oracle_response', handleResponse);

    return () => {
      socket.off('connect', handleConnect);
      socket.off('disconnect', handleDisconnect);
      socket.off('connect_error', handleConnectError);
      socket.off('oracle_response', handleResponse);
      socket.disconnect();
    };
  }, []);

  return { connected };
}
