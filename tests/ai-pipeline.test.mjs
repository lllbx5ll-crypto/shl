import test from "node:test";
import assert from "node:assert/strict";
import { createWebsite, splitHtml } from "../functions/api/ai/build.js";
import { AI_MODELS, selectAIModel, runTextModel } from "../functions/_shared/models.js";
import "../functions/api/ai/chat.js";

const css = "body{background:#fff;color:#222;font-family:system-ui;margin:0}section{padding:48px}a{color:rebeccapurple}".repeat(7);
const html = '<!doctype html><html lang="ar" dir="rtl"><head><title>نموذج تجريبي</title><style>' + css +
  '</style></head><body><main><section><h1>متجر أنيق</h1></section><section><h2>المنتجات</h2></section><section><h2>الخدمات</h2></section></main><script>console.log("ready")</script></body></html>';
const plan = JSON.stringify({name:"متجر أنيق",concept:"modern",colors:["#fff","#222","#846cda"],
  sections:[{type:"hero",title:"المقدمة"},{type:"products",title:"المنتجات"},{type:"cta",title:"اتصل بنا"}],interactions:["cart"]});

test("supports three allow-listed models and safe fallback",()=>{
  assert.equal(Object.keys(AI_MODELS).length,3);
  assert.equal(selectAIModel("gemma-4").label,"Gemma 4");
  assert.equal(selectAIModel("qwen-3.8").label,"Qwen 3.8");
  assert.equal(selectAIModel("../../something").label,"Gemma 4");
});

test("splits generated HTML into standalone preview files",()=>{
  const files=splitHtml(html);
  assert.match(files["index.html"],/styles\.css/);
  assert.match(files["index.html"],/script\.js/);
  assert.match(files["styles.css"],/background:#fff/);
  assert.match(files["script.js"],/ready/);
});

test("rejects incomplete generic output rather than publishing it",()=>{
  assert.throws(()=>splitHtml("<html><body>unfinished</body></html>"));
  assert.throws(()=>splitHtml('<html><body><style>a{}</style><section></section></body></html>'));
});

test("two-stage studio generator sends grounded progress and returns files",async()=>{
  const called=[];
  const ai={async run(model,options){
    called.push(model);
    if(options.messages[0].content.includes("design planner")) return {response:plan};
    return {response:html};
  }};
  const stages=[];
  const result=await createWebsite(ai,{prompt:"صمّم متجراً","style":"premium","model":"qwen-coder"},(stage)=>stages.push(stage));
  assert.deepEqual(stages,["analyzing","planning","building","reviewing"]);
  assert.equal(called.length,2);
  assert.equal(result.model,AI_MODELS["qwen-coder"].id);
  assert.equal(result.designPlan.sections.length,3);
  assert.match(result.files["index.html"],/متجر/);
  assert.match(result.summary,/المدفوعات/);
});

test("failed requested model automatically falls back to the code model",async()=>{
  const ai={async run(model,options){
    if(options.messages[0].content.includes("design planner"))return {response:plan};
    if(model===AI_MODELS["qwen-3.8"].id)throw new Error("Model unavailable");
    return {response:html};
  }};
  const stages=[];
  const result=await createWebsite(ai,{prompt:"صفحة شركة",style:"modern",model:"qwen-3.8"},(stage)=>stages.push(stage));
  assert.ok(stages.includes("fallback"));
  assert.equal(result.modelLabel,"Qwen Coder");
});

test("repairs an incomplete HTML output once instead of returning a broken result",async()=>{
  let generation=0;
  const ai={async run(model,options){
    if(options.messages[0].content.includes("design planner"))return {response:plan};
    generation+=1;
    return {response:generation===1?"<html><body>unfinished</body></html>":html};
  }};
  const stages=[];
  const result=await createWebsite(ai,{prompt:"صفحة شركة",style:"modern",model:"qwen-coder"},(stage)=>stages.push(stage));
  assert.ok(stages.includes("refining"));
  assert.equal(generation,2);
  assert.match(result.files["styles.css"],/background:#fff/);
});

test("model runner handles completion response shapes",async()=>{
  const ai={async run(){return {choices:[{message:{content:"جاهز"}}]};}};
  assert.equal(await runTextModel(ai,AI_MODELS["gemma-4"],[{role:"user",content:"hi"}]),"جاهز");
});
