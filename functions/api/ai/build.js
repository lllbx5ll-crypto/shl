import { enforceUserRateLimit, jsonError, requireFirebaseUser, RequestError } from "../../_shared/auth.js";

const MODEL = "@cf/qwen/qwen2.5-coder-32b-instruct";
const DESIGN_STYLES = {
  premium: "Luxury editorial: warm white or ivory surfaces, refined charcoal typography, restrained violet/champagne accents, generous whitespace and premium product presentation.",
  modern: "Modern commercial: crisp white surfaces, confident blue/cyan accents, clean geometric grids, strong typography and polished conversion-focused sections.",
  minimal: "Calm minimal: soft neutral palette, muted sage or stone accents, precise typography, generous breathing room and subtle borders.",
  creative: "Creative studio: expressive but harmonious colors, bold typography, asymmetrical layouts, layered visual elements and confident art direction.",
  tech: "Premium technology: deep ink/navy surfaces are allowed, electric blue/violet accents, sophisticated product mockups and clean high-contrast typography."
};
const FALLBACK_CSS = "*{box-sizing:border-box}body{margin:0;font-family:system-ui,Tahoma,sans-serif;line-height:1.75;background:#fbfaff;color:#24243a}a{color:inherit}main{width:min(1180px,90%);margin:auto;padding:48px 0}section{padding:34px 0}button,a{transition:all .2s ease}";

function extractHtml(raw) {
  let html = String(raw || "").trim();
  html = html.replace(/^\x60{3}(?:html)?\s*/i, "").replace(/\s*\x60{3}\s*$/i, "");
  const start = html.search(/<!doctype\s+html|<html[\s>]/i);
  if (start >= 0) html = html.slice(start);
  const end = html.toLowerCase().lastIndexOf("</html>");
  if (end >= 0) html = html.slice(0, end + 7);
  if (!/<html[\s>]/i.test(html) || !/<body[\s>]/i.test(html)) throw new RequestError("النموذج لم يُرجع صفحة HTML مكتملة. أعد المحاولة بوصف أقصر أو أوضح.", 502);
  return html;
}

export async function onRequestPost({ request, env }) {
  try {
    const user = await requireFirebaseUser(request);
    enforceUserRateLimit(user.uid, 5);
    if (!env.AI) throw new RequestError("لم يتم تفعيل ربط Workers AI في Cloudflare بعد. أضف AI binding ثم أعد النشر.", 503);
    const body = await request.json().catch(() => null);
    const prompt = typeof body?.prompt === "string" ? body.prompt.trim() : "";
    if (!prompt) throw new RequestError("اكتب وصف الموقع أولاً.", 400);
    if (prompt.length > 6000) throw new RequestError("وصف الموقع أطول من 6000 حرف.", 413);
    const requestedStyle = typeof body?.style === "string" ? body.style : "premium";
    const style = Object.prototype.hasOwnProperty.call(DESIGN_STYLES, requestedStyle) ? requestedStyle : "premium";

    let existingContext = "";
    const existing = body?.existingFiles;
    if (existing !== undefined && existing !== null) {
      if (typeof existing !== "object" || Array.isArray(existing)) throw new RequestError("ملفات الموقع الحالي غير صالحة.", 400);
      const html = typeof existing["index.html"] === "string" ? existing["index.html"].slice(0, 9000) : "";
      const css = typeof existing["styles.css"] === "string" ? existing["styles.css"].slice(0, 5000) : "";
      const js = typeof existing["script.js"] === "string" ? existing["script.js"].slice(0, 3000) : "";
      existingContext = "\n\nملفات الموقع الحالي التي يجب تعديلها مع الحفاظ على الأجزاء غير المطلوبة:\n" + JSON.stringify({ "index.html": html, "styles.css": css, "script.js": js });
    }

    const result = await env.AI.run(MODEL, {
      messages: [
        {
          role: "system",
          content: [
            "You are the lead digital art director, senior UX designer and senior frontend engineer at ZYQMORA AI.",
            "Create a complete, visually rich, polished website that feels delivered by a professional design studio — never a wireframe, school exercise or rough prototype.",
            "Fit the user's actual business, audience and goal. Do not reuse the same generic layout for every request.",
            "DESIGN DIRECTION: " + DESIGN_STYLES[style],
            "1. Establish a coherent design system: 3-5 coordinated colors, CSS variables, consistent spacing, deliberate radii, subtle layered shadows and clear typography hierarchy.",
            "2. Use a distinctive hero with a clear value proposition, supporting copy and primary/secondary calls to action. Avoid oversized empty areas.",
            "3. A full business website should normally include 5-8 useful sections; a focused landing page may use 4-6. Choose sections appropriate to the brief: navigation, hero, trust/value strip, services/products, story, benefits, FAQ, contact CTA and footer.",
            "4. Use varied compositions: split hero, editorial layouts, asymmetric grids, bento layouts, product showcases and visual storytelling. Do not repeat the same three-card section.",
            "5. NEVER use blank gray rectangles, empty image boxes, skeleton placeholders, generic 'Product 1' labels, lorem ipsum or unfinished sections. Use specific copy. When imagery is unavailable, create attractive CSS artwork, gradients, inline SVG illustrations, product silhouettes or decorative compositions.",
            "6. For shops, create polished product cards with distinct visual product art, category labels, realistic product names, useful price presentation, badges and purchase actions. For portfolios, create a real project gallery. For restaurants, create a menu and atmosphere-led hero. For SaaS, show a convincing product UI preview and clear feature hierarchy.",
            "7. Mobile-first responsive design: check 320px, 375px, 768px, 1024px and wide desktop. No horizontal overflow, clipped sections, tiny text or navigation collisions.",
            "8. Use semantic HTML5, RTL and natural Arabic copy for Arabic prompts. Use accessible contrast, keyboard focus states, touch targets of at least 44px and reduced-motion support.",
            "9. Use Arabic-friendly system font stacks. Use inline SVG for icons; do not use emoji as the main visual system.",
            "10. Add meaningful plain-JavaScript interactions when suitable: mobile menu, tabs, accordions, filters, cart feedback or form validation. Do not leave fake controls.",
            "11. Do not invent verifiable customer counts, awards, certifications, named testimonials or factual business claims. Use benefit-led copy instead.",
            "12. Keep the page self-contained: no React, build tools, external packages, CDNs, remote fonts, remote images, fetch calls, network requests, analytics or tracking. Use CSS and inline SVG for visuals.",
            "13. Include meta viewport, descriptive title, accessible labels, responsive navigation, footer and working anchor links.",
            "FINAL SELF-REVIEW: remove generic placeholders; check hierarchy, contrast, spacing, section variety, mobile layout and whether the result feels client-ready.",
            "Return ONLY one complete standalone HTML document. Put all CSS in one inline style tag and JavaScript in one inline script tag. No markdown fences or explanations.",
            "If existing site files are supplied, preserve the existing identity, content and working sections not mentioned by the user."
          ].join("\n")
        },
        { role: "user", content: "اتجاه التصميم المختار: " + style + "\n\nأنشئ أو عدّل الموقع حسب الطلب التالي:\n" + prompt + existingContext }
      ],
      stream: false,
      max_tokens: 6144,
      temperature: 0.48,
      top_p: 0.9
    });

    const raw = typeof result?.response === "string" ? result.response : "";
    let html = extractHtml(raw);
    const styles = [...html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)].map((match) => match[1]).join("\n").replace(/<\/style/gi, "<\\/style");
    const scripts = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].map((match) => match[1]).join("\n").replace(/<\/script/gi, "<\\/script");
    html = html.replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "").replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "");
    if (!/<head[\s>]/i.test(html)) html = html.replace(/<html([^>]*)>/i, "<html$1><head></head>");
    if (!/rel=["']stylesheet["'][^>]*href=["']styles\.css["']|href=["']styles\.css["'][^>]*rel=["']stylesheet["']/i.test(html)) html = html.replace(/<\/head>/i, '<link rel="stylesheet" href="styles.css"/></head>');
    if (!/<script[^>]+src=["']script\.js["']/i.test(html)) html = html.replace(/<\/body>/i, '<script src="script.js"></script></body>');

    return Response.json({
      summary: "اكتمل إنشاء الموقع باتجاه تصميم " + style + " باستخدام Qwen Coder على خوادم Cloudflare. لا حاجة لتنزيل نموذج على جهازك.",
      files: { "index.html": html.slice(0,100000), "styles.css": (styles || FALLBACK_CSS).slice(0,100000), "script.js": scripts.slice(0,30000) },
      model: MODEL,
      designStyle: style
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return jsonError(error); }
}
