import HiddenContextPanel from './HiddenContextPanel.jsx';
import CampaignPanel from './CampaignPanel.jsx';
import QuirkPanel from './QuirkPanel.jsx';
import PartyManager from './PartyManager.jsx';
import ScriptedInvocationsPanel from './ScriptedInvocationsPanel.jsx';
import ToneModeToggle from './ToneModeToggle.jsx';
import VoiceSettings from './VoiceSettings.jsx';

export default function SettingsDrawer({
  open,
  onClose,
  sessionName,
  displayName,
  onChangeSession,
  hiddenContext,
  onHiddenContextChange,
  onHiddenContextReset,
  toneMode,
  onToneModeChange,
  voiceSettings,
  onVoiceSettingUpdate,
  voices,
  sttSupported,
  isBackendAvailable,
  autoSend,
  onAutoSendChange,
  displayMode,
  onDisplayModeChange,
  // Campaign + party props
  campaignContext,
  onCampaignContextChange,
  partyMembers,
  onAddPartyMember,
  onUpdatePartyMember,
  onDeletePartyMember,
  onAddFileToMember,
  onRemoveFileFromMember,
  // Oracle quirk
  oracleQuirkText,
  oracleQuirkIntensity,
  oracleQuirkStyle,
  oraclePersonalityStyle,
  onOracleQuirkTextChange,
  onOracleQuirkIntensityChange,
  onOracleQuirkStyleChange,
  onOraclePersonalityStyleChange,
  scriptedInvocations = [],
  onCreateInvocation,
  onUpdateInvocation,
  onDeleteInvocation,
}) {
  if (!open) return null;

  function handleChangeSession() {
    onClose();
    onChangeSession();
  }

  return (
    <>
      <div className="drawer-backdrop" onClick={onClose} aria-hidden="true" />

      <aside className="settings-drawer" aria-label="Settings">
        <div className="drawer-header">
          <span className="drawer-title">Settings</span>
          <button
            type="button"
            className="drawer-close"
            onClick={onClose}
            aria-label="Close settings"
          >
            ✕
          </button>
        </div>

        <div className="drawer-body">
          {/* ── TTS master switch ── */}
          <section className="drawer-section drawer-section-tts-master">
            <label className="drawer-toggle-row">
              <span>
                <strong>Voice (TTS)</strong>
                <span className="drawer-toggle-hint">
                  {voiceSettings.ttsEnabled
                    ? 'Spoken responses enabled'
                    : 'Disabled — preserves API tokens'}
                </span>
              </span>
              <input
                type="checkbox"
                checked={voiceSettings.ttsEnabled}
                onChange={e => onVoiceSettingUpdate('ttsEnabled', e.target.checked)}
              />
            </label>
          </section>

          {/* ── Oracle Display Mode (LAN multi-device) ── */}
          <section className="drawer-section">
            <label className="drawer-toggle-row">
              <span>
                <strong>Oracle Display Mode</strong>
                <span className="drawer-toggle-hint">
                  This device becomes the room speaker/display for Oracle responses.
                </span>
              </span>
              <input
                type="checkbox"
                checked={!!displayMode}
                onChange={e => onDisplayModeChange?.(e.target.checked)}
              />
            </label>
          </section>

          {/* ── Session ── */}
          <section className="drawer-section">
            <h3 className="drawer-section-label">Session</h3>
            <div className="drawer-session-info">
              <span className="drawer-session-name">{sessionName}</span>
              <span className="drawer-session-dm">{displayName}</span>
            </div>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={handleChangeSession}
            >
              Change Session
            </button>
          </section>

          {/* ── Tone ── */}
          <section className="drawer-section">
            <h3 className="drawer-section-label">Tone</h3>
            <ToneModeToggle value={toneMode} onChange={onToneModeChange} />
          </section>

          {/* ── Voice input ── */}
          <section className="drawer-section">
            <h3 className="drawer-section-label">Voice Input</h3>
            <label className="drawer-toggle-row">
              <span>Auto-send spoken question</span>
              <input
                type="checkbox"
                checked={autoSend}
                onChange={e => onAutoSendChange(e.target.checked)}
              />
            </label>
          </section>

          {/* ── Session-specific context (temporary) ── */}
          <section className="drawer-section">
            <HiddenContextPanel
              value={hiddenContext}
              onChange={onHiddenContextChange}
              onReset={onHiddenContextReset}
            />
          </section>

          {/* ── Persistent campaign context ── */}
          <section className="drawer-section">
            <CampaignPanel
              value={campaignContext}
              onChange={onCampaignContextChange}
            />
          </section>

          {/* ── Scripted invocations (DM-authored trigger phrases) ── */}
          {onCreateInvocation && (
            <section className="drawer-section">
              <ScriptedInvocationsPanel
                invocations={scriptedInvocations}
                onCreate={onCreateInvocation}
                onUpdate={onUpdateInvocation}
                onDelete={onDeleteInvocation}
              />
            </section>
          )}

          {/* ── Oracle quirk (hidden DM-only flavour) ── */}
          <section className="drawer-section">
            <QuirkPanel
              text={oracleQuirkText}
              intensity={oracleQuirkIntensity}
              style={oracleQuirkStyle}
              personality={oraclePersonalityStyle}
              onTextChange={onOracleQuirkTextChange}
              onIntensityChange={onOracleQuirkIntensityChange}
              onStyleChange={onOracleQuirkStyleChange}
              onPersonalityChange={onOraclePersonalityStyleChange}
            />
          </section>

          {/* ── Party members ── */}
          <section className="drawer-section">
            <PartyManager
              partyMembers={partyMembers}
              onAdd={onAddPartyMember}
              onUpdate={onUpdatePartyMember}
              onDelete={onDeletePartyMember}
              onAddFile={onAddFileToMember}
              onRemoveFile={onRemoveFileFromMember}
            />
          </section>

          {/* ── Voice output settings ── */}
          {voiceSettings.ttsEnabled && (
            <section className="drawer-section">
              <VoiceSettings
                settings={voiceSettings}
                onUpdate={onVoiceSettingUpdate}
                voices={voices}
                sttSupported={sttSupported}
                isBackendAvailable={isBackendAvailable}
              />
            </section>
          )}
        </div>
      </aside>
    </>
  );
}
