// 帳號設定步驟的唯一來源：app 內「設定教學」頁從這裡取。docs/SETUP.md 要與此同步。
// 依據 platform.openai.com 2026-11-20 的畫面（Settings → Organization）。

import { SHARING_LINKS, type NoticeLink } from "./notices";

export interface SetupStep {
  id: string;
  title: string;
  where: string; // 畫面路徑
  steps: string[];
  warn?: string;
  links?: readonly NoticeLink[];
}

export const SETUP_STEPS: readonly SetupStep[] = [
  {
    id: "topup",
    title: "1. 儲值 5 美元，並關閉自動加值",
    where: "platform.openai.com → 右上齒輪 Settings → Organization → Billing",
    steps: [
      "按「Add payment details」綁信用卡。",
      "按「Add to credit balance」，金額填 5（最低儲值額）。",
      "「Auto recharge（自動加值）」務必保持關閉。",
    ],
    warn:
      "關閉自動加值後，就算哪天真的被收費，最多只會用掉這 5 美元，不會再從信用卡扣款。這是最可靠的一道保險。",
  },
  {
    id: "limits",
    title: "2. 設定支出上限與提醒信",
    where: "Settings → Organization → Limits",
    steps: [
      "頁面頂端的標籤就是你的方案（例如 Build），回到本程式設定頁選同一個。",
      "Organization spend limit → Edit spend limit → 填 1（美元）。",
      "Spend alerts → Add alert，各加一條 80% 和 100%，超過時會寄信給你。",
    ],
    warn:
      "OpenAI 的支出上限標示「Limit not enforced」：到達上限不會擋下請求，只是提醒。真正的保險是第 1 步的「只儲值 5 美元、不自動加值」，加上本程式的自動卡額度。",
  },
  {
    id: "share",
    title: "3. 開啟資料共享，拿每日免費額度",
    where: "Settings → Organization → Data controls → Sharing",
    steps: [
      "找到最下面的「Share inputs and outputs with OpenAI」，選「Enabled for all projects」。",
      "確認上方出現「You're enrolled for complimentary daily tokens.」。",
      "上面兩項（model feedback、evaluation and fine-tuning）維持 Disabled 即可，跟免費額度無關。",
    ],
    warn:
      "沒有出現「You're enrolled…」代表你目前不符資格，每一筆都會收費，請不要使用本程式。開啟後你送出的內容 OpenAI 可用於訓練，不要輸入私密資訊。",
    links: SHARING_LINKS,
  },
  {
    id: "key",
    title: "4. 建立 API 金鑰",
    where: "Settings → Organization → API keys",
    steps: [
      "按「Create new secret key」，名稱隨意（例如 free-tier-app），Project 選 Default project。",
      "複製金鑰（只會顯示一次），貼到本程式設定頁。",
      "如果第 3 步選的是「Enabled for selected projects」，金鑰所屬的專案必須在名單內，否則不算免費。",
    ],
    warn: "金鑰等於你的付款權限，不要傳給別人、不要貼在聊天內容裡。外洩時立刻到同一頁刪除。",
  },
  {
    id: "verify",
    title: "5. 第一次使用後確認真的沒扣款",
    where: "platform.openai.com → 左側 Analytics → 使用情況",
    steps: [
      "送出一兩則訊息，等幾分鐘。",
      "往下找到「處理層級」分頁，應該只出現「資料分享獎勵等級」；「模型」分頁可以看各模型的用量。",
      "回到總覽，總支出應為 US$0.00。若出現費用，立刻停用並檢查第 3 步。",
    ],
  },
];
