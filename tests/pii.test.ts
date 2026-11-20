// 去識別化（第 4 輪）。前 6 條照抄作者的 law 專案 tests/unit/pii.test.mjs 的案例與預期值；Opus 寫，不准改。
import { describe, expect, it } from "vitest";
import { detectPII, maskFields, maskPII, PII_LABEL, scanFields } from "../src/text/pii";

const types = (s: string) => detectPII(s).map((h) => `${h.type}:${h.text}`);

describe("pii", () => {
  it("PII_LABEL", () => {
    expect(PII_LABEL).toEqual({ id: "身分證", phone: "電話", email: "Email", ubn: "統編" });
  });
  it("身分證與居留證", () => {
    expect(types("我是A123456789，他是b234567890")).toEqual(["id:A123456789", "id:b234567890"]);
    expect(types("居留證 A800000014")).toEqual(["id:A800000014"]);
    expect(types("A323456789 不是")).toEqual([]);
    expect(types("XA123456789")).toEqual([]);
    expect(types("A1234567890")).toEqual([]);
    expect(types("全形Ａ１２３４５６７８９")).toEqual(["id:Ａ１２３４５６７８９"]);
  });
  it("電話", () => {
    expect(types("手機0912-345-678或0912 345 678或0912345678")).toEqual(["phone:0912-345-678", "phone:0912 345 678", "phone:0912345678"]);
    expect(types("市話(02)2345-6789、02-23456789、049-2345678")).toEqual(["phone:(02)2345-6789", "phone:02-23456789", "phone:049-2345678"]);
    expect(types("09123456789")).toEqual([]);
    expect(types("押金20000元")).toEqual([]);
  });
  it("Email 與統編", () => {
    expect(types("寄到 a.b-c@ex-ample.com.tw 謝謝")).toEqual(["email:a.b-c@ex-ample.com.tw"]);
    expect(types("公司統編：12345678，另欠款12345678元")).toEqual(["ubn:12345678"]);
    expect(types("統一編號為 87654321")).toEqual(["ubn:87654321"]);
    expect(types("案號12345678")).toEqual([]);
  });
  it("位置與排序", () => {
    expect(detectPII("A123456789 0912345678")).toEqual([
      { type: "id", start: 0, end: 10, text: "A123456789" },
      { type: "phone", start: 11, end: 21, text: "0912345678" },
    ]);
  });
  it("maskPII：同值同代號、類別各自編號、可只遮部分", () => {
    const s = "甲A123456789打0912-345-678，乙B223456789也打0912345678，甲A123456789";
    const r = maskPII(s, detectPII(s));
    expect(r.text).toBe("甲〔身分證A〕打〔電話A〕，乙〔身分證B〕也打〔電話A〕，甲〔身分證A〕");
    expect(r.map).toEqual([
      { token: "〔身分證A〕", original: "A123456789" },
      { token: "〔電話A〕", original: "0912-345-678" },
      { token: "〔身分證B〕", original: "B223456789" },
    ]);
    const only = maskPII(s, detectPII(s).filter((x) => x.type === "phone"));
    expect(only.text).toBe("甲A123456789打〔電話A〕，乙B223456789也打〔電話A〕，甲A123456789");
    expect(maskPII("沒有", [])).toEqual({ text: "沒有", map: [] });
  });
  it("maskFields：跨欄位同代號、未指定欄位不動、欄位尾端號碼不會黏到下一欄", () => {
    const values = { a: "我的電話0912345678", b: "0912-345-678 是他打的，信箱 x@y.com", lang: "英文" };
    expect(scanFields(values, ["a", "b"]).map((h) => h.type)).toEqual(["phone", "phone", "email"]);
    const r = maskFields(values, ["a", "b"]);
    expect(r.values).toEqual({ a: "我的電話〔電話A〕", b: "〔電話A〕 是他打的，信箱 〔EmailA〕", lang: "英文" });
    expect(r.map.map((m) => m.token)).toEqual(["〔電話A〕", "〔EmailA〕"]);
    expect(maskFields({ a: "沒有" }, ["a", "missing"]).values).toEqual({ a: "沒有" });
  });
});
