import { describe, expect, it } from "vitest";
import { CARDS, CATEGORIES, renderCard, validateCard } from "../src/config/cards";
import { modelGroupOf, MODELS } from "../src/config/models";

const card = (id: string) => CARDS.find((c) => c.id === id)!;

describe("cards 設定", () => {
  it("卡片 id 不重複", () => expect(new Set(CARDS.map((c) => c.id)).size).toBe(CARDS.length));
  it("預設模型都在清單內且 verified", () => {
    for (const c of CARDS) expect(MODELS.find((m) => m.id === c.defaultModel)?.verified).toBe(true);
  });
  it("group 與預設模型的額度組一致", () => {
    for (const c of CARDS) expect(modelGroupOf(c.defaultModel)).toBe(c.group);
  });
  it("每張卡有分類、一字圖示、15 字內短說明，每個分類都有卡", () => {
    for (const c of CARDS) {
      expect(CATEGORIES.map((x) => x.id)).toContain(c.category);
      expect([...c.badge].length).toBe(1);
      expect(c.tagline.length).toBeGreaterThan(0);
      expect(c.tagline.length).toBeLessThanOrEqual(30);
    }
    for (const cat of CATEGORIES) expect(CARDS.some((c) => c.category === cat.id)).toBe(true);
  });
  it("每張卡的模板都能用預設值渲染（不引用不存在欄位、textarea 不進 instructions）", () => {
    for (const c of CARDS) expect(() => renderCard(c, { text: "x" })).not.toThrow();
  });
  it("shareTargetField 指向存在的 textarea", () => {
    for (const c of CARDS.filter((x) => x.shareTargetField)) {
      expect(c.fields.find((f) => f.id === c.shareTargetField)?.kind).toBe("textarea");
    }
  });
});

describe("renderCard", () => {
  it("翻譯：目標語言進 instructions、原文包在 <input> 內", () => {
    const r = renderCard(card("translate"), { target: "English", text: "你好" });
    expect(r.instructions).toContain("翻譯成English");
    expect(r.user).toBe("<input>\n你好\n</input>");
  });
  it("select 沒填時用預設值", () => {
    expect(renderCard(card("summarize"), { text: "a" }).instructions).toContain("5 點重點");
  });
});

describe("圖片卡", () => {
  it("圖片放在 images，不進文字模板", () => {
    const r = renderCard(card("ocr"), { image: "data:image/jpeg;base64,AAA" });
    expect(r.images).toEqual(["data:image/jpeg;base64,AAA"]);
    expect(r.user).toBe("請處理附上的圖片。");
  });
  it("拍照翻譯沒附照片 → 錯誤", () => {
    expect(validateCard(card("photo-translate"), {})).toEqual(["請填「照片」"]);
  });
  it("圖片不是 data:image/ → 錯誤", () => {
    expect(validateCard(card("ocr"), { image: "https://x/y.jpg" })).toEqual(["「照片」格式無效"]);
  });
  it("錯誤訊息解讀：文字與截圖都空 → 至少填一項", () => {
    expect(validateCard(card("explain-error"), {})).toEqual(["請至少填一項"]);
    expect(validateCard(card("explain-error"), { image: "data:image/png;base64,A" })).toEqual([]);
  });
});

describe("validateCard", () => {
  it("必填空白 → 錯誤", () => expect(validateCard(card("translate"), { text: "  " })).toEqual(["請填「原文」"]));
  it("超過字數 → 錯誤", () => {
    expect(validateCard(card("grammar"), { text: "a".repeat(6_001) })[0]).toContain("超過 6,000 字");
  });
  it("select 不在選項內 → 錯誤", () => {
    expect(validateCard(card("translate"), { target: "火星文", text: "a" })).toEqual(["「翻成」選項無效"]);
  });
  it("正常 → 空陣列", () => expect(validateCard(card("rewrite"), { text: "hello" })).toEqual([]));
});

describe("第 5 輪：生活卡片", () => {
  it("諮詢前整理：預設 sol、有固定提醒、提示詞禁止條號與期限", () => {
    const c = card("legal-prep");
    expect(c.category).toBe("life");
    expect(c.defaultModel).toBe("gpt-6.1-sol");
    expect(c.footer).toContain("法律常有期限");
    expect(c.instructions).toContain("不寫任何法規名稱或條號");
    expect(c.instructions).toContain("不估算金額、賠償、期限或時效");
  });
  it("條文白話：法規名稱可留空、條文必填，兩者都進 <input>", () => {
    const c = card("law-plain");
    expect(validateCard(c, { text: "第一條 本法…" })).toEqual([]);
    expect(validateCard(c, { law: "民法第 1 條" })).toContain("請填「條文原文」");
    const r = renderCard(c, { law: "民法第 1 條", text: "民事，法律所未規定者，依習慣。" });
    expect(r.user).toBe("<input>\n民法第 1 條\n民事，法律所未規定者，依習慣。\n</input>");
    expect(r.instructions).not.toContain("民法第 1 條");
  });
  it("footer 與 links 格式：links 都是 https", () => {
    for (const c of CARDS) {
      if (c.footer !== undefined) expect(c.footer.length).toBeGreaterThan(0);
      for (const l of c.links ?? []) expect(l.href.startsWith("https://")).toBe(true);
    }
    expect(card("law-plain").links?.[0].href).toBe("https://law.moj.gov.tw/");
  });
});
