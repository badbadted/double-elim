/**
 * Application store. Owns the current tournament, the caller's role, and sync
 * with the storage API. Admin mutations apply locally (snappy) then push
 * debounced; viewers pull via refresh(). All rules stay in the pure engine.
 */
import { create } from 'zustand';
import {
  type Tournament,
  createTournament, reseed, addPlayer, removePlayer, renamePlayer,
  setResetEnabled, lockAndStart, resetToDraft, advanceWinner, revertMatch,
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
  /** Admin-only: render the UI as a viewer would see it (no editing). */
  previewAsViewer: boolean;
  /** Bumped whenever the owned-tournament list changes, to re-render switchers. */
  listRev: number;

  init: () => Promise<void>;
  togglePreview: () => void;
  create: (name: string, names: string[]) => Promise<void>;
  open: (id: string) => Promise<void>;
  refresh: () => Promise<void>;
  /** Leave the current tournament and go to the start screen (keeps all owned). */
  newTournament: () => Promise<void>;
  /** Delete a tournament from this device (cloud copy stays reachable by link). */
  removeTournament: (id: string) => Promise<void>;
  shareUrl: () => string;

  reseed: () => void;
  addPlayer: (name: string) => void;
  removePlayer: (id: string) => void;
  renamePlayer: (id: string, name: string) => void;
  toggleReset: (enabled: boolean) => void;
  start: () => void;
  backToDraft: () => void;
  pickWinner: (matchId: string, side: 'a' | 'b') => void;
  revertMatch: (matchId: string) => void;
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
  previewAsViewer: false,
  listRev: 0,

  togglePreview: () => set((s) => ({ previewAsViewer: !s.previewAsViewer })),

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
    set((s) => ({ id, tournament, role: 'admin', rev: 0, sync: 'saving', previewAsViewer: false, listRev: s.listRev + 1 }));
    try {
      const { rev } = await remote.put(id, tournament, token);
      set({ rev, sync: 'idle' });
    } catch {
      set({ sync: 'offline' }); // still usable locally
    }
  },

  open: async (id) => {
    await flushPush(); // don't lose a pending edit of the tournament we're leaving
    const token = local.getToken(id);
    const role: Role = token ? 'admin' : 'viewer';
    set({ sync: 'loading', id, role, previewAsViewer: false });
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

  newTournament: async () => {
    await flushPush();
    setUrl(null);
    set((s) => ({ id: null, tournament: null, role: 'viewer', rev: 0, sync: 'idle', previewAsViewer: false, listRev: s.listRev + 1 }));
  },

  removeTournament: async (rid) => {
    if (pushTimer && get().id === rid) { clearTimeout(pushTimer); pushTimer = null; }
    local.clear(rid);
    if (get().id === rid) {
      const owned = local.listOwned();
      if (owned.length) {
        await get().open(owned[0].id);
        set((s) => ({ listRev: s.listRev + 1 }));
      } else {
        setUrl(null);
        set((s) => ({ id: null, tournament: null, role: 'viewer', rev: 0, sync: 'idle', previewAsViewer: false, listRev: s.listRev + 1 }));
      }
    } else {
      set((s) => ({ listRev: s.listRev + 1 }));
    }
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
  revertMatch: (matchId) => applyEdit(get, (t) => revertMatch(t, matchId)),
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

/** Immediately flush any pending debounced push (used before leaving/switching). */
async function flushPush() {
  if (!pushTimer) return;
  clearTimeout(pushTimer);
  pushTimer = null;
  const { id, tournament } = useStore.getState();
  if (!id || !tournament) return;
  const token = local.getToken(id);
  if (!token) return;
  try {
    const { rev } = await remote.put(id, tournament, token);
    useStore.setState({ rev, sync: 'idle' });
  } catch {
    useStore.setState({ sync: 'offline' });
  }
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
