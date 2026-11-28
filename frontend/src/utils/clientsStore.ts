import { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import API_URL from '../constants/api';
import { authedFetch, onSessionExpired } from './adminAuth';

/**
 * One shared client list for every admin screen.
 *  - requests are de-duplicated (one in flight, short cache)
 *  - a failed refresh NEVER clears the list that is already on screen
 *  - handles both response shapes: [..] and { clients: [..] }
 */
export interface ClientsResult {
  ok: boolean;
  status: number;
  clients: any[] | null;
  error?: string;
}

const TTL_MS = 20000;
let cache: { at: number; clients: any[] } | null = null;
let inflight: Promise<ClientsResult> | null = null;
let generation = 0; // bumped on invalidate so a response that started before a change is not cached
onSessionExpired(() => { cache = null; inflight = null; generation++; });
const subscribers = new Set<(clients: any[]) => void>();

export function invalidateClients() {
  cache = null;
  generation++;
}

export function getCachedClients(): any[] | null {
  return cache?.clients ?? null;
}

export async function loadClients(force = false): Promise<ClientsResult> {
  if (!force && cache && Date.now() - cache.at < TTL_MS) {
    return { ok: true, status: 200, clients: cache.clients };
  }
  if (inflight && !force) return inflight;
  const myGen = generation;
  const holder: { p?: Promise<ClientsResult> } = {};
  const run = (async (): Promise<ClientsResult> => {
    try {
      const res = await authedFetch(`${API_URL}/api/clients?limit=1000`);
      if (!res.ok) return { ok: false, status: res.status, clients: null, error: `HTTP ${res.status}` };
      const data = await res.json();
      const list = Array.isArray(data) ? data : data?.clients;
      if (!Array.isArray(list)) return { ok: false, status: res.status, clients: null, error: 'Unexpected response' };
      const clients = list.filter((c: any) => c && c.id);
      if (myGen === generation) {
        cache = { at: Date.now(), clients };
      }
      subscribers.forEach((s) => s(clients));
      return { ok: true, status: res.status, clients };
    } catch (e: any) {
      return { ok: false, status: 0, clients: null, error: e?.message || 'Network error' };
    } finally {
      if (inflight === holder.p) inflight = null;
    }
  })();
  holder.p = run;
  inflight = run;
  return run;
}

export function useClients() {
  const [clients, setClients] = useState<any[]>(cache?.clients ?? []);
  const [loaded, setLoaded] = useState(!!cache);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    const sub = (c: any[]) => mounted.current && setClients(c);
    subscribers.add(sub);
    return () => {
      mounted.current = false;
      subscribers.delete(sub);
    };
  }, []);

  const refresh = useCallback(async (force = true) => {
    setRefreshing(true);
    const r = await loadClients(force);
    if (!mounted.current) return r;
    if (r.ok && r.clients) {
      setClients(r.clients);
      setError(null);
    } else {
      // keep whatever is already shown
      setError(r.error || 'Failed to load');
    }
    setLoaded(true);
    setRefreshing(false);
    return r;
  }, []);

  useFocusEffect(
    useCallback(() => {
      refresh(false);
    }, [refresh]),
  );

  return { clients, loaded, refreshing, error, refresh };
}

// ─── Small shared helpers on client records ───────────────────────────────
export const clientOutstanding = (c: any): number => {
  const num = (x: any) => (x === null || x === undefined || x === '' ? null : Number.isFinite(Number(x)) ? Number(x) : null);
  const v = num(c?.outstanding_balance);
  if (v !== null) return v;
  return num(c?.total_amount_due) ?? num(c?.loan_amount) ?? 0;
};

export const clientDaysOverdue = (c: any): number => Number(c?.days_overdue || 0) || 0;
