// 讀入 .txt／.md 檔（第 4 輪）：只在本機解碼，填進欄位，不自動送出。
// 框架：Opus 2026-11-19。實作者只填函式內容，不改名稱、參數、回傳型別與本檔註解。
// 畫面：讀 File → arrayBuffer → decodeTextBytes；解碼後字數超過該欄 maxChars 就拒絕並顯示
// 「檔案有 N 字，超過這欄上限 M 字，請先刪減。」，不截斷。

/** 超過這個大小直接拒絕（不讀內容）。 */
export const MAX_TEXT_FILE_BYTES = 1_000_000;

/** 副檔名 .txt、.md、.markdown（不分大小寫）才收。 */
export function isAcceptedTextFile(name: string): boolean {
  return /\.(txt|md|markdown)$/i.test(name);
}

/**
 * 解碼順序：
 *  1. 開頭 EF BB BF → 去掉 BOM，UTF-8。
 *  2. 開頭 FF FE → 去掉 BOM，UTF-16LE。
 *  3. 用 TextDecoder("utf-8", { fatal: true })，成功就回傳。
 *  4. 失敗再用 TextDecoder("big5", { fatal: true })（台灣舊記事本檔）。
 *  5. 都失敗丟 Error("無法辨識檔案編碼，請用記事本另存成 UTF-8 再試。")
 * 換行一律轉成 \n（\r\n、\r → \n）。
 */
export function decodeTextBytes(bytes: Uint8Array): string {
  const decode = (encoding: string, data: Uint8Array) => new TextDecoder(encoding, { fatal: true }).decode(data).replace(/\r\n|\r/g, "\n");
  try {
    if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) return decode("utf-8", bytes.subarray(3));
    if (bytes[0] === 0xff && bytes[1] === 0xfe) return decode("utf-16le", bytes.subarray(2));
    try { return decode("utf-8", bytes); }
    catch { return decode("big5", bytes); }
  } catch { throw new Error("無法辨識檔案編碼，請用記事本另存成 UTF-8 再試。"); }
}
