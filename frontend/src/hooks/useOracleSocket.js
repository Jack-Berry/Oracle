import { useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';

/**
 * Connects a single Socket.IO client to the current backend host and forwards
 * `oracle_response` events to the latest handler. Reconnects automatically.
 *
 * No-arg `io()` connects to window.location.origin, so the same code works
 * from http://localhost:5173 and http://<lan-ip>:5173 — Vite proxies
 * /socket.io to the Express backend (see vite.config.js, ws: true).
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
    const target = `${window.location.origin}/socket.io`;
    if (import.meta.env.DEV) {
      console.log(`[socket] connecting → ${target}`);
    }

    const socket = io({
      path: '/socket.io',
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
    });

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
