# SPEC — gpt-free-tier（版本 2026-11-19-g）

純前端 PWA，只用 OpenAI 資料共享免費額度。沒有後端；金鑰存在瀏覽器；請求直送 api.openai.com。

## 已定死（Opus 寫好，實作者不得改）

| 檔案 | 狀態 | 說明 |
|---|---|---|
| `src/config/models.ts` | 完成 | 唯一模型清單（luna、terra、astra、6.1-sol），`verified` 控制是否出現在選單 |
| `src/config/notices.ts` | 完成 | 所有告知文字＋`SHARING_LINKS`（英文原文、程式內中文摘要頁 `#doc/openai-sharing`） |
| `src/config/setupSteps.ts` | 完成 | 帳號設定步驟，與 `docs/SETUP.md` 同步 |
| `src/config/cards.ts` | 完成 | 12 張功能卡＋`renderCard`／`validateCard`＋分類 `CATEGORIES`／`category`／`badge`／`tagline`（第 3 輪加），`tests/cards.test.ts` 16 條 |
| `src/ui/history.ts` | **簽名**，第 3 輪實作 | 對話紀錄，`tests/history.test.ts` 6 條 |
| `src/quota/plan.ts` | 完成 | 保留、結算純函式，`tests/plan.test.ts` 16 條 |
| `src/quota/store.ts` | **簽名**，第 1 輪實作 | IndexedDB＋navigator.locks |
| `src/api/openai.ts` | **簽名**，第 1 輪實作 | fetch＋SSE，含圖片輸入，鐵則寫在檔頭；第 4 輪 Opus 加 `AnswerMeta`、`OpenAIHttpError`、`StreamInterruptedError`、`estimateTextTokens`（已完成） |
| `src/text/pii.ts` | 完成（第 4 輪，Opus 移植 law） | 去識別化，`tests/pii.test.ts` 7 條 |
| `src/api/errors.ts`、`src/text/stats.ts`、`src/text/fileText.ts`、`src/text/export.ts`、`src/text/thread.ts` | **簽名**，第 4 輪實作 | `tests/errors.test.ts` 4 條、`tests/text.test.ts` 10 條 |
| `src/config/cards.ts`（第 5 輪） | 完成 | 加分類 `life`（生活）、卡片欄位 `footer`／`links`、兩張卡 `legal-prep`（諮詢前整理）／`law-plain`（條文白話），`tests/cards.test.ts` 共 19 條 |
| `src/config/notices.ts`（第 5 輪） | 完成 | 加 `voice` 告知、`VOICE_NOTICE`、`WHERE_AI_CONFIRM` |
| `src/where/rules.ts`、`src/where/ai.ts` | 完成（第 5 輪，Opus 移植 where） | 東西放哪的拆句、同名、搜尋、存檔規則與 AI 提示詞，`tests/where.test.ts` 14 條 |
| `src/where/store.ts`、`src/voice/speech.ts` | **簽名**，第 5 輪實作 | `tests/where-store.test.ts` 4 條、`tests/speech.test.ts` 6 條 |
| `docs/openai-sharing.zh-TW.md` | 完成 | 官方說明的中文重點摘要（作者自行整理，非翻譯），程式內頁面直接 import（`?raw`） |

### 卡片清單（第一版全部上線）

| 類別 | 卡片 |
|---|---|
| 文字 | 自由對話、翻譯、摘要、改寫潤稿、文法檢查、易讀版改寫、一稿多平台貼文、簡報大綱、點子產生器 |
| 文字或圖片 | 錯誤訊息解讀（文字、截圖至少填一項） |
| 圖片 | 拍照翻譯、拍照轉文字 |

全部預設使用 terra（小模型組；2026-11-21 起，原為 luna）；使用者可以在卡片頁改選其他 verified 模型。

## 第 1 輪：邏輯（Codex）

1. `src/quota/store.ts`：照檔頭註解實作。新增 `tests/store.test.ts`，用 `fake-indexeddb` 和自製的 locks stub，共 5 條：
   - `reserve 成功後 readDay 看得到保留`
   - `reserve 失敗不寫入`
   - `兩個 reserve 併發，總保留不超過 limit`（limit 237,500，兩個各要 200,000，只有一個 ok）
   - `settleReservation(null) 整筆計入`
   - `setExternalUsed 負數視為 0`
2. `src/api/openai.ts`：照檔頭鐵則實作，`estimateRequestTokens` 照抄下方演算法。新增 `tests/openai.test.ts`，一律 mock `fetch`，不打真 API，共 8 條：
   - `request body 只含白名單欄位`（逐一比對 key 集合）
   - `清單外模型不呼叫 fetch`
   - `額度不足丟 QuotaRefusedError 且不呼叫 fetch`
   - `completed 事件的 usage 傳給 settle`
   - `HTTP 500 → settle(null)`
   - `abort 中途 → settle(null)`
   - `有圖片時 content 為 input_text＋input_image 陣列`
   - `估算含圖片：一則訊息一張圖 = 文字估算 + 8 + 1500`

第 1 輪 PROOF：`npm test && npm run typecheck`，共 44 條（plan 16、cards 15、store 5、openai 8）。

## 第 2 輪：畫面（之後另寫任務書）

- **首次同意頁**：列出全部 `NOTICES`，`mustAck` 的要逐條勾選才能進入；存 `NOTICE_VERSION`，版本變了要重新同意。`links` 顯示成連結。
- **設定教學頁**：逐步顯示 `SETUP_STEPS`，`warn` 用醒目樣式，`links` 顯示成連結。同意頁和設定頁都要有入口，還沒設定金鑰時，首頁直接導向這頁。
- **中文摘要頁**（`#doc/openai-sharing`）：`import md from "../../docs/openai-sharing.zh-TW.md?raw"`，用 react-markdown 顯示。
- **設定頁**：金鑰（type=password，可刪除）；方案（build／launch_grow，切到 launch_grow 要再確認一次）；兩組額度的「今天在其他地方已用量」；可以再看全部 NOTICES；「清除全部本機資料」（含金鑰，要再確認一次）。
- **首頁**：卡片清單，顯示標題、說明、用哪組額度。
- **卡片頁**：
  - 依 `card.fields` 產生表單，送出前跑 `validateCard`，用 `renderCard` 組出 instructions、user 訊息、images，再用 `card.maxOutputTokens`、`card.reasoningEffort` 呼叫 `streamChat`。
  - `multiTurn=false` 的卡只送一則 user 訊息；`chat` 卡保留對話歷史。
  - 結果區有「複製」「再來一次」。
  - 模型下拉預設 `card.defaultModel`，選項只用 `selectableModels()`。
- **圖片欄位**：`<input type="file" accept="image/*" capture="environment">`。用 canvas 把長邊壓到 1024px 以內，輸出 JPEG（品質 0.85）data URL，顯示縮圖，可以移除。
- **手機分享（Web Share Target）**：manifest 加 `share_target`（GET，參數 `text`／`title`／`url`）。分享進來後先讓使用者選卡片（只列有 `shareTargetField` 的卡），把文字填入該欄位，**不自動送出**。`url` 只當成文字附上，不去抓網頁。
- **共通**：
  - 頂端常駐一行「無法聯網・內容會分享給 OpenAI・勿輸入私密資訊」。
  - 右上顯示兩組額度今日已用／上限，以及重置時間（台灣 08:00）。
  - 被拒時顯示中文原因和剩餘量。
- **儲存**：對話和卡片結果存在 IndexedDB（只在本機）。
- **PWA**：manifest＋最簡 service worker，只快取靜態檔，**不快取 api.openai.com**。
- **樣式**：手寫 CSS，手機寬 360px 可用，支援深色模式。

## 第 3 輪：C 版「大字親和」改版＋對話紀錄（使用者 2026-11-19 選定）

設計稿：`docs/design/c/`（C-home 手機首頁、C-card 手機卡片頁、C-desktop 桌面首頁；原稿在 Design 畫布 https://claude.ai/artifact/29bKf5EmzxxAC8TwaJjdpU ）。只改畫面，第 2 輪的行為全部保留。

- **版面**：寬度 < 900px 用手機版（底部三分頁：首頁／紀錄／設定，高 72px）；≥ 900px 用桌面版（頂端橫列：品牌＋三個分頁鈕）。同意頁、設定教學頁、中文摘要頁不顯示分頁列。
- **首頁**：標題「今天想做什麼？」；額度卡寫「今天的免費額度還剩」＋兩組各一格大字百分比（`1 − 已用／上限`，四捨五入、不低於 0%），桌面版再加一行「已用 X／上限 Y」，底下「每天早上 8 點（台灣）重新計算」；提醒框（米黃底）；卡片依 `CATEGORIES` 分組，每張顯示 `badge`、`title`、`tagline`。桌面版卡片三欄，額度與提醒放右側 300px 欄。
- **卡片頁**：標題用襯線字；欄位依 `card.fields` 順序顯示成「第 N 步　{label}」；模型選單收進 `<details>`「進階：換模型」；送出鈕文字「開始」，產生中變「停止」。結果區大字（18px），按鈕「複製」「再來一次」；結果下方小字「使用 {模型 label}」。`multiTurn` 卡維持對話串＋底部輸入框，另有「開始新對話」。桌面版：表單左、結果右兩欄。
- **紀錄頁（新）**：`listConversations()` 依時間列出，每列：卡片 badge、標題（空的話用卡片名稱）、卡片名稱、時間（今天顯示 HH:mm，其他顯示 M/D）、刪除鈕（要確認）。點一列開卡片頁並載入該筆：`multiTurn` 卡可接著聊（同一筆繼續更新）；一次問答的卡顯示當時的 user 內容與結果，表單回到預設值，再送出就是新的一筆。
- **何時存**：每次回答結束（成功、使用者停止、出錯但已收到部分文字）都 `saveConversation`；一次問答的卡每次送出是新的一筆；`multiTurn` 卡在同一段對話內共用一筆，「開始新對話」才開新的一筆。舊的 `gft:card:*` 讀寫拿掉，不做搬移（尚未上線）。
- **配色與字**（CSS 變數，亮色＝設計稿；深色用 `prefers-color-scheme: dark`）：底 `#FBF7F0`／`#16181D`、卡片 `#FFFFFF`／`#20232A`、線 `#E8E0D2`／`#343843`、字 `#1F2430`／`#ECEEF2`、次要字 `#4A5060`／`#A9AFBC`、主色 `#2F4FA8`／`#8FA8F0`、主色淺底 `#EEF2FB`／`#252E45`、提醒底 `#FFF1DC`／`#3A2F1C`。內文 16–18px、按鈕高 ≥ 48px、圓角 14–18px。字型只用系統字：內文 `system-ui, "PingFang TC", "Microsoft JhengHei", sans-serif`；標題 `"Noto Serif TC", "Songti TC", "PMingLiU", serif`（**不載入任何外部字型**，設計稿的 Google Fonts 連結不准照抄）。

### estimateTokens（照抄）

- 中日韓字（U+2E80–9FFF、3000–303F、3040–30FF、3400–4DBF、AC00–D7AF、F900–FAFF、FF00–FFEF）每字算 1。
- 以空白斷詞，其餘 ASCII 每 4 字元算 1（無條件進位）。
- 每則訊息和 instructions 各再加 8；每張圖片加 `IMAGE_TOKEN_ESTIMATE`（1,500）。

## 第 4 輪：好用度＋去識別化（框架 Opus 2026-11-19）

純函式的行為以各檔檔頭註解和測試為準；本節只寫畫面怎麼接。第 3 輪的版面與行為全部保留。

1. **回答標註**：按下送出時記開始時間；每次存檔時（成功、停止、出錯但有部分文字），那則 assistant 訊息帶 `meta: { model, ms: 現在 − 開始, usage: 成功時用 ChatResult.usage、否則 null, incompleteReason }`。畫面：`multiTurn` 對話串每則回答下方小字 `formatMeta(meta, 模型 label)`；一次問答的卡把結果下方「使用 {模型}」換成 `formatMeta`（產生中、或舊紀錄沒有 meta 時維持「使用 {模型}」）。模型 label 用 `selectableModels()` 查，查不到用 id。
2. **下載與匯出**：一次問答的卡在結果區「複製」旁加「下載 .md」；`multiTurn` 卡在「開始新對話」旁加「匯出整段對話」。兩者都用目前這筆紀錄跑 `conversationToMarkdown(紀錄, card.title, labelOf)`，檔名 `exportFileName(紀錄.title, Date.now())`，用 `Blob`（`text/markdown;charset=utf-8`）＋`<a download>` 下載後 `URL.revokeObjectURL`。還沒有紀錄時按鈕停用。
3. **字數與 token 預估**：每個 textarea 下方的計數改成「{字數} / {上限} 字・約 {tokens} tokens」（沒有上限就省略「/ 上限」），用 `textStats`。
4. **長文折疊**：對話串與「當時的輸入」裡的 **user** 訊息，`foldText(...).folded` 為 true 時只顯示 `preview`＋按鈕「展開全文（共 N 字）」，展開後按鈕變「收起」。回答不折疊。
5. **讀入 .txt／.md**：每個 textarea 下方加按鈕「讀入 .txt／.md」（隱藏的 `<input type="file" accept=".txt,.md,.markdown,text/plain,text/markdown">`）。依序檢查：`isAcceptedTextFile(檔名)`，否則顯示「只能讀入 .txt 或 .md 檔」；`file.size > MAX_TEXT_FILE_BYTES` 顯示「檔案太大（上限 1 MB）」；`decodeTextBytes` 丟錯就顯示錯誤訊息；解碼後 `.length` 超過該欄 `maxChars` 顯示「檔案有 N 字，超過這欄上限 M 字，請先刪減。」不截斷。欄位原本有字時先 `confirm("要用檔案內容取代目前的文字嗎？")`。只填入欄位，**不自動送出**。
6. **錯誤訊息與重試**：`QuotaRefusedError` 維持第 3 輪的詳細訊息；其他錯誤改用 `describeError(e, navigator.onLine).message`。`retryable` 為 true 時錯誤訊息旁顯示「重試」鈕，行為同「再來一次」（重送 lastRequest，跳過去識別化檢查）。**不做自動重試。** `incompleteReason === "max_output_tokens"` 的狀態文字改成「回答太長被截斷（已達輸出上限）」，其他原因維持「回答未完成：{原因}」。
7. **編輯重送**（只限 `multiTurn` 卡）：對話串每則 user 訊息加「編輯」鈕（產生中不顯示）。按下後該則變成 textarea（預填原內容）＋「重新送出」「取消」。重新送出：`messages = editUserMessage(目前 messages, index, 新內容)`，instructions 用 `renderCard(card, values).instructions`，接著照一般送出流程（同一筆紀錄覆蓋，之後的對話丟掉）。`editUserMessage` 丟錯就顯示訊息，不送出。
8. **送出前去識別化**（所有卡片）：按「開始」或「重新送出」時，對要送出的文字跑偵測——「開始」用 `scanFields(values, 所有 textarea 與 text 欄位 id)`，「重新送出」用 `detectPII(新內容)`。有命中就不送出，在送出鈕上方顯示提示框（`role="alertdialog"`，用頁內元件，不用 `window.confirm`）：
   - 標題「送出前請確認：找到可能的個資」；逐條列出 `{PII_LABEL[type]}：{text}`；最後一行固定顯示 `PII_NAME_HINT`。
   - 三個按鈕：「遮蔽後送出」（開始：`maskFields` 後把遮好的值寫回表單再送；重新送出：`maskPII(新內容, detectPII(新內容)).text`）、「照原文送出」、「返回修改」（關閉提示，不送）。
   - 代號對照表不存、不顯示、不送出；回答裡的代號不還原。「再來一次」「重試」不再檢查。
   - 沒有命中就直接送出，不顯示任何東西。
9. **紀錄**：assistant 的 `meta` 跟著 `saveConversation` 存；舊紀錄沒有 `meta` 照常顯示。

第 4 輪 PROOF：`npm test && npm run typecheck && npm run build`，共 75 條（第 3 輪 51＋openai 3＋pii 7＋errors 4＋text 10）。

## 第 5 輪：生活卡片、東西放哪、語音（框架 Opus 2026-11-19）

純函式的行為以各檔檔頭註解和測試為準；本節只寫畫面怎麼接。第 3、4 輪的版面與行為全部保留（兩張新卡自動適用去識別化、標註、匯出等）。

1. **卡片固定提醒與連結**（所有卡片通用，不准判斷卡片 id）：`card.links` 有值時，在卡片頁說明下方列出連結（新分頁、`rel="noopener noreferrer"`）。`card.footer` 有值時，一次問答的卡在結果下方、`multiTurn` 卡在每則 assistant 訊息下方，用提醒框樣式（米黃底）顯示 footer；產生中也顯示。footer 不送給模型、不存進紀錄、不放進匯出的 .md。
2. **首頁**：分類照 `CATEGORIES`（新增「生活」，兩張新卡會自動出現）。分類之後加一區「生活工具」，裡面一個按鈕「東西放哪」（badge「放」、短說明「記下東西放哪，忘了問它」），點了進新頁面 `where`。分享進來時（`pendingShare !== null`）不顯示這區。`where` 頁頂端的分頁列「首頁」標成目前頁；產生中不能離開（沿用 busy）。
3. **語音輸入**（`dictationSupported()` 為 true 才顯示）：卡片頁每個 textarea 與 `multiTurn` 底部輸入框、東西放哪兩個輸入框旁加麥克風鈕（`aria-label="語音輸入"`）。按下 `startDictation`，收音中鈕變「停止」；`onText` 用 `appendDictation(目前值, 文字)` 寫回欄位（寫回後仍受 maxChars 檢查，不截斷）；`onError` 顯示訊息。同一時間只能一個欄位收音；產生中不能按。有麥克風鈕的頁面在第一個麥克風下方小字顯示一次 `VOICE_NOTICE`。
4. **朗讀**（`speechSupported()` 為 true 才顯示）：一次問答的卡結果區「複製」旁加「朗讀」；`multiTurn` 每則 assistant 訊息下方加「朗讀」；東西放哪的答案與存檔告知旁加「朗讀」。按下 `speak(文字)`，朗讀中按鈕變「停止朗讀」（`stopSpeaking`）；離開頁面或開始新的朗讀時先 `stopSpeaking`。產生中的回答不能朗讀。footer 不念。
5. **東西放哪頁**（新檔 `src/ui/WherePage.tsx`，規則全部呼叫 `src/where/*`，不准在畫面重寫）：
   - 標題「東西放哪」，副標「只存在這台裝置，最多 100 筆」＋目前筆數「N／100 筆」。
   - **記一筆**：textarea（上限 `WHERE_TEXT_MAX` 字，placeholder「例：健保卡放在客廳電視櫃第二層」）＋麥克風＋「整理」。按「整理」：先 `splitLocal(文字)`；拿到結果就進確認表單。拿不到：顯示 `WHERE_AI_CONFIRM`（{what}＝「這句話」）與兩個按鈕「送給 AI 整理」「自己填」。「送給 AI 整理」用 `streamChat`（model `WHERE_AI_MODEL`、instructions `WHERE_SPLIT_INSTRUCTIONS`、messages `[{ role: "user", content: splitUserMessage(文字) }]`、effort `WHERE_AI_EFFORT`、maxOutputTokens `WHERE_SPLIT_MAX_OUTPUT`），結束後 `parseSplitReply`；null 就顯示「AI 沒有看懂，請自己填」並進空白表單。「自己填」進空白表單（名稱預填空、位置預填空）。
   - **確認表單**：「東西」「位置」兩個輸入框（預填）＋「儲存」「取消」。表單上方預告：`findSameItem(名稱)` 找到 →「「{舊名稱}」之前記在「{舊位置}」，儲存後會改成新位置。」；沒找到且已有 100 筆 →「已經記滿 100 筆，儲存後會刪掉最久沒更新的「{名稱}」。」（名稱改動時即時更新預告）。按「儲存」：`applySave(目前全部, { name, location, raw: 原句 }, Date.now(), crypto.randomUUID())` → `saveWhereItems(result.items)` → 顯示 `saveNote(...)`（`role="status"`）並清空輸入；`applySave` 丟錯就顯示訊息不存。
   - **找東西**：輸入框＋麥克風＋「找」。沒有任何紀錄時顯示「還沒有記錄任何東西」。`localConfident` 為 true → 顯示 `localAnswer`，下方小字「本機找到，沒有用到 AI」。否則顯示 `WHERE_AI_CONFIRM`（{what}＝「清單裡 N 筆的名稱與位置和你的問題」）、「送給 AI 找」「不用了」；`localFind` 有結果時，同時列出前 3 筆 `answerLine` 當「本機可能的結果」。「送給 AI 找」用 `streamChat`（instructions `WHERE_FIND_INSTRUCTIONS`、user `findUserMessage(問題, 全部)`、maxOutputTokens `WHERE_FIND_MAX_OUTPUT`，其餘同上），回答串流顯示，下方小字「AI 回答，請以實際位置為準」。
   - **清單**：依 `updatedAt` 新的在前，每列「名稱」「位置」「更新時間（今天 HH:mm，其他 M/D，台灣時區）」＋刪除鈕（要 `confirm`）。不做編輯（同名再記一次就是更新）。
   - AI 呼叫的錯誤處理同卡片頁：`QuotaRefusedError` 用第 3 輪的詳細訊息，其他用 `describeError(e, navigator.onLine).message`；不做自動重試；提供「停止」鈕（AbortController）。AI 呼叫不存進對話紀錄、不跑去識別化檢查（已先經使用者確認要送）。結束後呼叫 `onQuota` 更新額度。
6. **設定頁**：「使用告知」會自動多出 `voice` 那條（`NOTICES` 已加，mustAck 為 false，不改 `NOTICE_VERSION`）。

第 5 輪 PROOF：`npm test && npm run typecheck && npm run build`，共 102 條（第 4 輪 75＋cards 3＋where 14＋where-store 4＋speech 6）。

## 不准做

- 不准加任何 tools、web_search、file_search，也不准做讓使用者自己輸入模型名稱的欄位。
- 不准為個別卡片寫專用邏輯，全部走 cards.ts 的設定。
- 不准改 `src/config/*`、`src/quota/plan.ts`、`src/api/openai.ts`、`src/text/pii.ts`、`src/where/rules.ts`、`src/where/ai.ts`、`tests/` 底下任何檔案，也不准改上述與第 4 輪各檔的函式簽名、型別與檔頭註解；覺得有問題就停下回報。
- 不准打真的 OpenAI API，測試一律 mock。
- 不准加後端、分析追蹤、第三方 CDN 或外部字型；程式對外只准連 api.openai.com。

## 路線圖（Opus 2026-11-19 重新規劃）

- **第一版**：上面 12 張卡＋手機分享＋圖片輸入。分兩輪實作：第 1 輪邏輯、第 2 輪畫面。
- **第二版**（學習工具，要專用畫面）：單字卡（本機複習）、依教材出題（本機評分）、讀書筆記心智圖（markmap，MIT）、拍題目講解解題步驟（要提醒自行驗算）。
- **第三版**：欄位抽取（JSON schema）、字幕翻譯、PDF 雙語對照。
- **第 4 輪（已定）**：編輯重送（multiTurn 卡）、每則回答標註模型／用時／tokens、下載 .md 與匯出整段對話、長文折疊＋字數與 token 預估、讀入 .txt／.md 檔、錯誤訊息補 429／內容過長／斷線重試、送出前去識別化（移植 law `src/ai/pii.js`：身分證、電話、Email、統編偵測＋一鍵遮蔽，所有卡片共用；人名偵測不到，提示改寫成甲、乙）。
- **第 5 輪（已定，使用者 2026-11-19；畫面規格見上方「第 5 輪」小節）**：
  - 「諮詢前整理」卡：情境 → 時間軸、已知／待補事實、該準備的證據文件、要問的問題清單、可詢問單位（法扶、調解會、勞工局、消保官等）。不判斷合法與否、不寫條號、不估金額與期限；「法律常有期限，請盡快確認」由程式固定附上。預設 sol。
  - 「條文白話」卡：使用者自己貼條文 → 白話、要件、效果、用語解釋（沿用 law F30 提示詞）；說明附全國法規資料庫連結。
  - 「東西放哪」頁（首頁「生活工具」入口，獨立頁）：最多 100 筆；同名覆蓋並告知舊位置（比對沿用 where `sameThing`：互相包含且長度比 ≥ 0.6，單字名稱須完全相同）；滿 100 筆換掉最久沒更新的並告知；記錄時本機先拆「東西／位置」，拆不出來才問 luna，存檔前確認；找東西本機加權搜尋優先（沿用 where `localFind`／`localConfident`），沒把握才送精簡清單給 luna。只有用到 AI 時才分享位置，要告知。
  - 語音：Web Speech API，卡片輸入框與「東西放哪」加麥克風，結果可朗讀（speechSynthesis）；瀏覽器不支援就不顯示。新增告知：語音辨識由瀏覽器處理，Chrome 送 Google、Safari 送 Apple。不用 OpenAI 轉錄 API（不在免費額度內）。
- **選項（有需求再做）**：常用法規包：內建約 20 部常用法律（壓縮後估 1 MB 內），AI 列條號 → 本機依「法規名＋條號」取條文、查不到剔除 → AI 只依取出的條文說明。不做完整法規下載（法律 37.5 MB＋搜尋引擎＋每週同步，等於搬整個 law）。
- **不做**：需要聯網的（新聞、股價、只貼網址的翻譯）、生圖、以私密資料為主的（會議紀錄、合約、病歷、報稅）、法律結論式諮詢（沒有法規資料又不能聯網，條號與修法狀態無法查證）。
- **參考專案**：目前不下載。ChatGPTBox（MIT）是瀏覽器擴充套件，我們用不上；心智圖直接用 markmap 的 npm 套件。
- **調研依據**：collab/from-codex.md、collab/from-sonnet-research.md（2026-11-19，不進版控）。

## 上線前（Opus／使用者）

- terra：使用者 2026-11-19 在 Usage 後台確認處理層級為「資料分享獎勵等級」，`verified` 已改 true。astra 等明天 08:00 重置後再測。
- astra：使用者 2026-11-20 在 Usage 後台確認處理層級為「資料分享獎勵等級」（sol＋astra 共 113 請求全在該層級），`verified` 已改 true。注意 GPT-6.2 Astra／Sol（11/18 推出）不在免費清單，不要加入。
- 發佈：先建私人 repo，檢查沒有信箱、金鑰後，由使用者決定是否公開，再開 GitHub Pages。
