/**
 * App shell. Routes on tournament status:
 *   none    -> StartScreen
 *   DRAFT   -> roster editor + live bracket preview (reshuffle freely)
 *   RUNNING -> interactive bracket (pick winners)
 *   FINISHED-> standings + final bracket
 */
import { useState } from 'react';
import { useStore } from './state/store';
import { computeStandings, playableMatches } from './engine';
import { StartScreen } from './components/StartScreen';
import { RosterPanel } from './components/RosterPanel';
import { BracketView } from './components/BracketView';
import { Standings } from './components/Standings';
import { ConfirmDialog } from './components/ConfirmDialog';

type Dialog = 'reset' | 'discard' | null;

export default function App() {
  const t = useStore((s) => s.tournament);
  const { reseed, start, backToDraft, discard, pickWinner } = useStore();
  const [dialog, setDialog] = useState<Dialog>(null);

  if (!t) return <StartScreen />;

  const statusLabel = { DRAFT: '草稿 DRAFT', RUNNING: '比賽中 RUNNING', FINISHED: '完賽 FINISHED' }[t.status];
  const statusClass = { DRAFT: 'draft', RUNNING: 'running', FINISHED: 'finished' }[t.status];
  const remaining = t.status === 'RUNNING' ? playableMatches(t).length : 0;

  const exportResults = () => {
    const lines = computeStandings(t).map((r) => `${r.rank}. ${r.player.name}${r.title ? `（${r.title}）` : ''}`);
    const blob = new Blob([`${t.name} 最終排名\n\n${lines.join('\n')}\n`], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${t.name || '賽事'}-最終排名.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="app">
      <div className="app-title">🏁 {t.name}</div>
      <div className="app-sub">雙敗賽制隨機排位系統</div>

      <div className="control-bar">
        <span className={`badge ${statusClass}`}>● {statusLabel}</span>
        <span className="count">{t.players.length} 人 · 雙敗淘汰{t.resetEnabled ? ' · 含復活賽' : ''}</span>
        {t.status === 'RUNNING' && <span className="count">· 目前 {remaining} 場可進行</span>}
        <span className="spacer" />

        {t.status === 'DRAFT' && (
          <>
            <button className="btn" onClick={() => reseed()}>🎲 重新抽籤</button>
            <button className="btn" onClick={() => setDialog('discard')}>放棄賽事</button>
            <button className="btn primary" disabled={t.players.length < 2} onClick={() => start()}>
              鎖定開賽 →
            </button>
          </>
        )}
        {t.status === 'RUNNING' && (
          <button className="btn warn" onClick={() => setDialog('reset')}>重置（清空戰績）</button>
        )}
        {t.status === 'FINISHED' && (
          <>
            <button className="btn" onClick={exportResults}>📤 匯出結果</button>
            <button className="btn warn" onClick={() => setDialog('reset')}>重置</button>
          </>
        )}
      </div>

      {t.status === 'DRAFT' && <RosterPanel tournament={t} />}
      {t.status === 'FINISHED' && <Standings tournament={t} />}

      <BracketView tournament={t} interactive={t.status === 'RUNNING'} onPick={pickWinner} />

      {dialog === 'reset' && (
        <ConfirmDialog
          title="重置賽事？"
          message="這會清空所有已記錄的勝負，回到草稿狀態重新排位。此動作無法復原。"
          confirmLabel="確定重置"
          onConfirm={() => { backToDraft(); setDialog(null); }}
          onCancel={() => setDialog(null)}
        />
      )}
      {dialog === 'discard' && (
        <ConfirmDialog
          title="放棄這場賽事？"
          message="這會刪除目前的名單與對戰表，回到起始畫面。此動作無法復原。"
          confirmLabel="確定放棄"
          onConfirm={() => { discard(); setDialog(null); }}
          onCancel={() => setDialog(null)}
        />
      )}
    </div>
  );
}
