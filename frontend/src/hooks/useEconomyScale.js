import { useCallback, useState } from 'react';

// DM-facing multiplier applied to every Merchant Mode price at render time.
// Stored as a label (e.g. "1/50x") for stable round-tripping through
// localStorage and to sidestep float comparison drift.

const STORAGE_KEY = 'merchant_economy_scale';

export const ECONOMY_SCALE_OPTIONS = [
  { label: '1/50x', value: 1 / 50 },
  { label: '1/25x', value: 1 / 25 },
  { label: '1/10x', value: 1 / 10 },
  { label: '1/5x',  value: 1 / 5 },
  { label: '1/2x',  value: 1 / 2 },
  { label: '1x',    value: 1 },
  { label: '2x',    value: 2 },
  { label: '5x',    value: 5 },
  { label: '10x',   value: 10 },
  { label: '25x',   value: 25 },
  { label: '50x',   value: 50 },
];

const DEFAULT_LABEL = '1x';

function findOptionByLabel(label) {
  return ECONOMY_SCALE_OPTIONS.find(o => o.label === label) || null;
}

function loadLabel() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_LABEL;
    return findOptionByLabel(raw) ? raw : DEFAULT_LABEL;
  } catch {
    return DEFAULT_LABEL;
  }
}

export function useEconomyScale() {
  const [scaleLabel, setScaleLabelState] = useState(loadLabel);

  const setScaleLabel = useCallback((label) => {
    if (!findOptionByLabel(label)) return;
    setScaleLabelState(label);
    try { localStorage.setItem(STORAGE_KEY, label); } catch {}
  }, []);

  const scale = findOptionByLabel(scaleLabel)?.value ?? 1;

  return {
    scale,
    scaleLabel,
    setScaleLabel,
    options: ECONOMY_SCALE_OPTIONS,
    isDefault: scaleLabel === DEFAULT_LABEL,
  };
}
