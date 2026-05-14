const CAMPAIGN_KEY = 'oracle_campaign_v1';

/**
 * Collects all migratable data from localStorage.
 * Returns null if there's nothing worth migrating.
 */
export function collectMigrationData(sessionNames = []) {
  const raw = localStorage.getItem(CAMPAIGN_KEY);
  if (!raw) return null;

  let campaign;
  try { campaign = JSON.parse(raw); } catch { return null; }

  const { campaignContext = '', partyMembers = [] } = campaign;

  // Strip dataUrl and extractedCharacter data from files for transport
  const cleanMembers = partyMembers.map(m => ({
    ...m,
    files: (m.files || []).filter(f => f.extractedText || f.extractedCharacter),
  }));

  const sessions = sessionNames.map(name => {
    const hiddenContext = localStorage.getItem(`oracle_hidden_ctx_${name}`) || '';
    let consultations = [];
    try {
      const raw2 = localStorage.getItem(`oracle_history_${name}`);
      consultations = raw2 ? JSON.parse(raw2) : [];
    } catch { consultations = []; }
    return { name, hiddenContext, consultations };
  });

  const hasContent =
    campaignContext.trim() ||
    cleanMembers.length > 0 ||
    sessions.some(s => s.hiddenContext || s.consultations.length > 0);

  return hasContent ? { campaignContext, partyMembers: cleanMembers, sessions } : null;
}

/** Wipe old localStorage keys after a successful migration. */
export function clearMigratedData(sessionNames = []) {
  localStorage.removeItem(CAMPAIGN_KEY);
  for (const name of sessionNames) {
    localStorage.removeItem(`oracle_hidden_ctx_${name}`);
    localStorage.removeItem(`oracle_history_${name}`);
  }
}
