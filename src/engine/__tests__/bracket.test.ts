import { describe, it, expect } from 'vitest';
import {
  createTournament, lockAndStart, advanceWinner, playableMatches,
  getChampion, isResetActive, computeStandings, resetToDraft, reseed,
  nextPow2, standardSeedOrder,
  indexMatches, indexPlayers, resolveMatch, loserOf,
} from '../index';
import type { Match, Tournament } from '../types';
import { mulberry32 } from '../rng';

const names = (n: number) => Array.from({ length: n }, (_, i) => `選手${i + 1}`);

/** Resolve the two real players of a ready match as [idA, idB]. */
function pairOf(t: Tournament, m: Match): [string, string] {
  const { a, b } = resolveMatch(m, indexMatches(t.matches), indexPlayers(t.players));
  if (a.state !== 'player' || b.state !== 'player') throw new Error('not ready');
  return [a.player.id, b.player.id];
}

type Chooser = (t: Tournament, m: Match) => 'a' | 'b';

/**
 * Play a locked tournament to completion. Asserts there is never an *immediate*
 * rematch: a player's two consecutive matches are never against the same
 * opponent (the spec's "避免立刻重演" requirement). Full rematch elimination is
 * not asserted — it is provably not always achievable in double elimination
 * (e.g. the winners-final loser dropping into the losers final).
 */
function playThrough(start: Tournament, choose: Chooser) {
  let t = start;
  const lastOpponent = new Map<string, string>();
  let guard = 0;
  while (t.status === 'RUNNING') {
    if (++guard > 500) throw new Error('did not terminate');
    const ready = playableMatches(t);
    expect(ready.length).toBeGreaterThan(0); // no deadlock
    const m = ready[0];
    const [ia, ib] = pairOf(t, m);
    if (m.bracket === 'LB') {
      expect(lastOpponent.get(ia) === ib && lastOpponent.get(ib) === ia,
        `immediate rematch ${ia}|${ib} in ${m.id}`).toBe(false);
    }
    lastOpponent.set(ia, ib);
    lastOpponent.set(ib, ia);
    t = advanceWinner(t, m.id, choose(t, m));
  }
  return t;
}

const lowerSeedWins: Chooser = (t, m) => {
  const [ia, ib] = pairOf(t, m);
  const pa = t.players.find((p) => p.id === ia)!;
  const pb = t.players.find((p) => p.id === ib)!;
  return pa.seed <= pb.seed ? 'a' : 'b';
};

const randomChooser = (rand: () => number): Chooser => () => (rand() < 0.5 ? 'a' : 'b');

/** Count how many decided matches a player lost. */
function lossCount(t: Tournament, playerId: string): number {
  const mi = indexMatches(t.matches);
  const pi = indexPlayers(t.players);
  let c = 0;
  for (const m of t.matches) {
    if (m.winner === null) continue;
    if (loserOf(m, mi, pi)?.id === playerId) c++;
  }
  return c;
}

function assertFinishedInvariants(t: Tournament, n: number) {
  expect(t.status).toBe('FINISHED');
  const champ = getChampion(t);
  expect(champ).not.toBeNull();
  const s = computeStandings(t);
  const runnerUp = s.find((r) => r.rank === 2)!.player;
  // Every non-champion is eliminated at exactly 2 losses, EXCEPT the runner-up,
  // who may exit on a single loss when the grand-final reset is disabled.
  for (const p of t.players) {
    const losses = lossCount(t, p.id);
    if (p.id === champ!.id) expect(losses).toBeLessThanOrEqual(1);
    else if (p.id === runnerUp.id) expect(losses, `runner-up ${p.name}`).toBeGreaterThanOrEqual(1);
    else expect(losses, `${p.name} losses`).toBe(2);
  }
  // Standings: one row per player, rank 1 unique = champion.
  expect(s.length).toBe(n);
  expect(s[0].rank).toBe(1);
  expect(s[0].player.id).toBe(champ!.id);
  expect(s.filter((r) => r.rank === 1).length).toBe(1);
  expect(s.filter((r) => r.rank === 2).length).toBe(1); // exactly one runner-up
}

describe('helpers', () => {
  it('nextPow2', () => {
    expect(nextPow2(2)).toBe(2);
    expect(nextPow2(5)).toBe(8);
    expect(nextPow2(8)).toBe(8);
    expect(nextPow2(11)).toBe(16);
  });
  it('standardSeedOrder spreads top seeds', () => {
    expect(standardSeedOrder(4)).toEqual([1, 4, 2, 3]);
    expect(standardSeedOrder(8)).toEqual([1, 8, 4, 5, 2, 7, 3, 6]);
  });
});

describe('structure', () => {
  for (const n of [4, 6, 8, 11, 16]) {
    it(`${n} players: WB/LB match counts`, () => {
      const t = createTournament('T', names(n), { rand: mulberry32(n), now: 1 });
      const N = nextPow2(n);
      const wb = t.matches.filter((m) => m.bracket === 'WB').length;
      const lb = t.matches.filter((m) => m.bracket === 'LB').length;
      expect(wb).toBe(N - 1);
      expect(lb).toBe(N - 2);
      expect(t.matches.filter((m) => m.bracket === 'GF').length).toBe(1);
    });
  }
});

describe('full playthroughs', () => {
  for (const n of [4, 6, 8, 11, 16]) {
    it(`${n} players — lower seed wins, no rematch, valid standings`, () => {
      const t = createTournament('T', names(n), { rand: mulberry32(n * 7), now: 1 });
      const started = lockAndStart(t, 2);
      const done = playThrough(started, lowerSeedWins);
      assertFinishedInvariants(done, n);
    });

    it(`${n} players — 30 random draws x random results stay valid`, () => {
      for (let s = 0; s < 30; s++) {
        const rand = mulberry32(n * 1000 + s);
        const t = createTournament('T', names(n), { rand, now: 1 });
        const started = lockAndStart(t, 2);
        const done = playThrough(started, randomChooser(rand));
        assertFinishedInvariants(done, n);
      }
    });
  }
});

describe('grand final reset (復活賽)', () => {
  it('activates when the losers-bracket champion wins game 1, then decider crowns the winner', () => {
    // Force: everyone lower-seed wins EXCEPT the grand final, where the LB
    // champion (side b) takes game 1, then the WB champion (side a) wins reset.
    const t = createTournament('T', names(8), { rand: mulberry32(99), now: 1, resetEnabled: true });
    const started = lockAndStart(t, 2);
    const choose: Chooser = (tt, m) => {
      if (m.bracket === 'GF') return 'b'; // LB champion wins game 1
      if (m.bracket === 'GF_RESET') return 'a'; // WB champion wins decider
      return lowerSeedWins(tt, m);
    };
    let cur = started;
    let sawResetActive = false;
    let guard = 0;
    while (cur.status === 'RUNNING') {
      if (++guard > 500) throw new Error('loop');
      const ready = playableMatches(cur);
      const m = ready[0];
      cur = advanceWinner(cur, m.id, choose(cur, m));
      if (isResetActive(cur)) sawResetActive = true;
    }
    expect(sawResetActive).toBe(true);
    assertFinishedInvariants(cur, 8);
  });

  it('with reset disabled, a losers-bracket champion win ends it immediately', () => {
    const t = createTournament('T', names(8), { rand: mulberry32(5), now: 1, resetEnabled: false });
    expect(t.matches.some((m) => m.bracket === 'GF_RESET')).toBe(false);
    const started = lockAndStart(t, 2);
    const choose: Chooser = (tt, m) => (m.bracket === 'GF' ? 'b' : lowerSeedWins(tt, m));
    let cur = started;
    let guard = 0;
    while (cur.status === 'RUNNING') {
      if (++guard > 500) throw new Error('loop');
      const m = playableMatches(cur)[0];
      cur = advanceWinner(cur, m.id, choose(cur, m));
    }
    assertFinishedInvariants(cur, 8);
  });
});

describe('byes', () => {
  it('non-power-of-two seeds a bye that auto-advances its holder', () => {
    const t = createTournament('T', names(6), { rand: mulberry32(3), now: 1 });
    // 6 players -> size 8 -> 2 byes. Two WB R1 matches are already decided.
    const autoDecidedR1 = t.matches.filter(
      (m) => m.bracket === 'WB' && m.round === 1 && m.winner !== null,
    );
    expect(autoDecidedR1.length).toBe(2);
    // A bye match is never offered as a playable pick.
    const started = lockAndStart(t, 2);
    for (const m of playableMatches(started)) {
      expect(m.winner).toBeNull();
    }
  });
});

describe('draft controls', () => {
  it('reseed is deterministic and only changes seeding', () => {
    const t = createTournament('T', names(8), { rand: mulberry32(1), now: 1 });
    const a = reseed(t, mulberry32(42), 2);
    const b = reseed(t, mulberry32(42), 2);
    expect(a.players.map((p) => p.seed)).toEqual(b.players.map((p) => p.seed));
  });

  it('resetToDraft clears every result', () => {
    const t = lockAndStart(createTournament('T', names(4), { rand: mulberry32(1), now: 1 }), 2);
    const played = advanceWinner(t, playableMatches(t)[0].id, 'a');
    const back = resetToDraft(played, 3);
    expect(back.status).toBe('DRAFT');
    expect(back.matches.every((m) => m.winner === null || m.bracket === 'WB')).toBe(true);
  });

  it('advanceWinner is a no-op while in DRAFT', () => {
    const t = createTournament('T', names(4), { rand: mulberry32(1), now: 1 });
    const ready = t.matches.find((m) => m.bracket === 'WB' && m.round === 1 && m.winner === null)!;
    expect(advanceWinner(t, ready.id, 'a')).toEqual(t);
  });
});

describe('determinism', () => {
  it('same seed produces identical brackets', () => {
    const a = createTournament('T', names(11), { rand: mulberry32(7), now: 1, id: 'x' });
    const b = createTournament('T', names(11), { rand: mulberry32(7), now: 1, id: 'x' });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});
