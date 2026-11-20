import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { resolve } from "node:path";

export default defineConfig({
  plugins: [
    react(),
    {
      name: "version-static-cache",
      apply: "build",
      writeBundle(options) {
        const output = resolve(options.dir ?? "dist");
        const version = createHash("sha256").update(readFileSync(resolve(output, "index.html"))).digest("hex").slice(0, 16);
        const worker = readFileSync(resolve("public/sw.js"), "utf8").replace("__BUILD_VERSION__", version);
        writeFileSync(resolve(output, "sw.js"), worker);
      },
    },
  ],
  base: "./",
});
