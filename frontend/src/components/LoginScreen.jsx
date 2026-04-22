import { useState } from 'react';

export default function LoginScreen({ onLogin }) {
  const [displayName, setDisplayName] = useState('');
  const [sessionName, setSessionName] = useState('');
  const [error, setError] = useState('');

  function handleSubmit(e) {
    e.preventDefault();
    const name = displayName.trim();
    const session = sessionName.trim();

    if (!name) return setError('Enter your display name.');
    if (!session) return setError('Enter a session name.');

    onLogin(name, session);
  }

  return (
    <div className="login-screen">
      <div className="login-card">
        <div className="login-emblem">
          <span className="oracle-sigil" aria-hidden="true">◈</span>
          <h1 className="oracle-title">The Oracle</h1>
          <p className="oracle-tagline">Seek wisdom. Guide your story.</p>
        </div>

        <form className="login-form" onSubmit={handleSubmit} noValidate>
          {error && <div className="inline-error" role="alert">{error}</div>}

          <div className="field">
            <label htmlFor="displayName">Your Name (DM)</label>
            <input
              id="displayName"
              type="text"
              value={displayName}
              onChange={e => { setError(''); setDisplayName(e.target.value); }}
              placeholder="Dungeon Master"
              maxLength={50}
              autoComplete="off"
              autoFocus
            />
          </div>

          <div className="field">
            <label htmlFor="sessionName">Session Name</label>
            <input
              id="sessionName"
              type="text"
              value={sessionName}
              onChange={e => { setError(''); setSessionName(e.target.value); }}
              placeholder="The Curse of Strahd"
              maxLength={80}
              autoComplete="off"
            />
          </div>

          <button type="submit" className="btn btn-primary">
            Consult the Oracle
          </button>
        </form>
      </div>
    </div>
  );
}
