/**
 * DRAFT-mode roster editor: rename inline, remove, add, and toggle the
 * grand-final reset. Editing names does not reshuffle; only 重新抽籤 does.
 */
import { useState } from 'react';
import type { Tournament } from '../engine';
import { nextPow2 } from '../engine';
import { useStore } from '../state/store';

export function RosterPanel({ tournament }: { tournament: Tournament }) {
  const { renamePlayer, setNickname, removePlayer, addPlayer, toggleReset } = useStore();
  const [draftName, setDraftName] = useState('');

  const submitAdd = () => {
    const name = draftName.trim();
    if (!name) return;
    addPlayer(name);
    setDraftName('');
  };

  const byes = nextPow2(Math.max(2, tournament.players.length)) - tournament.players.length;

  return (
    <div className="panel">
      <h3>參賽名單（{tournament.players.length} 人）</h3>
      <p className="hint">
        對戰表大小 {nextPow2(Math.max(2, tournament.players.length))} 格
        {byes > 0 ? `，${byes} 個輪空自動散佈` : '，剛好填滿無輪空'}。可填綽號，對戰表會以綽號顯示（沒填則用本名）。
      </p>

      <div className="roster">
        {tournament.players.map((p) => (
          <div className="roster-row" key={p.id}>
            <span className="seed">{p.seed}</span>
            <div className="roster-fields">
              <input
                className="rn-name"
                value={p.name}
                onChange={(e) => renamePlayer(p.id, e.target.value)}
                placeholder="本名"
                aria-label={`第 ${p.seed} 位選手本名`}
              />
              <input
                className="rn-nick"
                value={p.nickname ?? ''}
                onChange={(e) => setNickname(p.id, e.target.value)}
                placeholder="綽號（選填 · 晉級顯示用）"
                aria-label={`第 ${p.seed} 位選手綽號`}
              />
            </div>
            <button className="del" onClick={() => removePlayer(p.id)} title="移除" aria-label={`移除 ${p.name}`}>
              ✕
            </button>
          </div>
        ))}
      </div>

      <div className="add-row">
        <input
          value={draftName}
          onChange={(e) => setDraftName(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') submitAdd(); }}
          placeholder="輸入選手名稱後按 Enter 或「新增」"
          aria-label="新增選手名稱"
        />
        <button className="btn" onClick={submitAdd}>＋ 新增選手</button>
      </div>

      <div className="toggle-row">
        <label className="switch">
          <input
            type="checkbox"
            checked={tournament.resetEnabled}
            onChange={(e) => toggleReset(e.target.checked)}
          />
          <span className="track" />
        </label>
        <span>冠軍戰復活賽（bracket reset）</span>
      </div>
      <div className="toggle-note">
        開：真雙敗，敗部冠軍逆轉需再贏一場才奪冠。關：冠軍戰一場定生死。
      </div>
    </div>
  );
}
