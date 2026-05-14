import { useState, useEffect, useRef, useCallback } from 'react';
import ConsultationForm from './ConsultationForm.jsx';
import ConsultationHistory from './ConsultationHistory.jsx';
import StatusBanner from './StatusBanner.jsx';
import OracleResponseOverlay from './OracleResponseOverlay.jsx';
import SettingsDrawer from './SettingsDrawer.jsx';
import MigrationBanner from './MigrationBanner.jsx';
import InvocationTriggerPanel from './InvocationTriggerPanel.jsx';
import MerchantPanel from './MerchantPanel.jsx';
import { useAudioEngine } from '../hooks/useAudioEngine.js';
import { useVoiceSettings } from '../hooks/useVoiceSettings.js';
import { useCampaignDb } from '../hooks/useCampaignDb.js';
import { useScriptedInvocations } from '../hooks/useScriptedInvocations.js';
import { useOracleSocket } from '../hooks/useOracleSocket.js';
import { isSpeechRecognitionSupported } from '../hooks/useSpeechRecognition.js';

const AUTO_SEND_KEY = 'oracle_auto_send';
const DISPLAY_MODE_KEY = 'oracle_display_mode';

function loadAutoSend() {
  try { return JSON.parse(localStorage.getItem(AUTO_SEND_KEY) || 'false'); }
  catch { return false; }
}

function loadDisplayMode() {
  try { return JSON.parse(localStorage.getItem(DISPLAY_MODE_KEY) || 'false'); }
  catch { return false; }
}

// Strip dataUrl and extractedCharacter before sending to the Oracle API.
function partyForApi(partyMembers) {
  return partyMembers.map(m => ({
    ...m,
    files: (m.files || []).map(
      // eslint-disable-next-line no-unused-vars
      ({ dataUrl: _d, extractedCharacter: _ec, ...rest }) => rest
    ),
  }));
}

export default function OracleScreen({ displayName, sessionName, onChangeSession }) {
  const [toneMode, setToneMode] = useState('oracle');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [autoSend, setAutoSend] = useState(loadAutoSend);
  const [displayMode, setDisplayMode] = useState(loadDisplayMode);
  const [migrationDismissed, setMigrationDismissed] = useState(false);
  const [merchantOpen, setMerchantOpen] = useState(false);
  const merchantBtnRef = useRef(null);

  // Mirrors displayMode into a ref so the socket-event handler reads the
  // current value at the moment an event arrives, even if the closure or
  // hook deps lag behind a quick toggle.
  const displayModeRef = useRef(displayMode);
  displayModeRef.current = displayMode;
  const settingsRef = useRef(null);
  // settingsRef populated below once settings is in scope

  useEffect(() => {
    if (import.meta.env.DEV) {
      console.log(`[oracle] mounted displayMode=${displayMode}`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Overlay state machine: null → 'thinking' → 'cooling' → null
  const [overlayPhase, setOverlayPhase] = useState(null);
  const [currentEntry, setCurrentEntry] = useState(null);

  const {
    campaignContext,
    setCampaignContext,
    partyMembers,
    addPartyMember,
    updatePartyMember,
    deletePartyMember,
    addFileToMember,
    removeFileFromMember,
    hiddenContext,
    setHiddenContext,
    resetHiddenContext,
    oracleQuirkText,
    setOracleQuirkText,
    oracleQuirkIntensity,
    setOracleQuirkIntensity,
    oracleQuirkStyle,
    setOracleQuirkStyle,
    oraclePersonalityStyle,
    setOraclePersonalityStyle,
    consultations,
    addConsultation,
    clearConsultations,
    isLoading: dbLoading,
    campaignError,
    campaignId,
    hasMigratable,
    runMigration,
    isMigrating,
    migrationError,
    migrationDone,
  } = useCampaignDb({ sessionName, displayName });

  const {
    invocations,
    create: createInvocation,
    update: updateInvocation,
    remove: removeInvocation,
  } = useScriptedInvocations(campaignId);

  const { isSpeaking, isBackendAvailable, speak: engineSpeak, stop: stopSpeech } =
    useAudioEngine();

  const [backendVoices, setBackendVoices] = useState([]);
  useEffect(() => {
    fetch('/api/voices')
      .then(r => r.ok ? r.json() : { voices: [] })
      .then(data => setBackendVoices(data.voices || []))
      .catch(() => setBackendVoices([]));
  }, []);

  const { settings, updateSetting } = useVoiceSettings();
  settingsRef.current = settings;
  const [speakingId, setSpeakingId] = useState(null);

  useEffect(() => {
    if (!isSpeaking) setSpeakingId(null);
  }, [isSpeaking]);

  function handleAutoSendChange(val) {
    setAutoSend(val);
    try { localStorage.setItem(AUTO_SEND_KEY, JSON.stringify(val)); } catch {}
  }

  function handleDisplayModeChange(val) {
    setDisplayMode(val);
    try { localStorage.setItem(DISPLAY_MODE_KEY, JSON.stringify(val)); } catch {}
    if (import.meta.env.DEV) console.log(`[socket] display mode → ${val}`);
  }

  function speakResponse(id, text) {
    if (!settings.ttsEnabled) return;
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
    setOverlayPhase('thinking');

    try {
      const res = await fetch('/api/oracle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question,
          hiddenContext,
          campaignContext,
          campaignId,
          partyMembers: partyForApi(partyMembers),
          toneMode,
          sessionName,
          displayName,
          oracleQuirkText,
          oracleQuirkIntensity,
          oracleQuirkStyle,
          oraclePersonalityStyle,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'The Oracle could not be reached.');

      if (import.meta.env.DEV && data.invocation) {
        console.log(
          `[Oracle invocation] matched id=${data.invocation.id} title="${data.invocation.title || '(untitled)'}" mode=${data.invocation.mode}`
        );
      }

      const entry = {
        id: Date.now(),
        question,
        response: data.response,
        timestamp: new Date().toISOString(),
        toneMode,
      };

      await addConsultation(entry);
      setCurrentEntry(entry);
      setOverlayPhase('cooling');

      // When Display Mode is on, the broadcast socket event handles playback
      // for this device — skip local autoSpeak to avoid double audio.
      if (settings.ttsEnabled && settings.autoSpeak && !displayMode) {
        engineSpeak(entry.response, settings);
        setSpeakingId(entry.id);
      }
    } catch (err) {
      setError(err.message);
      setOverlayPhase(null);
    } finally {
      setIsLoading(false);
    }
  }

  const handleOverlayDismiss = useCallback(() => {
    setOverlayPhase(null);
    setCurrentEntry(null);
  }, []);

  // Controller-side handler for the InvocationTriggerPanel buttons. Calls the
  // dedicated trigger endpoint so the backend can match by id (no typed
  // trigger phrase needed) and broadcasts via Socket.IO like the typed flow.
  async function handleTriggerInvocation(inv) {
    if (overlayPhase !== null) return;
    if (import.meta.env.DEV) {
      console.log(
        `[invocation] button pressed id=${inv.id} title="${inv.title || '(untitled)'}" mode=${inv.mode}`
      );
    }
    setIsLoading(true);
    setError(null);
    setOverlayPhase('thinking');

    try {
      const res = await fetch(`/api/invocations/${inv.id}/trigger`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionName, displayName }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'The Oracle could not be reached.');

      const label = (inv.title && inv.title.trim())
        || (inv.triggerPhrase && inv.triggerPhrase.trim())
        || 'Scripted invocation';

      const entry = {
        id: Date.now(),
        question: `(invocation: ${label})`,
        response: data.response,
        timestamp: new Date().toISOString(),
        toneMode: 'oracle',
      };

      await addConsultation(entry);
      setCurrentEntry(entry);
      setOverlayPhase('cooling');

      // Same display-mode rule as handleAsk: when this device is the speaker,
      // the broadcast handler does the audio so we don't double-play.
      if (settings.ttsEnabled && settings.autoSpeak && !displayMode) {
        engineSpeak(entry.response, settings);
        setSpeakingId(entry.id);
      }
    } catch (err) {
      setError(err.message);
      setOverlayPhase(null);
    } finally {
      setIsLoading(false);
    }
  }

  // Display Mode: when a broadcast arrives, this device shows the overlay
  // and speaks the response. Other devices ignore the event.
  // Reads displayMode/settings from refs so a stale closure can't leave a
  // toggled-on Mac silently ignoring events.
  const handleSocketResponse = useCallback((payload) => {
    const dm = displayModeRef.current;
    const sourceType = payload?.sourceType || 'normal';

    if (import.meta.env.DEV) {
      console.log(
        `[socket] oracle_response handler fired displayMode=${dm} sourceType=${sourceType}`
      );
    }

    if (!dm) {
      if (import.meta.env.DEV) console.log('[socket] ignored — displayMode is off');
      return;
    }
    if (!payload || typeof payload.response !== 'string') {
      if (import.meta.env.DEV) console.warn('[socket] ignored — malformed payload', payload);
      return;
    }

    if (import.meta.env.DEV) {
      console.log(`[socket] applying oracle_response sourceType=${sourceType}`);
    }

    const entry = {
      id: `socket_${payload.timestamp || Date.now()}`,
      response: payload.response,
      timestamp: payload.timestamp || new Date().toISOString(),
      toneMode: 'oracle',
    };

    setCurrentEntry(entry);
    setOverlayPhase('cooling');

    const s = settingsRef.current;
    if (s?.ttsEnabled) {
      engineSpeak(payload.response, s);
      setSpeakingId(entry.id);
    }
  }, [engineSpeak]);

  useOracleSocket(handleSocketResponse);

  const overlayActive = overlayPhase !== null;

  const showMigrationBanner = hasMigratable && !migrationDismissed && !migrationDone;

  return (
    <div className="oracle-screen">
      {overlayActive && (
        <OracleResponseOverlay
          phase={overlayPhase}
          response={currentEntry?.response}
          toneMode={currentEntry?.toneMode}
          isSpeaking={isSpeaking}
          onSpeak={
            settings.ttsEnabled
              ? () => currentEntry && engineSpeak(currentEntry.response, settings)
              : undefined
          }
          onStopSpeech={stopSpeech}
          onDismiss={handleOverlayDismiss}
        />
      )}

      <SettingsDrawer
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        sessionName={sessionName}
        displayName={displayName}
        onChangeSession={onChangeSession}
        hiddenContext={hiddenContext}
        onHiddenContextChange={setHiddenContext}
        onHiddenContextReset={resetHiddenContext}
        toneMode={toneMode}
        onToneModeChange={setToneMode}
        voiceSettings={settings}
        onVoiceSettingUpdate={updateSetting}
        voices={backendVoices}
        sttSupported={isSpeechRecognitionSupported}
        isBackendAvailable={isBackendAvailable}
        autoSend={autoSend}
        onAutoSendChange={handleAutoSendChange}
        displayMode={displayMode}
        onDisplayModeChange={handleDisplayModeChange}
        campaignContext={campaignContext}
        onCampaignContextChange={setCampaignContext}
        partyMembers={partyMembers}
        onAddPartyMember={addPartyMember}
        onUpdatePartyMember={updatePartyMember}
        onDeletePartyMember={deletePartyMember}
        onAddFileToMember={addFileToMember}
        onRemoveFileFromMember={removeFileFromMember}
        oracleQuirkText={oracleQuirkText}
        oracleQuirkIntensity={oracleQuirkIntensity}
        oracleQuirkStyle={oracleQuirkStyle}
        oraclePersonalityStyle={oraclePersonalityStyle}
        onOracleQuirkTextChange={setOracleQuirkText}
        onOracleQuirkIntensityChange={setOracleQuirkIntensity}
        onOracleQuirkStyleChange={setOracleQuirkStyle}
        onOraclePersonalityStyleChange={setOraclePersonalityStyle}
        scriptedInvocations={invocations}
        onCreateInvocation={createInvocation}
        onUpdateInvocation={updateInvocation}
        onDeleteInvocation={removeInvocation}
      />

      <header className="oracle-header">
        <div className="header-merchant-wrap">
          <button
            ref={merchantBtnRef}
            type="button"
            className="merchant-btn"
            onClick={() => setMerchantOpen(v => !v)}
            aria-label="Open Merchant"
            aria-expanded={merchantOpen}
            title="Merchant"
          >
            <span className="merchant-btn-icon" aria-hidden="true">⚖</span>
            <span className="merchant-btn-label">Merchant</span>
          </button>
          <MerchantPanel
            open={merchantOpen}
            onClose={() => setMerchantOpen(false)}
            anchor={merchantBtnRef.current}
          />
        </div>

        <h1 className="oracle-title-main">The Oracle</h1>

        <button
          type="button"
          className="burger-btn"
          onClick={() => setSettingsOpen(true)}
          aria-label="Open settings"
          aria-expanded={settingsOpen}
        >
          <span />
          <span />
          <span />
        </button>
      </header>

      <main className="oracle-main">
        {displayMode && (
          <div className="display-mode-badge" role="status" aria-live="polite">
            ◈ Oracle Display Mode — listening for broadcasts
          </div>
        )}

        {showMigrationBanner && (
          <MigrationBanner
            onMigrate={runMigration}
            onDismiss={() => setMigrationDismissed(true)}
            isMigrating={isMigrating}
            migrationError={migrationError}
            migrationDone={migrationDone}
          />
        )}

        {campaignError && (
          <StatusBanner type="error" message={`Database: ${campaignError}`} />
        )}

        <p className="oracle-tagline-main">
          Seek guidance. The story remains yours to command.
        </p>

        <ConsultationForm
          onSubmit={handleAsk}
          isLoading={isLoading || dbLoading}
          autoSend={autoSend}
          locked={overlayActive}
        />

        <InvocationTriggerPanel
          invocations={invocations}
          onTrigger={handleTriggerInvocation}
          disabled={overlayActive || isLoading || dbLoading}
        />

        {error && (
          <StatusBanner type="error" message={error} onDismiss={() => setError(null)} />
        )}

        <ConsultationHistory
          consultations={consultations}
          onClear={clearConsultations}
          ttsSupported={settings.ttsEnabled}
          onSpeak={speakResponse}
          onStopSpeech={stopSpeech}
          speakingId={speakingId}
          isSpeaking={isSpeaking}
        />
      </main>
    </div>
  );
}
