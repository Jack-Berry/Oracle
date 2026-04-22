import { useState } from 'react';

export default function HiddenContextPanel({ value, onChange, onReset }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="context-panel">
      <button
        type="button"
        className="context-toggle"
        onClick={() => setOpen(v => !v)}
        aria-expanded={open}
      >
        <span>Hidden Session Context</span>
        <span className={`chevron${open ? ' open' : ''}`} aria-hidden="true">▼</span>
      </button>

      {open && (
        <div className="context-body">
          <p className="context-hint">
            Private notes the Oracle will consider — not visible to players. Party details, campaign secrets, current location, etc.
          </p>
          <textarea
            value={value}
            onChange={e => onChange(e.target.value)}
            placeholder="The party is level 5, in the Underdark. They don't know the innkeeper is a shapeshifter…"
            rows={4}
            maxLength={2000}
            aria-label="Hidden session context"
          />
          {value && (
            <div className="context-actions">
              <button
                type="button"
                className="btn btn-ghost btn-sm btn-danger"
                onClick={onReset}
              >
                Reset Hidden Context
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
