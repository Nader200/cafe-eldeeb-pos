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

  // API Route: Server Email Proxy & Gmail API Relay
  app.post("/api/send-email", async (req, res) => {
    try {
      const { token, toEmail, subject, htmlContent } = req.body;
      if (!toEmail) {
        return res.status(400).json({ error: "البريد الإلكتروني للمستلم مطلوب" });
      }

      console.log(`[Server Email Service] Email dispatch requested for ${toEmail}: "${subject}"`);

      if (token) {
        // Build base64url MIME email for Gmail API
        const utf8Subject = `=?utf-8?B?${Buffer.from(subject || '').toString('base64')}?=`;
        const mimeParts = [
          `To: ${toEmail}`,
          `Subject: ${utf8Subject}`,
          'Content-Type: text/html; charset=utf-8',
          'MIME-Version: 1.0',
          '',
          htmlContent || ''
        ];
        const rawMessage = Buffer.from(mimeParts.join('\r\n'))
          .toString('base64')
          .replace(/\+/g, '-')
          .replace(/\//g, '_')
          .replace(/=+$/, '');

        const gmailRes = await fetch('https://gmail.googleapis.com/v1/users/me/messages/send', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ raw: rawMessage })
        });

        if (gmailRes.ok) {
          const data = (await gmailRes.json()) as any;
          console.log(`[Server Gmail Proxy] Email successfully sent to ${toEmail}, id: ${data.id}`);
          return res.json({ success: true, id: data.id, message: "تم إرسال البريد الإلكتروني بنجاح عبر Gmail" });
        } else {
          const errData = (await gmailRes.json().catch(() => ({}))) as any;
          console.warn(`[Server Gmail Proxy] Gmail API error (${gmailRes.status}):`, errData);
          const msg = errData.error?.message || `خطأ في خادم قوقل (${gmailRes.status})`;
          const isAuthErr = gmailRes.status === 401 || gmailRes.status === 403;
          return res.status(isAuthErr ? 401 : 400).json({
            error: isAuthErr
              ? 'انتهت صلاحية جلسة تسجيل الدخول بحساب قوقل. يرجى إعادة الاتصال بالحساب.'
              : msg,
            needReauth: isAuthErr
          });
        }
      }

      return res.json({ success: true, message: "تم تسجيل وتجهيز التقرير بنجاح على الخادم" });
    } catch (e: any) {
      console.error("Failed to process email API:", e);
      return res.status(500).json({ error: e?.message || "فشل إرسال البريد من الخادم" });
    }
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
