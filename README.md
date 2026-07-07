# 雙敗賽制隨機排位系統 (double-elim)

輸入參賽名單 → 一鍵隨機排入 **double-elimination（雙敗淘汰）** 對戰表 → 賽前可重複重抽比較組合 → 賽中點選勝者自動推進勝部/敗部，跑到冠軍並產出完整最終排名。

## 功能

- **隨機排位 + 無限重抽**（草稿模式）：人數自動適應，非 2 次方補輪空（bye 平均散佈）。
- **賽中推進**：點選每場勝者，自動路由勝部/敗部（反轉交叉，避免立刻重演）。
- **冠軍戰復活賽（bracket reset）**：可開關。敗部冠軍逆轉需再贏一場才奪冠。
- **完整最終排名**：同輪淘汰並列名次。
- **一寫多讀跨裝置**（階段 2）：管理者那台編輯，其他人開 `?t=<賽事ID>` 連結即時觀看（每 5 秒輪詢）。管理權以 editToken 保護。
- **localStorage 快取**：離線或本機 `vite dev`（無 /api）時自動降級為單機工具。

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
- `src/state/` — Zustand store + `persistence.ts`（remote API + localStorage 快取、role 判定）。
- `src/components/` — React UI。
- `api/tournament/[id].ts` — Vercel serverless：`GET` 讀（公開）、`PUT` 寫（需 editToken）。KV 秘密只在此。

## 部署（Vercel + Vercel KV，一寫多讀）

1. Vercel 匯入本 repo（自動偵測 Vite）。
2. Vercel 專案 → **Storage** → 建立 **KV / Upstash Redis** → 連到本專案。
   會自動注入 serverless 環境變數 `KV_REST_API_URL`、`KV_REST_API_TOKEN`（伺服器端秘密，不進瀏覽器）。
3. 推送即部署。管理者建立賽事後，用「🔗 複製觀看連結」把 `?t=<id>` 連結給觀看者即時觀看。

> 權限模型：第一次 `PUT` 建立賽事並綁定 editToken（存管理者本機），之後寫入需帶對的 token；
> 讀取公開。所以只有管理者那台能改，其他人只能看。

本機測 /api 需 `vercel dev`（`vite dev` 不跑 serverless，會自動降級為單機模式）。
