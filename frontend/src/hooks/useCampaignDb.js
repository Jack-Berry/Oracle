import { useState, useEffect, useRef, useCallback } from 'react';
import { processFile } from './useCampaignData.js';
import {
  collectMigrationData,
  clearMigratedData,
} from '../utils/migration.js';

// ── API helpers ──────────────────────────────────────────────────────────────

async function apiFetch(method, path, body) {
  const res = await fetch(path, {
    method,
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : {},
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || `HTTP ${res.status}`);
  }
  return res.json();
}

// Diagnostic fields produced by the PDF mapper (raw and normalized field
// key arrays). Useful in dev console logs, not useful in the DB — strip
// before persisting so character_json stays a clean structured record.
function stripDebugKeys(character) {
  if (!character || typeof character !== 'object') return character;
  const { _allKeys, _normalizedKeys, ...rest } = character;
  return rest;
}

// ── Hook ─────────────────────────────────────────────────────────────────────

export function useCampaignDb({ sessionName, displayName }) {
  const [campaignId, setCampaignId]   = useState(null);
  const [sessionId, setSessionId]     = useState(null);
  const [campaignContext, setCampaignContextState] = useState('');
  const [partyMembers, setPartyMembers] = useState([]);
  const [hiddenContext, setHiddenContextState]     = useState('');
  const [consultations, setConsultations]          = useState([]);
  const [oracleQuirkText, setOracleQuirkTextState] = useState('');
  const [oracleQuirkIntensity, setOracleQuirkIntensityState] = useState(0);
  const [oracleQuirkStyle, setOracleQuirkStyleState] = useState(0);
  const [oraclePersonalityStyle, setOraclePersonalityStyleState] = useState(0);

  const [isLoading, setIsLoading]     = useState(true);
  const [campaignError, setCampaignError] = useState(null);

  // Migration state
  const [hasMigratable, setHasMigratable]   = useState(false);
  const [isMigrating, setIsMigrating]       = useState(false);
  const [migrationError, setMigrationError] = useState(null);
  const [migrationDone, setMigrationDone]   = useState(false);

  // Debounce timers
  const ctxTimer   = useRef(null);
  const hideTimer  = useRef(null);
  const quirkTimer = useRef(null);

  // ── Boot: ensure campaign + session exist ──────────────────────────────────

  useEffect(() => {
    let cancelled = false;

    async function boot() {
      setIsLoading(true);
      setCampaignError(null);

      try {
        // Shared LAN mode: every device boots the same backend default
        // campaign so all sessions converge without per-browser state.
        const camp = await apiFetch('GET', '/api/campaigns/default');
        if (cancelled) return;

        const cid = camp.id;
        setCampaignId(cid);

        if (import.meta.env.DEV) {
          console.log(`[campaign] loaded shared default id=${cid}`);
        }

        setCampaignContextState(camp.campaignContext || '');
        setPartyMembers(camp.partyMembers || []);
        setOracleQuirkTextState(camp.oracleQuirkText || '');
        setOracleQuirkIntensityState(
          Number.isInteger(camp.oracleQuirkIntensity) ? camp.oracleQuirkIntensity : 0
        );
        setOracleQuirkStyleState(
          Number.isInteger(camp.oracleQuirkStyle) && camp.oracleQuirkStyle >= 0 && camp.oracleQuirkStyle <= 2
            ? camp.oracleQuirkStyle
            : 0
        );
        setOraclePersonalityStyleState(
          Number.isInteger(camp.oraclePersonalityStyle) && camp.oraclePersonalityStyle >= 0 && camp.oraclePersonalityStyle <= 2
            ? camp.oraclePersonalityStyle
            : 0
        );

        // Upsert session
        const sess = await apiFetch('POST', `/api/campaigns/${cid}/sessions/upsert`, { name: sessionName });
        if (cancelled) return;

        if (import.meta.env.DEV) {
          console.log(`[session] upserted name="${sessionName}" id=${sess.id}`);
        }

        setSessionId(sess.id);
        setHiddenContextState(sess.hiddenContext || '');

        // Load consultations
        const history = await apiFetch('GET', `/api/sessions/${sess.id}/consultations`);
        if (cancelled) return;
        setConsultations(history);

        // Check for migratable localStorage data
        const migratable = collectMigrationData([sessionName]);
        if (migratable) setHasMigratable(true);
      } catch (err) {
        if (!cancelled) setCampaignError(err.message);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    boot();
    return () => { cancelled = true; };
  }, [sessionName, displayName]);

  // ── Campaign context ───────────────────────────────────────────────────────

  function setCampaignContext(text) {
    setCampaignContextState(text);
    clearTimeout(ctxTimer.current);
    ctxTimer.current = setTimeout(() => {
      if (campaignId) {
        apiFetch('PATCH', `/api/campaigns/${campaignId}`, { campaignContext: text })
          .catch(err => console.error('campaign context save:', err.message));
      }
    }, 800);
  }

  // ── Oracle quirk ───────────────────────────────────────────────────────────

  function setOracleQuirkText(text) {
    const safe = String(text || '').slice(0, 500);
    setOracleQuirkTextState(safe);
    clearTimeout(quirkTimer.current);
    quirkTimer.current = setTimeout(() => {
      if (campaignId) {
        apiFetch('PATCH', `/api/campaigns/${campaignId}`, { oracleQuirkText: safe })
          .catch(err => console.error('quirk text save:', err.message));
      }
    }, 800);
  }

  function setOracleQuirkIntensity(value) {
    const n = parseInt(value, 10);
    const safe = Number.isInteger(n) && n >= 0 && n <= 4 ? n : 0;
    setOracleQuirkIntensityState(safe);
    if (campaignId) {
      apiFetch('PATCH', `/api/campaigns/${campaignId}`, { oracleQuirkIntensity: safe })
        .catch(err => console.error('quirk intensity save:', err.message));
    }
  }

  function setOracleQuirkStyle(value) {
    const n = parseInt(value, 10);
    const safe = Number.isInteger(n) && n >= 0 && n <= 2 ? n : 0;
    setOracleQuirkStyleState(safe);
    if (campaignId) {
      apiFetch('PATCH', `/api/campaigns/${campaignId}`, { oracleQuirkStyle: safe })
        .catch(err => console.error('quirk style save:', err.message));
    }
  }

  function setOraclePersonalityStyle(value) {
    const n = parseInt(value, 10);
    const safe = Number.isInteger(n) && n >= 0 && n <= 2 ? n : 0;
    setOraclePersonalityStyleState(safe);
    if (campaignId) {
      apiFetch('PATCH', `/api/campaigns/${campaignId}`, { oraclePersonalityStyle: safe })
        .catch(err => console.error('personality style save:', err.message));
    }
  }

  // ── Hidden context ─────────────────────────────────────────────────────────

  function setHiddenContext(text) {
    setHiddenContextState(text);
    clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => {
      if (sessionId) {
        apiFetch('PATCH', `/api/sessions/${sessionId}/hidden-context`, { hiddenContext: text })
          .catch(err => console.error('hidden context save:', err.message));
      }
    }, 800);
  }

  function resetHiddenContext() {
    setHiddenContext('');
  }

  // ── Party members ──────────────────────────────────────────────────────────

  async function addPartyMember(fields) {
    const optimisticId = `tmp-${Date.now()}`;
    const optimistic = { ...fields, id: optimisticId, files: [] };
    setPartyMembers(prev => [...prev, optimistic]);

    try {
      const { id } = await apiFetch('POST', `/api/campaigns/${campaignId}/members`, fields);
      setPartyMembers(prev => prev.map(m => m.id === optimisticId ? { ...m, id } : m));
      return id;
    } catch (err) {
      setPartyMembers(prev => prev.filter(m => m.id !== optimisticId));
      throw err;
    }
  }

  async function updatePartyMember(id, fields) {
    setPartyMembers(prev => prev.map(m => m.id === id ? { ...m, ...fields } : m));
    await apiFetch('PATCH', `/api/members/${id}`, fields)
      .catch(err => console.error('updatePartyMember:', err.message));
  }

  async function deletePartyMember(id) {
    setPartyMembers(prev => prev.filter(m => m.id !== id));
    await apiFetch('DELETE', `/api/members/${id}`)
      .catch(err => console.error('deletePartyMember:', err.message));
  }

  // ── File attachments ───────────────────────────────────────────────────────

  async function addFileToMember(memberId, fileRecord) {
    // fileRecord is produced by processFile() — has extractedText/extractedCharacter
    // Optimistic: add with local ID (no dataUrl/extractedCharacter in DB copy)
    const localRecord = { ...fileRecord };
    setPartyMembers(prev =>
      prev.map(m => m.id === memberId ? { ...m, files: [...(m.files || []), localRecord] } : m)
    );

    // Skip DB write if nothing worth storing
    if (!fileRecord.extractedText && !fileRecord.extractedCharacter) return;

    try {
      const { id: dbId } = await apiFetch('POST', `/api/members/${memberId}/files`, {
        fileName:           fileRecord.name,
        fileType:           fileRecord.type,
        extractedText:      fileRecord.extractedText || null,
        extractedCharacter: stripDebugKeys(fileRecord.extractedCharacter) || null,
      });
      // Replace the local id with the DB id so deletes work correctly
      setPartyMembers(prev =>
        prev.map(m => {
          if (m.id !== memberId) return m;
          return {
            ...m,
            files: (m.files || []).map(f => f.id === fileRecord.id ? { ...f, id: dbId } : f),
          };
        })
      );
    } catch (err) {
      console.error('addFileToMember DB write:', err.message);
    }
  }

  async function removeFileFromMember(memberId, fileId) {
    setPartyMembers(prev =>
      prev.map(m =>
        m.id === memberId ? { ...m, files: (m.files || []).filter(f => f.id !== fileId) } : m
      )
    );
    // Only attempt DB delete for real (non-tmp) IDs
    if (!String(fileId).startsWith('tmp-')) {
      await apiFetch('DELETE', `/api/files/${fileId}`)
        .catch(err => console.error('removeFileFromMember:', err.message));
    }
  }

  // ── Consultations ──────────────────────────────────────────────────────────

  const addConsultation = useCallback(async (entry) => {
    setConsultations(prev => [entry, ...prev]);
    if (!sessionId) return;
    await apiFetch('POST', `/api/sessions/${sessionId}/consultations`, {
      question:  entry.question,
      response:  entry.response,
      toneMode:  entry.toneMode,
      timestamp: entry.timestamp,
    }).catch(err => console.error('addConsultation:', err.message));
  }, [sessionId]);

  const clearConsultations = useCallback(async () => {
    setConsultations([]);
    if (!sessionId) return;
    await apiFetch('DELETE', `/api/sessions/${sessionId}/consultations`)
      .catch(err => console.error('clearConsultations:', err.message));
  }, [sessionId]);

  // ── Migration ──────────────────────────────────────────────────────────────

  async function runMigration() {
    setIsMigrating(true);
    setMigrationError(null);

    try {
      const data = collectMigrationData([sessionName]);
      if (!data) { setMigrationDone(true); return; }

      // Merge into existing campaign rather than creating a new one
      // Update campaign context if the DB one is empty
      if (!campaignContext.trim() && data.campaignContext.trim()) {
        await apiFetch('PATCH', `/api/campaigns/${campaignId}`, {
          campaignContext: data.campaignContext,
        });
        setCampaignContextState(data.campaignContext);
      }

      // Import party members
      for (const m of data.partyMembers) {
        const { id: newMemberId } = await apiFetch('POST', `/api/campaigns/${campaignId}/members`, m);
        for (const f of (m.files || [])) {
          if (!f.extractedText && !f.extractedCharacter) continue;
          await apiFetch('POST', `/api/members/${newMemberId}/files`, {
            fileName:           f.name,
            fileType:           f.type || '',
            extractedText:      f.extractedText || null,
            extractedCharacter: stripDebugKeys(f.extractedCharacter) || null,
          });
        }
      }

      // Import sessions (hidden context + consultations)
      for (const s of data.sessions) {
        let sid = sessionId;
        if (s.name !== sessionName) {
          const sess = await apiFetch('POST', `/api/campaigns/${campaignId}/sessions/upsert`, { name: s.name });
          sid = sess.id;
        }
        if (s.hiddenContext && sid) {
          await apiFetch('PATCH', `/api/sessions/${sid}/hidden-context`, { hiddenContext: s.hiddenContext });
          if (s.name === sessionName) setHiddenContextState(s.hiddenContext);
        }
        for (const c of (s.consultations || []).slice().reverse()) {
          await apiFetch('POST', `/api/sessions/${sid}/consultations`, c);
        }
      }

      clearMigratedData([sessionName]);
      // Reload fresh data
      const [camp, history] = await Promise.all([
        apiFetch('GET', `/api/campaigns/${campaignId}`),
        apiFetch('GET', `/api/sessions/${sessionId}/consultations`),
      ]);
      setPartyMembers(camp.partyMembers || []);
      setConsultations(history);
      setHasMigratable(false);
      setMigrationDone(true);
    } catch (err) {
      setMigrationError(err.message);
    } finally {
      setIsMigrating(false);
    }
  }

  return {
    // Campaign data
    campaignContext,
    setCampaignContext,
    partyMembers,
    addPartyMember,
    updatePartyMember,
    deletePartyMember,
    addFileToMember,
    removeFileFromMember,

    // Oracle quirk
    oracleQuirkText,
    setOracleQuirkText,
    oracleQuirkIntensity,
    setOracleQuirkIntensity,
    oracleQuirkStyle,
    setOracleQuirkStyle,
    oraclePersonalityStyle,
    setOraclePersonalityStyle,

    // Session data
    hiddenContext,
    setHiddenContext,
    resetHiddenContext,

    // Consultation history
    consultations,
    addConsultation,
    clearConsultations,

    // Meta
    isLoading,
    campaignError,
    sessionId,
    campaignId,

    // Migration
    hasMigratable,
    runMigration,
    isMigrating,
    migrationError,
    migrationDone,
  };
}

// Re-export processFile so importers don't have to change their import path
export { processFile };
