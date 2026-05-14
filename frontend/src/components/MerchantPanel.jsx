import { useEffect, useMemo, useRef, useState } from 'react';
import { useMerchantPricing } from '../hooks/useMerchantPricing.js';
import { useEconomyScale } from '../hooks/useEconomyScale.js';
import { gpToAllDenominations, formatNumber, formatPrimary } from '../utils/currency.js';
import MerchantItemModal from './MerchantItemModal.jsx';

const MAX_DESC = 500;
const INITIAL_VISIBLE = 3;

// One denomination cell inside the small price grid on each result card.
// Non-integer values (e.g. 0.5 gp after a 1/50x scale on a resale) render as
// "--" so the grid never shows fractional denominations. The underlying
// fractional value still flows through formatPrimary in the scale hint.
function DenomCell({ unit, value }) {
  const isWhole = Number.isFinite(value) && Number.isInteger(value);
  return (
    <div className="merchant-denom-cell">
      <span className="merchant-denom-unit">{unit}</span>
      <span
        className={`merchant-denom-value${isWhole ? '' : ' merchant-denom-value--empty'}`}
      >
        {isWhole ? formatNumber(value) : '--'}
      </span>
    </div>
  );
}

// Renders the compact "base 50 gp → 1 gp at 1/50x" hint underneath a price
// label. Hidden entirely at 1x to keep the card clean.
function ScaleHint({ baseGp, scale, scaleLabel }) {
  if (!Number.isFinite(baseGp) || baseGp <= 0) return null;
  if (scale === 1) return null;
  return (
    <span className="merchant-scale-hint-inline">
      base {formatPrimary(baseGp)} → {formatPrimary(baseGp * scale)} at {scaleLabel}
    </span>
  );
}

// Stacked card for a single existing-item match.
function ExistingCard({ row, scale, scaleLabel, onSelect }) {
  const purchase = gpToAllDenominations(row.purchaseGp * scale);
  const sell = gpToAllDenominations(row.sellGp * scale);

  return (
    <article className="merchant-card">
      <header className="merchant-card-head">
        <div className="merchant-card-title">
          <button
            type="button"
            className="merchant-item-name merchant-item-name--btn"
            onClick={() => onSelect?.(row)}
            aria-label={`Show details for ${row.name}`}
          >
            {row.name}
          </button>
          {row.category && <span className="merchant-cat-pill">{row.category}</span>}
        </div>
        {Number.isFinite(row.confidence) && row.confidence > 0 && (
          <span className="merchant-confidence">
            {row.confidence}%{row.matchReason ? ` — ${row.matchReason}` : ''}
          </span>
        )}
      </header>

      <div className="merchant-price-block">
        <div className="merchant-price-label">
          Purchase
          <ScaleHint baseGp={row.purchaseGp} scale={scale} scaleLabel={scaleLabel} />
        </div>
        <div className="merchant-denom-grid">
          <DenomCell unit="cp" value={purchase.cp} />
          <DenomCell unit="sp" value={purchase.sp} />
          <DenomCell unit="ep" value={purchase.ep} />
          <DenomCell unit="gp" value={purchase.gp} />
          <DenomCell unit="pp" value={purchase.pp} />
        </div>
      </div>

      <div className="merchant-price-block">
        <div className="merchant-price-label">
          Resale
          <ScaleHint baseGp={row.sellGp} scale={scale} scaleLabel={scaleLabel} />
          {row.resaleNote && (
            <span className="merchant-resale-note">{row.resaleNote}</span>
          )}
        </div>
        <div className="merchant-denom-grid">
          <DenomCell unit="cp" value={sell.cp} />
          <DenomCell unit="sp" value={sell.sp} />
          <DenomCell unit="ep" value={sell.ep} />
          <DenomCell unit="gp" value={sell.gp} />
          <DenomCell unit="pp" value={sell.pp} />
        </div>
      </div>
    </article>
  );
}

// Stacked card for a DM-created item estimate.
function CustomCard({ row, scale, scaleLabel, onSelect }) {
  const purchase = gpToAllDenominations(row.purchaseGp * scale);
  const sell = gpToAllDenominations(row.sellGp * scale);

  return (
    <article className="merchant-card">
      <header className="merchant-card-head">
        <div className="merchant-card-title">
          <button
            type="button"
            className="merchant-item-name merchant-item-name--btn"
            onClick={() => onSelect?.(row)}
            aria-label={`Show details for ${row.name}`}
          >
            {row.name}
          </button>
          {row.rarityOrCategory && (
            <span className="merchant-cat-pill">{row.rarityOrCategory}</span>
          )}
        </div>
        <span className="merchant-confidence">DM-created estimate</span>
      </header>

      <div className="merchant-price-block">
        <div className="merchant-price-label">
          Purchase
          <ScaleHint baseGp={row.purchaseGp} scale={scale} scaleLabel={scaleLabel} />
        </div>
        <div className="merchant-denom-grid">
          <DenomCell unit="cp" value={purchase.cp} />
          <DenomCell unit="sp" value={purchase.sp} />
          <DenomCell unit="ep" value={purchase.ep} />
          <DenomCell unit="gp" value={purchase.gp} />
          <DenomCell unit="pp" value={purchase.pp} />
        </div>
      </div>

      <div className="merchant-price-block">
        <div className="merchant-price-label">
          Resale
          <ScaleHint baseGp={row.sellGp} scale={scale} scaleLabel={scaleLabel} />
          <span className="merchant-resale-note">typical resale estimate</span>
        </div>
        <div className="merchant-denom-grid">
          <DenomCell unit="cp" value={sell.cp} />
          <DenomCell unit="sp" value={sell.sp} />
          <DenomCell unit="ep" value={sell.ep} />
          <DenomCell unit="gp" value={sell.gp} />
          <DenomCell unit="pp" value={sell.pp} />
        </div>
      </div>

    </article>
  );
}

// Segmented two-option select. Single source of truth for mode.
function ModeSelect({ value, onChange }) {
  return (
    <div className="merchant-segment" role="tablist" aria-label="Item type">
      <button
        type="button"
        role="tab"
        aria-selected={value === 'existing'}
        className={`merchant-segment-btn${value === 'existing' ? ' is-active' : ''}`}
        onClick={() => onChange('existing')}
      >
        Existing D&amp;D item
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={value === 'custom'}
        className={`merchant-segment-btn${value === 'custom' ? ' is-active' : ''}`}
        onClick={() => onChange('custom')}
      >
        DM-created item
      </button>
    </div>
  );
}

export default function MerchantPanel({ open, onClose, anchor }) {
  const [description, setDescription] = useState('');
  const [mode, setMode] = useState('existing'); // 'existing' | 'custom'
  const [expanded, setExpanded] = useState(false);
  const [modalRow, setModalRow] = useState(null);
  const { loading, error, results, priceExisting, priceCustom, reset } = useMerchantPricing();
  const { scale, scaleLabel, setScaleLabel, options: scaleOptions, isDefault: scaleIsDefault } = useEconomyScale();

  const panelRef = useRef(null);

  // Close on outside click / Escape
  useEffect(() => {
    if (!open) return;

    function onKey(e) {
      if (e.key === 'Escape') onClose();
    }
    function onClick(e) {
      if (!panelRef.current) return;
      if (panelRef.current.contains(e.target)) return;
      if (anchor && anchor.contains && anchor.contains(e.target)) return;
      onClose();
    }
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onClick);
    document.addEventListener('touchstart', onClick);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('touchstart', onClick);
    };
  }, [open, onClose, anchor]);

  // Collapse expansion whenever a new result set arrives.
  useEffect(() => {
    setExpanded(false);
    setModalRow(null);
  }, [results]);

  // Close any open detail modal when the panel itself closes.
  useEffect(() => {
    if (!open) setModalRow(null);
  }, [open]);

  const existingRows = results?.mode === 'existing' ? results.rows : null;
  const visibleRows = useMemo(() => {
    if (!existingRows) return [];
    if (expanded) return existingRows;
    return existingRows.slice(0, INITIAL_VISIBLE);
  }, [existingRows, expanded]);

  // Dev visibility into the Show more state — total rows, visible rows,
  // expansion. Helps confirm the button is rendering only when there is
  // actually something hidden.
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    if (!existingRows) return;
    // eslint-disable-next-line no-console
    console.log(
      `[merchant] showMore totalRows=${existingRows.length} visibleRows=${visibleRows.length} expanded=${expanded}`
    );
  }, [existingRows, visibleRows, expanded]);

  if (!open) return null;

  function handleGo(e) {
    e?.preventDefault?.();
    const trimmed = description.trim();
    if (!trimmed) return;
    if (mode === 'existing') {
      priceExisting(trimmed);
    } else {
      priceCustom(trimmed);
    }
  }

  function handleClear() {
    setDescription('');
    setExpanded(false);
    reset();
  }

  const hiddenCount = existingRows ? Math.max(0, existingRows.length - INITIAL_VISIBLE) : 0;

  return (
    <div className="merchant-panel" ref={panelRef} role="dialog" aria-label="Merchant Mode">
      <div className="merchant-panel-header">
        <span className="merchant-panel-title">Merchant</span>
        <button
          type="button"
          className="merchant-close"
          onClick={onClose}
          aria-label="Close Merchant Mode"
        >
          ✕
        </button>
      </div>

      <form className="merchant-form" onSubmit={handleGo}>
        <label className="merchant-field-label" htmlFor="merchant-desc">Item description</label>
        <textarea
          id="merchant-desc"
          className="merchant-textarea"
          value={description}
          onChange={(e) => setDescription(e.target.value.slice(0, MAX_DESC))}
          placeholder="e.g. health potion, longsword, glowing dagger that whispers..."
          rows={3}
          maxLength={MAX_DESC}
        />
        <div className="merchant-char-count">{description.length}/{MAX_DESC}</div>

        <div className="merchant-mode-row">
          <span className="merchant-field-label merchant-mode-label">Mode</span>
          <ModeSelect value={mode} onChange={setMode} />
        </div>

        <div className="merchant-scale-row">
          <label className="merchant-field-label merchant-mode-label" htmlFor="merchant-scale">
            Economy Scale
          </label>
          <select
            id="merchant-scale"
            className="merchant-scale-select"
            value={scaleLabel}
            onChange={(e) => setScaleLabel(e.target.value)}
          >
            {scaleOptions.map(o => (
              <option key={o.label} value={o.label}>{o.label}</option>
            ))}
          </select>
          <span className="merchant-scale-help">
            Adjusts all prices to fit your campaign economy.
            {!scaleIsDefault && (
              <>
                {' '}
                <strong>Prices at {scaleLabel}.</strong>
              </>
            )}
          </span>
        </div>

        <div className="merchant-actions">
          <button
            type="submit"
            className="btn btn-primary merchant-go"
            disabled={loading || !description.trim()}
          >
            {loading ? 'Pricing…' : 'Go'}
          </button>
          {(results || description) && (
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={handleClear}
              disabled={loading}
            >
              Clear
            </button>
          )}
        </div>
      </form>

      {error && <div className="merchant-error">{error}</div>}

      {loading && (
        <div className="merchant-status">Looking up pricing…</div>
      )}

      {results && results.mode === 'existing' && (
        <div className="merchant-results">
          {results.source === 'ai-fallback' && existingRows.length > 0 && (
            <div
              className="merchant-source-pill"
              title="Local lookup confidence was low — these matches came from the pricing assistant."
            >
              AI-assisted match
            </div>
          )}

          {existingRows.length === 0 ? (
            <div className="merchant-empty">
              No close match found. Try the DM-created item option for an estimate.
            </div>
          ) : (
            <>
              <div className="merchant-card-list">
                {visibleRows.map((row, i) => (
                  <ExistingCard
                    key={`${row.name}-${i}`}
                    row={row}
                    scale={scale}
                    scaleLabel={scaleLabel}
                    onSelect={setModalRow}
                  />
                ))}
              </div>

              {hiddenCount > 0 && !expanded && (
                <button
                  type="button"
                  className="merchant-show-more"
                  onClick={() => setExpanded(true)}
                >
                  Show {hiddenCount} more {hiddenCount === 1 ? 'match' : 'matches'}
                </button>
              )}

              {hiddenCount > 0 && expanded && (
                <button
                  type="button"
                  className="merchant-show-more"
                  onClick={() => setExpanded(false)}
                >
                  Show less
                </button>
              )}
            </>
          )}
        </div>
      )}

      {results && results.mode === 'custom' && (
        <div className="merchant-results">
          <div className="merchant-card-list">
            <CustomCard
              row={results.row}
              scale={scale}
              scaleLabel={scaleLabel}
              onSelect={setModalRow}
            />
          </div>
        </div>
      )}

      {modalRow && (
        <MerchantItemModal
          row={modalRow}
          scale={scale}
          scaleLabel={scaleLabel}
          onClose={() => setModalRow(null)}
        />
      )}
    </div>
  );
}
