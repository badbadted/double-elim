/**
 * App shell. Loads a tournament from the ?t=<id> URL (or last-opened), then
 * routes on role + status:
 *   admin  -> full controls (edit / pick winners), share link, sync status
 *   viewer -> read-only bracket that polls for live updates
 */
import { useEffect, useRef, useState } from 'react';
import { useStore } from './state/store';
import { computeStandings, playableMatches } from './engine';
import { StartScreen } from './components/StartScreen';
import { RosterPanel } from './components/RosterPanel';
import { BracketView } from './components/BracketView';
import { Standings } from './components/Standings';
import { ConfirmDialog } from './components/ConfirmDialog';

type Dialog = 'reset' | 'discard' | null;

const SYNC_TEXT: Record<string, string> = {
  idle: '☁ 已同步', saving: '⟳ 儲存中…', offline: '⚠ 離線（僅本機）',
  error: '⚠ 連線錯誤', loading: '載入中…', notfound: '',
};

export default function App() {
  const { id, tournament, role, sync, init, refresh, reseed, start, backToDraft, discard, pickWinner, shareUrl } = useStore();
  const [dialog, setDialog] = useState<Dialog>(null);
  const [copied, setCopied] = useState(false);
  const started = useRef(false);

  // Load from URL once on mount.
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void init();
  }, [init]);

  // Viewers poll for live updates while the tab is visible.
  useEffect(() => {
    if (role !== 'viewer' || !id) return;
    const tick = () => { if (document.visibilityState === 'visible') void refresh(); };
    const timer = setInterval(tick, 5000);
    return () => clearInterval(timer);
  }, [role, id, refresh]);

  if (sync === 'loading') return <Centered>載入賽事中…</Centered>;
  if (sync === 'notfound') return (
    <Centered>
      找不到這場賽事 🤷<br />
      <button className="btn" style={{ marginTop: 14 }} onClick={() => discard()}>回起始畫面</button>
    </Centered>
  );
  if (!tournament) return <StartScreen />;

  const isAdmin = role === 'admin';
  const statusLabel = { DRAFT: '草稿 DRAFT', RUNNING: '比賽中 RUNNING', FINISHED: '完賽 FINISHED' }[tournament.status];
  const statusClass = { DRAFT: 'draft', RUNNING: 'running', FINISHED: 'finished' }[tournament.status];
  const remaining = tournament.status === 'RUNNING' ? playableMatches(tournament).length : 0;

  const copyShare = async () => {
    try { await navigator.clipboard.writeText(shareUrl()); setCopied(true); setTimeout(() => setCopied(false), 1800); }
    catch { /* clipboard blocked */ }
  };

  const exportResults = () => {
    const lines = computeStandings(tournament).map((r) => `${r.rank}. ${r.player.name}${r.title ? `（${r.title}）` : ''}`);
    const blob = new Blob([`${tournament.name} 最終排名\n\n${lines.join('\n')}\n`], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `${tournament.name || '賽事'}-最終排名.txt`; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="app">
      <div className="app-title">🏁 {tournament.name}</div>
      <div className="app-sub">雙敗賽制隨機排位系統{!isAdmin && ' · 👁 觀看模式（即時更新）'}</div>

      <div className="control-bar">
        <span className={`badge ${statusClass}`}>● {statusLabel}</span>
        <span className="count">{tournament.players.length} 人 · 雙敗淘汰{tournament.resetEnabled ? ' · 含復活賽' : ''}</span>
        {tournament.status === 'RUNNING' && isAdmin && <span className="count">· 目前 {remaining} 場可進行</span>}
        <span className="spacer" />

        {isAdmin && <span className="count" title="與雲端同步狀態">{SYNC_TEXT[sync] ?? ''}</span>}
        {id && (
          <button className="btn" onClick={copyShare} title="複製給觀看者的即時連結">
            {copied ? '✓ 已複製' : '🔗 複製觀看連結'}
          </button>
        )}

        {isAdmin && tournament.status === 'DRAFT' && (
          <>
            <button className="btn" onClick={() => reseed()}>🎲 重新抽籤</button>
            <button className="btn" onClick={() => setDialog('discard')}>放棄賽事</button>
            <button className="btn primary" disabled={tournament.players.length < 2} onClick={() => start()}>鎖定開賽 →</button>
          </>
        )}
        {isAdmin && tournament.status === 'RUNNING' && (
          <button className="btn warn" onClick={() => setDialog('reset')}>重置（清空戰績）</button>
        )}
        {isAdmin && tournament.status === 'FINISHED' && (
          <>
            <button className="btn" onClick={exportResults}>📤 匯出結果</button>
            <button className="btn warn" onClick={() => setDialog('reset')}>重置</button>
          </>
        )}
      </div>

      {isAdmin && tournament.status === 'DRAFT' && <RosterPanel tournament={tournament} />}
      {!isAdmin && tournament.status === 'DRAFT' && (
        <div className="panel"><p className="hint" style={{ margin: 0 }}>賽事尚未開始（草稿中），開賽後這裡會即時顯示對戰進度。</p></div>
      )}
      {tournament.status === 'FINISHED' && <Standings tournament={tournament} />}

      <BracketView tournament={tournament} interactive={isAdmin && tournament.status === 'RUNNING'} onPick={pickWinner} />

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
          message="這會從本機移除這場賽事並回到起始畫面（雲端資料仍在，可用連結重開）。"
          confirmLabel="確定放棄"
          onConfirm={() => { discard(); setDialog(null); }}
          onCancel={() => setDialog(null)}
        />
      )}
    </div>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return <div className="start"><div className="card" style={{ textAlign: 'center' }}>{children}</div></div>;
}
