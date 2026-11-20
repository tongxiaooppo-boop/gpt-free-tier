import { afterEach, describe, expect, it, vi } from "vitest";
import {
  appendDictation,
  dictationSupported,
  speechErrorMessage,
  speechSupported,
  textForSpeech,
} from "../src/voice/speech";

afterEach(() => vi.unstubAllGlobals());

describe("語音：支援偵測", () => {
  it("dictationSupported：有 webkitSpeechRecognition 或 SpeechRecognition 才是 true", () => {
    vi.stubGlobal("window", {});
    expect(dictationSupported()).toBe(false);
    vi.stubGlobal("window", { webkitSpeechRecognition: function () {} });
    expect(dictationSupported()).toBe(true);
  });
  it("speechSupported：要有 speechSynthesis 與 SpeechSynthesisUtterance", () => {
    vi.stubGlobal("window", { speechSynthesis: {} });
    expect(speechSupported()).toBe(false);
    vi.stubGlobal("window", { speechSynthesis: {}, SpeechSynthesisUtterance: function () {} });
    expect(speechSupported()).toBe(true);
  });
});

describe("語音：純函式", () => {
  it("textForSpeech：去掉標題、清單、粗體、連結與圖片，程式碼區塊略過", () => {
    const md =
      "## 重點\n\n- **第一點**：看[說明](https://x.y)\n2. 第二點 `npm test`\n\n![圖](a.png)\n```js\nconsole.log(1)\n```\n> 引用";
    expect(textForSpeech(md)).toBe("重點\n\n第一點：看說明\n第二點 npm test\n\n（程式碼略）\n引用");
  });
  it("textForSpeech：表格分隔行刪掉、欄位用逗號連接", () => {
    expect(textForSpeech("| 原文 | 譯文 |\n|---|:---:|\n| hello | 你好 |")).toBe("原文，譯文\nhello，你好");
  });
  it("appendDictation：中文直接接、英數之間加空白、空的不動", () => {
    expect(appendDictation("", " 你好 ")).toBe("你好");
    expect(appendDictation("今天天氣", "很好")).toBe("今天天氣很好");
    expect(appendDictation("hello", "world")).toBe("hello world");
    expect(appendDictation("原本 ", "  ")).toBe("原本 ");
  });
  it("speechErrorMessage：常見錯誤碼轉中文，aborted 不顯示", () => {
    expect(speechErrorMessage("not-allowed")).toBe("麥克風權限被拒，請到瀏覽器設定允許使用麥克風");
    expect(speechErrorMessage("no-speech")).toBe("沒有聽到聲音，請再試一次");
    expect(speechErrorMessage("aborted")).toBe("");
    expect(speechErrorMessage("weird")).toBe("語音辨識出錯（weird）");
  });
});
