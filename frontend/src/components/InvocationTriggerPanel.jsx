import { useState } from 'react';

function buttonLabel(inv) {
  if (inv.title && inv.title.trim()) return inv.title.trim();
  const t = (inv.triggerPhrase || '').trim();
  return t.length > 40 ? `${t.slice(0, 37)}…` : t || 'Untitled';
}

/**
 * Compact, touch-friendly row of buttons to fire scripted/creative
 * invocations directly from the controller (phone/iPad). Hidden when no
 * enabled invocations exist, so it doesn't clutter the main screen.
 */
export default function InvocationTriggerPanel({ invocations = [], onTrigger, disabled }) {
  const [pendingId, setPendingId] = useState(null);

  const enabled = invocations.filter(i => i.isEnabled);
  if (enabled.length === 0) return null;

  async function handleClick(inv) {
    if (pendingId || disabled) return;
    setPendingId(inv.id);
    try {
      await onTrigger(inv);
    } finally {
      setPendingId(null);
    }
  }

  return (
    <section className="invocation-trigger-panel" aria-label="Scripted invocations">
      <h3 className="invocation-trigger-label">Invocations</h3>
      <div className="invocation-trigger-buttons">
        {enabled.map(inv => {
          const isPending = pendingId === inv.id;
          return (
            <button
              key={inv.id}
              type="button"
              className="btn btn-sm invocation-trigger-btn"
              disabled={disabled || !!pendingId}
              onClick={() => handleClick(inv)}
              aria-busy={isPending}
              title={inv.triggerPhrase}
            >
              {isPending ? 'Calling…' : buttonLabel(inv)}
            </button>
          );
        })}
      </div>
    </section>
  );
}
