import { enforceUserRateLimit, jsonError, requireFirebaseUser, RequestError } from "../../_shared/auth.js";

const MODEL = "@cf/qwen/qwen2.5-coder-32b-instruct";

const FALLBACK_CSS = "*{box-sizing:border-box}body{margin:0;font-family:system-ui,Tahoma,sans-serif;line-height:1.7;background:#0b1020;color:#f8fafc}a{color:inherit}main{width:min(1100px,92%);margin:auto;padding:48px 0}section{padding:28px 0}";

function extractHtml(raw) {
  let html = String(raw || "").trim();
  html = html.replace(/^\x60{3}(?:html)?\s*/i, "").replace(/\s*\x60{3}\s*$/i, "");
  const start = html.search(/<!doctype\s+html|<html[\s>]/i);
  if (start >= 0) html = html.slice(start);
  const end = html.toLowerCase().lastIndexOf("</html>");
  if (end >= 0) html = html.slice(0, end + 7);
  if (!/<html[\s>]/i.test(html) || !/<body[\s>]/i.test(html)) {
    throw new RequestError("النموذج لم يُرجع صفحة HTML مكتملة. أعد المحاولة بوصف أقصر أو أوضح.", 502);
  }
  return html;
}

export async function onRequestPost({ request, env }) {
  try {
    const user = await requireFirebaseUser(request);
    enforceUserRateLimit(user.uid, 5);

    if (!env.AI) {
      throw new RequestError("لم يتم تفعيل ربط Workers AI في Cloudflare بعد. أضف AI binding ثم أعد النشر.", 503);
    }

    const body = await request.json().catch(() => null);
    const prompt = typeof body?.prompt === "string" ? body.prompt.trim() : "";
    if (!prompt) throw new RequestError("اكتب وصف الموقع أولاً.", 400);
    if (prompt.length > 6000) throw new RequestError("وصف الموقع أطول من 6000 حرف.", 413);

    let existingContext = "";
    const existing = body?.existingFiles;
    if (existing !== undefined && existing !== null) {
      if (typeof existing !== "object" || Array.isArray(existing)) {
        throw new RequestError("ملفات الموقع الحالي غير صالحة.", 400);
      }
      const html = typeof existing["index.html"] === "string" ? existing["index.html"].slice(0, 9000) : "";
      const css = typeof existing["styles.css"] === "string" ? existing["styles.css"].slice(0, 5000) : "";
      const js = typeof existing["script.js"] === "string" ? existing["script.js"].slice(0, 3000) : "";
      existingContext = "\n\nملفات الموقع الحالي التي يجب تعديلها مع الحفاظ على الأجزاء غير المطلوبة:\n" +
        JSON.stringify({ "index.html": html, "styles.css": css, "script.js": js });
    }

    const result = await env.AI.run(MODEL, {
      messages: [
        {
          role: "system",
          content: [
            "You are a senior frontend engineer and product designer inside ZYQMORA AI.",
            "Create a polished, complete, responsive website from the user's request.",
            "Return ONLY one complete standalone HTML document. Put all CSS inside a single inline style tag and JavaScript inside an inline script tag.",
            "Use semantic HTML5, accessible controls, responsive mobile-first layout, thoughtful typography, spacing, color, hover and focus states.",
            "If the user asks in Arabic, use Arabic RTL and natural Arabic copy.",
            "Do not use React, build tools, external libraries, CDN links, remote fonts, remote images, fetch, network calls, analytics, or data exfiltration.",
            "Use CSS gradients, inline SVG, and local decorative elements instead of remote assets.",
            "If existing site files are supplied, update the requested parts while preserving the rest of the design and content.",
            "Do not output markdown fences, explanations, or anything outside the HTML document."
          ].join("\n")
        },
        {
          role: "user",
          content: "أنشئ أو عدّل الموقع حسب الطلب التالي:\n" + prompt + existingContext
        }
      ],
      stream: false,
      max_tokens: 4096,
      temperature: 0.25
    });

    const raw = typeof result?.response === "string" ? result.response : "";
    let html = extractHtml(raw);
    const styles = [...html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)]
      .map((match) => match[1]).join("\n").replace(/<\/style/gi, "<\\/style");
    const scripts = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)]
      .map((match) => match[1]).join("\n").replace(/<\/script/gi, "<\\/script");

    html = html.replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "");
    html = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "");
    if (!/<head[\s>]/i.test(html)) {
      html = html.replace(/<html([^>]*)>/i, "<html$1><head></head>");
    }
    if (!/rel=["']stylesheet["'][^>]*href=["']styles\.css["']|href=["']styles\.css["'][^>]*rel=["']stylesheet["']/i.test(html)) {
      html = html.replace(/<\/head>/i, '<link rel="stylesheet" href="styles.css"/></head>');
    }
    if (!/<script[^>]+src=["']script\.js["']/i.test(html)) {
      html = html.replace(/<\/body>/i, '<script src="script.js"></script></body>');
    }

    return Response.json({
      summary: "اكتمل إنشاء الموقع بواسطة نموذج Qwen Coder السحابي. لا حاجة لتنزيل نموذج على جهازك.",
      files: {
        "index.html": html.slice(0, 100000),
        "styles.css": (styles || FALLBACK_CSS).slice(0, 100000),
        "script.js": scripts.slice(0, 30000)
      },
      model: MODEL
    }, {
      headers: { "Cache-Control": "no-store" }
    });
  } catch (error) {
    return jsonError(error);
  }
}
