import { OpenAIHttpError, QuotaRefusedError, StreamInterruptedError } from "./openai";

// 錯誤訊息分類（第 4 輪）：把 streamChat 丟出的錯誤翻成中文說明，並標明能不能按「重試」。
// 框架：Opus 2026-11-19。實作者只填函式內容，不改名稱、參數、回傳型別與本檔註解。
//
// 不做自動重試：每次失敗（離線除外）都以保留量整筆計入今日額度，自動重試會悄悄吃掉額度。
// 畫面只在 retryable 為 true 時顯示「重試」鈕，按下才重送同一個請求。

export type ErrorKind =
  | "quota" // QuotaRefusedError：畫面沿用第 3 輪的詳細額度訊息，本函式的 message 只當備用
  | "auth" // HTTP 401
  | "rate_limit" // HTTP 429 且 code 不是 insufficient_quota
  | "no_credit" // HTTP 429 且 code === "insufficient_quota"
  | "too_long" // HTTP 400 且（code === "context_length_exceeded" 或 apiMessage 符合 /context length|too long|maximum context/i）
  | "offline" // TypeError 且 onLine === false
  | "network" // 其他 TypeError，或 StreamInterruptedError
  | "server" // HTTP 500–599
  | "other"; // 其他全部

export interface ErrorInfo {
  kind: ErrorKind;
  message: string;
  retryable: boolean;
}

/**
 * 判斷順序就是上面 ErrorKind 的順序。message 固定文字（{status} 換成實際狀態碼，其他照抄）：
 *  - quota：「今天這組的免費額度不夠這次使用。」retryable false
 *  - auth：「金鑰無效或已停用，請到設定頁重新貼上金鑰。」false
 *  - rate_limit：「請求太頻繁，OpenAI 暫時擋下。請等 1 分鐘後按「重試」。」true
 *  - no_credit：「OpenAI 帳號的額度或付款狀態有問題（insufficient_quota），請到 OpenAI 後台檢查。」false
 *  - too_long：「內容太長，超過模型能處理的長度。請刪減內容或分段送出。」false
 *  - offline：「目前沒有網路，連上後按「重試」。這次沒有計入額度。」true
 *  - network：「連線中斷。可以按「重試」；中斷的這次會以保留量計入今日額度。」true
 *  - server：「OpenAI 伺服器暫時出錯（HTTP {status}），請稍後按「重試」。」true
 *  - other：error 是 Error 就用 error.message，否則 String(error)。false
 * 其他 4xx（例如 400 但不是內容過長、403、404）歸 other，message 用 OpenAIHttpError 的 message。
 * @param onLine 呼叫端傳 navigator.onLine（測試直接給布林值）
 */
export function describeError(error: unknown, onLine: boolean): ErrorInfo {
  if (error instanceof QuotaRefusedError) return { kind: "quota", message: "今天這組的免費額度不夠這次使用。", retryable: false };
  if (error instanceof OpenAIHttpError) {
    if (error.status === 401) return { kind: "auth", message: "金鑰無效或已停用，請到設定頁重新貼上金鑰。", retryable: false };
    if (error.status === 429) return error.code === "insufficient_quota"
      ? { kind: "no_credit", message: "OpenAI 帳號的額度或付款狀態有問題（insufficient_quota），請到 OpenAI 後台檢查。", retryable: false }
      : { kind: "rate_limit", message: "請求太頻繁，OpenAI 暫時擋下。請等 1 分鐘後按「重試」。", retryable: true };
    if (error.status === 400 && (error.code === "context_length_exceeded" || /context length|too long|maximum context/i.test(error.apiMessage ?? ""))) return { kind: "too_long", message: "內容太長，超過模型能處理的長度。請刪減內容或分段送出。", retryable: false };
  }
  if (error instanceof TypeError && !onLine) return { kind: "offline", message: "目前沒有網路，連上後按「重試」。這次沒有計入額度。", retryable: true };
  if (error instanceof TypeError || error instanceof StreamInterruptedError) return { kind: "network", message: "連線中斷。可以按「重試」；中斷的這次會以保留量計入今日額度。", retryable: true };
  if (error instanceof OpenAIHttpError && error.status >= 500 && error.status <= 599) return { kind: "server", message: `OpenAI 伺服器暫時出錯（HTTP ${error.status}），請稍後按「重試」。`, retryable: true };
  return { kind: "other", message: error instanceof Error ? error.message : String(error), retryable: false };
}
