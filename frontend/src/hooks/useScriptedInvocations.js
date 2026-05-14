import { useState, useEffect, useCallback } from 'react';

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

export function useScriptedInvocations(campaignId) {
  const [invocations, setInvocations] = useState([]);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    if (!campaignId) {
      setInvocations([]);
      return undefined;
    }

    apiFetch('GET', `/api/campaigns/${campaignId}/invocations`)
      .then(rows => { if (!cancelled) setInvocations(rows); })
      .catch(err => { if (!cancelled) setError(err.message); });

    return () => { cancelled = true; };
  }, [campaignId]);

  const create = useCallback(async (fields) => {
    if (!campaignId) throw new Error('No campaign loaded.');
    const row = await apiFetch('POST', `/api/campaigns/${campaignId}/invocations`, fields);
    setInvocations(prev => [row, ...prev]);
    return row;
  }, [campaignId]);

  const update = useCallback(async (id, fields) => {
    setInvocations(prev => prev.map(inv => inv.id === id ? { ...inv, ...fields } : inv));
    try {
      const row = await apiFetch('PATCH', `/api/invocations/${id}`, fields);
      setInvocations(prev => prev.map(inv => inv.id === id ? row : inv));
      return row;
    } catch (err) {
      setError(err.message);
      throw err;
    }
  }, []);

  const remove = useCallback(async (id) => {
    setInvocations(prev => prev.filter(inv => inv.id !== id));
    try {
      await apiFetch('DELETE', `/api/invocations/${id}`);
    } catch (err) {
      setError(err.message);
    }
  }, []);

  return { invocations, error, create, update, remove };
}
