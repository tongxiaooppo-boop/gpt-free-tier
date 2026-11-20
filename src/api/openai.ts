// 從瀏覽器直接呼叫 OpenAI Responses API（fetch + SSE），不經任何中介伺服器。
// 框架：Opus 2026-11-19。實作者只填函式內容，不得改簽名。
//
// 鐵則（違反即退件）：
// 1. 請求 body 只能有 model、instructions、input、reasoning、max_output_tokens、stream:true、store:false。
//    絕對不能有 tools、tool_choice、web_search 或任何其他欄位。
// 2. model 必須在 config/models.ts 的 selectableModels() 內，否則丟 Error 不送出。
// 3. max_output_tokens 一律用 reserve() 回傳的 maxOutputTokens，不得自行放大。
// 3b. 有 images 的 user 訊息，input 的 content 改成陣列：
//    [{ type: "input_text", text }, { type: "input_image", image_url: <data URL> }, ...]；沒有 images 時 content 直接放字串。
// 4. 呼叫順序：reserve → fetch → 依結果 settleReservation：
//    - 收到 response.completed／response.incomplete 的 usage → 傳實際 { input_tokens, output_tokens }
//    - fetch 失敗（TypeError）且 navigator.onLine === false → 傳 { input: 0, output: 0 }；其他 TypeError 照下一條傳 null
//    - 其他任何情況（HTTP 錯誤、中途 abort、串流斷掉、沒有 usage）→ 傳 null（整筆保留量計入）
//    settleReservation 必須在 finally 裡，確保一定執行。

import { selectableModels, type Tier } from "../config/models";
import { reserve, settleReservation } from "../quota/store";

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  /** 只有 user 訊息可帶；每張是長邊 ≤ 1024px 的 JPEG data URL（UI 負責壓縮） */
  images?: string[];
  /** 只有 assistant 訊息有（第 4 輪）：畫面標註與匯出用，**不送出**（input 只取 role／content／images） */
  meta?: AnswerMeta;
}

/** 一則回答的標註（第 4 輪）。 */
export interface AnswerMeta {
  model: string;
  /** 從送出到結束的毫秒數 */
  ms: number;
  usage: { input: number; output: number } | null;
  incompleteReason: string | null;
}

/** OpenAI 回 HTTP 非 2xx。code／apiMessage 取自回應 JSON 的 error.code／error.message，讀不到為 null。 */
export class OpenAIHttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string | null,
    public readonly apiMessage: string | null
  ) {
    super(`OpenAI HTTP ${status}` + (apiMessage ? `：${apiMessage}` : ""));
  }
}

/** 串流在 completed／incomplete 事件之前結束。 */
export class StreamInterruptedError extends Error {
  constructor() {
    super("OpenAI 串流在完成事件之前中斷");
  }
}

/**
 * 每張圖片的保守 token 預估。實測 luna 1024×512 約 650 tokens（2026-11-19），
 * 取 1,500 涵蓋 1024×1024 與估算誤差；寧可多保留。
 */
export const IMAGE_TOKEN_ESTIMATE = 1_500;

export interface ChatRequest {
  apiKey: string;
  tier: Tier;
  model: string;
  instructions: string;
  messages: ChatMessage[];
  reasoningEffort: "low" | "medium" | "high";
  maxOutputTokens: number | null;
}

export interface ChatResult {
  text: string;
  usage: { input: number; output: number } | null;
  /** response.incomplete 的原因（例如 max_output_tokens），完成則為 null */
  incompleteReason: string | null;
}

export class QuotaRefusedError extends Error {
  constructor(
    public readonly reason: "unknown_model" | "quota_exhausted",
    public readonly limit: number,
    public readonly usedBefore: number,
    public readonly needInput: number
  ) {
    super(`額度保護：${reason}`);
  }
}

/** 粗估輸入 tokens：中日韓字 1 字 1 token、其他每 4 字元 1 token、每則訊息 +8、每張圖 +IMAGE_TOKEN_ESTIMATE。照抄 docs/SPEC.md 的 estimateTokens。 */
export function estimateTextTokens(text: string): number {
  const cjk = /[\u2E80-\u9FFF\uAC00-\uD7AF\uF900-\uFAFF\uFF00-\uFFEF]/g;
  const cjkCount = (text.match(cjk) ?? []).length;
  const other = text.replace(cjk, "").split(/\s+/).reduce((sum, word) => sum + Math.ceil(word.length / 4), 0);
  return cjkCount + other;
}

export function estimateRequestTokens(instructions: string, messages: ChatMessage[]): number {
  const estimateText = estimateTextTokens;
  return estimateText(instructions) + 8 + messages.reduce(
    (sum, message) => sum + estimateText(message.content) + 8 + (message.images?.length ?? 0) * IMAGE_TOKEN_ESTIMATE,
    0
  );
}

export async function streamChat(
  req: ChatRequest,
  onDelta: (text: string) => void,
  signal: AbortSignal
): Promise<ChatResult> {
  if (!selectableModels().some((model) => model.id === req.model)) {
    throw new Error("模型未在已核對清單內");
  }
  const plan = await reserve(req.tier, req.model, estimateRequestTokens(req.instructions, req.messages), req.maxOutputTokens, Date.now());
  if (!plan.ok) {
    throw new QuotaRefusedError(plan.reason, plan.limit, plan.usedBefore, plan.needInput);
  }

  let usage: ChatResult["usage"] = null;
  let text = "";
  let incompleteReason: string | null = null;
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  try {
    signal.throwIfAborted();
    const input = req.messages.map((message) => {
      if (message.images?.length && message.role !== "user") {
        throw new Error("只有 user 訊息可帶圖片");
      }
      return {
        role: message.role,
        content: message.images?.length
          ? [{ type: "input_text", text: message.content }, ...message.images.map((image_url) => ({ type: "input_image", image_url }))]
          : message.content,
      };
    });
    let response: Response;
    try {
      response = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: { Authorization: `Bearer ${req.apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: req.model,
          instructions: req.instructions,
          input,
          reasoning: { effort: req.reasoningEffort },
          max_output_tokens: plan.maxOutputTokens,
          stream: true,
          store: false,
        }),
        signal,
      });
    } catch (error) {
      // 只有確定離線（請求不可能送達）才記 0；其他網路錯誤可能已送達 OpenAI 並計費，保守地整筆計入。
      if (error instanceof TypeError && !signal.aborted && typeof navigator !== "undefined" && navigator.onLine === false) {
        usage = { input: 0, output: 0 };
      }
      throw error;
    }
    signal.throwIfAborted();
    if (!response.ok) {
      let code: string | null = null;
      let apiMessage: string | null = null;
      try {
        const body = JSON.parse(await response.text());
        if (typeof body?.error?.code === "string") code = body.error.code;
        if (typeof body?.error?.message === "string") apiMessage = body.error.message;
      } catch {
        // 回應不是 JSON：只保留狀態碼
      }
      throw new OpenAIHttpError(response.status, code, apiMessage);
    }
    if (!response.body) throw new Error("OpenAI 回應缺少串流");
    reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let data: string[] = [];
    const dispatch = (): boolean => {
      if (!data.length) return false;
      const payload = data.join("\n");
      data = [];
      if (payload === "[DONE]") return false;
      const event = JSON.parse(payload);
      switch (event.type) {
        case "response.output_text.delta":
          if (typeof event.delta !== "string") throw new Error("無效的文字串流事件");
          text += event.delta;
          onDelta(event.delta);
          signal.throwIfAborted();
          return false;
        case "response.completed":
        case "response.incomplete": {
          const actual = event.response?.usage;
          if (actual && Number.isFinite(actual.input_tokens) && actual.input_tokens >= 0 &&
              Number.isFinite(actual.output_tokens) && actual.output_tokens >= 0) {
            usage = { input: actual.input_tokens, output: actual.output_tokens };
          }
          incompleteReason = event.type === "response.incomplete" ? event.response?.incomplete_details?.reason ?? null : null;
          return true;
        }
        case "response.failed":
        case "error":
          throw new Error(event.response?.error?.message ?? event.error?.message ?? event.message ?? "OpenAI 串流失敗");
        default:
          return false;
      }
    };
    while (true) {
      signal.throwIfAborted();
      const { value, done } = await reader.read();
      signal.throwIfAborted();
      buffer += decoder.decode(value, { stream: !done });
      // 逐行處理 SSE：支援 LF、CRLF、CR，以及換行與 UTF-8 字元跨 chunk。
      let newline: RegExpExecArray | null;
      while ((newline = /\r\n|\r|\n/.exec(buffer))) {
        if (!done && newline[0] === "\r" && newline.index === buffer.length - 1) break;
        const line = buffer.slice(0, newline.index);
        buffer = buffer.slice(newline.index + newline[0].length);
        if (line === "") {
          if (dispatch()) return { text, usage, incompleteReason };
        } else if (line.startsWith("data:")) {
          data.push(line.slice(5).replace(/^ /, ""));
        }
      }
      if (done) throw new StreamInterruptedError();
    }
  } finally {
    try {
      if (reader) {
        await reader.cancel().catch(() => undefined);
        reader.releaseLock();
      }
    } finally {
      await settleReservation(plan.reservation, usage, Date.now());
    }
  }
}
