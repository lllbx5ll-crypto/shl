import { useEffect, useMemo, useState } from "react";
import { addDoc, collection, doc, serverTimestamp, updateDoc } from "firebase/firestore";
import { Bot, Check, CircleAlert, Code2, Copy, Cpu, Eye, LoaderCircle, Send, Sparkles, WandSparkles } from "lucide-react";
import { db } from "./firebase.js";
import {
  BROWSER_MODELS,
  browserAICapable,
  browserChat,
  browserBuildWebsite,
  buildFreeTemplate
} from "./browserAI.js";
import "./builder.css";

function htmlPreview(files) {
  if (!files || !files["index.html"]) return "";
  const css = (files["styles.css"] || "").replace(/<\/style/gi, "<\\/style");
  const js = (files["script.js"] || "").replace(/<\/script/gi, "<\\/script");
  const policy = '<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; img-src data:; style-src \'unsafe-inline\'; script-src \'unsafe-inline\'; connect-src \'none\'; form-action \'none\'; base-uri \'none\'">';
  let html = files["index.html"];
  html = /<head[^>]*>/i.test(html)
    ? html.replace(/<head([^>]*)>/i, "<head$1>" + policy)
    : "<head>" + policy + "</head>" + html;
  const styleTag = "<style>" + css + "</style>";
  html = /<link[^>]+href=["']styles\.css["'][^>]*>/i.test(html)
    ? html.replace(/<link[^>]+href=["']styles\.css["'][^>]*>/i, styleTag)
    : html.replace(/<\/head>/i, styleTag + "</head>");
  const scriptTag = "<script>" + js + "</script>";
  html = /<script[^>]+src=["']script\.js["'][^>]*><\/script>/i.test(html)
    ? html.replace(/<script[^>]+src=["']script\.js["'][^>]*><\/script>/i, scriptTag)
    : html.replace(/<\/body>/i, scriptTag + "</body>");
  return html;
}

export default function BrowserBuilder({ user }) {
  const [webgpu, setWebgpu] = useState(false);
  const [model, setModel] = useState(BROWSER_MODELS[0].id);
  const [messages, setMessages] = useState([{
    role: "assistant",
    content: "أهلاً بك! يمكنك إنشاء قالب موقع مجاني فوراً على أي جهاز. ولتجربة الذكاء الاصطناعي نفسه، يلزم متصفح يدعم WebGPU وتنزيل نموذج صغير أول مرة."
  }]);
  const [input, setInput] = useState("");
  const [projectName, setProjectName] = useState("");
  const [files, setFiles] = useState(null);
  const [projectId, setProjectId] = useState("");
  const [activeTab, setActiveTab] = useState("preview");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => setWebgpu(browserAICapable()), []);
  const preview = useMemo(() => htmlPreview(files), [files]);

  async function saveFiles(result, prompt) {
    setSaved(false);
    try {
      if (projectId) {
        await updateDoc(doc(db, "projects", projectId), {
          prompt: prompt.slice(0, 6000),
          generatedFiles: result.files,
          aiModel: result.model,
          updatedAt: serverTimestamp()
        });
      } else {
        const reference = await addDoc(collection(db, "projects"), {
          ownerUid: user.uid,
          name: (projectName.trim() || prompt.slice(0, 55) || "موقع جديد").slice(0, 80),
          prompt: prompt.slice(0, 6000),
          status: "draft",
          framework: "html",
          visibility: "private",
          generatedFiles: result.files,
          aiModel: result.model,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
        setProjectId(reference.id);
      }
      setSaved(true);
      setNotice("تم حفظ ملفات الموقع في Firestore. لم يتم نشره للعامة.");
    } catch {
      setNotice("المعاينة جاهزة، لكن تعذّر الحفظ في Firestore. تحقق من القواعد المنشورة.");
    }
  }

  async function generate(type) {
    const prompt = input.trim();
    if (!prompt || busy) return;
    setError("");
    setNotice("");
    setProgress("");
    setBusy(true);
    setActiveTab("preview");
    try {
      let result;
      if (type === "template") {
        result = buildFreeTemplate(prompt);
      } else {
        if (!webgpu) throw new Error("هذا الجهاز لا يدعم WebGPU؛ استخدم زر القالب الفوري المجاني.");
        result = await browserBuildWebsite({
          model,
          prompt,
          existingFiles: files || undefined,
          onProgress: setProgress
        });
      }
      setFiles(result.files);
      setInput("");
      setMessages((current) => [...current,
        { role: "user", content: prompt },
        { role: "assistant", content: result.summary }
      ]);
      await saveFiles(result, prompt);
    } catch (err) {
      setError(err?.message || "حدث خطأ. حاول مجدداً.");
    } finally {
      setBusy(false);
      setProgress("");
    }
  }

  async function sendChat() {
    const text = input.trim();
    if (!text || busy || !webgpu) return;
    const next = [...messages, { role: "user", content: text }];
    setMessages(next);
    setInput("");
    setBusy(true);
    setError("");
    setProgress("");
    try {
      const result = await browserChat({
        model,
        messages: next,
        onProgress: setProgress
      });
      setMessages((current) => [...current, { role: "assistant", content: result.content }]);
    } catch (err) {
      setError(err?.message || "فشل تشغيل النموذج.");
      setInput(text);
    } finally {
      setBusy(false);
      setProgress("");
    }
  }

  async function copyFile() {
    try {
      await navigator.clipboard.writeText(files?.[activeTab] || "");
      setNotice("تم نسخ الكود.");
    } catch {
      setNotice("لم يسمح المتصفح بالنسخ. يمكنك تحديد النص ونسخه يدوياً.");
    }
  }

  return (
    <section className="ai-builder">
      <header className="ai-builder-heading">
        <div>
          <div className="eyebrow"><Sparkles size={15} /> مجاني بلا مفاتيح API</div>
          <h1>ابنِ موقعك مع ZYQMORA AI</h1>
          <p>قالب فوري لأي جهاز، أو ذكاء اصطناعي تجريبي يعمل داخل المتصفح نفسه.</p>
        </div>
        <div className={webgpu ? "engine-indicator is-online" : "engine-indicator is-offline"}>
          <span className="engine-indicator-dot" />
          <span>{webgpu ? "WebGPU متاح" : "WebGPU غير متاح"}</span>
        </div>
      </header>
      <div className="ai-builder-grid">
        <section className="ai-chat-card">
          <div className="ai-panel-header">
            <div className="ai-panel-title">
              <div className="ai-panel-icon"><Bot size={19}/></div>
              <div><strong>دردشة وإنشاء المواقع</strong><small>بدون Puter أو API مدفوع</small></div>
            </div>
            <label className="model-picker">
              <Cpu size={16}/>
              <select aria-label="اختر نموذج الذكاء الاصطناعي" value={model} onChange={(event) => setModel(event.target.value)} disabled={busy}>
                {BROWSER_MODELS.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
              </select>
            </label>
          </div>
          <div className="browser-mode-note">
            النموذج يُنزّل إلى جهاز الزائر عند أول استخدام، وقد يستهلك مئات الميجابايت أو أكثر.
            الجودة محدودة ولا يعمل على كل الهواتف. القالب الفوري لا يحتاج نموذجاً ولا تنزيله.
          </div>
          {!webgpu && (
            <div className="engine-warning">
              <CircleAlert size={17}/>
              <div><strong>الذكاء المحلي غير مدعوم على هذا الجهاز</strong><span>زر «قالب فوري مجاني» يعمل بدونه.</span></div>
            </div>
          )}
          <div className="ai-message-list">
            {messages.map((message, i) => (
              <article key={i} className={"ai-message " + (message.role === "user" ? "from-user" : "from-ai")}>
                {message.role === "assistant" && <div className="ai-message-avatar"><Bot size={16}/></div>}
                <div className="ai-message-bubble">
                  <div className="ai-message-label">{message.role === "user" ? "أنت" : "ZYQMORA"}</div>
                  <p>{message.content}</p>
                </div>
              </article>
            ))}
            {busy && <div className="ai-thinking"><LoaderCircle size={16}/>{progress || "جارٍ العمل..."}</div>}
          </div>
          {error && <div className="ai-error"><CircleAlert size={16}/>{error}</div>}
          <div className="ai-compose">
            <input value={projectName} onChange={(event) => setProjectName(event.target.value)} placeholder="اسم المشروع (اختياري)" maxLength={80}/>
            <textarea rows={4} maxLength={6000} value={input} onChange={(event) => setInput(event.target.value)} placeholder="مثلاً: أنشئ موقع متجر إلكتروني فاخر بالألوان البنفسجية..."/>
            <div className="ai-compose-actions">
              <span>{input.length}/6000</span>
              <div>
                <button type="button" className="ai-send-button" onClick={sendChat} disabled={busy || !input.trim() || !webgpu}><Send size={15}/> دردشة AI</button>
                <button type="button" className="ai-build-button" onClick={() => generate("ai")} disabled={busy || !input.trim() || !webgpu}><WandSparkles size={15}/> إنشاء بالذكاء</button>
                <button type="button" className="ai-send-button" onClick={() => generate("template")} disabled={busy || !input.trim()}><Code2 size={15}/> قالب فوري مجاني</button>
              </div>
            </div>
          </div>
        </section>

        <section className="ai-preview-card">
          <div className="ai-preview-header">
            <div><strong><Eye size={17}/> معاينة الموقع</strong><small>{files ? "ملفات HTML وCSS وJavaScript" : "لم يتم إنشاء موقع بعد"}</small></div>
            {files && <div className="ai-preview-header-actions">
              {saved && <span className="ai-generated-badge"><Check size={13}/> محفوظ</span>}
              <button type="button" onClick={() => {setFiles(null);setProjectId("");setSaved(false);setNotice("");setActiveTab("preview");setProjectName("");}}>مشروع جديد</button>
            </div>}
          </div>
          {files ? (
            <>
              <div className="ai-file-tabs">
                {["preview","index.html","styles.css","script.js"].map((tab) => (
                  <button key={tab} className={activeTab === tab ? "selected" : ""} onClick={() => setActiveTab(tab)}>{tab === "preview" ? "معاينة" : tab}</button>
                ))}
                {activeTab !== "preview" && <button className="copy-code-button" onClick={copyFile}><Copy size={14}/> نسخ</button>}
              </div>
              {activeTab === "preview"
                ? <iframe className="ai-live-preview" title="معاينة آمنة للموقع" sandbox="allow-scripts" referrerPolicy="no-referrer" srcDoc={preview}/>
                : <pre className="ai-code-view"><code>{files[activeTab] || ""}</code></pre>}
              {notice && <div className="ai-save-status">{notice}</div>}
            </>
          ) : (
            <div className="ai-preview-empty">
              <div className="ai-preview-empty-icon"><Code2 size={31}/></div>
              <strong>مساحة موقعك الجديد</strong>
              <p>اكتب طلبك ثم اضغط «قالب فوري مجاني» لنتيجة سريعة على أي جهاز، أو «إنشاء بالذكاء» إن كان WebGPU متاحاً.</p>
            </div>
          )}
        </section>
      </div>
      <div className="ai-builder-footnote">
        <CircleAlert size={15}/>
        <span>هذه نسخة مجانية تجريبية: القوالب تُولّد بقواعد برمجية، والذكاء الاصطناعي المحلي يحتاج موارد جهاز الزائر. لا يوجد خادم AI مدفوع أو Puter. لا يُنشر موقع المستخدم للعامة دون موافقته.</span>
      </div>
    </section>
  );
}
