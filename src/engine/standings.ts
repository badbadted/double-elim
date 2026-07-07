/**
 * Final standings derivation.
 *
 * A player's placement is decided by how deep they got before their 2nd loss:
 * later elimination = better rank. Players knocked out in the same losers-bracket
 * round share a rank (3rd, 4th, 5-6th, 7-8th, ...), matching standard
 * double-elimination placement.
 */
import type { Match, StandingRow, Tournament } from './types';
import { indexMatches, indexPlayers, loserOf } from './resolve';
import { getChampion } from './engine';

const RESET_SCORE = 1_000_000;
const GF_SCORE = 999_999;

/** Higher = eliminated later = better placement. */
function scoreOf(match: Match): number {
  switch (match.bracket) {
    case 'GF_RESET': return RESET_SCORE;
    case 'GF': return GF_SCORE;
    case 'LB': return match.round;
    default: return -1; // a winners-bracket loss never eliminates
  }
}

const TITLES: Record<number, string> = { 1: '冠軍', 2: '亞軍', 3: '季軍' };

/** Compute placement for every player. Meaningful once the tournament is FINISHED. */
export function computeStandings(t: Tournament): StandingRow[] {
  const mi = indexMatches(t.matches);
  const pi = indexPlayers(t.players);
  const champion = getChampion(t);

  // Collect each player's losing matches.
  const losses = new Map<string, Match[]>();
  for (const p of t.players) losses.set(p.id, []);
  for (const m of t.matches) {
    if (m.winner === null) continue;
    const l = loserOf(m, mi, pi);
    if (l) losses.get(l.id)!.push(m);
  }

  const ranked = t.players.map((player) => {
    const lost = losses.get(player.id)!;
    const isChamp = champion?.id === player.id;
    const score = isChamp
      ? Number.POSITIVE_INFINITY
      : lost.reduce((max, m) => Math.max(max, scoreOf(m)), -1);
    return { player, losses: lost.length, score };
  });

  // Sort by depth desc, then by seed for a stable order within ties.
  ranked.sort((x, y) => (y.score - x.score) || (x.player.seed - y.player.seed));

  // Dense competition ranking with shared ranks for equal scores.
  const rows: StandingRow[] = [];
  let rank = 1;
  let i = 0;
  while (i < ranked.length) {
    let j = i;
    while (j < ranked.length && ranked[j].score === ranked[i].score) j++;
    for (let k = i; k < j; k++) {
      rows.push({
        rank,
        player: ranked[k].player,
        losses: ranked[k].losses,
        title: TITLES[rank],
      });
    }
    rank += j - i;
    i = j;
  }
  return rows;
}
