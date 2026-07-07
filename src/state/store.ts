/**
 * Application store. Thin wrapper that maps user intents onto the pure engine
 * functions and persists the result. Keeping all the rules in the engine means
 * this layer stays trivial and swapping localStorage for Firestore later only
 * touches persistence.ts.
 */
import { create } from 'zustand';
import {
  type Tournament,
  createTournament, reseed, addPlayer, removePlayer, renamePlayer,
  setResetEnabled, lockAndStart, resetToDraft, advanceWinner,
} from '../engine';
import { persistence } from './persistence';

/** Browser-unique id for a new player. */
function newId(): string {
  const c = globalThis.crypto;
  return c?.randomUUID ? `p_${c.randomUUID()}` : `p_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
}

interface AppState {
  tournament: Tournament | null;
  /** Replace state and persist in one step. */
  apply: (next: Tournament | null) => void;

  create: (name: string, names: string[]) => void;
  discard: () => void;

  reseed: () => void;
  addPlayer: (name: string) => void;
  removePlayer: (id: string) => void;
  renamePlayer: (id: string, name: string) => void;
  toggleReset: (enabled: boolean) => void;

  start: () => void;
  backToDraft: () => void;
  pickWinner: (matchId: string, side: 'a' | 'b') => void;
}

export const useStore = create<AppState>((set, get) => ({
  tournament: persistence.load(),

  apply: (next) => {
    persistence.save(next);
    set({ tournament: next });
  },

  create: (name, names) => get().apply(createTournament(name, names)),
  discard: () => get().apply(null),

  reseed: () => withT(get, (t) => reseed(t)),
  addPlayer: (name) => withT(get, (t) => addPlayer(t, name, newId())),
  removePlayer: (id) => withT(get, (t) => removePlayer(t, id)),
  renamePlayer: (id, name) => withT(get, (t) => renamePlayer(t, id, name)),
  toggleReset: (enabled) => withT(get, (t) => setResetEnabled(t, enabled)),

  start: () => withT(get, (t) => lockAndStart(t)),
  backToDraft: () => withT(get, (t) => resetToDraft(t)),
  pickWinner: (matchId, side) => withT(get, (t) => advanceWinner(t, matchId, side)),
}));

/** Run an engine mutator against the current tournament and persist. */
function withT(get: () => AppState, fn: (t: Tournament) => Tournament) {
  const { tournament, apply } = get();
  if (!tournament) return;
  apply(fn(tournament));
}
