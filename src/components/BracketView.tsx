/**
 * The bracket itself: winners zone (blue), losers zone (amber), grand-final
 * zone (purple). Matches are grouped into round columns. In RUNNING mode the
 * ready match is clickable; otherwise it is read-only.
 */
import { useMemo } from 'react';
import type { Match, Tournament } from '../engine';
import { GRAND_FINAL_ID, GRAND_FINAL_RESET_ID, isResetActive } from '../engine';
import { MatchCard } from './MatchCard';

interface Props {
  tournament: Tournament;
  interactive: boolean;
  canRevert: boolean;
  onPick: (matchId: string, side: 'a' | 'b') => void;
  onRevert: (matchId: string) => void;
}

/** Group a bracket's matches by round number, ordered. */
function byRound(matches: Match[]): Match[][] {
  const rounds = new Map<number, Match[]>();
  for (const m of matches) {
    const arr = rounds.get(m.round) ?? [];
    arr.push(m);
    rounds.set(m.round, arr);
  }
  return [...rounds.keys()].sort((x, y) => x - y).map((r) => rounds.get(r)!.sort((a, b) => a.order - b.order));
}

export function BracketView({ tournament, interactive, canRevert, onPick, onRevert }: Props) {
  const { wb, lb, gf, gfr } = useMemo(() => ({
    wb: byRound(tournament.matches.filter((m) => m.bracket === 'WB')),
    lb: byRound(tournament.matches.filter((m) => m.bracket === 'LB')),
    gf: tournament.matches.find((m) => m.id === GRAND_FINAL_ID) ?? null,
    gfr: tournament.matches.find((m) => m.id === GRAND_FINAL_RESET_ID) ?? null,
  }), [tournament.matches]);

  const resetLive = isResetActive(tournament);

  const renderZone = (kind: 'wb' | 'lb', label: string, rounds: Match[][]) => (
    <div className={`zone ${kind}`}>
      <div className="region-label">{label}</div>
      <div className="rounds-scroll">
        <div className="rounds">
          {rounds.map((matches, i) => (
            <div className="round tall" key={i}>
              <div className="round-title">{matches[0]?.label ?? ''}</div>
              {matches.map((m) => (
                <MatchCard key={m.id} match={m} tournament={tournament} interactive={interactive} canRevert={canRevert} onPick={onPick} onRevert={onRevert} />
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  return (
    <div>
      {renderZone('wb', '🔵 勝部 Winners Bracket', wb)}
      {lb.length > 0 && renderZone('lb', '🟠 敗部 Losers Bracket', lb)}
      <div className="zone gf">
        <div className="region-label">🟣 冠軍戰 Grand Final</div>
        <div className="rounds-scroll">
          <div className="rounds">
            {gf && (
              <div className="round">
                <div className="round-title">{gf.label}</div>
                <MatchCard match={gf} tournament={tournament} interactive={interactive} canRevert={canRevert} onPick={onPick} onRevert={onRevert} />
              </div>
            )}
            {gfr && resetLive && (
              <div className="round">
                <div className="round-title">{gfr.label}</div>
                <MatchCard match={gfr} tournament={tournament} interactive={interactive} canRevert={canRevert} onPick={onPick} onRevert={onRevert} />
              </div>
            )}
          </div>
        </div>
        {tournament.resetEnabled && !resetLive && (
          <div className="gf-note">
            ⚡ 復活賽已開啟：敗部冠軍（帶 1 敗）若在冠軍戰擊敗勝部冠軍（0 敗），兩人各 1 敗，將加賽一場決勝。
          </div>
        )}
      </div>
    </div>
  );
}
