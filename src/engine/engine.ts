/**
 * Stateful (but immutable-by-return) operations over a Tournament.
 *
 * Every mutator returns a new Tournament; callers replace their reference.
 * This keeps the state layer (Zustand today, Firestore tomorrow) simple: it
 * only ever swaps in the object these functions hand back.
 */
import type { Match, Player, Tournament, TournamentStatus } from './types';
import { drawSeeds, generateBracket, nextPow2, GRAND_FINAL_ID, GRAND_FINAL_RESET_ID } from './bracket';
import { classifyMatch, indexMatches, indexPlayers, resolveSlot, winnerOf } from './resolve';
import type { RandomFn } from './rng';

let idCounter = 0;

export interface CreateOptions {
  id?: string;
  resetEnabled?: boolean;
  rand?: RandomFn;
  now?: number;
}

/** Build fresh player objects from names, with stable ids and random seeds. */
function makePlayers(names: string[], rand: RandomFn): Player[] {
  const base = names.map((name, i) => ({ id: `p${i + 1}`, name: name.trim(), seed: i + 1 }));
  return drawSeeds(base, rand);
}

function regenerate(t: Tournament): Tournament {
  const matches = generateBracket(t.players, t.bracketSize, t.wbRounds, t.resetEnabled);
  return settleByes({ ...t, matches });
}

/** Create a DRAFT tournament with an initial random draw. */
export function createTournament(name: string, names: string[], opts: CreateOptions = {}): Tournament {
  const rand = opts.rand ?? Math.random;
  const now = opts.now ?? Date.now();
  const players = makePlayers(names, rand);
  const bracketSize = nextPow2(players.length);
  const wbRounds = Math.max(1, Math.log2(bracketSize));
  const t: Tournament = {
    id: opts.id ?? `t${++idCounter}-${now}`,
    name: name.trim() || '未命名賽事',
    status: 'DRAFT',
    resetEnabled: opts.resetEnabled ?? true,
    players,
    matches: [],
    bracketSize,
    wbRounds,
    createdAt: now,
    updatedAt: now,
  };
  return regenerate(t);
}

/** Re-draw the random seeding. DRAFT only. */
export function reseed(t: Tournament, rand: RandomFn = Math.random, now = Date.now()): Tournament {
  if (t.status !== 'DRAFT') return t;
  const players = drawSeeds(t.players, rand);
  return regenerate({ ...t, players, updatedAt: now });
}

/** Replace the player list (add/remove/rename). DRAFT only; re-draws seeds. */
export function setPlayers(t: Tournament, names: string[], rand: RandomFn = Math.random, now = Date.now()): Tournament {
  if (t.status !== 'DRAFT') return t;
  const players = makePlayers(names, rand);
  const bracketSize = nextPow2(Math.max(2, players.length));
  const wbRounds = Math.max(1, Math.log2(bracketSize));
  return regenerate({ ...t, players, bracketSize, wbRounds, updatedAt: now });
}

/** Append one player. DRAFT only; keeps existing seeding, new player last. */
export function addPlayer(t: Tournament, name: string, id: string, now = Date.now()): Tournament {
  if (t.status !== 'DRAFT') return t;
  const players = [...t.players, { id, name: name.trim() || `選手${t.players.length + 1}`, seed: t.players.length + 1 }];
  const bracketSize = nextPow2(Math.max(2, players.length));
  const wbRounds = Math.max(1, Math.log2(bracketSize));
  return regenerate({ ...t, players, bracketSize, wbRounds, updatedAt: now });
}

/** Remove one player. DRAFT only; re-numbers remaining seeds by current order. */
export function removePlayer(t: Tournament, id: string, now = Date.now()): Tournament {
  if (t.status !== 'DRAFT') return t;
  const players = t.players
    .filter((p) => p.id !== id)
    .map((p, i) => ({ ...p, seed: i + 1 }));
  const bracketSize = nextPow2(Math.max(2, players.length));
  const wbRounds = Math.max(1, Math.log2(bracketSize));
  return regenerate({ ...t, players, bracketSize, wbRounds, updatedAt: now });
}

/** Rename one player. DRAFT only; does not touch seeding or the bracket. */
export function renamePlayer(t: Tournament, id: string, name: string, now = Date.now()): Tournament {
  if (t.status !== 'DRAFT') return t;
  const players = t.players.map((p) => (p.id === id ? { ...p, name } : p));
  return { ...t, players, updatedAt: now };
}

/** Set one player's nickname (shown in the bracket). DRAFT only. */
export function setNickname(t: Tournament, id: string, nickname: string, now = Date.now()): Tournament {
  if (t.status !== 'DRAFT') return t;
  const players = t.players.map((p) => (p.id === id ? { ...p, nickname } : p));
  return { ...t, players, updatedAt: now };
}

/** Toggle the grand-final reset (復活賽). DRAFT only. */
export function setResetEnabled(t: Tournament, enabled: boolean, now = Date.now()): Tournament {
  if (t.status !== 'DRAFT' || t.resetEnabled === enabled) return t;
  return regenerate({ ...t, resetEnabled: enabled, updatedAt: now });
}

/** Lock the draw and begin play. DRAFT -> RUNNING. */
export function lockAndStart(t: Tournament, now = Date.now()): Tournament {
  if (t.status !== 'DRAFT') return t;
  if (t.players.length < 2) return t;
  return { ...t, status: 'RUNNING', updatedAt: now };
}

/** Discard all results and return to DRAFT (keeps the player list). */
export function resetToDraft(t: Tournament, now = Date.now()): Tournament {
  const cleared = t.matches.map((m) => ({ ...m, winner: null as Match['winner'] }));
  return regenerate({ ...t, status: 'DRAFT', matches: cleared, updatedAt: now });
}

/** Is the grand-final reset match live (LB champion forced a decider)? */
export function isResetActive(t: Tournament): boolean {
  if (!t.resetEnabled) return false;
  const gf = t.matches.find((m) => m.id === GRAND_FINAL_ID);
  return !!gf && gf.winner === 'b';
}

/** The champion, or null if the tournament is not finished. */
export function getChampion(t: Tournament): Player | null {
  const mi = indexMatches(t.matches);
  const pi = indexPlayers(t.players);
  const gf = mi.get(GRAND_FINAL_ID);
  if (!gf || gf.winner === null) return null;
  if (gf.winner === 'a') return winnerOf(gf, mi, pi); // WB champion closed it out
  // LB champion won game 1
  if (!t.resetEnabled) return winnerOf(gf, mi, pi);
  const reset = mi.get(GRAND_FINAL_RESET_ID);
  if (!reset || reset.winner === null) return null; // decider still to play
  return winnerOf(reset, mi, pi);
}

/** Matches awaiting a user pick right now, in play order. */
export function playableMatches(t: Tournament): Match[] {
  if (t.status !== 'RUNNING') return [];
  const mi = indexMatches(t.matches);
  const pi = indexPlayers(t.players);
  const resetLive = isResetActive(t);
  return t.matches.filter((m) => {
    if (m.bracket === 'GF_RESET' && !resetLive) return false;
    return classifyMatch(m, mi, pi) === 'ready';
  });
}

/**
 * Auto-decide every bye / double-bye match until the graph is stable.
 * Idempotent; safe to call after any mutation.
 */
export function settleByes(t: Tournament): Tournament {
  const matches = t.matches.map((m) => ({ ...m }));
  const pi = indexPlayers(t.players);
  let changed = true;
  while (changed) {
    changed = false;
    const mi = indexMatches(matches);
    for (const m of matches) {
      if (m.winner !== null) continue;
      if (m.bracket === 'GF_RESET') continue; // never auto-resolves
      const state = classifyMatch(m, mi, pi);
      if (state === 'auto') {
        // Winner is whichever side resolves to a real player.
        m.winner = resolveSlot(m.a, mi, pi).state === 'player' ? 'a' : 'b';
        changed = true;
      } else if (state === 'double-bye') {
        m.winner = 'a';
        changed = true;
      }
    }
  }
  return { ...t, matches };
}

/** Match ids whose result depends (transitively) on `matchId`, excluding it. */
function downstreamOf(t: Tournament, matchId: string): Set<string> {
  const dependents = new Map<string, string[]>();
  for (const m of t.matches) {
    for (const slot of [m.a, m.b]) {
      if (slot.type === 'winner' || slot.type === 'loser') {
        const arr = dependents.get(slot.matchId) ?? [];
        arr.push(m.id);
        dependents.set(slot.matchId, arr);
      }
    }
  }
  const affected = new Set<string>();
  const stack = [matchId];
  while (stack.length) {
    const cur = stack.pop()!;
    for (const dep of dependents.get(cur) ?? []) {
      if (!affected.has(dep)) { affected.add(dep); stack.push(dep); }
    }
  }
  return affected;
}

/**
 * How many *already-decided* matches would also be cleared by reverting
 * `matchId` (the downstream cascade), so the UI can warn before wiping results.
 */
export function revertImpact(t: Tournament, matchId: string): number {
  const byId = indexMatches(t.matches);
  let n = 0;
  for (const id of downstreamOf(t, matchId)) {
    if (byId.get(id)?.winner != null) n++;
  }
  return n;
}

/**
 * Undo a match result. Clears the match and every downstream match that
 * consumed its winner/loser (their participants changed, so their results are
 * no longer valid), re-settles byes, and recomputes status. RUNNING/FINISHED.
 */
export function revertMatch(t: Tournament, matchId: string, now = Date.now()): Tournament {
  if (t.status !== 'RUNNING' && t.status !== 'FINISHED') return t;
  const target = t.matches.find((m) => m.id === matchId);
  if (!target || target.winner === null) return t;
  const clear = downstreamOf(t, matchId);
  clear.add(matchId);
  const matches = t.matches.map((m) => (clear.has(m.id) ? { ...m, winner: null as Match['winner'] } : m));
  let next = settleByes({ ...t, matches, updatedAt: now });
  const status: TournamentStatus = getChampion(next) ? 'FINISHED' : 'RUNNING';
  if (status !== next.status) next = { ...next, status };
  return next;
}

/** Record the winner of a ready match, then settle byes and update status. */
export function advanceWinner(t: Tournament, matchId: string, side: 'a' | 'b', now = Date.now()): Tournament {
  if (t.status !== 'RUNNING') return t;
  const mi = indexMatches(t.matches);
  const pi = indexPlayers(t.players);
  const target = mi.get(matchId);
  if (!target) return t;
  if (target.bracket === 'GF_RESET' && !isResetActive(t)) return t;
  if (classifyMatch(target, mi, pi) !== 'ready') return t;

  const matches = t.matches.map((m) => (m.id === matchId ? { ...m, winner: side } : m));
  let next = settleByes({ ...t, matches, updatedAt: now });
  const status: TournamentStatus = getChampion(next) ? 'FINISHED' : 'RUNNING';
  if (status !== next.status) next = { ...next, status };
  return next;
}
