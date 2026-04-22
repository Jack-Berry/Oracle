import { useState, useEffect } from 'react';
import LoginScreen from './components/LoginScreen.jsx';
import OracleScreen from './components/OracleScreen.jsx';

const LS_NAME = 'oracle_displayName';
const LS_SESSION = 'oracle_sessionName';

export default function App() {
  const [displayName, setDisplayName] = useState('');
  const [sessionName, setSessionName] = useState('');
  const [loggedIn, setLoggedIn] = useState(false);

  // Restore session on mount
  useEffect(() => {
    const name = localStorage.getItem(LS_NAME);
    const session = localStorage.getItem(LS_SESSION);
    if (name && session) {
      setDisplayName(name);
      setSessionName(session);
      setLoggedIn(true);
    }
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

  if (loggedIn) {
    return (
      <OracleScreen
        displayName={displayName}
        sessionName={sessionName}
        onChangeSession={handleChangeSession}
      />
    );
  }

  return <LoginScreen onLogin={handleLogin} />;
}
