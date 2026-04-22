import { useState, useEffect } from 'react';
import HiddenContextPanel from './HiddenContextPanel.jsx';
import ToneModeToggle from './ToneModeToggle.jsx';
import ConsultationForm from './ConsultationForm.jsx';
import ConsultationHistory from './ConsultationHistory.jsx';
import StatusBanner from './StatusBanner.jsx';
import VoiceSettings from './VoiceSettings.jsx';
import { useAudioEngine } from '../hooks/useAudioEngine.js';
import { useSpeechSynthesis } from '../hooks/useSpeechSynthesis.js';
import { useVoiceSettings } from '../hooks/useVoiceSettings.js';
import { isSpeechRecognitionSupported } from '../hooks/useSpeechRecognition.js';

function loadHistory(sessionName) {
  try {
    const raw = localStorage.getItem(`oracle_history_${sessionName}`);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveHistory(sessionName, history) {
  try {
    localStorage.setItem(`oracle_history_${sessionName}`, JSON.stringify(history));
  } catch {}
}

export default function OracleScreen({ displayName, sessionName, onChangeSession }) {
  const [consultations, setConsultations] = useState(() => loadHistory(sessionName));
  const [hiddenContext, setHiddenContext] = useState('');
  const [toneMode, setToneMode] = useState('oracle');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  // Audio engine — real effects via Web Audio API + backend TTS
  const { isSpeaking, isBackendAvailable, speak: engineSpeak, stop: stopSpeech } =
    useAudioEngine();

  const { isSupported: ttsSupported } = useSpeechSynthesis();

  const [backendVoices, setBackendVoices] = useState([]);
  useEffect(() => {
    fetch('/api/voices')
      .then(r => r.ok ? r.json() : { voices: [] })
      .then(data => setBackendVoices(data.voices || []))
      .catch(() => setBackendVoices([]));
  }, []);

  const { settings, updateSetting } = useVoiceSettings();
  const [speakingId, setSpeakingId] = useState(null);

  useEffect(() => {
    if (!isSpeaking) setSpeakingId(null);
  }, [isSpeaking]);

  function speakResponse(id, text) {
    if (speakingId === id && isSpeaking) {
      stopSpeech();
    } else {
      engineSpeak(text, settings);
      setSpeakingId(id);
    }
  }

  async function handleAsk(question) {
    setIsLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/oracle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question, hiddenContext, toneMode, sessionName, displayName }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'The Oracle could not be reached.');

      const entry = {
        id: Date.now(),
        question,
        response: data.response,
        timestamp: new Date().toISOString(),
        toneMode,
      };

      setConsultations(prev => {
        const updated = [entry, ...prev];
        saveHistory(sessionName, updated);
        return updated;
      });

      if (settings.autoSpeak) {
        engineSpeak(entry.response, settings);
        setSpeakingId(entry.id);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  }

  function clearHistory() {
    setConsultations([]);
    saveHistory(sessionName, []);
  }

  return (
    <div className="oracle-screen">
      <header className="oracle-header">
        <div className="oracle-header-row">
          <h1>The Oracle</h1>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={onChangeSession}
          >
            Change Session
          </button>
        </div>
        <p className="session-meta">{sessionName} · {displayName}</p>
      </header>

      <main>
        <p className="oracle-intro">
          The Oracle sees the threads of fate — the paths your players might walk, the consequences of choices not yet made. Seek guidance. The story remains yours to command.
        </p>

        <HiddenContextPanel
          value={hiddenContext}
          onChange={setHiddenContext}
          onReset={() => setHiddenContext('')}
        />

        <ToneModeToggle value={toneMode} onChange={setToneMode} />

        <VoiceSettings
          settings={settings}
          onUpdate={updateSetting}
          backendVoices={backendVoices}
          ttsSupported={ttsSupported}
          sttSupported={isSpeechRecognitionSupported}
          isBackendAvailable={isBackendAvailable}
        />

        <ConsultationForm onSubmit={handleAsk} isLoading={isLoading} />

        {isLoading && (
          <div className="oracle-loading" aria-live="polite">
            The Oracle contemplates your question…
          </div>
        )}

        {error && (
          <StatusBanner type="error" message={error} onDismiss={() => setError(null)} />
        )}

        <ConsultationHistory
          consultations={consultations}
          onClear={clearHistory}
          ttsSupported={ttsSupported}
          onSpeak={speakResponse}
          onStopSpeech={stopSpeech}
          speakingId={speakingId}
          isSpeaking={isSpeaking}
        />
      </main>
    </div>
  );
}
