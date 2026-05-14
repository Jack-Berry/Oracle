import { useState } from 'react';

const MAX = 4000;

export default function CampaignPanel({ value, onChange }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="context-panel">
      <button
        type="button"
        className="context-toggle"
        onClick={() => setOpen(v => !v)}
        aria-expanded={open}
      >
        <span>Persistent Campaign Context</span>
        <span className={`chevron${open ? ' open' : ''}`} aria-hidden="true">▼</span>
      </button>

      {open && (
        <div className="context-body">
          <p className="context-hint">
            World facts, recurring NPCs, long-term secrets, house rules, ongoing plot threads.
            Always shared with the Oracle across all sessions.
          </p>
          <textarea
            value={value}
            onChange={e => onChange(e.target.value)}
            placeholder="The world of Aethermoor sits on the edge of a planar rift. The Crimson Hand cult secretly controls the city guard. House rule: flanking grants advantage..."
            rows={5}
            maxLength={MAX}
            aria-label="Persistent campaign context"
          />
          <div className="context-char-count">{value.length}/{MAX}</div>
        </div>
      )}
    </div>
  );
}
