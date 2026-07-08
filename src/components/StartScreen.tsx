/** First-run screen: name the tournament and paste an initial roster. */
import { useState } from 'react';
import { useStore } from '../state/store';
import { local } from '../state/persistence';

const SAMPLE = '阿明\n小華\n大雄\n靜香\n胖虎\n小夫\n哆啦\n出木杉';
const STATUS_LABEL: Record<string, string> = { DRAFT: '草稿', RUNNING: '進行中', FINISHED: '完賽' };

export function StartScreen() {
  const create = useStore((s) => s.create);
  const open = useStore((s) => s.open);
  const listRev = useStore((s) => s.listRev);
  const [name, setName] = useState('');
  const [roster, setRoster] = useState('');

  void listRev;
  const owned = local.listOwned();

  const names = roster.split('\n').map((s) => s.trim()).filter(Boolean);
  const canCreate = names.length >= 2;

  return (
    <div className="start">
      <div className="card">
        <img className="start-mascot" src={`${import.meta.env.BASE_URL}illustrations/mascot-shiba.jpeg`} alt="" />
        <h1>雙敗賽制隨機排位系統</h1>
        <p>輸入參賽名單，一鍵隨機排入雙敗淘汰對戰表。開賽前可重複抽籤比較不同組合。</p>

        <div className="field">
          <label>賽事名稱</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="例：夏季盃"
          />
        </div>

        <div className="field">
          <label>參賽名單（一行一位，至少 2 人）</label>
          <textarea
            rows={8}
            value={roster}
            onChange={(e) => setRoster(e.target.value)}
            placeholder={SAMPLE}
          />
        </div>

        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <button className="btn primary" disabled={!canCreate} onClick={() => create(name, names)}>
            建立賽事 →
          </button>
          <button className="btn" onClick={() => setRoster(SAMPLE)}>填入範例 8 人</button>
          <span className="count">{names.length} 人</span>
        </div>

        {owned.length > 0 && (
          <div className="owned-list">
            <div className="owned-head">或開啟已建立的賽事（{owned.length}）</div>
            {owned.map((o) => (
              <button key={o.id} className="owned-row" onClick={() => open(o.id)}>
                <span className="sw-name">{o.name}</span>
                <span className="sw-meta">{STATUS_LABEL[o.status] ?? '草稿'} · {o.players} 人</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
