/**
 * A single match: two slots, each showing seed + name, with the winner filled
 * green and the loser struck through. When interactive and both sides are known,
 * clicking a slot records that player as the winner.
 */
import { useMemo } from 'react';
import type { Match, ResolvedSlot, Tournament } from '../engine';
import { indexMatches, indexPlayers, resolveMatch, classifyMatch } from '../engine';

interface Props {
  match: Match;
  tournament: Tournament;
  interactive: boolean;
  onPick: (matchId: string, side: 'a' | 'b') => void;
}

function slotText(r: ResolvedSlot): { text: string; seed: string; kind: 'player' | 'bye' | 'tbd' } {
  if (r.state === 'player') return { text: r.player.name, seed: String(r.player.seed), kind: 'player' };
  if (r.state === 'bye') return { text: '輪空 bye', seed: '', kind: 'bye' };
  return { text: '待定', seed: '', kind: 'tbd' };
}

export function MatchCard({ match, tournament, interactive, onPick }: Props) {
  const { a, b, ready } = useMemo(() => {
    const mi = indexMatches(tournament.matches);
    const pi = indexPlayers(tournament.players);
    return {
      ...resolveMatch(match, mi, pi),
      ready: classifyMatch(match, mi, pi) === 'ready',
    };
  }, [match, tournament]);

  const clickable = interactive && ready && match.winner === null;

  const renderSlot = (side: 'a' | 'b', r: ResolvedSlot) => {
    const info = slotText(r);
    const isWinner = match.winner === side;
    const isLoser = match.winner !== null && match.winner !== side && info.kind === 'player';
    const classes = ['slot'];
    if (isWinner) classes.push('win');
    if (isLoser) classes.push('lost');
    if (info.kind === 'bye') classes.push('byeSlot');
    if (info.kind === 'tbd') classes.push('empty');
    if (clickable && info.kind === 'player') classes.push('clickable');
    return (
      <div
        className={classes.join(' ')}
        onClick={clickable && info.kind === 'player' ? () => onPick(match.id, side) : undefined}
        role={clickable && info.kind === 'player' ? 'button' : undefined}
        tabIndex={clickable && info.kind === 'player' ? 0 : undefined}
        onKeyDown={
          clickable && info.kind === 'player'
            ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onPick(match.id, side); } }
            : undefined
        }
        title={clickable && info.kind === 'player' ? `判定 ${info.text} 獲勝` : undefined}
      >
        {info.seed && <span className="seed">{info.seed}</span>}
        <span className="name">{info.text}</span>
      </div>
    );
  };

  return (
    <div className={`match${clickable ? ' ready' : ''}`}>
      {renderSlot('a', a)}
      {renderSlot('b', b)}
    </div>
  );
}
