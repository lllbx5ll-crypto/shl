import test from "node:test";
import assert from "node:assert/strict";
import { createWebsite, splitHtml } from "../functions/api/ai/build.js";
import { AI_MODELS, selectAIModel, runTextModel } from "../functions/_shared/models.js";
import "../functions/api/ai/chat.js";

const markup = [
  '<header><nav><a href="#home">Brand</a><button data-menu-toggle aria-expanded="false">Menu</button><div data-menu><a href="#services">Services</a></div></nav></header>',
  '<main id="home"><section class="hero"><h1>متجر أنيق</h1><p>منتجات مختارة بعناية.</p><a href="#products">اكتشف المنتجات</a></section>',
  '<section id="products"><h2>المنتجات</h2><article class="card"><h3>منتج مميز</h3><button data-cart-add>أضف للسلة</button></article></section>',
  '<section id="services"><h2>الخدمات</h2><p>خدمات مخصصة بجودة عالية.</p></section>',
  '<section id="story"><h2>قصتنا</h2><p>تفاصيل العلامة التجارية.</p></section>',
  '<section id="faq"><h2>الأسئلة الشائعة</h2><button data-faq-toggle aria-expanded="false">سؤال</button><div hidden>الإجابة</div></section>',
  '<section id="contact"><h2>تواصل معنا</h2><form data-demo-form><input aria-label="البريد الإلكتروني"><button>إرسال</button><p data-form-status></p></form></section></main>',
  '<footer><p>© جميع الحقوق محفوظة</p></footer>'
].join("");
const css = ":root{--brand:#7354d6;--paper:#fff;--ink:#222;--radius:18px}body{margin:0;background:var(--paper);color:var(--ink);font-family:system-ui}main{max-width:1200px;margin:auto}section{padding:64px 24px}.hero{min-height:70vh;display:grid;align-content:center;background:linear-gradient(135deg,#f5f1ff,#fff)}.card{padding:24px;border-radius:var(--radius);box-shadow:0 12px 32px #0001}button{padding:12px 20px;border-radius:99px;background:var(--brand);color:#fff;border:0}nav{display:flex;gap:24px;align-items:center}@media(max-width:760px){section{padding:40px 16px}.hero{min-height:60vh}nav{flex-wrap:wrap}[data-menu]{display:none}[data-menu].is-open{display:flex}}";
const js = 'document.addEventListener("click",function(e){var b=e.target.closest("[data-cart-add]");if(b){var c=document.querySelector("[data-cart-count]");if(c)c.textContent=String((Number(c.textContent)||0)+1);}});';
const plan = JSON.stringify({
  name:"متجر أنيق",concept:"Premium product store",visualDirection:"Ivory and violet editorial",
  palette:["#7354d6","#f5f1ff","#22243a","#ffffff","#e7e0f5"],
  sections:[{type:"hero",title:"المقدمة"},{type:"products",title:"المنتجات"},{type:"services",title:"الخدمات"},{type:"story",title:"قصتنا"}],
  interactions:["mobile navigation","demo cart"]
});
function fakeAI(options) {
  const generation={html:0,css:0,js:0};
  return {
    generation,
    async run(model,params) {
      const system=params.messages[0].content;
      if(system.includes("creative director"))return {response:plan};
      if(system.includes("HTML engineer")){generation.html++;return {response:options.html?options.html(generation.html):markup};}
      if(system.includes("CSS engineer")){generation.css++;return {response:options.css?options.css(generation.css):css};}
      if(system.includes("JavaScript engineer")){generation.js++;return {response:options.js?options.js(generation.js):js};}
      return {response:"ok"};
    }
  };
}
test("supports allow-listed models and safe default selection",()=>{
  assert.equal(Object.keys(AI_MODELS).length,3);
  assert.equal(selectAIModel("gemma-4").label,"Gemma 4");
  assert.equal(selectAIModel("qwen-3.8").label,"Qwen 3.8");
  assert.equal(selectAIModel("arbitrary-model").label,"Gemma 4");
});
test("wraps a body fragment into complete HTML files",()=>{
  const full='<html lang="ar"><head><style>'+css+'</style></head><body>'+markup+'<script>'+js+'</script></body></html>';
  const files=splitHtml(full);
  assert.match(files["index.html"],/^<!doctype html>/i);
  assert.match(files["index.html"],/<\/html>$/i);
  assert.match(files["index.html"],/styles\.css/);
  assert.match(files["index.html"],/script\.js/);
  assert.match(files["styles.css"],/--brand/);
  assert.match(files["script.js"],/data-cart-add/);
});
test("rejects genuinely incomplete body fragments",()=>{
  assert.throws(()=>splitHtml("<html><body><section>unfinished</section></body></html>"));
});
test("rejects truncated pages with unclosed sections",async()=>{
  const truncated='<header><nav>Brand</nav></header><main>'+markup.slice(markup.indexOf("<section"),markup.indexOf("</footer>")) ;
  const ai=fakeAI({html:()=>truncated});
  await assert.rejects(()=>createWebsite(ai,{prompt:"موقع شركة",style:"auto"},()=>{}));
});
test("builds a bespoke prompt-only site through separate HTML CSS and JS stages",async()=>{
  const ai=fakeAI({});
  const stages=[];
  const result=await createWebsite(ai,{prompt:"أريد متجراً إلكترونياً للأزياء النسائية",style:"auto"},(stage)=>stages.push(stage));
  assert.deepEqual(stages,["analyzing","planning","building","styling","interactions","reviewing"]);
  assert.equal(ai.generation.html,1);
  assert.equal(ai.generation.css,1);
  assert.equal(ai.generation.js,1);
  assert.equal(result.siteName,"متجر أنيق");
  assert.match(result.files["index.html"],/dir="rtl"/);
  assert.match(result.files["index.html"],/<\/html>/);
  assert.match(result.files["index.html"],/meta name="viewport"/);
  assert.match(result.files["styles.css"],/@media/);
  assert.match(result.files["script.js"],/data-cart-add/);
  assert.match(result.summary,/سلة/);
});
test("repairs an incomplete HTML fragment automatically",async()=>{
  const ai=fakeAI({html:(count)=>count===1?"<section>partial</section>":markup});
  const stages=[];
  const result=await createWebsite(ai,{prompt:"صفحة شركة تقنية",style:"auto"},(stage)=>stages.push(stage));
  assert.ok(stages.includes("refining"));
  assert.equal(ai.generation.html,2);
  assert.match(result.files["index.html"],/<\/html>/);
});
test("uses coding fallback if the selected model is unavailable",async()=>{
  const ai={
    generation:{html:0,css:0,js:0},
    async run(model,params) {
      const system=params.messages[0].content;
      if(system.includes("creative director"))return {response:plan};
      if(model===AI_MODELS["qwen-3.8"].id)throw new Error("Unavailable");
      if(system.includes("HTML engineer")){this.generation.html++;return {response:markup};}
      if(system.includes("CSS engineer")){this.generation.css++;return {response:css};}
      if(system.includes("JavaScript engineer")){this.generation.js++;return {response:js};}
      return {response:"ok"};
    }
  };
  const result=await createWebsite(ai,{prompt:"موقع لشركة تقنية",model:"qwen-3.8",style:"auto"},()=>{});
  assert.equal(result.model,AI_MODELS["qwen-coder"].id);
});
test("rejects unsafe custom JavaScript and retains safe local interactions",async()=>{
  const ai=fakeAI({js:()=>'fetch("https://example.com")'});
  const result=await createWebsite(ai,{prompt:"موقع متجر",style:"auto"},()=>{});
  assert.match(result.files["script.js"],/data-cart-add/);
  assert.doesNotMatch(result.files["script.js"],/fetch\(/);
});
test("model runner handles Cloudflare response shapes",async()=>{
  const ai={async run(){return {choices:[{message:{content:"جاهز"}}]};}};
  assert.equal(await runTextModel(ai,AI_MODELS["gemma-4"],[{role:"user",content:"hi"}]),"جاهز");
});
