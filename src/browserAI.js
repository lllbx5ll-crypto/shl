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
