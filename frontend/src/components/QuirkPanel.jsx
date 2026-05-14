import { useState } from 'react';

const MAX = 500;

const INTENSITY_OPTIONS = [
  { value: 0, label: '0 — Off' },
  { value: 1, label: '1 — Rare' },
  { value: 2, label: '2 — Occasional' },
  { value: 3, label: '3 — Frequent' },
  { value: 4, label: '4 — Chaotic' },
];

const STYLE_OPTIONS = [
  { value: 0, label: 'Subtle' },
  { value: 1, label: 'Playful' },
  { value: 2, label: 'Chaotic' },
];

const PERSONALITY_OPTIONS = [
  { value: 0, label: 'Ominous' },
  { value: 1, label: 'Mischievous' },
  { value: 2, label: 'Unhinged' },
];

export default function QuirkPanel({
  text,
  intensity,
  style,
  personality,
  onTextChange,
  onIntensityChange,
  onStyleChange,
  onPersonalityChange,
}) {
  const [open, setOpen] = useState(false);

  const safeIntensity =
    Number.isInteger(intensity) && intensity >= 0 && intensity <= 4 ? intensity : 0;
  const safeStyle =
    Number.isInteger(style) && style >= 0 && style <= 2 ? style : 0;
  const safePersonality =
    Number.isInteger(personality) && personality >= 0 && personality <= 2 ? personality : 0;

  return (
    <div className="context-panel">
      <button
        type="button"
        className="context-toggle"
        onClick={() => setOpen(v => !v)}
        aria-expanded={open}
      >
        <span>Oracle Personality &amp; Quirk <span className="context-scope-pill">DM only</span></span>
        <span className={`chevron${open ? ' open' : ''}`} aria-hidden="true">▼</span>
      </button>

      {open && (
        <div className="context-body">
          <div className="drawer-toggle-row" style={{ alignItems: 'flex-start' }}>
            <span>
              Oracle Personality
              <span
                className="drawer-toggle-hint"
                style={{ display: 'block', fontWeight: 'normal', opacity: 0.75 }}
              >
                Controls the Oracle's overall voice, separate from how often its quirk appears.
              </span>
            </span>
            <div
              role="radiogroup"
              aria-label="Oracle personality"
              className="quirk-style-segmented"
              style={{ display: 'inline-flex', gap: '0.25rem', flexWrap: 'wrap' }}
            >
              {PERSONALITY_OPTIONS.map(opt => {
                const selected = safePersonality === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    className={`btn btn-sm ${selected ? '' : 'btn-ghost'}`}
                    onClick={() => onPersonalityChange(opt.value)}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>

          <hr style={{ margin: '0.75rem 0', opacity: 0.3 }} />

          <p className="context-hint">
            A hidden personality quirk that occasionally flavours the Oracle's responses.
            Players never see this. Keep it short and weird. Higher intensity means it
            shows up more often.
          </p>

          <textarea
            value={text}
            onChange={e => onTextChange(e.target.value)}
            placeholder="The Oracle is obsessed with birds. The Oracle distrusts doors. The Oracle believes all problems are caused by goats."
            rows={3}
            maxLength={MAX}
            aria-label="Oracle quirk text"
          />
          <div className="context-char-count">{(text || '').length}/{MAX}</div>

          <label className="drawer-toggle-row" style={{ marginTop: '0.5rem' }}>
            <span>Intensity</span>
            <select
              value={safeIntensity}
              onChange={e => onIntensityChange(parseInt(e.target.value, 10))}
              aria-label="Oracle quirk intensity"
            >
              {INTENSITY_OPTIONS.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </label>

          <div className="drawer-toggle-row" style={{ marginTop: '0.5rem', alignItems: 'flex-start' }}>
            <span>
              Quirk Style
              <span
                className="drawer-toggle-hint"
                style={{ display: 'block', fontWeight: 'normal', opacity: 0.75 }}
              >
                How boldly the Oracle expresses its quirk when it appears.
              </span>
            </span>
            <div
              role="radiogroup"
              aria-label="Oracle quirk style"
              className="quirk-style-segmented"
              style={{ display: 'inline-flex', gap: '0.25rem', flexWrap: 'wrap' }}
            >
              {STYLE_OPTIONS.map(opt => {
                const selected = safeStyle === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    className={`btn btn-sm ${selected ? '' : 'btn-ghost'}`}
                    onClick={() => onStyleChange(opt.value)}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
