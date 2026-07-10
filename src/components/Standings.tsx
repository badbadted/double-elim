/** Champion celebration banner shown when the tournament is FINISHED. */
import type { Tournament } from '../engine';
import { getChampion, displayName } from '../engine';

export function Standings({ tournament }: { tournament: Tournament }) {
  const champion = getChampion(tournament);
  if (!champion) return null;

  return (
    <div className="champ-banner">
      <div className="cup">🏆</div>
      <div className="txt">
        <div className="k">冠軍 CHAMPION</div>
        <div className="v">
          {displayName(champion)}
          {champion.nickname?.trim() && champion.nickname.trim() !== champion.name && (
            <span className="realname-inline">（{champion.name}）</span>
          )}
        </div>
      </div>
      <img className="champ-mascot" src={`${import.meta.env.BASE_URL}illustrations/mascot-squirrel.jpeg`} alt="" />
    </div>
  );
}
