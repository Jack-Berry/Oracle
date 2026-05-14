// D&D 5e currency conversion helpers.
//
// Base unit is gp. Conversions:
//   1 gp = 100 cp
//   1 gp = 10  sp
//   1 gp = 2   ep
//   1 pp = 10  gp

const CP_PER_GP = 100;
const SP_PER_GP = 10;
const EP_PER_GP = 2;
const PP_PER_GP = 0.1;

function round2(n) {
  return Math.round(n * 100) / 100;
}

// Format a number cleanly: drop trailing zeros, cap at 2 decimals.
function fmt(n) {
  if (!Number.isFinite(n)) return '0';
  const rounded = round2(n);
  if (Number.isInteger(rounded)) return String(rounded);
  return String(rounded).replace(/\.?0+$/, '');
}

// Given a price in gp, return its value in each denomination.
export function gpToAllDenominations(gpRaw) {
  const gp = Number(gpRaw);
  if (!Number.isFinite(gp) || gp < 0) {
    return { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 };
  }
  return {
    cp: Math.round(gp * CP_PER_GP),
    sp: round2(gp * SP_PER_GP),
    ep: round2(gp * EP_PER_GP),
    gp: round2(gp),
    pp: round2(gp * PP_PER_GP),
  };
}

// Choose a sensible primary denomination + value for display.
// Prefer gp for >= 1 gp, sp for 0.1–1, cp for less.
export function primaryDenomination(gp) {
  const v = Number(gp) || 0;
  if (v >= 1) return { value: round2(v), unit: 'gp' };
  if (v >= 0.1) return { value: round2(v * SP_PER_GP), unit: 'sp' };
  return { value: Math.round(v * CP_PER_GP), unit: 'cp' };
}

export function formatPrimary(gp) {
  const { value, unit } = primaryDenomination(gp);
  return `${fmt(value)} ${unit}`;
}

export { fmt as formatNumber };
