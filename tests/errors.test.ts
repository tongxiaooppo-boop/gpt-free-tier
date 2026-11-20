// 錯誤訊息分類（第 4 輪）。Opus 寫的預期值，不准改。
import { describe, expect, it } from "vitest";
import { describeError } from "../src/api/errors";
import { OpenAIHttpError, QuotaRefusedError, StreamInterruptedError } from "../src/api/openai";

const kind = (e: unknown, onLine = true) => {
  const r = describeError(e, onLine);
  return [r.kind, r.retryable];
};

describe("describeError", () => {
  it("HTTP 狀態分類", () => {
    expect(kind(new OpenAIHttpError(401, "invalid_api_key", "bad key"))).toEqual(["auth", false]);
    expect(kind(new OpenAIHttpError(429, "rate_limit_exceeded", null))).toEqual(["rate_limit", true]);
    expect(kind(new OpenAIHttpError(429, null, null))).toEqual(["rate_limit", true]);
    expect(kind(new OpenAIHttpError(429, "insufficient_quota", "x"))).toEqual(["no_credit", false]);
    expect(kind(new OpenAIHttpError(400, "context_length_exceeded", null))).toEqual(["too_long", false]);
    expect(kind(new OpenAIHttpError(400, null, "Your input exceeds the context length of this model"))).toEqual(["too_long", false]);
    expect(kind(new OpenAIHttpError(503, null, null))).toEqual(["server", true]);
  });
  it("固定文字", () => {
    expect(describeError(new OpenAIHttpError(429, null, null), true).message).toBe("請求太頻繁，OpenAI 暫時擋下。請等 1 分鐘後按「重試」。");
    expect(describeError(new OpenAIHttpError(502, null, null), true).message).toBe("OpenAI 伺服器暫時出錯（HTTP 502），請稍後按「重試」。");
    expect(describeError(new TypeError("Failed to fetch"), false).message).toBe("目前沒有網路，連上後按「重試」。這次沒有計入額度。");
  });
  it("網路：離線、斷線、串流中斷", () => {
    expect(kind(new TypeError("Failed to fetch"), false)).toEqual(["offline", true]);
    expect(kind(new TypeError("Failed to fetch"), true)).toEqual(["network", true]);
    expect(kind(new StreamInterruptedError(), true)).toEqual(["network", true]);
  });
  it("額度與其他", () => {
    expect(kind(new QuotaRefusedError("quota_exhausted", 100, 90, 20))).toEqual(["quota", false]);
    expect(describeError(new OpenAIHttpError(400, "invalid_value", "Invalid value"), true)).toEqual({ kind: "other", message: "OpenAI HTTP 400：Invalid value", retryable: false });
    expect(describeError(new Error("壞了"), true)).toEqual({ kind: "other", message: "壞了", retryable: false });
    expect(describeError("字串", true)).toEqual({ kind: "other", message: "字串", retryable: false });
  });
});
