/** Champion celebration banner shown when the tournament is FINISHED. */
import type { Tournament } from '../engine';
import { getChampion } from '../engine';

export function Standings({ tournament }: { tournament: Tournament }) {
  const champion = getChampion(tournament);
  if (!champion) return null;

  return (
    <div className="champ-banner">
      <div className="cup">🏆</div>
      <div className="txt">
        <div className="k">冠軍 CHAMPION</div>
        <div className="v">{champion.name}</div>
      </div>
      <img className="champ-mascot" src={`${import.meta.env.BASE_URL}illustrations/mascot-squirrel.jpeg`} alt="" />
    </div>
  );
}
