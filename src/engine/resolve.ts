/**
 * Lazy resolution of match slots against current results.
 *
 * A slot pointing at the winner/loser of an upstream match is resolved by
 * following the pointer. A pointer into a bye match resolves to 'bye', which is
 * how byes propagate through the losers bracket without any special-casing.
 */
import type { Match, Player, ResolvedSlot, SlotRef } from './types';

export type MatchIndex = Map<string, Match>;
export type PlayerIndex = Map<string, Player>;

export function indexMatches(matches: Match[]): MatchIndex {
  const idx: MatchIndex = new Map();
  for (const m of matches) idx.set(m.id, m);
  return idx;
}

export function indexPlayers(players: Player[]): PlayerIndex {
  const idx: PlayerIndex = new Map();
  for (const p of players) idx.set(p.id, p);
  return idx;
}

/** The name to show in the bracket: nickname if set, otherwise the real name. */
export function displayName(p: Player): string {
  const nick = p.nickname?.trim();
  return nick ? nick : p.name;
}

/** Resolve one slot ref to a concrete player, a bye, or 'tbd'. */
export function resolveSlot(ref: SlotRef, mi: MatchIndex, pi: PlayerIndex): ResolvedSlot {
  switch (ref.type) {
    case 'player': {
      const player = pi.get(ref.playerId);
      return player ? { state: 'player', player } : { state: 'tbd' };
    }
    case 'bye':
      return { state: 'bye' };
    case 'winner':
    case 'loser': {
      const src = mi.get(ref.matchId);
      if (!src || src.winner === null) return { state: 'tbd' };
      const wantWinner = ref.type === 'winner';
      const side = wantWinner ? src.winner : src.winner === 'a' ? 'b' : 'a';
      return resolveSlot(side === 'a' ? src.a : src.b, mi, pi);
    }
  }
}

/** Resolve both sides of a match. */
export function resolveMatch(
  match: Match, mi: MatchIndex, pi: PlayerIndex,
): { a: ResolvedSlot; b: ResolvedSlot } {
  return { a: resolveSlot(match.a, mi, pi), b: resolveSlot(match.b, mi, pi) };
}

/** The player who won this match, if decided and not a bye. */
export function winnerOf(match: Match, mi: MatchIndex, pi: PlayerIndex): Player | null {
  if (match.winner === null) return null;
  const r = resolveSlot(match.winner === 'a' ? match.a : match.b, mi, pi);
  return r.state === 'player' ? r.player : null;
}

/** The player who lost this match, if decided and not a bye. */
export function loserOf(match: Match, mi: MatchIndex, pi: PlayerIndex): Player | null {
  if (match.winner === null) return null;
  const r = resolveSlot(match.winner === 'a' ? match.b : match.a, mi, pi);
  return r.state === 'player' ? r.player : null;
}

export type MatchState = 'ready' | 'auto' | 'double-bye' | 'pending' | 'done';

/**
 * Classify a match by its resolved slots:
 *  - done: winner already set
 *  - ready: two real players, awaiting a user pick
 *  - auto: one real player + one bye -> should auto-advance
 *  - double-bye: both byes -> inert placeholder
 *  - pending: at least one slot not yet known
 */
export function classifyMatch(match: Match, mi: MatchIndex, pi: PlayerIndex): MatchState {
  if (match.winner !== null) return 'done';
  const { a, b } = resolveMatch(match, mi, pi);
  const aReal = a.state === 'player';
  const bReal = b.state === 'player';
  const aBye = a.state === 'bye';
  const bBye = b.state === 'bye';
  if (aReal && bReal) return 'ready';
  if ((aReal && bBye) || (bReal && aBye)) return 'auto';
  if (aBye && bBye) return 'double-bye';
  return 'pending';
}
