/**
 * Final standings (FINISHED). Champion banner + ranked list. Ties share a rank.
 */
import { useMemo } from 'react';
import type { Tournament } from '../engine';
import { computeStandings } from '../engine';

export function Standings({ tournament }: { tournament: Tournament }) {
  const rows = useMemo(() => computeStandings(tournament), [tournament]);
  const champion = rows[0];

  return (
    <div className="panel">
      {champion && (
        <div className="champ-banner">
          <div className="cup">🏆</div>
          <div className="txt">
            <div className="k">冠軍 CHAMPION</div>
            <div className="v">{champion.player.name}</div>
          </div>
        </div>
      )}
      <h3 style={{ marginBottom: 12 }}>🏅 最終排名</h3>
      <div className="standings">
        {rows.map((r) => (
          <div className={`row r${r.rank <= 3 ? r.rank : ''}`} key={r.player.id}>
            <span className="rk">{r.rank}</span>
            <span className="nm">{r.player.name}</span>
            {r.title && <span className="tt">{r.title}</span>}
          </div>
        ))}
      </div>
    </div>
  );
}
