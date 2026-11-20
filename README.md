# Free Tier Chat

只用 **OpenAI「資料共享」每日免費額度** 的聊天程式。純網頁（PWA），可以加到手機或電腦主畫面。
使用你自己的 OpenAI API 金鑰，金鑰只存在你的瀏覽器，不會上傳到任何其他伺服器。

## ⚠️ 使用前必讀

**第一次使用請先照 [帳號設定步驟](docs/SETUP.md) 做完：儲值 5 美元（關閉自動加值）→ 設支出上限與提醒信 → 開啟資料共享 → 建立金鑰。**

| | |
|---|---|
| 💳 **需要先儲值** | OpenAI 規定帳戶餘額必須大於 0 才能用 API 與免費額度。正常使用不會扣到餘額，但必須先儲值。 |
| 🔓 **必須開啟資料共享** | 組織擁有者到 platform.openai.com → Data controls → Sharing，開啟 **Share inputs and outputs with OpenAI**，並確認出現 **「You're enrolled for complimentary daily tokens」**。沒有這句＝你不符資格，**每一筆都會照原價收費，請勿使用**。 |
| 🔒 **不適合私密資訊** | 開啟共享後，你送出的所有內容 OpenAI 可用於訓練模型。**不要輸入**個人資料、密碼、金鑰、客戶資料、公司機密、病歷、財務明細。 |
| 🌐 **無法聯網查詢** | 不啟用任何工具（含網路搜尋，工具不在免費範圍）。回答只來自模型訓練資料，可能過時。 |
| 🤖 **只能用以下模型** | 見下表，不能自行輸入其他模型。 |
| 🛑 **自動卡額度** | 送出前預先保留「預估輸入＋回答上限」，最後 5% 不放行，不足就拒絕。台灣時間 08:00（UTC 00:00）重置。 |
| 📱 **只算得到這台裝置** | 讀不到 OpenAI 後台用量。其他裝置、Playground、其他程式的用量，請在設定頁手動填入。 |

詳細說明：[帳號設定步驟](docs/SETUP.md)｜[注意事項](docs/NOTICES.md)｜[使用說明書](docs/MANUAL.md)

完整條款：[英文原文（OpenAI 官方）](https://help.openai.com/en/articles/10306912-sharing-feedback-evaluation-and-fine-tuning-data-and-api-inputs-and-outputs-with-openai)｜[中文重點摘要（非官方，以原文為準）](docs/openai-sharing.zh-TW.md)。
OpenAI 可能在提前 30 天通知後終止計畫，請定期到後台（Analytics → 使用情況）確認費用為 0。

## 支援模型與每日額度

| 額度組 | 模型 | Build 方案 | Launch／Grow 方案 |
|---|---|---|---|
| 大模型組 | gpt-6.1-sol、gpt-6-astra | 250,000 | 1,000,000 |
| 小模型組 | gpt-5.6-luna、gpt-5.6-terra | 2,500,000 | 10,000,000 |

同一組內的模型共用額度。程式預設 Build（最保守），不確定方案就不要改。
選單只會出現作者已實測確認不扣款的模型。

## 安裝

**公開網址**：待作者發佈後補上。

**本機執行**

1. 安裝 Node.js 後，在專案資料夾執行 `npm i`。
2. 執行 `npm run dev`。
3. 用瀏覽器開 http://localhost:5173 。

**加到手機或電腦主畫面**

- 電腦或 Android 的 Chrome：打開網址後，按網址列右邊的「安裝應用程式」圖示，或選單裡的「安裝應用程式」。
- iPhone 的 Safari：打開網址後，按下方的分享鈕，選「加入主畫面」。

## 授權

MIT，見 [LICENSE](LICENSE)。費用由使用者自行負責。
