// Browser-only AI: no Puter account, paid provider, API key or model server.
// The model runs on each visitor's own device with WebGPU.
// Model weights are fetched on first use and cached by the browser where supported.
export const BROWSER_MODELS = [
  { id: "SmolLM2-360M-Instruct-q4f32_1-MLC", label: "SmolLM2 360M — خفيف (تجريبي)" },
  { id: "SmolLM2-1.7B-Instruct-q4f32_1-MLC", label: "SmolLM2 1.7B — أقوى، يحتاج ذاكرة أكبر" }
];

const engines = new Map();
const loading = new Map();

export function browserAICapable() {
  return typeof navigator !== "undefined" &&
    typeof window !== "undefined" &&
    window.isSecureContext &&
    Boolean(navigator.gpu);
}

export async function loadBrowserAI(modelId, onProgress = () => {}) {
  if (!browserAICapable()) {
    throw new Error("متصفح هذا الجهاز لا يدعم WebGPU أو أن الموقع غير مفتوح عبر HTTPS. يمكنك إنشاء قالب موقع مجاني بدون تشغيل نموذج.");
  }
  const model = BROWSER_MODELS.find((entry) => entry.id === modelId);
  if (!model) throw new Error("النموذج المحدد غير متاح في هذه النسخة.");
  if (engines.has(modelId)) return engines.get(modelId);
  if (loading.has(modelId)) return loading.get(modelId);

  const promise = (async () => {
    onProgress("تحميل محرك الذكاء الاصطناعي...");
    const webllm = await import("@mlc-ai/web-llm");
    const engine = await webllm.CreateMLCEngine(modelId, {
      initProgressCallback: (progress) => {
        const pct = Math.max(0, Math.min(100, Math.round((progress?.progress || 0) * 100)));
        onProgress((progress?.text || "تحميل النموذج") + " — " + pct + "%");
      }
    });
    engines.set(modelId, engine);
    return engine;
  })();

  loading.set(modelId, promise);
  try {
    return await promise;
  } catch (error) {
    throw new Error("فشل تشغيل النموذج على جهازك. قد تكون ذاكرة الجهاز غير كافية: " + (error?.message || "حاول استخدام نموذج أخف."));
  } finally {
    loading.delete(modelId);
  }
}

async function complete({ model, messages, maxTokens = 1400, onProgress }) {
  const engine = await loadBrowserAI(model, onProgress);
  onProgress?.("النموذج يجهز الإجابة الآن...");
  const result = await engine.chat.completions.create({
    messages,
    stream: false,
    temperature: 0.35,
    max_tokens: maxTokens
  });
  const content = result?.choices?.[0]?.message?.content;
  if (typeof content !== "string" || !content.trim()) {
    throw new Error("لم يرد النموذج بنص مفهوم؛ جرّب مرة أخرى.");
  }
  return content.trim();
}

export async function browserChat({ model, messages, onProgress }) {
  const cleanMessages = (messages || []).slice(-12)
    .map((item) => ({
      role: item.role === "assistant" ? "assistant" : "user",
      content: String(item.content || "").slice(0, 1700)
    }));
  const response = await complete({
    model,
    onProgress,
    messages: [
      { role: "system", content: "أنت مساعد برمجي في ZYQMORA AI. أجب باختصار وبالعربية. لا تدّع أن لديك خادماً أو اتصالاً بأدوات خارجية." },
      ...cleanMessages
    ],
    maxTokens: 900
  });
  return { content: response, model };
}

export function buildFreeTemplate(prompt) {
  const cleanPrompt = String(prompt || "").trim().slice(0, 6000);
  const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[char]));
  const words = cleanPrompt.split(/\s+/).filter(Boolean);
  const title = escapeHtml(words.slice(0, 6).join(" ") || "موقعي الجديد");
  const description = escapeHtml(cleanPrompt || "أهلاً بك في موقعي الجديد.");
  const isShop = /متجر|تسوّق|منتج|shop|store/i.test(cleanPrompt);
  const isPortfolio = /أعمال|سيرة|شخصي|portfolio/i.test(cleanPrompt);
  const action = isShop ? "تصفّح المنتجات" : isPortfolio ? "تواصل معي" : "استكشف المزيد";
  const cards = isShop
    ? ["منتج مميز", "منتج جديد", "عروض خاصة"]
    : isPortfolio ? ["مشروع مبتكر", "تصميم احترافي", "خبرات ومهارات"]
    : ["الخدمة الأولى", "الخدمة الثانية", "الخدمة الثالثة"];
  const markup = `<!doctype html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>${title}</title>
<link rel="stylesheet" href="styles.css"/>
</head>
<body>
<header class="header">
  <a class="logo" href="#home">✦ ${title}</a>
  <nav><a href="#home">الرئيسية</a><a href="#features">الخدمات</a><a href="#contact">تواصل</a></nav>
</header>
<main id="home">
  <section class="hero">
    <span class="tag">صُمّم خصيصاً لفكرتك</span>
    <h1>${title}</h1>
    <p>${description}</p>
    <a class="cta" href="#features">${action} ←</a>
  </section>
  <section id="features" class="features">
    <h2>اكتشف ما نقدّمه</h2>
    <div class="grid">
      ${cards.map((name, i) => `<article class="card"><div class="num">0${i + 1}</div><h3>${escapeHtml(name)}</h3><p>تجربة حديثة وعناية بكل التفاصيل لخدمتك بأفضل صورة.</p></article>`).join("\n")}
    </div>
  </section>
  <section class="contact" id="contact"><h2>جاهز للانطلاق؟</h2><p>نحوّل الأفكار إلى تجربة رقمية مميزة.</p><a class="cta" href="#home">العودة للأعلى ↑</a></section>
</main>
<footer>© ${new Date().getFullYear()} ${title}. جميع الحقوق محفوظة.</footer>
<script src="script.js"></script>
</body>
</html>`;
  const css = `*{box-sizing:border-box}html{scroll-behavior:smooth}body{margin:0;font-family:system-ui,Tahoma,sans-serif;background:#08091b;color:#f8f7ff;line-height:1.7}a{color:inherit;text-decoration:none}.header{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:22px 7%;border-bottom:1px solid #ffffff16;background:#0b0c1f}.logo{font-size:19px;font-weight:800;color:#c4a6ff}.header nav{display:flex;gap:22px;font-size:14px;color:#c9c9e1}.hero{text-align:center;padding:115px 7% 120px;background:radial-gradient(circle at top,#42307777,transparent 58%)}.tag{display:inline-block;border-radius:40px;border:1px solid #9e82f355;background:#261e46;color:#cdbaff;padding:7px 16px;font-size:13px}.hero h1{font-size:clamp(34px,6vw,65px);line-height:1.3;margin:22px auto 14px;max-width:900px}.hero p{max-width:650px;margin:0 auto 32px;color:#aaaac4;font-size:17px}.cta{display:inline-block;padding:13px 27px;color:#151021;border-radius:12px;font-weight:700;background:linear-gradient(100deg,#c6a5ff,#7fe1ff);box-shadow:0 12px 33px #7050ff30}.features{padding:65px 7% 95px}.features h2{text-align:center;font-size:31px;margin:0 0 35px}.grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:18px}.card{padding:30px;background:#15172b;border:1px solid #ffffff1a;border-radius:20px}.num{font-weight:800;color:#a48bff;font-size:24px}.card h3{font-size:21px}.card p,.contact p{color:#a4a6c0}.contact{text-align:center;padding:75px 20px;background:#131426}.contact h2{font-size:33px;margin:0}footer{padding:28px;text-align:center;color:#8687a9;font-size:13px}@media(max-width:650px){.header{padding:16px 5%;flex-wrap:wrap}.header nav{gap:14px;font-size:12px}.hero{padding:80px 6%}.grid{grid-template-columns:1fr}.features{padding:45px 6% 70px}}`;
  return {
    summary: "تم إنشاء قالب موقع مجاني من وصفك بدون خادم ذكاء اصطناعي. هذا قالب مبرمج، وليس نتيجة نموذج لغوي.",
    files: { "index.html": markup, "styles.css": css, "script.js": "document.querySelectorAll('a[href^=\"#\"]').forEach(a => a.addEventListener('click', () => {}));" },
    model: "free-template"
  };
}

export async function browserBuildWebsite({ model, prompt, existingFiles, onProgress }) {
  const description = String(prompt || "").trim().slice(0, 1800);
  if (!description) throw new Error("اكتب وصف الموقع أولاً.");
  // Small local models often fail to return valid multi-file JSON.
  // Ask for a standalone HTML page, then extract assets with a safe fallback.
  const context = existingFiles
    ? "\nالصفحة السابقة (مرجع مختصر):\n" + String(existingFiles["index.html"] || "").slice(0, 2500)
    : "";
  const response = await complete({
    model,
    onProgress,
    maxTokens: 2200,
    messages: [
      {
        role: "system",
        content: "You create short complete responsive one-page websites. Return ONLY a standalone HTML document starting with <!doctype html>. Include inline <style> CSS, optional inline <script>, Arabic RTL when user asks in Arabic. No markdown. No external libraries, fetch, network, remote images or links. Keep code concise, valid and self-contained."
      },
      { role: "user", content: "Website request: " + description + context }
    ]
  });
  const extracted = response.replace(/^\x60\x60\x60(?:html)?\s*/i, "").replace(/\s*\x60\x60\x60$/, "");
  if (!/<html[\s>]/i.test(extracted) || !/<body[\s>]/i.test(extracted)) {
    throw new Error("النموذج الصغير لم يُنشئ HTML صالحاً. جرّب «قالب فوري» أو نموذجاً أكبر.");
  }
  const styles = [...extracted.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)].map((m) => m[1]).join("\n");
  const scripts = [...extracted.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].map((m) => m[1]).join("\n");
  let html = extracted.replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "").replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "");
  html = html.replace(/<\/head>/i, '<link rel="stylesheet" href="styles.css"/></head>');
  html = html.replace(/<\/body>/i, '<script src="script.js"></script></body>');
  return {
    summary: "تم إنشاء نسخة تجريبية باستخدام نموذج صغير يعمل داخل المتصفح.",
    files: {
      "index.html": html.slice(0, 100000),
      "styles.css": (styles || buildFreeTemplate(description).files["styles.css"]).slice(0, 100000),
      "script.js": scripts.slice(0, 100000) || "// No interactions generated"
    },
    model
  };
}
