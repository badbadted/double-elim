/**
 * Persistence: talks to the /api storage and keeps a localStorage mirror.
 *
 * Role model: whoever holds the `editToken` for an id (stored locally at create
 * time) is the admin/writer; everyone else who opens the link is a read-only
 * viewer. The token never travels except in the admin's own PUT requests.
 *
 * Everything degrades gracefully: if /api is unreachable (e.g. `vite dev` with
 * no serverless runtime, or offline), the app keeps working from the local
 * cache as a single-device tool.
 */
import type { Tournament } from '../engine';

const cacheKey = (id: string) => `de:cache:${id}`;
const tokenKey = (id: string) => `de:token:${id}`;
const LAST_KEY = 'de:last';

/** Short url-safe id (10 chars) matching the API's id pattern. */
export function makeId(): string {
  const bytes = new Uint8Array(8);
  (globalThis.crypto ?? { getRandomValues: (a: Uint8Array) => a }).getRandomValues?.(bytes);
  const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let out = '';
  for (let i = 0; i < 10; i++) out += alphabet[bytes[i % bytes.length] % alphabet.length];
  return out;
}

/** Secret edit token (owner proof). */
export function makeToken(): string {
  const c = globalThis.crypto;
  if (c?.randomUUID) return c.randomUUID().replace(/-/g, '');
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}`;
}

export const local = {
  getToken: (id: string) => safeGet(tokenKey(id)),
  setToken: (id: string, token: string) => safeSet(tokenKey(id), token),
  getCache: (id: string): Tournament | null => {
    const raw = safeGet(cacheKey(id));
    try { return raw ? (JSON.parse(raw) as Tournament) : null; } catch { return null; }
  },
  setCache: (id: string, t: Tournament) => safeSet(cacheKey(id), JSON.stringify(t)),
  getLast: () => safeGet(LAST_KEY),
  setLast: (id: string) => safeSet(LAST_KEY, id),
  clear: (id: string) => { safeRemove(cacheKey(id)); safeRemove(tokenKey(id)); if (safeGet(LAST_KEY) === id) safeRemove(LAST_KEY); },
};

export interface RemoteDoc { data: Tournament; rev: number; updatedAt: number; }

export const remote = {
  /** Read a tournament. Returns null on 404; throws on network/other errors. */
  async get(id: string): Promise<RemoteDoc | null> {
    const res = await fetch(`/api/tournament/${id}`, { headers: { 'cache-control': 'no-cache' } });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`GET ${res.status}`);
    return (await res.json()) as RemoteDoc;
  },
  /** Write a tournament (owner only). Throws on 403/network/other errors. */
  async put(id: string, data: Tournament, editToken: string): Promise<{ rev: number; updatedAt: number }> {
    const res = await fetch(`/api/tournament/${id}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ data, editToken }),
    });
    if (!res.ok) throw new Error(`PUT ${res.status}`);
    return (await res.json()) as { rev: number; updatedAt: number };
  },
};

function safeGet(k: string): string | null {
  try { return localStorage.getItem(k); } catch { return null; }
}
function safeSet(k: string, v: string): void {
  try { localStorage.setItem(k, v); } catch { /* ignore */ }
}
function safeRemove(k: string): void {
  try { localStorage.removeItem(k); } catch { /* ignore */ }
}
