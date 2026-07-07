# 雙敗賽制隨機排位系統 (double-elim)

輸入參賽名單 → 一鍵隨機排入 **double-elimination（雙敗淘汰）** 對戰表 → 賽前可重複重抽比較組合 → 賽中點選勝者自動推進勝部/敗部，跑到冠軍並產出完整最終排名。

## 功能

- **隨機排位 + 無限重抽**（草稿模式）：人數自動適應，非 2 次方補輪空（bye 平均散佈）。
- **賽中推進**：點選每場勝者，自動路由勝部/敗部（反轉交叉，避免立刻重演）。
- **冠軍戰復活賽（bracket reset）**：可開關。敗部冠軍逆轉需再贏一場才奪冠。
- **完整最終排名**：同輪淘汰並列名次。
- **localStorage 持久化**：重整不消失。（跨裝置 Firebase 同步為階段 2）

## 狀態機

```
草稿 DRAFT（改名單 / 重抽）→ 鎖定開賽 → 比賽中 RUNNING（點勝負）→ 完賽 FINISHED（排名）
```

## 開發

```bash
npm install
npm run dev        # 開發伺服器
npm test           # 雙敗引擎單元測試（vitest）
npm run build      # 產出 dist/
```

## 架構

- `src/engine/` — 純函數雙敗引擎（與 UI 解耦、可單元測試、可序列化）。
- `src/state/` — Zustand store + 持久化層（`persistence.ts`，階段 2 換 Firestore 只動這裡）。
- `src/components/` — React UI。
