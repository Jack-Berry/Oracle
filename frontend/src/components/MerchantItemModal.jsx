import { useEffect, useRef } from 'react';
import { formatPrimary } from '../utils/currency.js';

// Renders a centered modal with item details. Rendered as a child of the
// Merchant panel so the panel's outside-click handler does not see clicks
// on this modal as "outside the panel" — the modal-vs-panel close logic
// stays independent.

function basisLabel(basis) {
  switch (basis) {
    case 'official': return 'Official 5e pricing';
    case 'estimated': return 'DM estimate — not canonical';
    case 'campaign-estimate': return 'Campaign-specific estimate';
    case 'ai-estimated': return 'AI-assisted estimate';
    default: return basis || 'unknown';
  }
}

export default function MerchantItemModal({ row, scale, scaleLabel, onClose }) {
  const boxRef = useRef(null);

  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    }
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [onClose]);

  if (!row) return null;

  const purchaseBase = Number(row.purchaseGp) || 0;
  const sellBase = Number(row.sellGp) || 0;
  const purchaseAdj = purchaseBase * scale;
  const sellAdj = sellBase * scale;

  const description = row.description
    || row.reasoning
    || 'No description available for this item.';

  const aliases = Array.isArray(row.aliases) ? row.aliases.filter(Boolean) : [];

  function handleBackdropMouseDown(e) {
    if (boxRef.current && boxRef.current.contains(e.target)) return;
    e.stopPropagation();
    onClose();
  }

  return (
    <div
      className="merchant-modal-backdrop"
      onMouseDown={handleBackdropMouseDown}
      role="presentation"
    >
      <div
        ref={boxRef}
        className="merchant-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="merchant-modal-title"
      >
        <div className="merchant-modal-head">
          <h3 id="merchant-modal-title" className="merchant-modal-title">{row.name}</h3>
          <button
            type="button"
            className="merchant-modal-close"
            onClick={onClose}
            aria-label="Close item details"
          >
            ✕
          </button>
        </div>

        <div className="merchant-modal-meta">
          {(row.category || row.rarityOrCategory) && (
            <span className="merchant-cat-pill">
              {row.category || row.rarityOrCategory}
            </span>
          )}
          {row.pricingBasis && (
            <span className={`merchant-basis-pill merchant-basis-${row.pricingBasis}`}>
              {basisLabel(row.pricingBasis)}
            </span>
          )}
        </div>

        <div className="merchant-modal-prices">
          <div className="merchant-modal-price-row">
            <span className="merchant-modal-price-label">Purchase</span>
            <span className="merchant-modal-price-value">
              {formatPrimary(purchaseBase)}
              {scale !== 1 && (
                <span className="merchant-modal-adjusted">
                  {' '}→ {formatPrimary(purchaseAdj)} at {scaleLabel}
                </span>
              )}
            </span>
          </div>
          <div className="merchant-modal-price-row">
            <span className="merchant-modal-price-label">Resale</span>
            <span className="merchant-modal-price-value">
              {formatPrimary(sellBase)}
              {scale !== 1 && (
                <span className="merchant-modal-adjusted">
                  {' '}→ {formatPrimary(sellAdj)} at {scaleLabel}
                </span>
              )}
            </span>
          </div>
        </div>

        <div className="merchant-modal-section">
          <div className="merchant-modal-section-label">Description &amp; effect</div>
          <p className="merchant-modal-description">{description}</p>
        </div>

        {aliases.length > 0 && (
          <div className="merchant-modal-section">
            <div className="merchant-modal-section-label">Also known as</div>
            <div className="merchant-modal-aliases">
              {aliases.map((a, i) => (
                <span key={`${a}-${i}`} className="merchant-modal-alias">{a}</span>
              ))}
            </div>
          </div>
        )}

        {row.resaleNote && (
          <div className="merchant-modal-section merchant-modal-section--note">
            {row.resaleNote}
          </div>
        )}
      </div>
    </div>
  );
}
