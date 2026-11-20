# gpt-free-tier 交接（更新：2026-11-20）

> 新對話開工只讀本檔；需要規格時讀 `docs/SPEC.md`（版本 2026-11-19-g）的對應小節。`collab/` 不進版控。

## 目前狀態

- **第 1 輪（邏輯）**：完成並驗收，`85396ef`。
- **第 2 輪（畫面）**：Codex 完成，Opus 驗收 PROOF_CMD 通過（`d02e223`、`f40e3a8`、`f965b01`）。Opus 修正：清除本機資料不刪今日額度紀錄（`a128f24`，`tests/history.test.ts` 有回歸測試）。
- **第 3 輪（C 版「大字親和」改版＋對話紀錄）**：框架 `2332b30`（卡片分類 `CATEGORIES`／`category`／`badge`／`tagline`、`src/ui/history.ts` 簽名、6 條測試、設計稿 `docs/design/c/`）。Codex 完成 `6343b1f`、`dc4dee1`、`bc416aa`。Opus 重跑 PROOF_CMD：**51/51**、typecheck 0、build 通過（dist 有 index.html／manifest.webmanifest／sw.js）、禁用字串 0 行、外部網址／字型 0 行、Codex 沒動框架路徑（history.ts 只刪占位行）。
- **尚未做**：瀏覽器實際看畫面、手機安裝、分享選單實測（使用者 11/19 說先不測）。開法：`npm.cmd run dev` → http://localhost:5173；寬度 < 900px 是手機版。
- Codex 自行決定、Opus 接受：組名照 `GROUP_LABEL`（「大模型組（sol／astra）」）；日期以台灣時區判定；重開一次問答紀錄時「再來一次」要本頁送出過才可用；額度未讀到時顯示「—」。
- **第 4 輪（好用度＋去識別化）**：框架 `b88043c`（pii.ts 完整移植 law；openai.ts 加 meta／錯誤類別；其餘簽名＋測試）。Codex 完成 `1956048`、`39d2cb6`、`5bed861`（新增 `src/ui/TextExtras.tsx`）。Opus 重跑 PROOF_CMD：**75/75**、typecheck 0、build 通過、禁用字串／外部網址／框架路徑 diff 皆 0 行；框架檔只換掉 9 行「未實作」；抽查 CardPage：遮蔽只取 `.values`／`.text`，對照表未落地，重試沿用原模型。小瑕疵（接受）：出錯時 meta.incompleteReason 存整句中文錯誤訊息，標註會偏長。尚未瀏覽器實測。
- 第 4 輪 Opus 定的事：不做自動重試（失敗都整筆計入保留量），只有手動「重試」；去識別化對照表只在記憶體、回答代號不還原；「再來一次／重試」不再檢查個資；只折疊 user 訊息；Node 的 Big5 會吞掉 0xFF，測試改用截斷雙位元組。
- **第 5 輪（生活卡片、東西放哪、語音）**：框架 `384423b`（卡片加分類 `life`＋`footer`／`links`、兩張卡 `legal-prep`（sol）／`law-plain`（luna，改寫 law AI3_SYSTEM）；`src/where/rules.ts`、`ai.ts` 由 Opus 移植 where）。Codex 完成 `56d5829`、`39da705`、`f600a87`（新增 `src/ui/Voice.tsx`、`src/ui/WherePage.tsx`）。Opus 重跑 PROOF_CMD：**102/102**、typecheck 0、build 通過、禁用字串／外部網址／框架路徑 diff 皆 0 行；抽查 WherePage：用 AI 前一定先確認、規則全呼叫 src/where、不進對話紀錄；Voice 同時只一欄收音、離頁停止。Opus 修正：CardPage import 插在 BOM 前（已移回）。尚未瀏覽器實測（Codex 的 computer-use 也沒跑起來），測法見 `collab/from-codex.md`。
- 第 5 輪 Opus 定的事：where 不搬地點階層、分類、照片，只存名稱＋位置＋原話；「某地方有什麼」改用位置字串包含；找東西本機失敗時送整份「名稱｜位置」（不送原話）；每次用 AI 前都要使用者按確認；voice 告知 mustAck=false、不改 NOTICE_VERSION；footer 不送模型、不存紀錄、不進匯出。
- **使用者文件（2026-11-20）**：Sonnet 寫 `eb16eba`（SETUP 第 5 步改 Analytics → 使用情況 → 處理層級、同步 setupSteps.ts；新增 `docs/NOTICES.md` 注意事項、`docs/MANUAL.md` 說明書；README 加連結與安裝段），Opus 驗收 102/102、TSC 0、無信箱金鑰，補修 `fbc953c`。待確認：手機分享選單（Web Share Target）部署後行為未寫進說明書；`NOTICE_VERSION` 仍 2026-11-19（告知內容沒變，不需改）。

- **相關（2026-11-20）**：gptstudio 同步加入 gpt-6-astra、gpt-5.6-terra（`700bc06`，CLI／ask-file `--astra`／`--terra`，實測各一則皆記入正確額度組）；MCP `ask_gpt` 需重開才看得到新模型。

## 設計

- 三套 UI 樣稿（A 清爽卡片／B 深色工作台／C 大字親和）：https://claude.ai/artifact/29bKf5EmzxxAC8TwaJjdpU 。**使用者選 C。**
- 只用系統字型，不載入外部字型（SPEC 不准做）。

## 下一步

1. 第 3～5 輪瀏覽器實測：使用者 2026-11-19 決定不測、視為通過。
2. 上線：astra 2026-11-20 確認；信箱／金鑰檢查無誤；GitHub repo `gpt-free-tier` 已於 2026-11-20 **公開**。公開前歷史已壓成單一 commit（本檔提到的舊 commit hash 只存在本機備份分支 `backup/pre-public-2026-11-20`，遠端沒有）。公開前改：OpenAI 說明全文翻譯改成作者自寫重點摘要（避免重散布官方文章），程式註解的本機路徑改成「作者的 law／where 專案」。顯示名稱已改「Free Tier Chat」（避開 GPT 商標；repo／package 名、LOCK_NAME 不動以免影響既有資料）。GitHub Pages 已開（`.github/workflows/pages.yml`，push master 自動跑測試＋build＋部署），網址 https://tongxiaooppo-boop.github.io/gpt-free-tier/ ；README 附手機版截圖（`docs/screenshots/`，Playwright 390×844 截，金鑰用假值）。
3. 選項（有需求再做）：常用法規包（約 20 部、壓縮後估 1 MB 內）。完整法規下載不做（法律 37.5 MB＋搜尋引擎＋每週同步）。

## 決定紀錄（2026-11-19，使用者）

- 法律：沒有法規資料又不能聯網 → 不做結論式諮詢；只做「諮詢前整理」與「條文白話」（條文由使用者自己貼）。law 的考題不用。
- where：做位置紀錄，最多 100 筆，新位置取代舊位置；滿了自動換掉最久沒更新的並告知。
- 語音：要做。
- 其他專案整合原則：只移植規則與提示詞（改寫成 TS、檔頭註明來源），不做跨專案共用套件。

## 上線前（未變）

- terra（11-19）、astra（11-20）後台確認走資料分享獎勵等級，`verified` 皆已 true。GPT-6.2 系列不在免費清單，不加入。
- 發佈：先建私人 repo，檢查信箱與金鑰後由使用者決定是否公開。
