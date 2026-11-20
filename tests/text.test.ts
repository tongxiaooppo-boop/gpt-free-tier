// 字數／折疊、讀檔、匯出、編輯重送（第 4 輪）。Opus 寫的預期值，不准改。
import { describe, expect, it } from "vitest";
import type { Conversation } from "../src/ui/history";
import { conversationToMarkdown, exportFileName, formatMeta } from "../src/text/export";
import { decodeTextBytes, isAcceptedTextFile } from "../src/text/fileText";
import { FOLD_CHARS, FOLD_PREVIEW_CHARS, foldText, textStats } from "../src/text/stats";
import { editUserMessage } from "../src/text/thread";

// 2026-11-19 14:05 台灣時間
const AT = Date.UTC(2026, 10, 19, 6, 5);
const luna = { model: "gpt-5.6-luna", ms: 3240, usage: { input: 1234, output: 567 }, incompleteReason: null };
const labelOf = (id: string) => (id === "gpt-5.6-luna" ? "luna" : id);

describe("stats", () => {
  it("textStats 字數與 token 預估", () => {
    expect(textStats("你好 hello world")).toEqual({ chars: 14, tokens: 2 + 2 + 2 });
    expect(textStats("")).toEqual({ chars: 0, tokens: 0 });
  });
  it("foldText 門檻與預覽", () => {
    const short = "字".repeat(FOLD_CHARS);
    expect(foldText(short)).toEqual({ folded: false, preview: short, chars: FOLD_CHARS });
    const long = "字".repeat(FOLD_CHARS + 1);
    expect(foldText(long)).toEqual({ folded: true, preview: "字".repeat(FOLD_PREVIEW_CHARS) + "…", chars: FOLD_CHARS + 1 });
    const emoji = "😀".repeat(FOLD_CHARS + 1);
    expect(foldText(emoji).preview).toBe("😀".repeat(FOLD_PREVIEW_CHARS) + "…");
  });
});

describe("fileText", () => {
  it("副檔名", () => {
    expect(["a.txt", "B.MD", "c.markdown"].map(isAcceptedTextFile)).toEqual([true, true, true]);
    expect(["a.docx", "a.pdf", "txt", "a.txt.exe"].map(isAcceptedTextFile)).toEqual([false, false, false, false]);
  });
  it("UTF-8（含 BOM）、UTF-16LE、換行統一", () => {
    const utf8 = new TextEncoder().encode("測試\r\n第二行\r第三行");
    expect(decodeTextBytes(utf8)).toBe("測試\n第二行\n第三行");
    expect(decodeTextBytes(new Uint8Array([0xef, 0xbb, 0xbf, ...utf8]))).toBe("測試\n第二行\n第三行");
    expect(decodeTextBytes(new Uint8Array([0xff, 0xfe, 0x2c, 0x6e, 0x66, 0x8a]))).toBe("測試");
  });
  it("Big5 退回與無法辨識", () => {
    expect(decodeTextBytes(new Uint8Array([0xb4, 0xfa, 0xb8, 0xd5]))).toBe("測試");
    // 「測」＋截斷的雙位元組字：UTF-8 與 Big5 都不合法（0xFF 這類位元組 Node 的 Big5 會靜默丟掉，不拿來測）
    expect(() => decodeTextBytes(new Uint8Array([0xb4, 0xfa, 0x81]))).toThrow("無法辨識檔案編碼，請用記事本另存成 UTF-8 再試。");
  });
});

describe("export", () => {
  it("formatMeta", () => {
    expect(formatMeta(luna, "luna")).toBe("luna · 3.2 秒 · 輸入 1,234／輸出 567 tokens");
    expect(formatMeta({ ...luna, ms: 12000, usage: null, incompleteReason: "max_output_tokens" }, "luna"))
      .toBe("luna · 12.0 秒 · 用量未知 · 未完成（max_output_tokens）");
  });
  it("conversationToMarkdown：圖片不匯出、沒有 meta 的回答只寫標題", () => {
    const conv: Conversation = {
      id: "x", cardId: "chat", title: "問天氣", model: "gpt-5.6-luna", createdAt: AT, updatedAt: AT,
      messages: [
        { role: "user", content: "今天好嗎", images: ["data:image/jpeg;base64,AAA", "data:image/jpeg;base64,BBB"] },
        { role: "assistant", content: "很好", meta: luna },
        { role: "user", content: "再一次" },
        { role: "assistant", content: "好" },
      ],
    };
    const md = conversationToMarkdown(conv, "自由對話", labelOf);
    expect(md).toBe(
      "# 問天氣\n\n- 卡片：自由對話\n- 時間：2026-11-19 14:05（台灣）\n- 內容曾送給 OpenAI 處理\n\n" +
      "## 你\n\n今天好嗎\n\n（附圖 2 張，未匯出）\n\n" +
      "## 回答（luna · 3.2 秒 · 輸入 1,234／輸出 567 tokens）\n\n很好\n\n" +
      "## 你\n\n再一次\n\n## 回答\n\n好\n"
    );
    expect(md).not.toContain("data:");
    expect(conversationToMarkdown({ ...conv, title: "" }, "自由對話", labelOf).startsWith("# 自由對話\n")).toBe(true);
  });
  it("exportFileName", () => {
    expect(exportFileName("  天氣 / 問題?  ", AT)).toBe("天氣___問題_-20261119-1405.md");
    expect(exportFileName("   ", AT)).toBe("對話-20261119-1405.md");
    expect(exportFileName("一".repeat(35), AT)).toBe("一".repeat(30) + "-20261119-1405.md");
  });
});

describe("thread", () => {
  it("editUserMessage 保留之前、換內容留圖片、丟掉之後，不改原陣列", () => {
    const messages = [
      { role: "user" as const, content: "一", images: ["data:x"] },
      { role: "assistant" as const, content: "答一" },
      { role: "user" as const, content: "二" },
      { role: "assistant" as const, content: "答二" },
    ];
    const copy = structuredClone(messages);
    expect(editUserMessage(messages, 0, "改一")).toEqual([{ role: "user", content: "改一", images: ["data:x"] }]);
    expect(editUserMessage(messages, 2, "改二")).toEqual([messages[0], messages[1], { role: "user", content: "改二" }]);
    expect(messages).toEqual(copy);
  });
  it("editUserMessage 錯誤", () => {
    const messages = [{ role: "user" as const, content: "一" }, { role: "assistant" as const, content: "答" }];
    expect(() => editUserMessage(messages, 1, "x")).toThrow("只能編輯自己送出的訊息");
    expect(() => editUserMessage(messages, 5, "x")).toThrow("只能編輯自己送出的訊息");
    expect(() => editUserMessage(messages, 0, "  ")).toThrow("內容不能是空的");
  });
});
