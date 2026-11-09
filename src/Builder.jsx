import { useEffect, useMemo, useRef, useState } from "react";
import {
  Bot, Check, CircleAlert, Code2, Copy, Cpu, Eye, LoaderCircle,
  MessageSquare, RefreshCw, Save, Send, Sparkles, WandSparkles
} from "lucide-react";
import {
  addDoc, collection, doc, serverTimestamp, updateDoc
} from "firebase/firestore";
import { auth, db } from "./firebase.js";
import { aiRequest } from "./aiClient.js";
import "./builder.css";

const starterMessage = {
  role: "assistant",
  content: "أهلاً بك في ZYQMORA AI. أستطيع مساعدتك في البرمجة، أو إنشاء موقع كامل ومعاينته هنا. اختر نموذجاً محلياً ثم اكتب طلبك."
};

function makePreview(files) {
  if (!files?.["index.html"]) return "";
  let html = files["index.html"];
  const css = files["styles.css"] || "";
  const js = (files["script.js"] || "").replace(/<\/script/gi, "<\\/script");
  const policy = '<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; img-src data: https:; style-src \'unsafe-inline\' https:; font-src data: https:; script-src \'unsafe-inline\'; connect-src \'none\'; form-action \'none\'; base-uri \'none\'">';
  if (/<head[^>]*>/i.test(html)) {
    html = html.replace(/<head([^>]*)>/i, "<head$1>" + policy);
  } else {
    html = "<head>" + policy + "</head>" + html;
  }

  const styleTag = "<style>\n" + css + "\n</style>";
  if (/<link[^>]+href=[\"']styles\.css[\"'][^>]*>/i.test(html)) {
    html = html.replace(/<link[^>]+href=[\"']styles\.css[\"'][^>]*>/i, styleTag);
  } else {
    html = html.replace(/<\/head>/i, styleTag + "</head>");
  }

  const scriptTag = "<script>\n" + js + "\n</script>";
  if (/<script[^>]+src=[\"']script\.js[\"'][^>]*><\/script>/i.test(html)) {
    html = html.replace(/<script[^>]+src=[\"']script\.js[\"'][^>]*><\/script>/i, scriptTag);
  } else {
    html = html.replace(/<\/body>/i, scriptTag + "</body>");
  }
  return html;
}

export default function Builder({ user }) {
  const [messages, setMessages] = useState([starterMessage]);
  const [input, setInput] = useState("");
  const [projectName, setProjectName] = useState("");
  const [models, setModels] = useState([]);
  const [selectedModel, setSelectedModel] = useState("");
  const [health, setHealth] = useState({ ok: false, error: "جارٍ فحص المحرك..." });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [files, setFiles] = useState(null);
  const [summary, setSummary] = useState("");
  const [activeFile, setActiveFile] = useState("preview");
  const [savedProjectId, setSavedProjectId] = useState("");
  const [saveMessage, setSaveMessage] = useState("");
  const messagesEndRef = useRef(null);

  const preview = useMemo(() => makePreview(files), [files]);

  async function refreshEngine() {
    setHealth({ ok: false, error: "جارٍ فحص محرك Ollama..." });
    try {
      const healthData = await aiRequest("/api/health");
      setHealth(healthData);
      const token = await auth.currentUser?.getIdToken();
      const modelData = await aiRequest("/api/ai/models", { token });
      setModels(modelData.models || []);
      setSelectedModel((current) => current && modelData.models.includes(current)
        ? current
        : (modelData.models.includes(modelData.defaultModel) ? modelData.defaultModel : modelData.models[0] || ""));
    } catch (err) {
      setHealth({ ok: false, error: err.message });
      setModels([]);
    }
  }

  useEffect(() => {
    refreshEngine();
  }, [user?.uid]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, busy]);

  async function sendMessage() {
    const text = input.trim();
    if (!text || busy) return;
    setError("");
    setInput("");
    const nextMessages = [...messages, { role: "user", content: text }];
    setMessages(nextMessages);
    setBusy(true);
    try {
      const token = await auth.currentUser?.getIdToken();
      const result = await aiRequest("/api/ai/chat", {
        method: "POST",
        token,
        body: {
          model: selectedModel || undefined,
          messages: nextMessages.slice(-16).map(({ role, content }) => ({ role, content }))
        }
      });
      setMessages((current) => [...current, { role: "assistant", content: result.content }]);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function buildWebsite() {
    const prompt = input.trim();
    if (!prompt || busy) return;
    setError("");
    setSaveMessage("");
    setInput("");
    const isRevision = Boolean(files);
    setMessages((current) => [...current, { role: "user", content: (isRevision ? "عدّل الموقع الحالي: " : "أنشئ موقعاً: ") + prompt }]);
    setBusy(true);
    setActiveFile("preview");

    try {
      const token = await auth.currentUser?.getIdToken();
      const result = await aiRequest("/api/ai/build", {
        method: "POST",
        token,
        body: { prompt, model: selectedModel || undefined, existingFiles: files || undefined }
      });

      setFiles(result.files);
      setSummary(result.summary || "تم إنشاء الموقع.");
      setMessages((current) => [...current, {
        role: "assistant",
        content: (result.summary || "تم إنشاء الموقع.") + "\n\nأنشأت ملفات HTML وCSS وJavaScript. افتح تبويب المعاينة لمشاهدة الموقع."
      }]);

      try {
        if (savedProjectId) {
          await updateDoc(doc(db, "projects", savedProjectId), {
            prompt: prompt.slice(0, 6000),
            generatedFiles: result.files,
            aiModel: result.model || selectedModel || "local-ollama",
            updatedAt: serverTimestamp()
          });
          setSaveMessage("تم تحديث ملفات المشروع في Firestore.");
        } else {
          const saved = await addDoc(collection(db, "projects"), {
            ownerUid: user.uid,
            name: (projectName.trim() || prompt.slice(0, 55) || "مشروع جديد").slice(0, 80),
            prompt: prompt.slice(0, 6000),
            status: "draft",
            framework: "html",
            visibility: "private",
            generatedFiles: result.files,
            aiModel: result.model || selectedModel || "local-ollama",
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp()
          });
          setSavedProjectId(saved.id);
          setSaveMessage("تم حفظ المشروع وملفاته في Firestore.");
        }
      } catch (saveError) {
        console.error("Could not save generated project:", saveError);
        setSaveMessage("تم إنشاء الموقع ومعاينته، لكن تعذّر حفظه في Firestore. انشر قواعد Firestore المحدّثة ثم أعد الحفظ.");
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function copyActiveFile() {
    const content = files?.[activeFile];
    if (!content) return;
    try {
      await navigator.clipboard.writeText(content);
      setSaveMessage("تم نسخ محتوى الملف.");
    } catch {
      setSaveMessage("تعذّر النسخ من المتصفح. حدّد الكود وانسخه يدوياً.");
    }
  }

  const activeCode = files?.[activeFile] || "";

  return (
    <section className="ai-builder">
      <header className="ai-builder-heading">
        <div>
          <div className="eyebrow"><Sparkles size={15} /> مساحة البناء الذكي</div>
          <h1>دردشة ZYQMORA AI</h1>
          <p>مساعد برمجي محلي ينشئ المواقع دون مفاتيح API مدفوعة.</p>
        </div>
        <div className={health.ok ? "engine-indicator is-online" : "engine-indicator is-offline"}>
          <span className="engine-indicator-dot" />
          <span>{health.ok ? "محرك Ollama متصل" : "المحرك غير متصل"}</span>
          <button type="button" onClick={refreshEngine} title="فحص المحرك"><RefreshCw size={15} /></button>
        </div>
      </header>

      <div className="ai-builder-grid">
        <section className="ai-chat-card">
          <div className="ai-panel-header">
            <div className="ai-panel-title"><div className="ai-panel-icon"><Bot size={19} /></div><div><strong>المساعد الذكي</strong><small>تشغيل محلي عبر Ollama</small></div></div>
            <label className="model-picker">
              <Cpu size={15} />
              <select value={selectedModel} onChange={(event) => setSelectedModel(event.target.value)} disabled={!models.length || busy}>
                {!models.length && <option value="">لا توجد نماذج</option>}
                {models.map((model) => <option key={model} value={model}>{model}</option>)}
              </select>
            </label>
          </div>

          {!health.ok && (
            <div className="engine-warning">
              <CircleAlert size={17} />
              <div><strong>المحرك غير جاهز بعد</strong><span>{health.error || "شغّل Ollama ونزّل نموذجاً محلياً."}</span></div>
            </div>
          )}

          <div className="ai-message-list">
            {messages.map((message, index) => (
              <article key={index} className={"ai-message " + (message.role === "user" ? "from-user" : "from-ai")}>
                {message.role === "assistant" && <div className="ai-message-avatar"><Bot size={16} /></div>}
                <div className="ai-message-bubble">
                  <div className="ai-message-label">{message.role === "user" ? "أنت" : "ZYQMORA AI"}</div>
                  <p>{message.content}</p>
                </div>
              </article>
            ))}
            {busy && <div className="ai-thinking"><LoaderCircle size={16} /> يفكر النموذج المحلي ويجهّز النتيجة...</div>}
            <div ref={messagesEndRef} />
          </div>

          {error && <div className="ai-error"><CircleAlert size={16} /> {error}</div>}
          <div className="ai-compose">
            <input value={projectName} onChange={(event) => setProjectName(event.target.value)} placeholder="اسم المشروع (اختياري)" maxLength={80} />
            <textarea
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  sendMessage();
                }
              }}
              placeholder="اسأل المساعد أو صف الموقع الذي تريد إنشاءه..."
              rows={3}
              maxLength={6000}
            />
            <div className="ai-compose-actions">
              <span>{input.length}/6000</span>
              <div>
                <button type="button" className="ai-send-button" onClick={sendMessage} disabled={busy || !input.trim() || !models.length}><Send size={16} /> إرسال</button>
                <button type="button" className="ai-build-button" onClick={buildWebsite} disabled={busy || !input.trim() || !models.length}><WandSparkles size={16} /> إنشاء موقع</button>
              </div>
            </div>
          </div>
        </section>

        <section className="ai-preview-card">
          <div className="ai-preview-header">
            <div><strong><Eye size={17} /> مساحة المعاينة</strong><small>{files ? "مشروعك المولّد" : "ستظهر النتيجة هنا بعد الإنشاء"}</small></div>
            {files && <div className="ai-preview-header-actions"><span className="ai-generated-badge"><Check size={13} /> تم التوليد</span><button type="button" onClick={() => { setFiles(null); setSavedProjectId(""); setSaveMessage(""); setSummary(""); setProjectName(""); setActiveFile("preview"); }}>مشروع جديد</button></div>}
          </div>

          {files ? (
            <>
              <div className="ai-file-tabs">
                <button className={activeFile === "preview" ? "selected" : ""} onClick={() => setActiveFile("preview")}><Eye size={14} /> معاينة</button>
                <button className={activeFile === "index.html" ? "selected" : ""} onClick={() => setActiveFile("index.html")}>HTML</button>
                <button className={activeFile === "styles.css" ? "selected" : ""} onClick={() => setActiveFile("styles.css")}>CSS</button>
                <button className={activeFile === "script.js" ? "selected" : ""} onClick={() => setActiveFile("script.js")}>JS</button>
                {activeFile !== "preview" && <button className="copy-code-button" onClick={copyActiveFile}><Copy size={14} /> نسخ</button>}
              </div>
              {activeFile === "preview" ? (
                <iframe className="ai-live-preview" title="معاينة الموقع الذي أنشأه الذكاء الاصطناعي" sandbox="allow-scripts" srcDoc={preview} />
              ) : (
                <pre className="ai-code-view"><code>{activeCode}</code></pre>
              )}
              <div className="ai-save-status">
                <span>{savedProjectId ? <><Check size={14} /> {saveMessage}</> : saveMessage || summary}</span>
                {savedProjectId && <small>معرّف المشروع: {savedProjectId}</small>}
              </div>
            </>
          ) : (
            <div className="ai-preview-empty">
              <div className="ai-preview-empty-icon"><Code2 size={31} /></div>
              <strong>مساحة موقعك الجديد</strong>
              <p>اكتب وصف موقعك ثم اضغط «إنشاء موقع». سيولّد النموذج ملفات الموقع ويعرضها هنا داخل معاينة معزولة.</p>
              <div className="ai-preview-steps"><span><MessageSquare size={14} /> اكتب فكرتك</span><span><WandSparkles size={14} /> ولّد الملفات</span><span><Eye size={14} /> راجع المعاينة</span></div>
            </div>
          )}
        </section>
      </div>

      <div className="ai-builder-footnote">
        <CircleAlert size={15} />
        <span>النموذج يعمل على جهاز/خادم يشغّل Ollama. GitHub يحفظ الكود فقط، وFirebase Hosting لا يشغّل نموذج الذكاء الاصطناعي بنفسه.</span>
      </div>
    </section>
  );
}
