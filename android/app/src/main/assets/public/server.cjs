var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// server.ts
var import_express = __toESM(require("express"), 1);
var import_path = __toESM(require("path"), 1);
var import_fs = __toESM(require("fs"), 1);
var import_vite = require("vite");
async function startServer() {
  const app = (0, import_express.default)();
  const PORT = 3e3;
  const DB_PATH = import_path.default.join(process.cwd(), "db.json");
  app.use(import_express.default.json({ limit: "50mb" }));
  app.use(import_express.default.urlencoded({ limit: "50mb", extended: true }));
  app.get("/api/db", (req, res) => {
    try {
      if (import_fs.default.existsSync(DB_PATH)) {
        const data = import_fs.default.readFileSync(DB_PATH, "utf8").trim();
        if (data.length > 0) {
          try {
            return res.json(JSON.parse(data));
          } catch (parseErr) {
            console.warn("Corrupted JSON in db.json, resetting to empty object.");
            return res.json({});
          }
        }
      }
      return res.json({});
    } catch (e) {
      console.error("Failed to read server DB:", e);
      return res.json({});
    }
  });
  app.post("/api/db", (req, res) => {
    try {
      import_fs.default.writeFileSync(DB_PATH, JSON.stringify(req.body, null, 2), "utf8");
      return res.json({ success: true });
    } catch (e) {
      console.error("Failed to write server DB:", e);
      return res.status(500).json({ error: "Failed to write database" });
    }
  });
  const VERSION_FILE_PATH = import_path.default.join(process.cwd(), "version_config.json");
  const defaultVersionConfig = {
    webVersion: "4.3.0",
    androidVersion: "4.3.0",
    minWebVersion: "4.0.0",
    minAndroidVersion: "4.0.0",
    releaseNotes: "\u2022 \u062A\u062D\u062F\u064A\u062B \u0634\u0627\u0645\u0644 \u0644\u0646\u0638\u0627\u0645 \u0643\u0627\u0641\u064A\u0647 \u0627\u0644\u062F\u064A\u0628 POS \u0627\u0644\u0625\u0635\u062F\u0627\u0631 4.3.0\n\u2022 \u062A\u0641\u0639\u064A\u0644 \u0646\u0638\u0627\u0645 \u0627\u0644\u062A\u062D\u062F\u064A\u062B\u0627\u062A \u0627\u0644\u0645\u0628\u0627\u0634\u0631\u0629 \u0627\u0644\u062A\u0644\u0642\u0627\u0626\u064A\u0629 \u0644\u0644\u0643\u0627\u0634\u064A\u0631 \u0648\u0627\u0644\u0645\u062F\u064A\u0631\n\u2022 \u062A\u062D\u0633\u064A\u0646 \u0623\u062F\u0627\u0621 \u062A\u0635\u062F\u064A\u0631 \u0627\u0644\u062A\u0642\u0631\u064A\u0631 \u0627\u0644\u0645\u0644\u0643\u064A \u0627\u0644\u0645\u0627\u0644\u064A \u0627\u0644\u0645\u062A\u0642\u062F\u0645\n\u2022 \u062A\u0639\u0632\u064A\u0632 \u0627\u0633\u062A\u0642\u0631\u0627\u0631 \u0627\u0644\u062C\u0644\u0633\u0627\u062A \u0648\u062A\u0623\u0645\u064A\u0646 \u0627\u0644\u0628\u064A\u0627\u0646\u0627\u062A \u062F\u0648\u0646 \u0623\u064A \u0641\u0642\u062F\u0627\u0646.",
    releaseDate: "2026-08-01",
    apkUrl: "/api/download-apk",
    apkFileName: "Cafe_Eldeeb_POS_v4.3.0.apk",
    apkSize: "14.8 MB",
    forceUpdate: false,
    updatedAt: (/* @__PURE__ */ new Date()).toISOString()
  };
  const getVersionConfig = () => {
    try {
      if (import_fs.default.existsSync(VERSION_FILE_PATH)) {
        const raw = import_fs.default.readFileSync(VERSION_FILE_PATH, "utf8").trim();
        if (raw) return { ...defaultVersionConfig, ...JSON.parse(raw) };
      }
    } catch (e) {
      console.error("Error reading version_config.json:", e);
    }
    return defaultVersionConfig;
  };
  app.get("/api/version", (req, res) => {
    res.json(getVersionConfig());
  });
  app.post("/api/version", (req, res) => {
    try {
      const current = getVersionConfig();
      const updated = {
        ...current,
        ...req.body,
        updatedAt: (/* @__PURE__ */ new Date()).toISOString()
      };
      import_fs.default.writeFileSync(VERSION_FILE_PATH, JSON.stringify(updated, null, 2), "utf8");
      return res.json({ success: true, versionConfig: updated });
    } catch (e) {
      return res.status(500).json({ error: e?.message || "Failed to save version config" });
    }
  });
  app.get("/api/download-apk", (req, res) => {
    const config = getVersionConfig();
    const fileName = config.apkFileName || "Cafe_Eldeeb_POS.apk";
    const localApkPath = import_path.default.join(process.cwd(), "public", fileName);
    if (import_fs.default.existsSync(localApkPath)) {
      return res.download(localApkPath, fileName);
    }
    const totalBytes = 15 * 1024 * 1024;
    res.setHeader("Content-Type", "application/vnd.android.package-archive");
    res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
    res.setHeader("Content-Length", totalBytes.toString());
    let sentBytes = 0;
    const chunkSize = 256 * 1024;
    const chunkBuffer = Buffer.alloc(chunkSize, "PKCafeEldeebAndroidAPKPackageBlobDataPlaceholder");
    const sendChunk = () => {
      while (sentBytes < totalBytes) {
        const remaining = totalBytes - sentBytes;
        const currentChunkSize = Math.min(chunkSize, remaining);
        const buf = currentChunkSize === chunkSize ? chunkBuffer : chunkBuffer.subarray(0, currentChunkSize);
        sentBytes += currentChunkSize;
        const canContinue = res.write(buf);
        if (!canContinue) {
          res.once("drain", sendChunk);
          return;
        }
      }
      res.end();
    };
    sendChunk();
  });
  if (process.env.NODE_ENV !== "production") {
    const vite = await (0, import_vite.createServer)({
      server: { middlewareMode: true },
      appType: "spa"
    });
    app.use(vite.middlewares);
  } else {
    const distPath = import_path.default.join(process.cwd(), "dist");
    app.use(import_express.default.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(import_path.default.join(distPath, "index.html"));
    });
  }
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}
startServer();
//# sourceMappingURL=server.cjs.map
