import { useState } from 'react';

export default function VoiceSettings({
  settings,
  onUpdate,
  voices,
  sttSupported,
  isBackendAvailable,
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="voice-settings-panel">
      <button
        type="button"
        className="context-toggle"
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
      >
        <span>Voice Settings</span>
        <span className={`chevron${open ? ' open' : ''}`}>▾</span>
      </button>

      {open && (
        <div className="context-body">
          <label className="voice-setting-row">
            <span>Auto-speak responses</span>
                <input
                  type="checkbox"
                  checked={settings.autoSpeak}
                  onChange={e => onUpdate('autoSpeak', e.target.checked)}
                />
              </label>

              {voices.length > 0 && (
                <label className="voice-setting-col">
                  <span>Voice</span>
                  <select
                    value={settings.voiceId}
                    onChange={e => onUpdate('voiceId', e.target.value)}
                  >
                    <option value="">— Select a voice —</option>
                    {voices.map(v => (
                      <option key={v.id} value={v.id}>{v.name}</option>
                    ))}
                  </select>
                </label>
              )}

              {/* ── Pitch ─────────────────────────────────────── */}
              <div className="voice-effects-section">
                <span className="voice-effects-heading">Pitch</span>

                <label className="voice-setting-row">
                  <span>Base Pitch &nbsp;<em>{settings.pitch.toFixed(2)}x</em></span>
                  <input
                    type="range"
                    min="0.5" max="2" step="0.01"
                    value={settings.pitch}
                    onChange={e => onUpdate('pitch', parseFloat(e.target.value))}
                  />
                </label>

                <label className="voice-setting-row">
                  <span>
                    Shift &nbsp;
                    <em>{settings.pitchShift > 0 ? '+' : ''}{settings.pitchShift} st</em>
                  </span>
                  <input
                    type="range"
                    min="-12" max="12" step="1"
                    value={settings.pitchShift}
                    onChange={e => onUpdate('pitchShift', parseInt(e.target.value, 10))}
                  />
                </label>

                <label className="voice-setting-row">
                  <span>Blend &nbsp;<em>{Math.round(settings.pitchMix * 100)}%</em></span>
                  <input
                    type="range"
                    min="0" max="1" step="0.01"
                    value={settings.pitchMix}
                    onChange={e => onUpdate('pitchMix', parseFloat(e.target.value))}
                  />
                </label>

                <p className="voice-setting-note">
                  Blend mixes the original with a pitch-shifted copy. 50% layers both simultaneously.
                </p>
              </div>

              {/* ── Reverb ────────────────────────────────────── */}
              <div className="voice-effects-section">
                <span className="voice-effects-heading">Reverb</span>

                <label className="voice-setting-row">
                  <span>Amount &nbsp;<em>{Math.round(settings.reverb * 100)}%</em></span>
                  <input
                    type="range"
                    min="0" max="1" step="0.01"
                    value={settings.reverb}
                    onChange={e => onUpdate('reverb', parseFloat(e.target.value))}
                  />
                </label>

                <label className="voice-setting-row">
                  <span>Time &nbsp;<em>{settings.reverbTime.toFixed(1)}s</em></span>
                  <input
                    type="range"
                    min="0.3" max="6" step="0.1"
                    value={settings.reverbTime}
                    onChange={e => onUpdate('reverbTime', parseFloat(e.target.value))}
                  />
                </label>

                <label className="voice-setting-row">
                  <span>Decay &nbsp;<em>{settings.reverbDecay.toFixed(1)}</em></span>
                  <input
                    type="range"
                    min="0.5" max="5" step="0.1"
                    value={settings.reverbDecay}
                    onChange={e => onUpdate('reverbDecay', parseFloat(e.target.value))}
                  />
                </label>

                <p className="voice-setting-note">
                  Time sets the tail length. Decay controls how quickly it fades — lower = longer sustain.
                </p>
              </div>

              {/* ── Delay ─────────────────────────────────────── */}
              <div className="voice-effects-section">
                <span className="voice-effects-heading">Delay</span>

                <label className="voice-setting-row">
                  <span>Amount &nbsp;<em>{Math.round(settings.delay * 100)}%</em></span>
                  <input
                    type="range"
                    min="0" max="1" step="0.01"
                    value={settings.delay}
                    onChange={e => onUpdate('delay', parseFloat(e.target.value))}
                  />
                </label>

                <label className="voice-setting-row">
                  <span>Time &nbsp;<em>{settings.delayTime.toFixed(2)}s</em></span>
                  <input
                    type="range"
                    min="0.05" max="1" step="0.01"
                    value={settings.delayTime}
                    onChange={e => onUpdate('delayTime', parseFloat(e.target.value))}
                  />
                </label>

                <label className="voice-setting-row">
                  <span>Feedback &nbsp;<em>{Math.round(settings.delayFeedback * 100)}%</em></span>
                  <input
                    type="range"
                    min="0" max="0.85" step="0.01"
                    value={settings.delayFeedback}
                    onChange={e => onUpdate('delayFeedback', parseFloat(e.target.value))}
                  />
                </label>

                <p className="voice-setting-note">
                  Feedback controls how many echoes repeat before fading.
                </p>
              </div>

          {!isBackendAvailable && (
            <p className="voice-unsupported">
              Backend unavailable — voice and effects require the server.
            </p>
          )}

          {!sttSupported && (
            <p className="voice-unsupported">
              Voice input not supported in this browser.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
