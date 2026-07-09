/**
 * App shell. Loads a tournament from the ?t=<id> URL (or last-opened), then
 * routes on role + status:
 *   admin  -> full controls (edit / pick winners), share link, sync status
 *   viewer -> read-only bracket that polls for live updates
 */
import { useEffect, useRef, useState } from 'react';
import { useStore } from './state/store';
import { computeStandings, playableMatches, revertImpact, displayName } from './engine';
import { StartScreen } from './components/StartScreen';
import { RosterPanel } from './components/RosterPanel';
import { BracketView } from './components/BracketView';
import { Standings } from './components/Standings';
import { ConfirmDialog } from './components/ConfirmDialog';
import { TournamentSwitcher } from './components/TournamentSwitcher';
import type { OwnedSummary } from './state/persistence';

type Dialog = 'reset' | 'discard' | 'new' | null;

const SYNC_TEXT: Record<string, string> = {
  idle: '☁ 已同步', saving: '⟳ 儲存中…', offline: '⚠ 離線（僅本機）',
  error: '⚠ 連線錯誤', loading: '載入中…', notfound: '',
};

export default function App() {
  const {
    id, tournament, role, sync, previewAsViewer,
    init, refresh, togglePreview, reseed, start, backToDraft, newTournament, removeTournament, pickWinner, revertMatch, shareUrl,
  } = useStore();
  const [dialog, setDialog] = useState<Dialog>(null);
  const [revertTarget, setRevertTarget] = useState<{ matchId: string; impact: number } | null>(null);
  const [removeTarget, setRemoveTarget] = useState<OwnedSummary | null>(null);
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
      <button className="btn" style={{ marginTop: 14 }} onClick={() => newTournament()}>回起始畫面</button>
    </Centered>
  );
  if (!tournament) return <StartScreen />;

  const isAdmin = role === 'admin';
  const effectiveAdmin = isAdmin && !previewAsViewer; // admin previewing sees the viewer UI
  const canRevert = effectiveAdmin && (tournament.status === 'RUNNING' || tournament.status === 'FINISHED');

  const handleRevert = (matchId: string) => {
    const impact = revertImpact(tournament, matchId);
    if (impact > 0) setRevertTarget({ matchId, impact });
    else revertMatch(matchId);
  };

  const statusLabel = { DRAFT: '草稿 DRAFT', RUNNING: '比賽中 RUNNING', FINISHED: '完賽 FINISHED' }[tournament.status];
  const statusClass = { DRAFT: 'draft', RUNNING: 'running', FINISHED: 'finished' }[tournament.status];
  const remaining = tournament.status === 'RUNNING' ? playableMatches(tournament).length : 0;

  const copyShare = async () => {
    try { await navigator.clipboard.writeText(shareUrl()); setCopied(true); setTimeout(() => setCopied(false), 1800); }
    catch { /* clipboard blocked */ }
  };

  const exportResults = () => {
    const lines = computeStandings(tournament).map((r) => `${r.rank}. ${displayName(r.player)}${r.title ? `（${r.title}）` : ''}`);
    const blob = new Blob([`${tournament.name} 最終排名\n\n${lines.join('\n')}\n`], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `${tournament.name || '賽事'}-最終排名.txt`; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="app">
      <div className="app-title">🏁 {tournament.name}</div>
      <div className="app-sub">雙敗賽制隨機排位系統{!effectiveAdmin && ' · 👁 觀看模式（即時更新）'}</div>

      {isAdmin && previewAsViewer && (
        <div className="preview-banner">
          👁 觀看者預覽中——這就是別人開連結看到的樣子（唯讀）。
          <button className="btn" onClick={() => togglePreview()}>✏ 返回管理</button>
        </div>
      )}

      <div className="control-bar">
        {isAdmin && <TournamentSwitcher onRequestRemove={setRemoveTarget} />}
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
        {isAdmin && (
          <button className="btn" onClick={() => togglePreview()} title="切換到觀看者視角預覽">
            {previewAsViewer ? '✏ 返回管理' : '👁 觀看者預覽'}
          </button>
        )}

        {effectiveAdmin && tournament.status === 'DRAFT' && (
          <>
            <button className="btn" onClick={() => reseed()}>🎲 重新抽籤</button>
            <button className="btn" onClick={() => setDialog('discard')}>放棄賽事</button>
            <button className="btn primary" disabled={tournament.players.length < 2} onClick={() => start()}>鎖定開賽 →</button>
          </>
        )}
        {effectiveAdmin && tournament.status === 'RUNNING' && (
          <>
            <button className="btn" onClick={() => setDialog('new')}>＋ 新賽事</button>
            <button className="btn warn" onClick={() => setDialog('reset')}>重置（清空戰績）</button>
          </>
        )}
        {effectiveAdmin && tournament.status === 'FINISHED' && (
          <>
            <button className="btn" onClick={exportResults}>📤 匯出結果</button>
            <button className="btn primary" onClick={() => setDialog('new')}>＋ 新賽事</button>
            <button className="btn warn" onClick={() => setDialog('reset')}>重置</button>
          </>
        )}
      </div>

      {effectiveAdmin && tournament.status === 'DRAFT' && <RosterPanel tournament={tournament} />}
      {!effectiveAdmin && tournament.status === 'DRAFT' && (
        <div className="panel"><p className="hint" style={{ margin: 0 }}>賽事尚未開始（草稿中），開賽後這裡會即時顯示對戰進度。</p></div>
      )}
      {tournament.status === 'FINISHED' && <Standings tournament={tournament} />}

      <BracketView
        tournament={tournament}
        interactive={effectiveAdmin && tournament.status === 'RUNNING'}
        canRevert={canRevert}
        onPick={pickWinner}
        onRevert={handleRevert}
      />

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
          title="放棄這場草稿？"
          message="這會從本機移除這場草稿（雲端資料仍在，可用連結重開）。若還有其他賽事會自動切換過去。"
          confirmLabel="確定放棄"
          onConfirm={() => { if (id) removeTournament(id); setDialog(null); }}
          onCancel={() => setDialog(null)}
        />
      )}
      {dialog === 'new' && (
        <ConfirmDialog
          title="開新賽事？"
          message="回到起始畫面建立新的一場。目前這場會保留在「📋 我的賽事」清單裡，隨時可切回，不會不見。"
          confirmLabel="開新賽事"
          onConfirm={() => { newTournament(); setDialog(null); }}
          onCancel={() => setDialog(null)}
        />
      )}
      {removeTarget && (
        <ConfirmDialog
          title="刪除這場賽事？"
          message={`「${removeTarget.name}」會從這台裝置的清單移除（雲端資料仍在，用連結還能重開）。`}
          confirmLabel="刪除"
          onConfirm={() => { removeTournament(removeTarget.id); setRemoveTarget(null); }}
          onCancel={() => setRemoveTarget(null)}
        />
      )}
      {revertTarget && (
        <ConfirmDialog
          title="改判這場？"
          message={`這會撤銷這場結果，並一併清除受影響的後續 ${revertTarget.impact} 場戰績（需重打）。確定要改判嗎？`}
          confirmLabel="確定改判"
          onConfirm={() => { revertMatch(revertTarget.matchId); setRevertTarget(null); }}
          onCancel={() => setRevertTarget(null)}
        />
      )}
    </div>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return <div className="start"><div className="card" style={{ textAlign: 'center' }}>{children}</div></div>;
}
