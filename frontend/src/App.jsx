import { useState, useEffect } from 'react';
import AccessGate from './components/AccessGate.jsx';
import LoginScreen from './components/LoginScreen.jsx';
import OracleScreen from './components/OracleScreen.jsx';

const LS_NAME = 'oracle_displayName';
const LS_SESSION = 'oracle_sessionName';

// Shared LAN-mode defaults. All devices that auto-boot use the same session
// name so they resolve to the same backend session row. The DM display name
// is per-device cosmetics only (used in prompts) so a generic default is fine.
const DEFAULT_NAME = 'Dungeon Master';
const DEFAULT_SESSION = "Tonight's Session";

export default function App() {
  const [displayName, setDisplayName] = useState('');
  const [sessionName, setSessionName] = useState('');
  const [loggedIn, setLoggedIn] = useState(false);

  // Auto-boot on mount with shared defaults so iPhone/iPad opening the LAN URL
  // skip the login screen and land on the same Oracle session as the host.
  useEffect(() => {
    const name = localStorage.getItem(LS_NAME) || DEFAULT_NAME;
    const session = localStorage.getItem(LS_SESSION) || DEFAULT_SESSION;
    if (!localStorage.getItem(LS_NAME)) localStorage.setItem(LS_NAME, name);
    if (!localStorage.getItem(LS_SESSION)) localStorage.setItem(LS_SESSION, session);
    setDisplayName(name);
    setSessionName(session);
    setLoggedIn(true);
  }, []);

  function handleLogin(name, session) {
    localStorage.setItem(LS_NAME, name);
    localStorage.setItem(LS_SESSION, session);
    setDisplayName(name);
    setSessionName(session);
    setLoggedIn(true);
  }

  function handleChangeSession() {
    setLoggedIn(false);
  }

  return (
    <AccessGate>
      {loggedIn ? (
        <OracleScreen
          displayName={displayName}
          sessionName={sessionName}
          onChangeSession={handleChangeSession}
        />
      ) : (
        <LoginScreen onLogin={handleLogin} />
      )}
    </AccessGate>
  );
}
