import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { estimateRequestTokens, IMAGE_TOKEN_ESTIMATE, OpenAIHttpError, QuotaRefusedError, StreamInterruptedError, streamChat, type ChatRequest } from "../src/api/openai";
import { reserve, settleReservation } from "../src/quota/store";
import type { PlanResult } from "../src/quota/plan";

vi.mock("../src/quota/store", () => ({ reserve: vi.fn(), settleReservation: vi.fn() }));
const reservation = { id: "test", group: "small" as const, tokens: 2_300, expiresAt: 9_999_999_999_999 };
const allowed: PlanResult = {
  ok: true, group: "small", limit: 2_375_000, usedBefore: 0, needInput: 1_300,
  maxOutputTokens: 1_000, reservation,
};
const req: ChatRequest = {
  apiKey: "test-key", tier: "build", model: "gpt-5.6-luna", instructions: "請回答",
  messages: [{ role: "user", content: "你好" }], reasoningEffort: "low", maxOutputTokens: 32_000,
};
const completed = { type: "response.completed", response: { usage: { input_tokens: 12, output_tokens: 34 } } };
const fetchMock = vi.fn<typeof fetch>();
function sse(events: unknown[], chunkSize = 1): Response {
  const bytes = new TextEncoder().encode(events.map((event) => `data: ${JSON.stringify(event)}\r\n\r\n`).join(""));
  let offset = 0;
  return new Response(new ReadableStream<Uint8Array>({
    pull(controller) {
      if (offset === bytes.length) return controller.close();
      // 預設單位元組拆包也會拆開 UTF-8 與 CRLF。
      const end = Math.min(offset + chunkSize, bytes.length);
      controller.enqueue(bytes.slice(offset, end));
      offset = end;
    },
  }));
}
function run(request = req, onDelta: (text: string) => void = vi.fn(), signal = new AbortController().signal) {
  return streamChat(request, onDelta, signal);
}
function body() {
  return JSON.parse(fetchMock.mock.calls[0][1]?.body as string);
}
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal("fetch", fetchMock);
  vi.mocked(reserve).mockResolvedValue(allowed);
  vi.mocked(settleReservation).mockResolvedValue(undefined);
  fetchMock.mockResolvedValue(sse([completed]));
});
afterEach(() => vi.unstubAllGlobals());

describe("Responses API", () => {
  it("request body 只含白名單欄位", async () => {
    await run();
    expect(fetchMock.mock.calls[0][0]).toBe("https://api.openai.com/v1/responses");
    expect(fetchMock.mock.calls[0][1]).toMatchObject({
      method: "POST", headers: { Authorization: "Bearer test-key", "Content-Type": "application/json" },
    });
    expect(Object.keys(body()).sort()).toEqual(["model", "instructions", "input", "reasoning", "max_output_tokens", "stream", "store"].sort());
    expect(body()).toEqual({
      model: req.model, instructions: req.instructions, input: req.messages,
      reasoning: { effort: "low" }, max_output_tokens: 1_000, stream: true, store: false,
    });
    expect(reserve).toHaveBeenCalledWith(req.tier, req.model, estimateRequestTokens(req.instructions, req.messages), 32_000, expect.any(Number));
  });

  it("清單外模型不呼叫 fetch", async () => {
    for (const model of ["unknown", "gpt-6.2-astra", "gpt-6.2-sol"]) {
      await expect(run({ ...req, model })).rejects.toThrow("模型未在已核對清單內");
    }
    expect(fetchMock).not.toHaveBeenCalled();
    expect(reserve).not.toHaveBeenCalled();
    expect(settleReservation).not.toHaveBeenCalled();
  });

  it("額度不足丟 QuotaRefusedError 且不呼叫 fetch", async () => {
    vi.mocked(reserve).mockResolvedValue({ ok: false, reason: "quota_exhausted", group: "small", limit: 100, usedBefore: 99, needInput: 10 });
    await expect(run()).rejects.toBeInstanceOf(QuotaRefusedError);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(settleReservation).not.toHaveBeenCalled();
  });

  it("completed 事件的 usage 傳給 settle", async () => {
    const onDelta = vi.fn();
    fetchMock.mockResolvedValueOnce(sse([
      { type: "response.created" },
      { type: "response.output_text.delta", delta: "你好" },
      { type: "response.output_text.delta", delta: "！" }, completed,
    ]));
    expect(await run(req, onDelta)).toEqual({ text: "你好！", usage: { input: 12, output: 34 }, incompleteReason: null });
    expect(onDelta.mock.calls).toEqual([["你好"], ["！"]]);
    expect(settleReservation).toHaveBeenLastCalledWith(reservation, { input: 12, output: 34 }, expect.any(Number));
    fetchMock.mockResolvedValueOnce(sse([{ type: "response.incomplete", response: {
      usage: { input_tokens: 3, output_tokens: 4 }, incomplete_details: { reason: "max_output_tokens" },
    } }]));
    expect(await run()).toEqual({ text: "", usage: { input: 3, output: 4 }, incompleteReason: "max_output_tokens" });
    expect(settleReservation).toHaveBeenLastCalledWith(reservation, { input: 3, output: 4 }, expect.any(Number));
  });

  it("HTTP 500 → settle(null)", async () => {
    fetchMock.mockResolvedValueOnce(new Response("server error", { status: 500 }));
    await expect(run()).rejects.toThrow("HTTP 500");
    expect(settleReservation).toHaveBeenLastCalledWith(reservation, null, expect.any(Number));
    for (const event of [{ type: "response.failed", response: { error: { message: "failed" } } }, { type: "error", message: "failed" }]) {
      fetchMock.mockResolvedValueOnce(sse([event]));
      await expect(run()).rejects.toThrow("failed");
      expect(settleReservation).toHaveBeenLastCalledWith(reservation, null, expect.any(Number));
    }
    fetchMock.mockResolvedValueOnce(sse([]));
    await expect(run()).rejects.toThrow("中斷");
    expect(settleReservation).toHaveBeenLastCalledWith(reservation, null, expect.any(Number));
    fetchMock.mockResolvedValueOnce(sse([{ type: "response.completed", response: {} }]));
    expect((await run()).usage).toBeNull();
    expect(settleReservation).toHaveBeenLastCalledWith(reservation, null, expect.any(Number));
    // 線上時的網路錯誤：可能已送達 OpenAI，整筆計入
    fetchMock.mockRejectedValueOnce(new TypeError("network unavailable"));
    await expect(run()).rejects.toThrow("network unavailable");
    expect(settleReservation).toHaveBeenLastCalledWith(reservation, null, expect.any(Number));
    // 確定離線：請求不可能送達，記 0
    vi.stubGlobal("navigator", { onLine: false });
    fetchMock.mockRejectedValueOnce(new TypeError("network unavailable"));
    await expect(run()).rejects.toThrow("network unavailable");
    expect(settleReservation).toHaveBeenLastCalledWith(reservation, { input: 0, output: 0 }, expect.any(Number));
    vi.unstubAllGlobals();
  });

  it("abort 中途 → settle(null)", async () => {
    const controller = new AbortController();
    fetchMock.mockResolvedValueOnce(sse([{ type: "response.output_text.delta", delta: "部分" }, completed], 10_000));
    await expect(run(req, () => controller.abort(), controller.signal)).rejects.toMatchObject({ name: "AbortError" });
    expect(settleReservation).toHaveBeenCalledTimes(1);
    expect(settleReservation).toHaveBeenCalledWith(reservation, null, expect.any(Number));
  });

  it("有圖片時 content 為 input_text＋input_image 陣列", async () => {
    const images = ["data:image/jpeg;base64,AAA", "data:image/jpeg;base64,BBB"];
    await run({ ...req, messages: [{ role: "user", content: "翻譯", images }, { role: "assistant", content: "好" }] });
    expect(body().input).toEqual([
      { role: "user", content: [{ type: "input_text", text: "翻譯" }, ...images.map((image_url) => ({ type: "input_image", image_url }))] },
      { role: "assistant", content: "好" },
    ]);
  });

  it("估算含圖片：一則訊息一張圖 = 文字估算 + 8 + 1500", () => {
    const content = "中文 abcde ab あ 한 Ａ"; // 5 個中日韓字，其他詞各自進位為 2、1。
    const textOnly = estimateRequestTokens("", [{ role: "user", content }]);
    expect(textOnly).toBe(8 + 8 + 5 + 2 + 1);
    expect(estimateRequestTokens("", [{ role: "user", content, images: ["data:image/jpeg;base64,AAA"] }]))
      .toBe(8 + (5 + 2 + 1) + 8 + 1500);
    expect(IMAGE_TOKEN_ESTIMATE).toBe(1500);
    expect(estimateRequestTokens("", [{ role: "user", content, images: ["a", "b"] }])).toBe(textOnly + 3000);
  });
});

describe("第 4 輪：錯誤類別與 meta", () => {
  it("HTTP 錯誤丟 OpenAIHttpError，帶 status 與 code", async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ error: { code: "rate_limit_exceeded", message: "slow down" } }), { status: 429 }));
    const error = await run().catch((e) => e);
    expect(error).toBeInstanceOf(OpenAIHttpError);
    expect(error).toMatchObject({ status: 429, code: "rate_limit_exceeded", apiMessage: "slow down" });
    expect(settleReservation).toHaveBeenLastCalledWith(reservation, null, expect.any(Number));
  });
  it("串流沒有完成事件就結束丟 StreamInterruptedError", async () => {
    fetchMock.mockResolvedValueOnce(sse([{ type: "response.output_text.delta", delta: "半" }]));
    await expect(run()).rejects.toBeInstanceOf(StreamInterruptedError);
  });
  it("assistant 的 meta 不送出", async () => {
    await run({ ...req, messages: [
      { role: "user", content: "a" },
      { role: "assistant", content: "b", meta: { model: "gpt-5.6-luna", ms: 1, usage: null, incompleteReason: null } },
      { role: "user", content: "c" },
    ] });
    expect(body().input).toEqual([{ role: "user", content: "a" }, { role: "assistant", content: "b" }, { role: "user", content: "c" }]);
  });
});
