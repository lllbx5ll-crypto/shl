import { enforceUserRateLimit, jsonError, requireFirebaseUser, RequestError } from "../../_shared/auth.js";
import { AI_MODELS, selectAIModel, runTextModel } from "../../_shared/models.js";

const STYLES = {
  auto: "Infer a distinctive art direction, brand identity, palette and layout directly from the user's brief. Never ask for a project name.",
  premium: "Luxury editorial art direction, sophisticated typography, generous spacing and premium product presentation.",
  modern: "Modern commercial design, crisp grids, confident colors and polished visuals.",
  minimal: "Calm minimal design, generous whitespace, restrained colors and precise typography.",
  creative: "Creative studio design, expressive composition, original graphics and bold typography.",
  tech: "Premium technology design, detailed interface visuals and sophisticated surfaces.",
  ivory: "Warm ivory editorial design with restrained indigo and elegant hierarchy.",
  clean: "Bright clean design with white surfaces, blue accents and clear spacing.",
  ocean: "Deep ocean palette with midnight blue and luminous azure accents.",
  forest: "Botanical forest palette with sophisticated greens and warm neutrals."
};
const PLAN_MODEL = AI_MODELS["gemma-4"];
const FALLBACK_MODEL = AI_MODELS["qwen-coder"];

const PLAN_SYSTEM = [
  "You are a senior digital creative director and product strategist.",
  "Read the user brief and invent a fitting brand identity automatically. Never ask for a project name.",
  "Return ONLY valid JSON with fields: name, concept, visualDirection, palette (4-6 hex colors), typography, sections (5-8 objects with type,title,layout,details), interactions.",
  "Choose a distinctive design concept for the actual business. Avoid generic templates, repetitive card grids and placeholder content.",
  "Write in the user's language. For Arabic use natural Arabic and RTL. If no brand name is supplied, create a short tasteful brand name."
].join("\n");

const HTML_SYSTEM = [
  "You are an award-winning website art director and senior semantic HTML engineer.",
  "Create a complete, visually distinctive website body fragment from the exact user brief and design blueprint.",
  "Return ONLY an HTML BODY FRAGMENT. No markdown, code fences, doctype, html, head, body, style or script tags.",
  "Include polished navigation/header, a remarkable hero, 5-8 substantial distinct sections, a strong CTA and complete footer. Vary compositions; do not repeat the same 3-card grid.",
  "Use specific realistic copy. Never use Lorem ipsum, Product 1/2, empty placeholders, fake testimonials or invented statistics.",
  "Create a coherent brand identity. If no name is provided, infer a suitable brand name from the prompt.",
  "Use inline SVG and CSS-ready visual compositions. No external images, fonts, CDNs, libraries, scripts, iframes or network resources.",
  "Use accessible anchor links to real section IDs. Use data-menu-toggle/data-menu for mobile navigation, data-faq-toggle for FAQ, data-cart-add/data-cart-count for demo cart and data-demo-form/data-form-status for demo forms.",
  "Use semantic HTML, accessible labels, buttons for actions and anchors for navigation. Arabic content must be natural Arabic.",
  "This must be a complete website homepage, not just a hero mockup. Include at least five detailed section elements."
].join("\n");

const CSS_SYSTEM = [
  "You are an award-winning web visual designer and senior CSS engineer.",
  "Write a complete bespoke stylesheet for the exact supplied HTML markup and design brief.",
  "Return ONLY CSS. No markdown, code fences, explanations, HTML or script.",
  "Create a high-end design system with CSS variables, typography scale, harmonious colors, spacing rhythm, buttons, navigation, cards, forms, section backgrounds, subtle transitions, hover and focus states.",
  "Make the hero memorable and visually rich. Vary section compositions; do not make every section look like identical cards.",
  "Design mobile-first for 320, 375, 768, 1024 and 1440px. Include responsive media queries and prevent horizontal overflow.",
  "Use system font stacks that support Arabic. No @import, external fonts, remote images, url(http), external libraries or CSS frameworks.",
  "Style all classes and data attributes in the markup. Ensure readable contrast, visible keyboard focus and comfortable touch targets.",
  "The stylesheet must be substantial and complete, not a tiny reset or starter stylesheet."
].join("\n");

const JS_SYSTEM = [
  "You are a senior frontend JavaScript engineer.",
  "Return ONLY plain vanilla JavaScript for the supplied website. No markdown or script tags.",
  "Implement only interactions present in the markup: mobile menu, FAQ accordion, local demo cart and demo form validation.",
  "Use addEventListener and safe DOM APIs. No network requests, fetch, XMLHttpRequest, WebSocket, EventSource, tracking, cookies, eval, Function constructor, imports, external libraries, parent-window access or browser storage.",
  "No inline event handlers. Do not replace the document. Keep code concise and defensive.",
  "If no custom interaction is needed, return a short comment and no executable code."
].join("\n");

const BASE_CSS = [
  "*,*::before,*::after{box-sizing:border-box}",
  "html{scroll-behavior:smooth;text-size-adjust:100%;-webkit-text-size-adjust:100%}",
  "body{margin:0;min-width:320px;max-width:100%;overflow-x:hidden}",
  "img,svg,video,canvas{max-width:100%;height:auto}",
  "button,input,textarea,select{font:inherit}",
  "button,a{-webkit-tap-highlight-color:transparent}",
  "a{overflow-wrap:anywhere}",
  ":focus-visible{outline:3px solid var(--accent,#7354d6);outline-offset:3px}",
  "@media(max-width:760px){body{min-width:320px}main,section{max-width:100%}}"
].join("\n");

const BASE_JS = [
  '(function(){ "use strict";',
  'document.addEventListener("click",function(event){',
  'var menuButton=event.target.closest("[data-menu-toggle]");if(menuButton){var selector=menuButton.getAttribute("data-target");var menu=selector?document.querySelector(selector):document.querySelector("[data-menu]");if(menu){var opened=menuButton.getAttribute("aria-expanded")==="true";menuButton.setAttribute("aria-expanded",String(!opened));menu.hidden=opened;}}',
  'var faqButton=event.target.closest("[data-faq-toggle]");if(faqButton){var panelId=faqButton.getAttribute("aria-controls");var panel=panelId?document.getElementById(panelId):faqButton.nextElementSibling;var expanded=faqButton.getAttribute("aria-expanded")==="true";faqButton.setAttribute("aria-expanded",String(!expanded));if(panel)panel.hidden=expanded;}',
  'var addButton=event.target.closest("[data-cart-add]");if(addButton){var counter=document.querySelector("[data-cart-count]");if(counter){var count=Number(counter.textContent)||0;counter.textContent=String(count+1);counter.setAttribute("aria-label","Cart items: "+String(count+1));}var status=document.querySelector("[data-cart-status]");if(status)status.textContent="تمت إضافة المنتج إلى السلة التجريبية.";}});',
  'document.addEventListener("submit",function(event){var form=event.target.closest("[data-demo-form]");if(!form)return;event.preventDefault();var status=form.querySelector("[data-form-status]")||document.querySelector("[data-form-status]");if(status)status.textContent="تم التحقق من البيانات. هذا نموذج تجريبي ولا يرسل بيانات إلى خادم.";});',
  '})();'
].join("\n");

function escapeHtml(value) {
  return String(value || "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;");
}
function stripFence(value) {
  return String(value || "").trim().replace(/^\x60{3}(?:html|css|javascript|js)?\s*/i,"").replace(/\s*\x60{3}\s*$/,"").trim();
}
function extractMarkup(raw) {
  let value=stripFence(raw);
  const body=value.match(/<body\b[^>]*>([\s\S]*)/i);
  if(body)value=body[1].replace(/<\/body>[\s\S]*$/i,"");
  else {
    value=value.replace(/<!doctype[^>]*>/gi,"").replace(/<head\b[^>]*>[\s\S]*?<\/head>/gi,"");
    value=value.replace(/<\/?html\b[^>]*>/gi,"").replace(/<\/?body\b[^>]*>/gi,"");
  }
  value=value.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,"").replace(/<script\b[^>]*>[\s\S]*$/gi,"");
  value=value.replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,"");
  value=value.replace(/<link\b[^>]*>/gi,"").replace(/<meta\b[^>]*>/gi,"").replace(/<base\b[^>]*>/gi,"");
  value=value.replace(/<iframe\b[^>]*>[\s\S]*?<\/iframe>/gi,"").replace(/<iframe\b[^>]*>[\s\S]*$/gi,"");
  value=value.replace(/\son[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi,"");
  value=value.replace(/\s(href|src)\s*=\s*(["'])\s*javascript:[\s\S]*?\2/gi,' $1="#"');
  return value.trim();
}
function extractCss(raw) {
  let value=stripFence(raw);
  const style=value.match(/<style\b[^>]*>([\s\S]*?)(?:<\/style>|$)/i);
  if(style)value=style[1];
  value=value.replace(/@import\s+[^;]+;?/gi,"").replace(/url\(\s*(['"]?)https?:[^)]*\)/gi,"none");
  return value.replace(/<\/style/gi,"").trim();
}
function validCss(css) {
  if(css.length<600||!/[.#a-zA-Z][^{]*\{/.test(css))return false;
  let depth=0;
  for(const ch of css){if(ch==="{")depth++;if(ch==="}")depth--;if(depth<0)return false;}
  return depth===0&&/@media|@container/.test(css);
}
function extractJs(raw) {
  let value=stripFence(raw);
  const script=value.match(/<script\b[^>]*>([\s\S]*?)(?:<\/script>|$)/i);
  if(script)value=script[1];
  return value.replace(/<\/script/gi,"").trim();
}
function safeJs(js) {
  if(!js||js.length<12)return false;
  if(/\b(fetch|XMLHttpRequest|WebSocket|EventSource|eval|importScripts)\b|new\s+Function|document\.cookie|window\.parent|window\.top|sendBeacon|localStorage|sessionStorage/i.test(js))return false;
  let braces=0,parens=0,brackets=0;
  for(const ch of js){if(ch==="{")braces++;if(ch==="}")braces--;if(ch==="(")parens++;if(ch===")")parens--;if(ch==="[")brackets++;if(ch==="]")brackets--;if(braces<0||parens<0||brackets<0)return false;}
  return braces===0&&parens===0&&brackets===0;
}
function planJson(raw) {
  const clean=stripFence(raw),a=clean.indexOf("{"),b=clean.lastIndexOf("}");
  if(a<0||b<=a)return null;
  try {
    const x=JSON.parse(clean.slice(a,b+1));
    if(!Array.isArray(x.sections)||x.sections.length<3)return null;
    return {
      name:String(x.name||"").slice(0,90),
      concept:String(x.concept||"").slice(0,350),
      visualDirection:String(x.visualDirection||"").slice(0,500),
      palette:Array.isArray(x.palette)?x.palette.map(c=>String(c)).filter(c=>/^#[0-9a-f]{3,8}$/i.test(c)).slice(0,6):[],
      sections:x.sections.slice(0,9).map(s=>({type:String(s?.type||"").slice(0,40),title:String(s?.title||"").slice(0,120),layout:String(s?.layout||"").slice(0,180),details:String(s?.details||"").slice(0,300)})),
      interactions:Array.isArray(x.interactions)?x.interactions.slice(0,8).map(v=>String(v).slice(0,150)):[]
    };
  }catch{return null;}
}
function deriveName(prompt,plan) {
  if(plan?.name&&plan.name.trim())return plan.name.trim().slice(0,80);
  const clean=String(prompt||"").replace(/[\r\n]+/g," ").replace(/^(أريد|اريد|أنشئ|انشئ|صمم|صمّم|ابنِ|ابني|موقع|صفحة|تصميم)\s*/i,"").trim();
  return (clean.slice(0,55).trim()||"موقعي الجديد").replace(/[.,،؛:!?]+$/,"");
}
function validateMarkup(raw) {
  const markup=extractMarkup(raw);
  const opened=(markup.match(/<section\b/gi)||[]).length;
  const closed=(markup.match(/<\/section\s*>/gi)||[]).length;
  if(markup.length<850||opened<4||closed<opened||!/<header\b|<nav\b/i.test(markup)||!/<footer\b/i.test(markup)) {
    throw new RequestError("التصميم لم يكتمل بعد. جارٍ إصلاح الأقسام تلقائياً.",502);
  }
  return markup;
}
function contextFromFiles(existing) {
  if(existing===undefined||existing===null)return "";
  if(typeof existing!=="object"||Array.isArray(existing))throw new RequestError("ملفات الموقع الحالي غير صالحة.",400);
  return JSON.stringify({
    "index.html":typeof existing["index.html"]==="string"?existing["index.html"].slice(0,6500):"",
    "styles.css":typeof existing["styles.css"]==="string"?existing["styles.css"].slice(0,3000):"",
    "script.js":typeof existing["script.js"]==="string"?existing["script.js"].slice(0,1800):""
  });
}
async function callStage(ai,model,messages,maxTokens) {
  try{return {text:await runTextModel(ai,model,messages,maxTokens),model};}
  catch(error){
    if(model.id===FALLBACK_MODEL.id)throw error;
    return {text:await runTextModel(ai,FALLBACK_MODEL,messages,maxTokens),model:FALLBACK_MODEL};
  }
}
function createFiles(markup,css,js,siteName,prompt,plan) {
  const arabic=/[\u0600-\u06FF]/.test(prompt);
  const title=escapeHtml(siteName);
  const description=escapeHtml(String(prompt||"").replace(/\s+/g," ").slice(0,155));
  const palette=plan?.palette||["#7354d6","#f5f1ff","#22243a","#ffffff","#e7e0f5"];
  const safeCss=validCss(css)?css:[
    ":root{--brand:"+escapeHtml(palette[0])+";--surface:"+escapeHtml(palette[1])+";--ink:"+escapeHtml(palette[2])+";--paper:"+escapeHtml(palette[3])+";--line:"+escapeHtml(palette[4])+";--radius:22px;--shadow:0 18px 55px rgba(25,25,55,.09)}",
    "body{background:var(--paper);color:var(--ink);font-family:system-ui,Tahoma,sans-serif;line-height:1.7}",
    "main{width:min(1180px,92%);margin:auto}section{padding:clamp(44px,8vw,100px) 0}",
    "h1,h2,h3{line-height:1.12;letter-spacing:-.035em}a{color:inherit;text-decoration:none}",
    "button{cursor:pointer;border:0;border-radius:999px;padding:13px 22px;background:var(--brand);color:white}",
    "article,.card,[class*=card]{border:1px solid var(--line);border-radius:var(--radius);box-shadow:var(--shadow);overflow:hidden}",
    "@media(max-width:760px){main{width:min(100% - 32px,600px)}section{padding:42px 0}h1{font-size:clamp(2.2rem,12vw,4rem)}[data-menu]{display:none}[data-menu].is-open{display:flex;flex-direction:column}}"
  ].join("\n");
  const body=/<main\b/i.test(markup)?markup:"<main id=\"main-content\">"+markup+"</main>";
  const html=[
    "<!doctype html>",
    '<html lang="'+(arabic?"ar":"en")+'" dir="'+(arabic?"rtl":"ltr")+'">',
    "<head>",
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">',
    '<meta name="description" content="'+description+'">',
    '<meta name="theme-color" content="#ffffff">',
    "<title>"+title+"</title>",
    '<link rel="stylesheet" href="styles.css">',
    "</head>",
    "<body>",
    body,
    '<script src="script.js" defer></script>',
    "</body>",
    "</html>"
  ].join("\n");
  return {
    "index.html":html.slice(0,150000),
    "styles.css":(safeCss+"\n"+BASE_CSS).slice(0,130000),
    "script.js":((safeJs(js)?js:"")+"\n"+BASE_JS).slice(0,40000)
  };
}
export function splitHtml(raw) {
  const markup=validateMarkup(raw);
  const style=(String(raw).match(/<style\b[^>]*>[\s\S]*?(?:<\/style>|$)/i)||[])[0]||"";
  const script=(String(raw).match(/<script\b[^>]*>[\s\S]*?(?:<\/script>|$)/i)||[])[0]||"";
  return createFiles(markup,extractCss(style),extractJs(script),"موقع جديد",raw,null);
}
function makeContext(prompt,style,plan,existing) {
  return [
    "USER BRIEF:\n"+prompt,
    "VISUAL DIRECTION:\n"+(STYLES[style]||STYLES.auto),
    "DESIGN BLUEPRINT:\n"+JSON.stringify(plan||{instruction:"Infer a complete original brand identity from the prompt."}),
    "EXISTING WEBSITE FILES:\n"+(existing||"New website"),
    "PROJECT NAME:\nDo not ask for a project name. Derive the brand name and page title automatically from the prompt."
  ].join("\n\n");
}
export async function createWebsite(ai,body,notify) {
  const style=STYLES[body.style]?body.style:"auto";
  const existing=contextFromFiles(body.existingFiles);
  let model=selectAIModel(body.model);
  notify("analyzing","جارٍ فهم فكرتك وتحديد نوع الموقع والجمهور...");
  notify("planning","جارٍ ابتكار الاسم والهوية البصرية وتخطيط الأقسام تلقائياً...");
  let plan=null;
  try {
    const planned=await runTextModel(ai,PLAN_MODEL,[
      {role:"system",content:PLAN_SYSTEM},
      {role:"user",content:"Visual preference: "+STYLES[style]+"\n\nUser brief:\n"+body.prompt.slice(0,5000)}
    ],1250);
    plan=planJson(planned);
  }catch(error){console.warn("Design planning unavailable; continuing from prompt.",error?.message);}
  const context=makeContext(body.prompt,style,plan,existing);

  notify("building","جارٍ بناء هيكل الموقع وأقسامه بمحتوى مخصص...");
  const htmlMessages=[
    {role:"system",content:HTML_SYSTEM},
    {role:"user",content:context+"\n\nCreate the complete body fragment now. Include at least five detailed section elements, distinct layouts and specific copy."}
  ];
  let htmlResult=await callStage(ai,model,htmlMessages,3600);
  model=htmlResult.model;
  let markup;
  try{markup=validateMarkup(htmlResult.text);}
  catch(error){
    notify("refining","جارٍ إعادة بناء أقسام الموقع الناقصة تلقائياً...");
    const retry=await callStage(ai,model,[
      {role:"system",content:HTML_SYSTEM+"\nThe previous output was incomplete. Return the complete body fragment again, not a full HTML document."},
      {role:"user",content:context+"\n\nPrevious output was incomplete. Include at least 5 complete section elements, close every section and element, and return more than 1000 characters. Output only the body fragment."}
    ],4300);
    model=retry.model;
    markup=validateMarkup(retry.text);
  }

  notify("styling","جارٍ تصميم الألوان والخطوط والتخطيط المتجاوب...");
  const cssMessages=[
    {role:"system",content:CSS_SYSTEM},
    {role:"user",content:context+"\n\nHTML BODY FRAGMENT:\n"+markup.slice(0,12500)+"\n\nWrite the complete matching stylesheet. Include mobile breakpoints."}
  ];
  let cssResult=await callStage(ai,model,cssMessages,3600);
  model=cssResult.model;
  let css=extractCss(cssResult.text);
  if(!validCss(css)){
    notify("refining","جارٍ إصلاح ملف التنسيق وتحسين توافقه مع الهواتف...");
    const retry=await callStage(ai,model,[
      {role:"system",content:CSS_SYSTEM+"\nThe previous CSS was incomplete or invalid. Return a complete stylesheet with balanced braces and mobile media queries."},
      {role:"user",content:context+"\n\nHTML:\n"+markup.slice(0,10000)+"\n\nPrevious CSS:\n"+css.slice(0,4500)+"\n\nReturn corrected complete CSS only."}
    ],4300);
    model=retry.model;
    css=extractCss(retry.text);
  }

  notify("interactions","جارٍ تجهيز وظائف الموقع والأزرار والنماذج...");
  let js="";
  try{
    const jsResult=await callStage(ai,model,[
      {role:"system",content:JS_SYSTEM},
      {role:"user",content:context+"\n\nHTML:\n"+markup.slice(0,9000)+"\n\nGenerate only the local interactions needed by this page."}
    ],1100);
    model=jsResult.model;
    const candidate=extractJs(jsResult.text);
    js=safeJs(candidate)?candidate:"";
  }catch(error){console.warn("Using built-in local interactions.",error?.message);}

  notify("reviewing","جارٍ تجميع ملفات الموقع والتحقق من سلامة الصفحة...");
  const siteName=deriveName(body.prompt,plan);
  const files=createFiles(markup,css,js,siteName,body.prompt,plan);
  const isStore=/متجر|شراء|سلة|منتج|checkout|store|ecommerce|shop/i.test(body.prompt);
  return {
    siteName,
    summary:"تم إنشاء موقع "+siteName+" بهوية وتصميم مخصصين من وصفك، مع تخطيط متجاوب للهواتف والحاسوب."+
      (isStore?" تتضمن المعاينة سلة وواجهة متجر تجريبية؛ الدفع والطلبات الحقيقية تحتاج ربط خدمات خلفية آمنة.":""),
    model:model.id,modelLabel:model.label,designStyle:style,designPlan:plan||undefined,files
  };
}
export async function onRequestPost({request,env}) {
  try{
    const user=await requireFirebaseUser(request);
    enforceUserRateLimit(user.uid,5);
    if(!env.AI)throw new RequestError("خدمة الذكاء الاصطناعي غير مفعّلة على الخادم. اربط Workers AI باسم AI في Cloudflare.",503);
    const body=await request.json().catch(()=>null);
    const prompt=typeof body?.prompt==="string"?body.prompt.trim():"";
    if(!prompt)throw new RequestError("اكتب وصف الموقع أولاً.",400);
    if(prompt.length>6000)throw new RequestError("الوصف أطول من 6000 حرف.",413);
    const style=typeof body?.style==="string"&&Object.hasOwn(STYLES,body.style)?body.style:"auto";
    const data={...body,prompt,style};
    if(!(request.headers.get("Accept")||"").includes("application/x-ndjson")){
      return Response.json(await createWebsite(env.AI,data,()=>{}),{headers:{"Cache-Control":"no-store"}});
    }
    const stream=new ReadableStream({
      async start(controller){
        const encoder=new TextEncoder();
        const emit=(type,payload)=>controller.enqueue(encoder.encode(JSON.stringify({type,...payload})+"\n"));
        try{
          const result=await createWebsite(env.AI,data,(stage,message)=>emit("progress",{stage,message}));
          emit("complete",{result});
        }catch(error){
          console.error("ZYQMORA build failed:",error);
          const message=error instanceof RequestError?error.message:"تعذّر إنشاء الموقع بسبب عدم استجابة خدمة الذكاء الاصطناعي أو بلوغ الحصة. حاول مرة أخرى بعد قليل.";
          emit("error",{message});
        }finally{controller.close();}
      }
    });
    return new Response(stream,{headers:{"Content-Type":"application/x-ndjson; charset=utf-8","Cache-Control":"no-store","X-Content-Type-Options":"nosniff"}});
  }catch(error){return jsonError(error);}
}
