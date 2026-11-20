import { describe, expect, it } from "vitest";
import {
  WHERE_MAX,
  applySave,
  findKeywords,
  localAnswer,
  localConfident,
  localFind,
  saveNote,
  sameThing,
  splitLocal,
  type WhereItem,
} from "../src/where/rules";
import { findUserMessage, parseSplitReply, splitUserMessage } from "../src/where/ai";

const item = (id: string, name: string, location: string, updatedAt = 1, raw = ""): WhereItem => ({
  id, name, location, raw, createdAt: updatedAt, updatedAt,
});

describe("where 規則：同名判斷與拆句", () => {
  it("sameThing：包含且長度比 ≥ 0.6 才算同一個；單字要完全相同", () => {
    expect(sameThing("血壓計", "血壓計啊")).toBe(true);
    expect(sameThing("血壓計", "血壓計的盒子")).toBe(false);
    expect(sameThing("眼鏡", "老花眼鏡")).toBe(false);
    expect(sameThing("傘", "雨傘")).toBe(false);
    expect(sameThing("傘", " 傘 ")).toBe(true);
    expect(sameThing("", "傘")).toBe(false);
  });
  it("splitLocal：切在位置用語，剝掉贅詞與數量", () => {
    expect(splitLocal("鑰匙放在客廳的鞋櫃上面")).toEqual({ name: "鑰匙", location: "客廳的鞋櫃上面" });
    expect(splitLocal("剛剛我把兩包衛生紙收在浴室洗手台下，備用的")).toEqual({ name: "衛生紙", location: "浴室洗手台下" });
    expect(splitLocal("那個藥啊我放在冰箱")).toEqual({ name: "藥", location: "冰箱" });
  });
  it("splitLocal：找不到位置或名稱是空的回 null", () => {
    expect(splitLocal("健保卡")).toBeNull();
    expect(splitLocal("放在抽屜裡")).toBeNull();
  });
});

describe("where 規則：找東西", () => {
  const items = [
    item("1", "存摺", "臥室衣櫃抽屜", 1),
    item("2", "印章", "書房書桌抽屜", 2),
    item("3", "健保卡", "客廳電視櫃", 3),
    item("4", "遙控器", "客廳茶几", 4),
  ];
  it("findKeywords：連接詞與停用詞當分隔", () => {
    expect(findKeywords("存摺跟印章在哪？")).toEqual(["存摺", "印章"]);
    expect(findKeywords("請問我的健保卡放在哪裡")).toEqual(["健保卡"]);
  });
  it("localFind：名稱命中排第一", () => {
    const hits = localFind("健保卡在哪", items);
    expect(hits[0].item.id).toBe("3");
    expect(hits[0].nameHit).toBe(true);
  });
  it("localConfident：名稱命中且領先才有把握；兩樣並列不算", () => {
    expect(localConfident("健保卡在哪", items)).toBe(true);
    expect(localConfident("存摺跟印章在哪", items)).toBe(false);
    expect(localConfident("身分證在哪", items)).toBe(false);
    expect(localConfident("健保卡在哪", [])).toBe(false);
  });
  it("位置問句：客廳有什麼 → 有把握，列出名稱（新的在前）", () => {
    expect(localConfident("客廳有什麼", items)).toBe(true);
    expect(localAnswer("客廳有什麼", items)).toBe("找到這些：遙控器、健保卡。");
  });
  it("localAnswer：單一命中回一句", () => {
    expect(localAnswer("健保卡在哪", items)).toBe("健保卡放在「客廳電視櫃」。");
  });
});

describe("where 規則：存檔", () => {
  it("新增一筆，不改原陣列", () => {
    const before: WhereItem[] = [];
    const r = applySave(before, { name: " 鑰匙 ", location: " 玄關鞋櫃 ", raw: "鑰匙放在玄關鞋櫃" }, 100, "k1");
    expect(before).toEqual([]);
    expect(r.items).toEqual([item("k1", "鑰匙", "玄關鞋櫃", 100, "鑰匙放在玄關鞋櫃")]);
    expect(r.replaced).toBeNull();
    expect(r.evicted).toBeNull();
    expect(saveNote(r, { name: "鑰匙", location: "玄關鞋櫃" })).toBe("記好了：鑰匙放在「玄關鞋櫃」。");
  });
  it("同名覆蓋：保留 id 與 createdAt，告知舊位置", () => {
    const old = item("k1", "血壓計", "臥室床頭櫃", 10);
    const r = applySave([old], { name: "血壓計啊", location: "客廳電視櫃", raw: "" }, 50, "new");
    expect(r.items).toHaveLength(1);
    expect(r.items[0]).toMatchObject({ id: "k1", name: "血壓計啊", location: "客廳電視櫃", createdAt: 10, updatedAt: 50 });
    expect(r.replaced).toEqual(old);
    expect(saveNote(r, { name: "血壓計啊", location: "客廳電視櫃" })).toBe("「血壓計啊」之前記在「臥室床頭櫃」，已改成「客廳電視櫃」。");
  });
  it("滿 100 筆：刪掉最久沒更新的一筆並告知", () => {
    const full = Array.from({ length: WHERE_MAX }, (_, i) => item("i" + i, "東西" + i + "號", "櫃子", i === 37 ? 0 : i + 1));
    const r = applySave(full, { name: "新的", location: "桌上", raw: "" }, 999, "n");
    expect(r.items).toHaveLength(WHERE_MAX);
    expect(r.evicted?.id).toBe("i37");
    expect(r.items.some((x) => x.id === "i37")).toBe(false);
    expect(saveNote(r, { name: "新的", location: "桌上" })).toBe(
      "記好了：新的放在「桌上」。已經記滿 100 筆，刪掉了最久沒更新的「東西37號」（在「櫃子」）。"
    );
  });
  it("名稱或位置空白丟錯", () => {
    expect(() => applySave([], { name: " ", location: "桌上", raw: "" }, 1, "x")).toThrow("請填東西和位置");
    expect(() => applySave([], { name: "傘", location: "", raw: "" }, 1, "x")).toThrow("請填東西和位置");
  });
});

describe("where AI 訊息", () => {
  it("parseSplitReply：容忍前後文字，name 空回 null", () => {
    expect(parseSplitReply('好的\n{"name":" 老花眼鏡 ","location":"書桌"}')).toEqual({ name: "老花眼鏡", location: "書桌" });
    expect(parseSplitReply('{"name":"傘"}')).toEqual({ name: "傘", location: "" });
    expect(parseSplitReply('{"name":""}')).toBeNull();
    expect(parseSplitReply("不是 JSON")).toBeNull();
  });
  it("findUserMessage：新的在前、每行名稱｜位置、不送原話", () => {
    const msg = findUserMessage(" 身分證呢 ", [item("a", "存摺", "衣櫃", 1, "秘密原話"), item("b", "印｜章", "書桌\n抽屜", 2)]);
    expect(msg).toBe("<input>\n清單：\n印 章｜書桌 抽屜\n存摺｜衣櫃\n\n問題：身分證呢\n</input>");
    expect(splitUserMessage(" 傘在門口 ")).toBe("<input>\n傘在門口\n</input>");
  });
});
