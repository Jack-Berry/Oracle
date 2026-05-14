import { useEffect, useState } from 'react';
import { getAccessToken, setAccessToken } from '../utils/apiClient.js';

// Simple shared-token gate. The user enters the configured access code once;
// it is stored in localStorage and attached to every API request and the
// Socket.IO handshake. A 401 from anywhere triggers an `oracle:unauthorized`
// event which forces this gate to re-prompt.
export default function AccessGate({ children }) {
  const [unlocked, setUnlocked] = useState(() => !!getAccessToken());
  const [input, setInput] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    function onUnauthorized() {
      setError('Access code rejected. Re-enter the current code.');
      setUnlocked(false);
    }
    window.addEventListener('oracle:unauthorized', onUnauthorized);
    return () => window.removeEventListener('oracle:unauthorized', onUnauthorized);
  }, []);

  function handleSubmit(e) {
    e.preventDefault();
    const v = input.trim();
    if (!v) { setError('Enter the Oracle access code.'); return; }
    setAccessToken(v);
    setInput('');
    setError('');
    setUnlocked(true);
  }

  if (unlocked) return children;

  return (
    <div className="login-screen">
      <div className="login-card">
        <div className="login-emblem">
          <span className="oracle-sigil" aria-hidden="true">◈</span>
          <h1 className="oracle-title">The Oracle</h1>
          <p className="oracle-tagline">Speak the access code to enter.</p>
        </div>

        <form className="login-form" onSubmit={handleSubmit} noValidate>
          {error && <div className="inline-error" role="alert">{error}</div>}

          <div className="field">
            <label htmlFor="oracleAccessCode">Oracle Access Code</label>
            <input
              id="oracleAccessCode"
              type="password"
              value={input}
              onChange={e => { setError(''); setInput(e.target.value); }}
              placeholder="••••••••"
              autoComplete="current-password"
              autoFocus
            />
          </div>

          <button type="submit" className="btn btn-primary">Enter</button>
        </form>
      </div>
    </div>
  );
}
