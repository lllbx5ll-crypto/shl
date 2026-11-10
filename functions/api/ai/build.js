import { enforceUserRateLimit, jsonError, requireFirebaseUser, RequestError } from "../../_shared/auth.js";
import { AI_MODELS, selectAIModel, runTextModel } from "../../_shared/models.js";

const STYLES = {
  premium: "Luxury editorial: ivory, sophisticated serif-like hierarchy, indigo/plum, champagne highlights, beautiful product art.",
  modern: "Modern clean: white, vivid blue and cyan accents, excellent grids and precise professional typography.",
  minimal: "Calm minimal: warm white, sage, soft shadows, fine lines and sophisticated whitespace.",
  creative: "Creative studio: expressive coordinated color, unusual compositions, layered illustrations and bold art direction.",
  tech: "Premium technology: midnight navy or crisp white, luminous blue/violet, convincing UI mockups.",
  ivory: "Ivory editorial: warm neutrals, restrained indigo, premium magazine layout.",
  clean: "Clean modern: pure white, blue, precise spacing and highly legible cards.",
  ocean: "Ocean: rich navy and cool blue, premium luminous detail.",
  forest: "Forest: botanical green and cream, refined organic details."
};
const PLAN_MODEL = AI_MODELS["gemma-4"];

function planJson(raw) {
  const clean = String(raw).replace(/^\x60{3}(?:json)?\s*/i,"").replace(/\s*\x60{3}\s*$/,"");
  const a=clean.indexOf("{"), b=clean.lastIndexOf("}");
  if(a<0||b<=a) return null;
  try {
    const x=JSON.parse(clean.slice(a,b+1));
    if(!Array.isArray(x.sections)||x.sections.length<3) return null;
    return {
      name:String(x.name||"").slice(0,100),concept:String(x.concept||"").slice(0,300),
      colors:Array.isArray(x.colors)?x.colors.slice(0,5):[],
      sections:x.sections.slice(0,9).map(s=>({type:String(s?.type||"").slice(0,40),title:String(s?.title||"").slice(0,120),layout:String(s?.layout||"").slice(0,150),details:String(s?.details||"").slice(0,280)})),
      interactions:Array.isArray(x.interactions)?x.interactions.slice(0,8):[]
    };
  } catch {return null;}
}
function splitHtml(raw) {
  let html=String(raw||"").trim().replace(/^\x60{3}(?:html)?\s*/i,"").replace(/\s*\x60{3}\s*$/,"");
  const at=html.search(/<!doctype\s+html|<html[\s>]/i);
  if(at>=0) html=html.slice(at);
  const end=html.toLowerCase().lastIndexOf("</html>");
  if(end>=0) html=html.slice(0,end+7);
  if(!/<html[\s>]/i.test(html)||!/<body[\s>]/i.test(html)||!/<\/html>/i.test(html)) throw new RequestError("النتيجة ليست HTML مكتملًا.",502);
  const css=[...html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)].map(x=>x[1]).join("\n");
  const js=[...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].map(x=>x[1]).join("\n");
  if(css.length<400) throw new RequestError("التصميم غير مكتمل: ملف CSS قصير جداً.",502);
  if([...html.matchAll(/<section[\s>]/gi)].length<3) throw new RequestError("الصفحة تفتقد الأقسام الأساسية.",502);
  html=html.replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,"").replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,"");
  if(!/<head[\s>]/i.test(html)) html=html.replace(/<html([^>]*)>/i,"<html$1><head></head>");
  if(!/<meta[^>]+name=["']viewport["']/i.test(html)) html=html.replace(/<\/head>/i,'<meta name="viewport" content="width=device-width,initial-scale=1"></head>');
  if(!/href=["']styles\.css["']/i.test(html)) html=html.replace(/<\/head>/i,'<link rel="stylesheet" href="styles.css"></head>');
  if(!/<script[^>]+src=["']script\.js["']/i.test(html)) html=html.replace(/<\/body>/i,'<script src="script.js"></script></body>');
  return {"index.html":html.slice(0,140000),"styles.css":css.replace(/<\/style/gi,"<\\/style").slice(0,120000),"script.js":js.replace(/<\/script/gi,"<\\/script").slice(0,38000)};
}
const SYSTEM = [
  "You are a top-tier award-winning web art director, senior UI/UX designer and frontend engineer.",
  "Make a visually rich polished, distinctive client-ready website from the user's exact brief, not a generic student template.",
  "Return ONLY one complete standalone HTML document with ALL CSS in <style> and JavaScript in <script>. Do not explain or format with markdown.",
  "Create a genuinely art-directed hero, useful navigation, diverse editorial sections, visual product/service cards, CTA, FAQ where relevant and a footer.",
  "Avoid blank gray blocks, lorem ipsum, Product 1/2, fake testimonials, unverifiable business claims and repetitive three-card layouts.",
  "Use coordinated brand colors, expressive hierarchy, elegant Arabic-friendly fonts, CSS variables, purposeful gradients and attractive inline SVG or CSS artwork, not external images.",
  "Build accessible responsive layout at 320,375,768,1024,1440px with no overflow or clipped navigation; RTL and natural Arabic for Arabic requests.",
  "Include real LOCAL JavaScript interactions when relevant: mobile menu, filters, accordions, demo shopping cart with add/remove/quantity, input validation. All links and visible controls should work.",
  "Only static frontend demo can be generated: do not claim real payments, secure admin panel, backend orders, authentication, inventory sync or email integration exist.",
  "No React, remote assets, external CDNs, fetch, tracking, exfiltration or third-party dependencies; all visuals and code self-contained.",
  "Do not replace existing site sections outside the requested revision. Return COMPLETE code, not truncated."
].join("\n");
function contextFromFiles(existing) {
  if(existing===undefined||existing===null) return "";
  if(typeof existing!=="object"||Array.isArray(existing)) throw new RequestError("ملفات الموقع الحالي غير صالحة.",400);
  return JSON.stringify({
    "index.html":typeof existing["index.html"]==="string"?existing["index.html"].slice(0,8500):"",
    "styles.css":typeof existing["styles.css"]==="string"?existing["styles.css"].slice(0,4000):"",
    "script.js":typeof existing["script.js"]==="string"?existing["script.js"].slice(0,2500):""
  });
}
async function createWebsite(ai,body,notify) {
  const chosen=selectAIModel(body.model);
  const existing=contextFromFiles(body.existingFiles);
  notify("analyzing","جارٍ فهم الفكرة والوظائف التي طلبتها...");
  notify("planning","جارٍ تخطيط الأقسام والألوان وتجربة المستخدم...");
  let plan=null;
  try {
    const text=await runTextModel(ai,PLAN_MODEL,[
      {role:"system",content:"You are a professional design planner. Output ONLY JSON with fields name, concept, colors (4-5 hex colors), sections (5-8 objects of type,title,layout,details), interactions (string array). Create an original coherent design plan; specific content, not placeholder cards. Honor the user's language. Do not claim real online payments or backend."},
      {role:"user",content:"Style: "+STYLES[body.style]+"\nBrief:\n"+body.prompt.slice(0,4800)}
    ],1400);
    plan=planJson(text);
  } catch(error) {console.warn("Design planning fallback",error?.message);}
  const brief="Original request:\n"+body.prompt+"\n\nStyle:\n"+STYLES[body.style]+"\n\nDesign blueprint:\n"+JSON.stringify(plan||{instruction:"Plan thoughtfully before writing HTML"})+"\n\nExisting files:\n"+existing+
    "\n\nIMPORTANT: deliver an original polished STATIC site. For shops, provide a functioning client-only demo cart with interactions but NEVER claim payments, secure orders or real admin exist.";
  notify("building","جارٍ برمجة المكونات والتصميم والتفاعلات...");
  let model=chosen;
  let text;
  try {
    text=await runTextModel(ai,model,[{role:"system",content:SYSTEM},{role:"user",content:brief}]);
  } catch(error) {
    if(model.id===AI_MODELS["qwen-coder"].id) throw error;
    notify("fallback","تعذّر النموذج المختار؛ جارٍ تجربة Qwen Coder...");
    model=AI_MODELS["qwen-coder"];
    text=await runTextModel(ai,model,[{role:"system",content:SYSTEM},{role:"user",content:brief}]);
  }
  notify("reviewing","جارٍ فحص HTML وCSS والأقسام الأساسية...");
  let files;
  try { files=splitHtml(text); }
  catch(error) {
    notify("refining","الملفات غير مكتملة؛ جارٍ إصلاح النتيجة...");
    const retry=await runTextModel(ai,model,[
      {role:"system",content:SYSTEM+"\nEarlier output was incomplete; output a COMPLETE HTML with at least 4 section tags and a substantial <style> tag."},
      {role:"user",content:brief.slice(0,11000)+"\n\nIssue to fix: "+error.message}
    ]);
    files=splitHtml(retry);
  }
  const isStore=/متجر|شراء|منتج|سلة|checkout|store|ecommerce|shop/i.test(body.prompt);
  return {
    summary:"اكتمل إنشاء الموقع باستخدام "+model.label+". "+(isStore?"المعاينة تمثل واجهة متجر وتجربة تفاعلية تجريبية؛ المدفوعات والطلبات الحقيقية ولوحة الإدارة الآمنة تحتاج خدمات خلفية.":"راجع المعاينة ثم انشر التصميم إن أعجبك."),
    model:model.id,modelLabel:model.label,designStyle:body.style,designPlan:plan||undefined,files
  };
}
export async function onRequestPost({request,env}) {
  try {
    const user=await requireFirebaseUser(request);
    enforceUserRateLimit(user.uid,5);
    if(!env.AI) throw new RequestError("لم يتم تفعيل ربط Workers AI باسم AI في Cloudflare.",503);
    const body=await request.json().catch(()=>null);
    const prompt=typeof body?.prompt==="string"?body.prompt.trim():"";
    if(!prompt) throw new RequestError("اكتب وصف الموقع أولاً.",400);
    if(prompt.length>6000) throw new RequestError("الوصف أطول من 6000 حرف.",413);
    const style=typeof body?.style==="string"&&Object.hasOwn(STYLES,body.style)?body.style:"premium";
    const data={...body,prompt,style};
    if(!(request.headers.get("Accept")||"").includes("application/x-ndjson")) {
      return Response.json(await createWebsite(env.AI,data,()=>{}),{headers:{"Cache-Control":"no-store"}});
    }
    const stream=new ReadableStream({
      async start(controller) {
        const encoder=new TextEncoder();
        const emit=(type,payload)=>controller.enqueue(encoder.encode(JSON.stringify({type,...payload})+"\n"));
        try {
          const result=await createWebsite(env.AI,data,(stage,message)=>emit("progress",{stage,message}));
          emit("complete",{result});
        } catch(error) {
          console.error("ZYQMORA build failed:",error);
          const message=error instanceof RequestError?error.message:"فشل إنشاء الموقع. قد تكون الحصة اليومية أو النموذج غير متاح؛ جرّب نموذجاً آخر.";
          emit("error",{message});
        } finally { controller.close(); }
      }
    });
    return new Response(stream,{headers:{"Content-Type":"application/x-ndjson; charset=utf-8","Cache-Control":"no-store","X-Content-Type-Options":"nosniff"}});
  } catch(error){return jsonError(error);}
}
