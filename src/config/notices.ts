// 告知文字的唯一來源：首次使用同意頁、設定頁、送出前提示都從這裡取。README 的「使用前必讀」要與此同步。
// 改這裡的內容 = 改使用者看到的承諾，修改時兩邊一起改。

export const NOTICE_VERSION = "2026-11-19"; // 內容有實質變動就改日期，使用者需重新勾選同意

/** 外部連結用 https 網址；程式內頁面用 "#doc/<id>"（目前只有 #doc/openai-sharing＝docs/openai-sharing.zh-TW.md）。 */
export interface NoticeLink {
  label: string;
  href: string;
}

/** 資料共享官方說明：英文原文＋程式內中文摘要頁 */
export const SHARING_LINKS: readonly NoticeLink[] = [
  {
    label: "官方說明（英文原文）",
    href: "https://help.openai.com/en/articles/10306912-sharing-feedback-evaluation-and-fine-tuning-data-and-api-inputs-and-outputs-with-openai",
  },
  { label: "中文重點摘要（非官方，以原文為準）", href: "#doc/openai-sharing" },
];

export interface Notice {
  id: string;
  title: string;
  body: string;
  /** true＝首次使用時必須逐條勾選才能進入 */
  mustAck: boolean;
  links?: readonly NoticeLink[];
}

export const NOTICES: readonly Notice[] = [
  {
    id: "topup",
    title: "需要先儲值 5 美元，並關閉自動加值",
    body:
      "OpenAI 規定帳戶要有正的餘額才能使用 API 與免費額度。" +
      "本程式只在免費額度內送出，正常使用不會扣到餘額，但你仍需先在 Billing 儲值（最低 5 美元）。" +
      "請務必關閉 Auto recharge，萬一被收費最多只損失這筆儲值。" +
      "OpenAI 的支出上限（spend limit）不會擋下請求，不能當作保險。步驟見「設定教學」。",
    mustAck: true,
  },
  {
    id: "share",
    title: "必須開啟「Share inputs and outputs with OpenAI」",
    body:
      "免費額度只給「與 OpenAI 共享資料」的流量。請由組織擁有者到 platform.openai.com 的 Data controls → Sharing 開啟，" +
      "並確認畫面出現「You're enrolled for complimentary daily tokens」。" +
      "沒看到這句代表你的帳號目前不符資格，送出的每一筆都會照原價收費，請不要使用本程式。",
    mustAck: true,
    links: SHARING_LINKS,
  },
  {
    id: "privacy",
    title: "不適合處理私密資訊",
    body:
      "開啟共享後，你送出的所有內容（含問題、附件、回答）OpenAI 可用於改進與訓練模型。" +
      "請不要輸入個人資料、帳號密碼、金鑰、客戶資料、公司機密、病歷、財務明細等任何不想被第三方看到的內容。",
    mustAck: true,
  },
  {
    id: "no-web",
    title: "無法聯網查詢",
    body:
      "本程式不啟用任何工具（含網路搜尋），因為工具不在免費範圍內。回答只來自模型的訓練資料，" +
      "可能過時或錯誤，即時資訊（新聞、股價、天氣）請另外查證。",
    mustAck: true,
  },
  {
    id: "models",
    title: "只能使用以下模型",
    body:
      "僅限 OpenAI 公告列入免費額度、且作者已實測確認不扣款的模型（見模型選單）。不能自行輸入其他模型名稱。",
    mustAck: false,
  },
  {
    id: "quota",
    title: "自動卡額度，寧可拒絕也不超額",
    body:
      "OpenAI 逐筆判斷：一筆請求只要讓當天總量超過額度，整筆照原價收費。" +
      "所以每次送出前，本程式會預先保留「預估輸入＋回答上限」，最後 5% 不放行；剩餘不足就直接拒絕。" +
      "額度每天台灣時間 08:00（UTC 00:00）重置。",
    mustAck: false,
  },
  {
    id: "device-only",
    title: "額度計數只看得到這台裝置",
    body:
      "本程式無法讀取 OpenAI 後台用量。同一個組織若在其他裝置、Playground 或其他程式也有使用，" +
      "請在設定頁填入「今天在其他地方已用量」，否則計數會偏低而可能超額。多台裝置共用同一組金鑰時風險最高。",
    mustAck: true,
  },
  {
    id: "tier",
    title: "請選對你的方案",
    body:
      "Build 方案每日：大模型組 25 萬、小模型組 250 萬 tokens；Launch／Grow 方案：100 萬、1,000 萬。" +
      "預設是最保守的 Build。不確定就維持 Build，選錯成較大的方案會超額付費。",
    mustAck: false,
  },
  {
    id: "key-local",
    title: "金鑰只存在你自己的瀏覽器",
    body:
      "API 金鑰只存在這台裝置的瀏覽器儲存空間，請求直接從瀏覽器送到 api.openai.com，不經過任何其他伺服器。" +
      "清除瀏覽器資料會一併刪除金鑰與對話。共用電腦請不要使用，或用完到設定頁刪除金鑰。",
    mustAck: false,
  },
  {
    id: "no-warranty",
    title: "免責",
    body:
      "OpenAI 可能在提前 30 天通知後終止免費計畫或更改規則，本程式不保證即時更新。" +
      "請定期到 Usage 後台確認費用為 0。本程式依 MIT 授權「現狀」提供，費用由使用者自行負責。",
    mustAck: true,
  },
  {
    id: "voice",
    title: "語音輸入由瀏覽器處理",
    body:
      "按麥克風說話時，聲音由瀏覽器內建的語音辨識處理：Chrome 會送到 Google、Safari 會送到 Apple，不經過本程式也不經過 OpenAI。" +
      "辨識出的文字填進欄位後，送出時才會照常分享給 OpenAI。朗讀回答在你的裝置上進行。瀏覽器不支援時不會出現麥克風按鈕。",
    mustAck: false,
  },
];

/** 麥克風按鈕旁的一行小字（第 5 輪）。與 NOTICES 的 voice 一致。 */
export const VOICE_NOTICE = "語音辨識由瀏覽器處理：Chrome 送 Google、Safari 送 Apple。";

/** 「東西放哪」要用 AI 前的確認文字（第 5 輪）。{what} 由畫面換成「這句話」或「清單裡 N 筆的名稱與位置和你的問題」。 */
export const WHERE_AI_CONFIRM = "本機沒把握。要把{what}送給 AI 嗎？會分享給 OpenAI，並使用小模型組額度。";
