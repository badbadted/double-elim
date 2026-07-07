/**
 * Application store. Owns the current tournament, the caller's role, and sync
 * with the storage API. Admin mutations apply locally (snappy) then push
 * debounced; viewers pull via refresh(). All rules stay in the pure engine.
 */
import { create } from 'zustand';
import {
  type Tournament,
  createTournament, reseed, addPlayer, removePlayer, renamePlayer,
  setResetEnabled, lockAndStart, resetToDraft, advanceWinner,
} from '../engine';
import { local, remote, makeId, makeToken } from './persistence';

export type Role = 'admin' | 'viewer';
export type SyncState = 'idle' | 'saving' | 'error' | 'offline' | 'loading' | 'notfound';

interface AppState {
  id: string | null;
  tournament: Tournament | null;
  role: Role;
  rev: number;
  sync: SyncState;

  init: () => Promise<void>;
  create: (name: string, names: string[]) => Promise<void>;
  open: (id: string) => Promise<void>;
  refresh: () => Promise<void>;
  discard: () => void;
  shareUrl: () => string;

  reseed: () => void;
  addPlayer: (name: string) => void;
  removePlayer: (id: string) => void;
  renamePlayer: (id: string, name: string) => void;
  toggleReset: (enabled: boolean) => void;
  start: () => void;
  backToDraft: () => void;
  pickWinner: (matchId: string, side: 'a' | 'b') => void;
}

let pushTimer: ReturnType<typeof setTimeout> | null = null;

function setUrl(id: string | null) {
  const url = id ? `${location.pathname}?t=${id}` : location.pathname;
  history.replaceState(null, '', url);
}

export const useStore = create<AppState>((set, get) => ({
  id: null,
  tournament: null,
  role: 'viewer',
  rev: 0,
  sync: 'idle',

  init: async () => {
    const params = new URLSearchParams(location.search);
    const id = params.get('t') ?? params.get('view') ?? local.getLast();
    if (id) await get().open(id);
  },

  create: async (name, names) => {
    const id = makeId();
    const token = makeToken();
    local.setToken(id, token);
    local.setLast(id);
    const tournament = createTournament(name, names);
    local.setCache(id, tournament);
    setUrl(id);
    set({ id, tournament, role: 'admin', rev: 0, sync: 'saving' });
    try {
      const { rev } = await remote.put(id, tournament, token);
      set({ rev, sync: 'idle' });
    } catch {
      set({ sync: 'offline' }); // still usable locally
    }
  },

  open: async (id) => {
    const token = local.getToken(id);
    const role: Role = token ? 'admin' : 'viewer';
    set({ sync: 'loading', id, role });
    setUrl(id);
    local.setLast(id);
    try {
      const doc = await remote.get(id);
      if (doc) {
        local.setCache(id, doc.data);
        set({ tournament: doc.data, rev: doc.rev, sync: 'idle' });
        return;
      }
      // Not on the server.
      const cached = local.getCache(id);
      if (cached) set({ tournament: cached, rev: 0, sync: 'offline' });
      else set({ tournament: null, sync: 'notfound' });
    } catch {
      const cached = local.getCache(id);
      if (cached) set({ tournament: cached, rev: 0, sync: 'offline' });
      else set({ tournament: null, sync: 'error' });
    }
  },

  refresh: async () => {
    const { id, rev } = get();
    if (!id) return;
    try {
      const doc = await remote.get(id);
      if (doc && doc.rev > rev) {
        local.setCache(id, doc.data);
        set({ tournament: doc.data, rev: doc.rev });
      }
    } catch { /* transient; keep showing last good state */ }
  },

  discard: () => {
    const { id } = get();
    if (id) local.clear(id);
    if (pushTimer) { clearTimeout(pushTimer); pushTimer = null; }
    setUrl(null);
    set({ id: null, tournament: null, role: 'viewer', rev: 0, sync: 'idle' });
  },

  shareUrl: () => {
    const { id } = get();
    return `${location.origin}${location.pathname}${id ? `?t=${id}` : ''}`;
  },

  reseed: () => applyEdit(get, (t) => reseed(t)),
  addPlayer: (name) => applyEdit(get, (t) => addPlayer(t, name, `p_${makeId()}`)),
  removePlayer: (pid) => applyEdit(get, (t) => removePlayer(t, pid)),
  renamePlayer: (pid, name) => applyEdit(get, (t) => renamePlayer(t, pid, name)),
  toggleReset: (enabled) => applyEdit(get, (t) => setResetEnabled(t, enabled)),
  start: () => applyEdit(get, (t) => lockAndStart(t)),
  backToDraft: () => applyEdit(get, (t) => resetToDraft(t)),
  pickWinner: (matchId, side) => applyEdit(get, (t) => advanceWinner(t, matchId, side)),
}));

/** Apply an engine mutation locally (admin only), cache it, and schedule a push. */
function applyEdit(get: () => AppState, fn: (t: Tournament) => Tournament) {
  const state = get();
  if (!state.tournament || !state.id || state.role !== 'admin') return;
  const next = fn(state.tournament);
  if (next === state.tournament) return;
  local.setCache(state.id, next);
  useStore.setState({ tournament: next });
  schedulePush();
}

/** Debounced push of the current tournament to the server. */
function schedulePush() {
  if (pushTimer) clearTimeout(pushTimer);
  pushTimer = setTimeout(async () => {
    pushTimer = null;
    const { id, tournament } = useStore.getState();
    if (!id || !tournament) return;
    const token = local.getToken(id);
    if (!token) return;
    useStore.setState({ sync: 'saving' });
    try {
      const { rev } = await remote.put(id, tournament, token);
      useStore.setState({ rev, sync: 'idle' });
    } catch {
      useStore.setState({ sync: 'offline' });
    }
  }, 500);
}
