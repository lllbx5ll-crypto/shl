import { useMemo, useState } from "react";
import { addDoc, collection, deleteDoc, deleteField, doc, getDoc, serverTimestamp, setDoc, updateDoc } from "firebase/firestore";
import { Bot, Check, CircleAlert, Code2, Cpu, Eye, Link as LinkIcon, LoaderCircle, Palette, Send, Sparkles, WandSparkles, Globe2, Trash2 } from "lucide-react";
import { db } from "./firebase.js";
import { buildFreeTemplate } from "./browserAI.js";
import { renderSiteDocument } from "./sitePreview.js";
import "./builder.css";


async function requestCloudAI(user, endpoint, payload) {
  if (!user?.getIdToken) throw new Error("انتهت جلسة الدخول. سجّل الدخول مجدداً.");
  const token = await user.getIdToken();
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer " + token
    },
    body: JSON.stringify(payload)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || "تعذّر الاتصال بمحرك الذكاء الاصطناعي السحابي.");
  }
  return data;
}

const designStyles = [
  { id: "premium", label: "فاخر" },
  { id: "modern", label: "عصري" },
  { id: "minimal", label: "هادئ" },
  { id: "creative", label: "إبداعي" },
  { id: "tech", label: "تقني" }
];

export default function BrowserBuilder({ user }) {
  const [messages, setMessages] = useState([{
    role: "assistant",
    content: "أهلاً بك في ZYQMORA AI. صف الموقع الذي تتخيله، واختر أسلوب التصميم، وسأجهّز لك موقعاً كاملاً لتعاينه قبل نشره. لا تحتاج إلى تنزيل نموذج على جهازك."
  }]);
  const [input, setInput] = useState("");
  const [projectName, setProjectName] = useState("");
  const [designStyle, setDesignStyle] = useState("premium");
  const [files, setFiles] = useState(null);
  const [projectId, setProjectId] = useState("");

  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [saved, setSaved] = useState(false);
  const [publishedId, setPublishedId] = useState("");
  const [publishing, setPublishing] = useState(false);
  const publishedUrl = publishedId ? window.location.origin + "/s/" + publishedId : "";

  const preview = useMemo(() => renderSiteDocument(files), [files]);

  async function saveFiles(result, prompt, style) {
    setSaved(false);
    try {
      if (projectId) {
        await updateDoc(doc(db, "projects", projectId), {
          prompt: prompt.slice(0, 6000),
          generatedFiles: result.files,
          aiModel: result.model,
          designStyle: style,
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
          designStyle: style,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
        setProjectId(reference.id);
      }
      setSaved(true);
      setNotice(publishedId ? "تم حفظ تعديلك كمسودة. الرابط العام ما زال يعرض النسخة المنشورة السابقة حتى تضغط «تحديث الموقع المنشور»." : "تم حفظ ملفات الموقع في Firestore. الموقع خاص حتى توافق على نشره.");
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

    try {
      let result;
      if (type === "template") {
        result = buildFreeTemplate(prompt, designStyle);
      } else {
        setProgress("إرسال الطلب إلى الذكاء الاصطناعي السحابي...");
        result = await requestCloudAI(user, "/api/ai/build", {
          prompt,
          style: designStyle,
          existingFiles: files || undefined
        });
      }
      setFiles(result.files);
      setInput("");
      setMessages((current) => [...current,
        { role: "user", content: prompt },
        { role: "assistant", content: result.summary }
      ]);
      await saveFiles(result, prompt, designStyle);
    } catch (err) {
      setError(err?.message || "حدث خطأ. حاول مجدداً.");
    } finally {
      setBusy(false);
      setProgress("");
    }
  }

  async function sendChat() {
    const text = input.trim();
    if (!text || busy) return;
    const next = [...messages, { role: "user", content: text }];
    setMessages(next);
    setInput("");
    setBusy(true);
    setError("");
    setProgress("");
    try {
      setProgress("يتصل بمحرك ZYQMORA AI السحابي...");
      const result = await requestCloudAI(user, "/api/ai/chat", {
        messages: next
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

  async function publishWebsite() {
    if (!files || !saved || !projectId || publishing || busy) return;
    const wasPublished = Boolean(publishedId);
    const approved = window.confirm(
      wasPublished
        ? "هل راجعت التعديلات وتوافق على تحديث موقعك العام بنفس الرابط؟"
        : "هل راجعت الموقع في المعاينة وتوافق أن يصبح متاحاً لأي شخص يملك الرابط؟"
    );
    if (!approved) return;

    setPublishing(true);
    setError("");
    setNotice("");
    try {
      const siteId = user.uid + "_" + projectId;
      const ref = doc(db, "publishedSites", siteId);
      const current = await getDoc(ref).catch(() => null);
      const publishedSite = {
        ownerUid: user.uid,
        projectId,
        name: (projectName.trim() || "موقع من ZYQMORA").slice(0, 80),
        status: "published",
        files,
        updatedAt: serverTimestamp(),
        ...(current?.exists() ? {} : { createdAt: serverTimestamp() })
      };
      await setDoc(ref, publishedSite, { merge: true });
      setPublishedId(siteId);
      try {
        await updateDoc(doc(db, "projects", projectId), {
          publishedSiteId: siteId,
          status: "published",
          updatedAt: serverTimestamp()
        });
      } catch (syncError) {
        console.error("Published site exists but project metadata sync failed:", syncError);
      }
      setNotice(wasPublished ? "تم تحديث الموقع على رابطه العام." : "تم نشر الموقع! يمكنك الآن نسخ الرابط وإرساله لأي شخص.");
    } catch (err) {
      setError("تعذّر نشر الموقع. تأكد أنك نشرت أحدث قواعد Firestore وأن Firebase Hosting يعمل: " + (err?.message || ""));
    } finally {
      setPublishing(false);
    }
  }

  async function unpublishWebsite() {
    if (!publishedId || publishing || busy) return;
    if (!window.confirm("إيقاف النشر سيجعل الرابط العام غير متاح. هل أنت متأكد؟")) return;
    setPublishing(true);
    setError("");
    try {
      await deleteDoc(doc(db, "publishedSites", publishedId));
      setPublishedId("");
      try {
        await updateDoc(doc(db, "projects", projectId), {
          status: "draft",
          publishedSiteId: deleteField(),
          updatedAt: serverTimestamp()
        });
      } catch (syncError) {
        console.error("Unpublished site but project metadata sync failed:", syncError);
      }
      setNotice("تم إيقاف نشر الموقع. مشروعك الخاص لا يزال محفوظاً.");
    } catch (err) {
      setError("تعذّر إيقاف النشر. تحقق من اتصالك وقواعد قاعدة البيانات.");
    } finally {
      setPublishing(false);
    }
  }

  async function copyPublishedLink() {
    try {
      await navigator.clipboard.writeText(publishedUrl);
      setNotice("تم نسخ رابط موقعك العام.");
    } catch {
      setNotice("يمكنك نسخ الرابط الظاهر يدوياً.");
    }
  }

  return (
    <section className="ai-builder">
      <header className="ai-builder-heading">
        <div>
          <div className="eyebrow"><Sparkles size={15} /> صمّم موقعك في دقائق</div>
          <h1>حوّل فكرتك إلى موقع احترافي</h1>
          <p>اكتب فكرتك، اختر الهوية البصرية، وشاهد موقعك مباشرة قبل نشره.</p>
        </div>
        <div className="engine-indicator is-online">
          <span className="engine-indicator-dot" />
          <span>ذكاء سحابي جاهز</span>
        </div>
      </header>
      <div className="ai-builder-grid">
        <section className="ai-chat-card">
          <div className="ai-panel-header">
            <div className="ai-panel-title">
              <div className="ai-panel-icon"><Bot size={19}/></div>
              <div><strong>مساعد التصميم والبرمجة</strong><small>لا تحتاج إلى مفتاح API خاص بك</small></div>
            </div>
            <span className="cloud-model-label"><Cpu size={15}/> Qwen Coder • Cloudflare</span>
          </div>
          <div className="browser-mode-note">
            تتم المعالجة على خوادم Cloudflare؛ لا يتم تنزيل نموذج على جوالك أو حاسوبك. الاستخدام المجاني يخضع لحصة يومية مشتركة لحساب الاستضافة.
          </div>
          <div className="style-selector">
            <div className="style-selector-heading">
              <span><Palette size={15} /> اتجاه التصميم</span>
              <small>يمكنك تغييره لكل مشروع</small>
            </div>
            <div className="style-options">
              {designStyles.map((style) => (
                <button key={style.id} type="button" className={designStyle === style.id ? "style-chip selected" : "style-chip"} aria-pressed={designStyle === style.id} onClick={() => setDesignStyle(style.id)} disabled={busy}>
                  {style.label}
                </button>
              ))}
            </div>
          </div>
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
                <button type="button" className="ai-send-button" onClick={sendChat} disabled={busy || !input.trim()}><Send size={15}/> اسأل المساعد</button>
                <button type="button" className="ai-build-button" onClick={() => generate("ai")} disabled={busy || !input.trim()}><WandSparkles size={15}/> صمّم موقعي</button>
                <button type="button" className="ai-send-button" onClick={() => generate("template")} disabled={busy || !input.trim()}><Code2 size={15}/> قالب مجاني سريع</button>
              </div>
            </div>
          </div>
        </section>

        <section className="ai-preview-card">
          <div className="ai-preview-header">
            <div><strong><Eye size={17}/> معاينة الموقع</strong><small>{files ? "معاينة الموقع النهائي" : "لم يتم إنشاء موقع بعد"}</small></div>
            {files && <div className="ai-preview-header-actions">
              {saved && <span className="ai-generated-badge"><Check size={13}/> محفوظ</span>}
              <button type="button" onClick={() => {setFiles(null);setProjectId("");setPublishedId("");setSaved(false);setNotice("");setProjectName("");}}>مشروع جديد</button>
            </div>}
          </div>
          {files ? (
            <>
              <iframe className="ai-live-preview" title="معاينة آمنة للموقع" sandbox="allow-scripts" referrerPolicy="no-referrer" srcDoc={preview}/>
              <div className="publish-actions">
                <div className="publish-help">
                  <strong>الخطوة الأخيرة: الموافقة والنشر</strong>
                  <span>شاهد المعاينة أولاً، وبعد موافقتك ننشر الموقع برابط عام، وليس كملفات للتحميل.</span>
                </div>
                <div className="publish-buttons">
                  <button type="button" className="ai-build-button" onClick={publishWebsite} disabled={!saved || busy || publishing}>
                    <Globe2 size={16}/> {publishing ? "جارٍ النشر..." : publishedId ? "تحديث الموقع المنشور" : "أوافق، انشر الموقع برابط"}
                  </button>
                  {publishedId && <button type="button" className="ai-send-button" onClick={unpublishWebsite} disabled={publishing || busy}><Trash2 size={15}/> إيقاف النشر</button>}
                </div>
                {publishedUrl && <div className="published-link-result">
                  <span><Check size={15}/> موقعك منشور ويمكن فتحه من أي متصفح:</span>
                  <a href={publishedUrl} target="_blank" rel="noopener noreferrer" dir="ltr">{publishedUrl}</a>
                  <button type="button" className="ai-send-button" onClick={copyPublishedLink}><LinkIcon size={15}/> نسخ رابط الموقع</button>
                </div>}
              </div>
              {notice && <div className="ai-save-status">{notice}</div>}
            </>
          ) : (
            <div className="ai-preview-empty">
              <div className="ai-preview-empty-icon"><Code2 size={31}/></div>
              <strong>مساحة موقعك الجديد</strong>
              <p>اكتب وصفاً واضحاً واختر النمط، ثم اضغط «صمّم موقعي». ستظهر المعاينة هنا دون تنزيل نموذج على جهازك.</p>
            </div>
          )}
        </section>
      </div>
      <div className="ai-builder-footnote">
        <CircleAlert size={15}/>
        <span>المستخدم يعاين الموقع أولاً ثم يوافق على نشره برابط عام. الذكاء يعمل على خوادم Cloudflare ولا ينزّل نموذجاً إلى جهاز الزائر. الحصة المجانية اليومية محدودة وقد تتوقف الطلبات عند بلوغها. روابط النشر تحتاج قواعد Firestore المحدثة.</span>
      </div>
    </section>
  );
}
