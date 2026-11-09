import "dotenv/config";
import express from "express";
import helmet from "helmet";
import cors from "cors";
import rateLimit from "express-rate-limit";
import path from "node:path";
import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";

const app = express();
const PORT = Number(process.env.PORT || 3001);
const OLLAMA_BASE_URL = (process.env.OLLAMA_BASE_URL || "http://127.0.0.1:11434").replace(/\/+$/, "");
const DEFAULT_MODEL = process.env.OLLAMA_MODEL || "qwen2.5-coder:7b";
const FIREBASE_PROJECT_ID = process.env.FIREBASE_PROJECT_ID || "zyqmora-ai";
const isProduction = process.env.NODE_ENV === "production";

let firebaseAdminAuth = null;
let firebaseAdminError = "";

try {
  if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
    const firebaseApp = getApps()[0] || initializeApp({
      credential: cert(serviceAccount),
      projectId: FIREBASE_PROJECT_ID
    });
    firebaseAdminAuth = getAuth(firebaseApp);
  }
} catch (error) {
  firebaseAdminError = error?.message || "Invalid Firebase service account JSON";
  console.error("Firebase Admin initialization failed:", firebaseAdminError);
}

const allowedOrigins = (process.env.CORS_ORIGINS || "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

app.disable("x-powered-by");
app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));
app.use(allowedOrigins.length ? cors({ origin: allowedOrigins }) : cors({ origin: false }));
app.use(express.json({ limit: "256kb" }));
app.use("/api/", rateLimit({
  windowMs: 60 * 1000,
  limit: 30,
  standardHeaders: "draft-7",
  legacyHeaders: false
}));

function requireUser(req, res, next) {
  if (!firebaseAdminAuth) {
    const remoteAddress = req.ip || req.socket?.remoteAddress || "";
    const isLoopback = ["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(remoteAddress);
    if (!isProduction && isLoopback && process.env.ALLOW_LOCAL_DEV_WITHOUT_ADMIN === "true") {
      req.user = { uid: "local-developer", localDevelopment: true };
      return next();
    }
    return res.status(503).json({
      error: "خادم الذكاء الاصطناعي يحتاج إعداد Firebase Admin. أضف FIREBASE_SERVICE_ACCOUNT_JSON في متغيرات البيئة، ولا ترفعه إلى GitHub."
    });
  }

  const authorization = req.headers.authorization || "";
  const token = authorization.replace(/^Bearer\s+/i, "");
  if (!token) return res.status(401).json({ error: "سجّل الدخول أولاً." });

  firebaseAdminAuth.verifyIdToken(token)
    .then((decoded) => {
      req.user = decoded;
      next();
    })
    .catch(() => res.status(401).json({ error: "انتهت جلسة الدخول. سجّل الدخول مجدداً." }));
}

async function getInstalledModels() {
  try {
    const response = await fetch(OLLAMA_BASE_URL + "/api/tags", {
      signal: AbortSignal.timeout(5000)
    });
    if (!response.ok) throw new Error("تعذّر الاتصال بمحرك Ollama.");
    const data = await response.json();
    return Array.isArray(data.models) ? data.models.map((model) => model.name) : [];
  } catch {
    const error = new Error("محرك Ollama غير متصل. شغّله على الجهاز أو الخادم أولاً.");
    error.status = 503;
    throw error;
  }
}

async function chooseModel(requestedModel) {
  const models = await getInstalledModels();
  if (!models.length) {
    const error = new Error("لم يتم تنزيل أي نموذج بعد. نفّذ: ollama pull qwen2.5-coder:7b");
    error.status = 409;
    throw error;
  }
  const selected = requestedModel || DEFAULT_MODEL;
  if (!models.includes(selected)) {
    const error = new Error("النموذج المحدد غير مثبت محلياً. اختر نموذجاً من القائمة أو نزّله أولاً.");
    error.status = 400;
    throw error;
  }
  return selected;
}

async function callOllama(payload, timeoutMs = 180000) {
  let response;
  try {
    response = await fetch(OLLAMA_BASE_URL + "/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(timeoutMs)
    });
  } catch (error) {
    const unavailable = new Error(
      "محرك Ollama غير متصل. شغّل Ollama وتأكد من تنزيل النموذج على الجهاز أو الخادم."
    );
    unavailable.status = error?.name === "TimeoutError" ? 504 : 503;
    throw unavailable;
  }

  if (!response.ok) {
    const details = await response.text().catch(() => "");
    const error = new Error("فشل النموذج في معالجة الطلب: " + details.slice(0, 300));
    error.status = response.status;
    throw error;
  }

  return response.json();
}

app.get("/api/health", async (_req, res) => {
  try {
    const models = await getInstalledModels();
    res.json({
      ok: true,
      engine: "Ollama local",
      model: DEFAULT_MODEL,
      installedModels: models,
      authReady: Boolean(firebaseAdminAuth) || (!isProduction && process.env.ALLOW_LOCAL_DEV_WITHOUT_ADMIN === "true")
    });
  } catch {
    res.status(503).json({
      ok: false,
      engine: "Ollama local",
      model: DEFAULT_MODEL,
      installedModels: [],
      authReady: Boolean(firebaseAdminAuth),
      error: "محرك Ollama غير متصل حالياً."
    });
  }
});

app.get("/api/ai/models", requireUser, async (_req, res) => {
  try {
    const models = await getInstalledModels();
    res.json({ models, defaultModel: DEFAULT_MODEL });
  } catch (error) {
    res.status(503).json({ error: error.message || "تعذّر جلب النماذج المحلية." });
  }
});

app.post("/api/ai/chat", requireUser, async (req, res) => {
  try {
    const inputMessages = req.body?.messages;
    if (!Array.isArray(inputMessages) || inputMessages.length < 1 || inputMessages.length > 24) {
      return res.status(400).json({ error: "أرسل رسالة واحدة على الأقل، وبحد أقصى 24 رسالة." });
    }

    const messages = inputMessages.map((message) => {
      if (!["user", "assistant"].includes(message?.role) || typeof message?.content !== "string") {
        throw new Error("صيغة الرسائل غير صحيحة.");
      }
      if (message.content.length > 12000) throw new Error("الرسالة طويلة جداً.");
      return { role: message.role, content: message.content };
    });

    const model = await chooseModel(req.body?.model);
    const result = await callOllama({
      model,
      stream: false,
      messages: [
        {
          role: "system",
          content: [
            "أنت ZYQMORA AI، مساعد برمجة وتصميم مواقع باللغة العربية.",
            "أجب بوضوح وباختصار مفيد، واكتب كوداً صحيحاً عند الطلب.",
            "لا تدّع أنك شغّلت أو نشرت مشروعاً أو نفّذت أمراً لم تنفذه.",
            "إذا طلب المستخدم إنشاء موقع كامل، وجّهه إلى زر إنشاء الموقع في مساحة البناء."
          ].join("\n")
        },
        ...messages
      ],
      options: { temperature: 0.35, num_ctx: 8192 }
    });

    res.json({
      content: result?.message?.content || "لم يرجع النموذج نصاً. حاول مرة أخرى.",
      model
    });
  } catch (error) {
    res.status(error.status || 400).json({ error: error.message || "حدث خطأ أثناء المحادثة." });
  }
});

app.post("/api/ai/build", requireUser, async (req, res) => {
  try {
    const prompt = typeof req.body?.prompt === "string" ? req.body.prompt.trim() : "";
    if (!prompt) return res.status(400).json({ error: "اكتب وصف الموقع أولاً." });
    if (prompt.length > 6000) return res.status(400).json({ error: "وصف الموقع أطول من الحد المسموح." });

    const existingFiles = req.body?.existingFiles;
    if (existingFiles !== undefined && existingFiles !== null) {
      if (typeof existingFiles !== "object" || Array.isArray(existingFiles)) {
        return res.status(400).json({ error: "ملفات المشروع الحالي غير صالحة." });
      }
      for (const fileName of ["index.html", "styles.css", "script.js"]) {
        if (typeof existingFiles[fileName] !== "string" || existingFiles[fileName].length > 100000) {
          return res.status(400).json({ error: "ملفات المشروع الحالي غير مكتملة أو كبيرة جداً." });
        }
      }
    }

    const model = await chooseModel(req.body?.model);
    const schema = {
      type: "object",
      additionalProperties: false,
      properties: {
        summary: { type: "string" },
        files: {
          type: "object",
          additionalProperties: false,
          properties: {
            "index.html": { type: "string" },
            "styles.css": { type: "string" },
            "script.js": { type: "string" }
          },
          required: ["index.html", "styles.css", "script.js"]
        }
      },
      required: ["summary", "files"]
    };

    const result = await callOllama({
      model,
      stream: false,
      format: schema,
      messages: [
        {
          role: "system",
          content: [
            "أنت مهندس واجهات ومطور مواقع خبير يعمل داخل ZYQMORA AI.",
            "أنشئ موقعاً متكاملاً وجذاباً ومتجاوباً مع الهاتف وسطح المكتب بناءً على طلب المستخدم.",
            "اكتب HTML5 دلالياً في index.html وCSS كاملاً في styles.css وJavaScript في script.js.",
            "استخدم العربية واتجاه RTL عندما يكون الطلب عربياً. اجعل التصميم احترافياً مع ألوان متناسقة ومساحات جيدة وحالات hover وتفاصيل دقيقة.",
            "لا تستخدم React أو build tools أو مكتبات خارجية أو روابط CDN. استخدم HTML وCSS وJavaScript عادي فقط.",
            "لا تضف أي اتصال شبكي أو fetch أو إرسال بيانات أو نماذج ترسل بيانات إلى خادم. اجعل الموقع نموذج عرض محلياً آمناً.",
            "لا تضع Markdown fences. أرجع JSON فقط مطابقاً للمخطط المطلوب. لا تترك أي ملف فارغ."
          ].join("\n")
        },
        { role: "user", content: prompt }
      ],
      options: { temperature: 0.2, num_ctx: 16384, num_predict: 12000 }
    }, 240000);

    let parsed;
    try {
      parsed = JSON.parse(result?.message?.content || "{}");
    } catch {
      throw new Error("النموذج أعاد صيغة غير مفهومة. جرّب وصفاً أبسط أو نموذجاً أقوى.");
    }

    const files = parsed?.files;
    const allowed = ["index.html", "styles.css", "script.js"];
    if (!files || allowed.some((name) => typeof files[name] !== "string" || !files[name].trim())) {
      throw new Error("النموذج لم ينشئ ملفات الموقع الثلاثة بصورة صحيحة. أعد المحاولة.");
    }
    if (allowed.some((name) => files[name].length > 100000)) {
      throw new Error("أحد الملفات أكبر من الحد المسموح. اطلب موقعاً أصغر أو قسّم الطلب.");
    }

    res.json({
      summary: typeof parsed.summary === "string" ? parsed.summary.slice(0, 1200) : "تم إنشاء ملفات الموقع.",
      files: {
        "index.html": files["index.html"],
        "styles.css": files["styles.css"],
        "script.js": files["script.js"]
      },
      model
    });
  } catch (error) {
    res.status(error.status || 400).json({ error: error.message || "تعذّر إنشاء الموقع." });
  }
});

const distDirectory = path.resolve(process.cwd(), "dist");
app.use(express.static(distDirectory));
app.get("*", (_req, res, next) => {
  res.sendFile(path.join(distDirectory, "index.html"), (error) => {
    if (error) next();
  });
});

app.use((error, _req, res, _next) => {
  console.error("Server error:", error);
  res.status(500).json({ error: "حدث خطأ غير متوقع في الخادم." });
});

app.listen(PORT, "0.0.0.0", () => {
  console.log("ZYQMORA AI server listening on port " + PORT);
  if (!firebaseAdminAuth) {
    console.warn(isProduction
      ? "Firebase Admin is not configured. Protected AI routes will remain unavailable."
      : "Local dev auth bypass is available only when ALLOW_LOCAL_DEV_WITHOUT_ADMIN=true.");
  }
  if (firebaseAdminError) console.warn("Firebase Admin config warning:", firebaseAdminError);
});
