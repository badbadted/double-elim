/**
 * Bracket generation for double elimination.
 *
 * Design: every match is created up front as a node in a graph. A match's two
 * slots are `SlotRef`s that either hold a concrete player/bye (winners-bracket
 * round 1) or point at the winner/loser of an upstream match. Results are then
 * resolved lazily (see resolve.ts), which keeps `advanceWinner` a one-line
 * mutation and makes the whole thing trivially serializable.
 *
 * Loser routing uses the standard "reversed cross" drop pattern so a player
 * dropping from the winners bracket does not immediately re-face someone they
 * already played. The unit tests assert zero rematches outside the grand final.
 */
import type { Match, Player, SlotRef } from './types';
import { shuffle, type RandomFn } from './rng';

/** Smallest power of two >= n (min 2). */
export function nextPow2(n: number): number {
  let p = 2;
  while (p < n) p *= 2;
  return p;
}

/** Standard single-elimination seed order for a bracket of size N (N = 2^k). */
export function standardSeedOrder(size: number): number[] {
  let seeds = [1, 2];
  const rounds = Math.log2(size);
  for (let r = 1; r < rounds; r++) {
    const sum = seeds.length * 2 + 1;
    const next: number[] = [];
    for (const s of seeds) {
      next.push(s);
      next.push(sum - s);
    }
    seeds = next;
  }
  return size === 1 ? [1] : seeds;
}

const wb = (round: number, order: number) => `WB-R${round}-M${order}`;
const lb = (round: number, order: number) => `LB-R${round}-M${order}`;
const GF_ID = 'GF-R1-M0';
const GFR_ID = 'GFR-R1-M0';

function wbLabel(round: number, total: number): string {
  if (round === total) return '勝部決賽';
  if (round === total - 1) return '勝部準決賽';
  return `勝部第${round}輪`;
}

function lbLabel(round: number, total: number): string {
  if (round === total) return '敗部決賽';
  return `敗部第${round}輪`;
}

/**
 * Build the complete match graph for `players` (whose seeds are already set).
 * `resetEnabled` controls whether the grand-final reset match is included.
 */
export function generateBracket(
  players: Player[],
  bracketSize: number,
  wbRounds: number,
  resetEnabled: boolean,
): Match[] {
  const N = bracketSize;
  const R = wbRounds;
  const n = players.length;
  const bySeed = new Map<number, Player>();
  for (const p of players) bySeed.set(p.seed, p);
  const matches: Match[] = [];

  // ---- Winners bracket ----
  const order = standardSeedOrder(N);
  // WB round 1: place seeds; seeds > n become byes.
  const r1 = N / 2;
  for (let m = 0; m < r1; m++) {
    const seedA = order[2 * m];
    const seedB = order[2 * m + 1];
    const slot = (seed: number): SlotRef =>
      seed <= n ? { type: 'player', playerId: bySeed.get(seed)!.id } : { type: 'bye' };
    matches.push({
      id: wb(1, m), bracket: 'WB', round: 1, order: m,
      a: slot(seedA), b: slot(seedB), winner: null, label: wbLabel(1, R),
    });
  }
  // WB rounds 2..R: fed by winners of the previous round.
  for (let r = 2; r <= R; r++) {
    const count = N / 2 ** r;
    for (let m = 0; m < count; m++) {
      matches.push({
        id: wb(r, m), bracket: 'WB', round: r, order: m,
        a: { type: 'winner', matchId: wb(r - 1, 2 * m) },
        b: { type: 'winner', matchId: wb(r - 1, 2 * m + 1) },
        winner: null, label: wbLabel(r, R),
      });
    }
  }

  // ---- Losers bracket ----
  const lbRounds = 2 * (R - 1);
  for (let L = 1; L <= lbRounds; L++) {
    const odd = L % 2 === 1;
    const j = odd ? (L + 1) / 2 : L / 2; // "stage" index, 1-based
    const count = N / 2 ** (j + 1);
    for (let m = 0; m < count; m++) {
      let a: SlotRef;
      let b: SlotRef;
      if (odd && j === 1) {
        // First minor round: pair adjacent WB R1 losers so their origins align
        // with the winners-bracket grouping fed into the next (major) round.
        a = { type: 'loser', matchId: wb(1, 2 * m) };
        b = { type: 'loser', matchId: wb(1, 2 * m + 1) };
      } else if (odd) {
        // Later minor round: pair winners of the previous major round.
        a = { type: 'winner', matchId: lb(L - 1, 2 * m) };
        b = { type: 'winner', matchId: lb(L - 1, 2 * m + 1) };
      } else {
        // Major round: minor-round survivor vs a winners-bracket dropout.
        // The dropout ordering alternates reversed / identity per stage so a
        // survivor never re-faces someone from their own winners sub-tree.
        const wbRound = j + 1;
        const reverse = j % 2 === 1;
        const dropIdx = reverse ? count - 1 - m : m;
        a = { type: 'winner', matchId: lb(L - 1, m) };
        b = { type: 'loser', matchId: wb(wbRound, dropIdx) };
      }
      matches.push({
        id: lb(L, m), bracket: 'LB', round: L, order: m,
        a, b, winner: null, label: lbLabel(L, lbRounds),
      });
    }
  }

  // ---- Grand final (+ optional reset) ----
  const wbChampFrom: SlotRef = { type: 'winner', matchId: wb(R, 0) };
  const lbChampFrom: SlotRef =
    lbRounds >= 1
      ? { type: 'winner', matchId: lb(lbRounds, 0) }
      : { type: 'loser', matchId: wb(1, 0) }; // degenerate 2-player case
  matches.push({
    id: GF_ID, bracket: 'GF', round: 1, order: 0,
    a: wbChampFrom, b: lbChampFrom, winner: null, label: '冠軍戰',
  });
  if (resetEnabled) {
    matches.push({
      id: GFR_ID, bracket: 'GF_RESET', round: 1, order: 0,
      a: { type: 'loser', matchId: GF_ID },
      b: { type: 'winner', matchId: GF_ID },
      winner: null, label: '冠軍戰・復活賽',
    });
  }
  return matches;
}

export interface DrawOptions {
  resetEnabled?: boolean;
  rand?: RandomFn;
}

/** Assign random seeds to players (returns new Player[] with seed set). */
export function drawSeeds(names: Player[], rand: RandomFn = Math.random): Player[] {
  return shuffle(names, rand).map((p, i) => ({ ...p, seed: i + 1 }));
}

export const GRAND_FINAL_ID = GF_ID;
export const GRAND_FINAL_RESET_ID = GFR_ID;
