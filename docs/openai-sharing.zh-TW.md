# OpenAI 資料共享與每日免費額度（重點摘要）

> **這是本程式作者整理的重點，不是官方文件，也不是翻譯。一切以 OpenAI 英文原文為準：**
> [Sharing feedback, evaluation and fine-tuning data, and API inputs and outputs with OpenAI](https://help.openai.com/en/articles/10306912-sharing-feedback-evaluation-and-fine-tuning-data-and-api-inputs-and-outputs-with-openai)
> 整理依據：2026-11-19 閱讀的版本。OpenAI 可能隨時更新。

## 1. 這是什麼

- API 的輸入與輸出**預設不分享**給 OpenAI。
- 組織擁有者可以在 [Data controls → Sharing](https://platform.openai.com/settings/organization/data-controls/sharing) 開啟「分享輸入與輸出」，範圍可選全部專案或指定專案，隨時可以關掉。
- 開啟後，你送出的內容 OpenAI 可以用來評估與訓練模型。**不要送敏感、機密或個人資料。**
- 啟用 Zero Data Retention 的帳號、部分企業帳號不能參加。

## 2. 免費額度怎麼拿

- 部分組織開啟分享後符合每日免費額度資格。Sharing 頁出現 **「You're enrolled for complimentary daily tokens」** 才算加入；沒有這句就是不符資格，用量照價收費。
- 符合資格後**自動套用**，不用另外申請；只有「有分享的專案」的用量才算免費。
- **帳戶餘額必須大於 0** 才能用（所以要先儲值）。
- 微調、評估（evals）、工具使用（含網路搜尋）**不在免費範圍**。
- OpenAI 終止計畫前會提前 30 天通知。

## 3. 每日額度（本程式用到的部分）

模型分兩組，組內模型**共用**額度：

| 組別 | 本程式使用的模型 | Build 方案 | Launch／Grow 方案 |
|---|---|---|---|
| 大模型組 | gpt-6.1-sol、gpt-6-astra | 每天 25 萬 tokens | 每天 100 萬 tokens |
| 小模型組 | gpt-5.6-luna、gpt-5.6-terra | 每天 250 萬 tokens | 每天 1,000 萬 tokens |

兩組其實各還有其他舊模型，完整清單請看原文。**清單以外的模型（例如 2026-11-18 推出的 GPT-6.2 系列）一律照價收費。**

## 4. 最容易被收費的規則

- **整筆計算**：每一筆請求都會跟當天累計量比較。如果這一筆會讓總量超過額度，**整筆**都照價收費，不是只收超出的部分。
  - 例：額度 100 萬，已用 97.5 萬，下一筆 3 萬 → 這 3 萬全部收費。
- 每天 **UTC 00:00（台灣時間 08:00）** 重置。
- 本程式因此最後 5% 不放行，並在送出前預先保留「預估輸入＋回答上限」。

## 5. 怎麼確認沒被收費

到 platform.openai.com → Analytics → 使用情況：「處理層級」應只出現「資料分享獎勵等級」，總支出應為 US$0.00。免費用量會出現在「用量」，但不會出現在「費用」。

## 6. 想退出

隨時到 Sharing 頁關閉即可。只有組織擁有者看得到這個設定。
