/**
 * Persistence adapter boundary.
 *
 * Phase 1 persists the whole tournament to localStorage on this machine.
 * Phase 2 (cross-device sync) swaps this single module for a Firestore-backed
 * adapter exposing the same load/save/subscribe shape — nothing else changes.
 */
import type { Tournament } from '../engine';

const KEY = 'double-elim:tournament';

export const persistence = {
  load(): Tournament | null {
    try {
      const raw = localStorage.getItem(KEY);
      return raw ? (JSON.parse(raw) as Tournament) : null;
    } catch {
      return null;
    }
  },
  save(t: Tournament | null): void {
    try {
      if (t) localStorage.setItem(KEY, JSON.stringify(t));
      else localStorage.removeItem(KEY);
    } catch {
      /* ignore quota / private-mode errors */
    }
  },
};
