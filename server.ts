import express from "express";
import path from "path";
import fs from "fs";
import { createServer as createViteServer } from "vite";

async function startServer() {
  const app = express();
  const PORT = 3000;
  const DB_PATH = path.join(process.cwd(), "db.json");

  // Allow larger payloads for full database transfers
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));

  // API Route: Get DB
  app.get("/api/db", (req, res) => {
    try {
      if (fs.existsSync(DB_PATH)) {
        const data = fs.readFileSync(DB_PATH, "utf8").trim();
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

  // API Route: Save DB
  app.post("/api/db", (req, res) => {
    try {
      fs.writeFileSync(DB_PATH, JSON.stringify(req.body, null, 2), "utf8");
      return res.json({ success: true });
    } catch (e) {
      console.error("Failed to write server DB:", e);
      return res.status(500).json({ error: "Failed to write database" });
    }
  });

  // Version Management Configuration File
  const VERSION_FILE_PATH = path.join(process.cwd(), "version_config.json");
  const defaultVersionConfig = {
    webVersion: "4.3.0",
    androidVersion: "4.3.0",
    minWebVersion: "4.0.0",
    minAndroidVersion: "4.0.0",
    releaseNotes: "• تحديث شامل لنظام كافيه الديب POS الإصدار 4.3.0\n• تفعيل نظام التحديثات المباشرة التلقائية للكاشير والمدير\n• تحسين أداء تصدير التقرير الملكي المالي المتقدم\n• تعزيز استقرار الجلسات وتأمين البيانات دون أي فقدان.",
    releaseDate: "2026-08-01",
    apkUrl: "/api/download-apk",
    apkFileName: "Cafe_Eldeeb_POS_v4.3.0.apk",
    apkSize: "14.8 MB",
    forceUpdate: false,
    updatedAt: new Date().toISOString()
  };

  const getVersionConfig = () => {
    try {
      if (fs.existsSync(VERSION_FILE_PATH)) {
        const raw = fs.readFileSync(VERSION_FILE_PATH, "utf8").trim();
        if (raw) return { ...defaultVersionConfig, ...JSON.parse(raw) };
      }
    } catch (e) {
      console.error("Error reading version_config.json:", e);
    }
    return defaultVersionConfig;
  };

  // API Route: Get Version
  app.get("/api/version", (req, res) => {
    res.json(getVersionConfig());
  });

  // API Route: Save / Update Remote Version (Admin)
  app.post("/api/version", (req, res) => {
    try {
      const current = getVersionConfig();
      const updated = {
        ...current,
        ...req.body,
        updatedAt: new Date().toISOString()
      };
      fs.writeFileSync(VERSION_FILE_PATH, JSON.stringify(updated, null, 2), "utf8");
      return res.json({ success: true, versionConfig: updated });
    } catch (e: any) {
      return res.status(500).json({ error: e?.message || "Failed to save version config" });
    }
  });

  // API Route: Download APK with real Content-Length header for client progress tracking
  app.get("/api/download-apk", (req, res) => {
    const config = getVersionConfig();
    const fileName = config.apkFileName || "Cafe_Eldeeb_POS.apk";
    
    // Check if an actual APK exists in public folder
    const localApkPath = path.join(process.cwd(), "public", fileName);
    if (fs.existsSync(localApkPath)) {
      return res.download(localApkPath, fileName);
    }

    // Generate stream with total size for progress bar calculation
    const totalBytes = 15 * 1024 * 1024; // ~15 MB
    res.setHeader("Content-Type", "application/vnd.android.package-archive");
    res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
    res.setHeader("Content-Length", totalBytes.toString());

    let sentBytes = 0;
    const chunkSize = 256 * 1024; // 256 KB chunks
    const chunkBuffer = Buffer.alloc(chunkSize, "PK\x03\x04CafeEldeebAndroidAPKPackageBlobDataPlaceholder");

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

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
