/**
 * "我的賽事" switcher: lists every tournament this device owns (holds an
 * editToken for), lets the admin switch between them, create a new one, or
 * remove one. Multiple tournaments can be managed in parallel.
 */
import { useState } from 'react';
import { useStore } from '../state/store';
import { local, type OwnedSummary } from '../state/persistence';

const STATUS: Record<string, { label: string; cls: string }> = {
  DRAFT: { label: '草稿', cls: 'draft' },
  RUNNING: { label: '進行中', cls: 'running' },
  FINISHED: { label: '完賽', cls: 'finished' },
};

export function TournamentSwitcher({ onRequestRemove }: { onRequestRemove: (s: OwnedSummary) => void }) {
  const currentId = useStore((s) => s.id);
  const listRev = useStore((s) => s.listRev);
  const open = useStore((s) => s.open);
  const newTournament = useStore((s) => s.newTournament);
  const [expanded, setExpanded] = useState(false);

  // Recomputed each render; listRev/currentId changes drive re-render.
  void listRev;
  const owned = local.listOwned();
  if (owned.length === 0) return null;

  return (
    <div className="switcher">
      <button className="btn switcher-btn" onClick={() => setExpanded((v) => !v)}>
        📋 我的賽事（{owned.length}）<span className="chev">▾</span>
      </button>
      {expanded && (
        <>
          <div className="switcher-backdrop" onClick={() => setExpanded(false)} />
          <div className="switcher-menu">
            <div className="switcher-head">我的賽事 · {owned.length} 場</div>
            {owned.map((o) => {
              const st = STATUS[o.status] ?? STATUS.DRAFT;
              const isCurrent = o.id === currentId;
              return (
                <div key={o.id} className={`switcher-row${isCurrent ? ' current' : ''}`}>
                  <button
                    className="switcher-pick"
                    onClick={() => { if (!isCurrent) void open(o.id); setExpanded(false); }}
                    title={isCurrent ? '目前這場' : '切換到這場'}
                  >
                    <span className={`badge ${st.cls}`}>{st.label}</span>
                    <span className="sw-name">{o.name}</span>
                    <span className="sw-meta">{o.players} 人{isCurrent ? ' · 目前' : ''}</span>
                  </button>
                  <button
                    className="sw-del"
                    title="從本機刪除這場"
                    onClick={() => { onRequestRemove(o); setExpanded(false); }}
                  >
                    ✕
                  </button>
                </div>
              );
            })}
            <button
              className="switcher-new"
              onClick={() => { void newTournament(); setExpanded(false); }}
            >
              ＋ 建立新賽事
            </button>
          </div>
        </>
      )}
    </div>
  );
}
