import { useEffect, useMemo, useState } from "react";
import {
  onAuthStateChanged,
  signInWithRedirect,
  getRedirectResult,
  signOut
} from "firebase/auth";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  where
} from "firebase/firestore";
import {
  Activity,
  ArrowUpLeft,
  Bot,
  Check,
  ChevronLeft,
  CircleHelp,
  Code2,
  FolderKanban,
  Globe2,
  LayoutDashboard,
  LogOut,
  Plus,
  Rocket,
  Settings2,
  ShieldCheck,
  Sparkles,
  Trash2,
  WandSparkles
} from "lucide-react";
import { auth, db, googleProvider } from "./firebase.js";
import BrowserBuilder from "./BrowserBuilder.jsx";

const brand = "ZYQMORA AI";

function readableDate(value) {
  if (!value?.toDate) return "الآن";
  return new Intl.DateTimeFormat("ar", {
    day: "numeric",
    month: "short",
    year: "numeric"
  }).format(value.toDate());
}

function LoginScreen({ onLogin, busy, error }) {
  return (
    <main className="login-shell">
      <div className="login-glow login-glow-one" />
      <div className="login-glow login-glow-two" />
      <section className="login-card">
        <img className="login-logo" src="/branding/logo.svg" alt={brand} />
        <div className="eyebrow"><Sparkles size={15} /> مساحة الإبداع تبدأ من هنا</div>
        <h1>حوّل فكرتك إلى <span>مشروع رقمي</span></h1>
        <p className="login-copy">
          مساحة عملك لبناء المواقع وإدارة مشاريعك. سجّل الدخول للبدء وحفظ مشاريعك بأمان.
        </p>
        <button className="google-button" onClick={onLogin} disabled={busy}>
          <span className="google-g">G</span>
          {busy ? "جارٍ تحويلك إلى Google..." : "المتابعة باستخدام Google"}
          <ArrowUpLeft size={18} />
        </button>
        {error && <div className="notice notice-error">{error}</div>}
        <div className="secure-note"><ShieldCheck size={16} /> تسجيل دخول آمن عبر Firebase Authentication</div>
        <div className="login-footer">Developed by <strong>Al-Qmishi</strong></div>
      </section>
    </main>
  );
}

function App() {
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [loginBusy, setLoginBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [projects, setProjects] = useState([]);
  const [projectsLoading, setProjectsLoading] = useState(false);
  const [projectsError, setProjectsError] = useState("");
  const [activeTab, setActiveTab] = useState("overview");
  const [projectName, setProjectName] = useState("");
  const [prompt, setPrompt] = useState("");
  const [saving, setSaving] = useState(false);
  const [selectedProject, setSelectedProject] = useState(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setAuthLoading(false);
    });
    getRedirectResult(auth).catch((err) => {
      setError("تعذّر إكمال تسجيل الدخول: " + (err?.message || "حاول مرة أخرى."));
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    if (!user) {
      setProjects([]);
      return undefined;
    }

    setProjectsLoading(true);
    setProjectsError("");

    const syncProfile = async () => {
      const profileRef = doc(db, "users", user.uid);
      const existing = await getDoc(profileRef);
      const profile = {
        uid: user.uid,
        displayName: user.displayName || "",
        email: user.email || "",
        photoURL: user.photoURL || "",
        lastLoginAt: serverTimestamp()
      };
      if (!existing.exists()) profile.createdAt = serverTimestamp();
      await setDoc(profileRef, profile, { merge: true });
    };

    syncProfile().catch((err) => {
      console.error("Profile sync failed:", err);
      setNotice("تم تسجيل الدخول، لكن تعذّر حفظ ملف الحساب. راجع قواعد Firestore.");
    });

    const projectsQuery = query(
      collection(db, "projects"),
      where("ownerUid", "==", user.uid)
    );

    const unsubscribe = onSnapshot(
      projectsQuery,
      (snapshot) => {
        const items = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
        items.sort((a, b) => {
          const aTime = a.createdAt?.toMillis?.() || 0;
          const bTime = b.createdAt?.toMillis?.() || 0;
          return bTime - aTime;
        });
        setProjects(items);
        setProjectsLoading(false);
      },
      (err) => {
        console.error("Projects listener failed:", err);
        setProjectsError("لم نتمكن من قراءة المشاريع. تأكد من نشر قواعد Firestore.");
        setProjectsLoading(false);
      }
    );

    return unsubscribe;
  }, [user]);

  const stats = useMemo(() => ({
    total: projects.length,
    drafts: projects.filter((project) => project.status !== "published").length,
    published: projects.filter((project) => project.status === "published").length
  }), [projects]);

  async function handleGoogleLogin() {
    setError("");
    setLoginBusy(true);
    try {
      await signInWithRedirect(auth, googleProvider);
    } catch (err) {
      console.error(err);
      setError("تعذّر بدء تسجيل الدخول. تأكد من تفعيل Google وإضافة النطاق المصرّح به في Firebase.");
      setLoginBusy(false);
    }
  }

  async function handleLogout() {
    try {
      await signOut(auth);
      setActiveTab("overview");
      setNotice("");
    } catch (err) {
      setNotice("تعذّر تسجيل الخروج: " + (err?.message || ""));
    }
  }

  async function createProject(event) {
    event.preventDefault();
    const cleanPrompt = prompt.trim();
    if (!cleanPrompt) {
      setNotice("اكتب وصفاً للموقع أولاً.");
      return;
    }
    setSaving(true);
    setNotice("");
    const cleanName = projectName.trim() || cleanPrompt.split(/\s+/).slice(0, 6).join(" ");
    try {
      await addDoc(collection(db, "projects"), {
        ownerUid: user.uid,
        name: cleanName.slice(0, 80),
        prompt: cleanPrompt.slice(0, 6000),
        status: "draft",
        framework: "html",
        visibility: "private",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
      setProjectName("");
      setPrompt("");
      setActiveTab("projects");
      setNotice("تم حفظ طلب المشروع في قاعدة البيانات. توليد الأكواد سيُفعّل بعد ربط محرك الذكاء الاصطناعي.");
    } catch (err) {
      console.error(err);
      setNotice("تعذّر حفظ المشروع. تأكد من نشر قواعد Firestore ثم حاول مجدداً.");
    } finally {
      setSaving(false);
    }
  }

  async function removeProject(project) {
    const confirmed = window.confirm("هل تريد حذف هذا المشروع نهائياً؟");
    if (!confirmed) return;
    try {
      await deleteDoc(doc(db, "projects", project.id));
      if (selectedProject?.id === project.id) setSelectedProject(null);
      setNotice("تم حذف المشروع.");
    } catch (err) {
      console.error(err);
      setNotice("تعذّر حذف المشروع. تحقق من صلاحيات قاعدة البيانات.");
    }
  }

  if (authLoading) {
    return <main className="loading-screen"><div className="loader" /><span>جارٍ تجهيز مساحة ZYQMORA...</span></main>;
  }

  if (!user) {
    return <LoginScreen onLogin={handleGoogleLogin} busy={loginBusy} error={error} />;
  }

  const navItems = [
    { id: "overview", label: "الرئيسية", icon: LayoutDashboard },
    { id: "builder", label: "الذكاء الاصطناعي", icon: Bot },
    { id: "projects", label: "مشاريعي", icon: FolderKanban },
    { id: "settings", label: "الحساب", icon: Settings2 }
  ];

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a className="brand-lockup" href="#home" onClick={() => setActiveTab("overview")}>
          <img src="/branding/logo.svg" alt={brand} />
        </a>
        <div className="workspace-label">مساحة العمل</div>
        <nav className="side-nav">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <button key={item.id} className={activeTab === item.id ? "nav-item active" : "nav-item"} onClick={() => setActiveTab(item.id)}>
                <Icon size={18} />
                <span>{item.label}</span>
                {activeTab === item.id && <ChevronLeft size={15} className="nav-chevron" />}
              </button>
            );
          })}
        </nav>
        <div className="sidebar-bottom">
          <div className="engine-status"><span className="status-dot" /><div><strong>محرك الذكاء الاصطناعي</strong><small>بانتظار الربط</small></div></div>
          <div className="developer-line">Developed by <strong>Al-Qmishi</strong></div>
        </div>
      </aside>

      <main className="main-area">
        <header className="topbar">
          <div className="mobile-brand"><img src="/branding/logo.svg" alt={brand} /></div>
          <div className="topbar-right"><span className="topbar-caption">مساحة إنشاء المواقع</span><span className="plan-pill">الخطة التجريبية</span></div>
          <div className="user-menu">
            {user.photoURL ? <img className="avatar" src={user.photoURL} alt="" /> : <div className="avatar avatar-fallback">{(user.displayName || user.email || "U").slice(0, 1)}</div>}
            <div className="user-meta"><strong>{user.displayName || "مستخدم ZYQMORA"}</strong><small>{user.email}</small></div>
            <button className="icon-button" title="تسجيل الخروج" onClick={handleLogout}><LogOut size={18} /></button>
          </div>
        </header>

        <nav className="mobile-nav" aria-label="التنقل الرئيسي">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <button key={item.id} className={activeTab === item.id ? "nav-item active" : "nav-item"} onClick={() => setActiveTab(item.id)}>
                <Icon size={17} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="content-wrap">
          {notice && <div className="notice"><span>{notice}</span><button onClick={() => setNotice("")}>إغلاق</button></div>}
          {activeTab === "overview" && (
            <>
              <section className="welcome-row">
                <div>
                  <div className="eyebrow"><Sparkles size={15} /> أهلاً بك في مساحة الإبداع</div>
                  <h1>مرحباً، {user.displayName?.split(" ")[0] || "بك"} 👋</h1>
                  <p>حوّل أفكارك إلى مشاريع رقمية، واحتفظ بكل أعمالك في مكان واحد.</p>
                </div>
                <div className="welcome-mark"><WandSparkles size={30} /></div>
              </section>

              <section className="stats-grid">
                <div className="stat-card"><div className="stat-icon purple"><FolderKanban /></div><div><span>إجمالي المشاريع</span><strong>{stats.total}</strong></div></div>
                <div className="stat-card"><div className="stat-icon blue"><Activity /></div><div><span>مسودات</span><strong>{stats.drafts}</strong></div></div>
                <div className="stat-card"><div className="stat-icon green"><Globe2 /></div><div><span>مواقع منشورة</span><strong>{stats.published}</strong></div></div>
              </section>

              <section className="builder-card">
                <div className="section-heading">
                  <div className="section-icon"><WandSparkles size={20} /></div>
                  <div><h2>ابدأ مشروعاً جديداً</h2><p>اكتب وصف الموقع الذي تريد بناءه.</p></div>
                </div>
                <form onSubmit={createProject}>
                  <label htmlFor="project-name">اسم المشروع <span>اختياري</span></label>
                  <input id="project-name" value={projectName} onChange={(event) => setProjectName(event.target.value)} placeholder="مثلاً: متجر القميشي الإلكتروني" maxLength={80} />
                  <label htmlFor="project-prompt">صف فكرتك</label>
                  <textarea id="project-prompt" value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder="مثلاً: أريد موقعاً احترافياً لشركة تقنية، يحتوي على صفحة رئيسية وخدمات ومعرض أعمال ونموذج تواصل..." rows={5} maxLength={6000} />
                  <div className="form-bottom"><span>{prompt.length}/6000 حرف</span><button className="primary-button" type="submit" disabled={saving || !prompt.trim()}><Plus size={18} />{saving ? "جارٍ الحفظ..." : "حفظ المشروع"}</button></div>
                </form>
                <div className="honest-note"><CircleHelp size={16} /> في هذه النسخة نحفظ وصف المشروع في Firestore. سيتم تفعيل توليد الأكواد والمعاينة بعد ربط محرك النموذج.</div>
              </section>

              <ProjectList projects={projects.slice(0, 3)} loading={projectsLoading} error={projectsError} onOpen={setSelectedProject} onDelete={removeProject} onAll={() => setActiveTab("projects")} />
            </>
          )}

          {activeTab === "builder" && <BrowserBuilder user={user} />}

          {activeTab === "projects" && (
            <section className="page-section">
              <div className="page-title-row"><div><div className="eyebrow">مساحة العمل</div><h1>مشاريعي</h1><p>المشاريع المحفوظة في حسابك.</p></div><span className="count-pill">{projects.length} مشروع</span></div>
              <ProjectList projects={projects} loading={projectsLoading} error={projectsError} onOpen={setSelectedProject} onDelete={removeProject} />
            </section>
          )}

          {activeTab === "settings" && (
            <section className="page-section">
              <div className="eyebrow">إعدادات الحساب</div><h1>حسابك</h1><p className="muted">معلومات تسجيل الدخول المرتبطة بمنصة ZYQMORA AI.</p>
              <div className="settings-card">
                <div className="settings-user">{user.photoURL ? <img className="avatar large" src={user.photoURL} alt="" /> : <div className="avatar large avatar-fallback">U</div>}<div><strong>{user.displayName || "مستخدم ZYQMORA"}</strong><span>{user.email}</span></div></div>
                <div className="settings-row"><span>طريقة تسجيل الدخول</span><strong><Check size={16} /> Google</strong></div>
                <div className="settings-row"><span>حالة الحساب</span><strong className="safe-label"><ShieldCheck size={16} /> متصل</strong></div>
                <div className="settings-row"><span>معرّف الحساب</span><code>{user.uid}</code></div>
              </div>
              <div className="settings-card note-card"><Bot size={22} /><div><strong>إعدادات المنصة</strong><p>سيتم إضافة إعدادات المالك ووسائل التواصل والاشتراكات في مرحلة لاحقة بصلاحيات آمنة.</p></div></div>
            </section>
          )}
        </div>
      </main>

      {selectedProject && (
        <div className="modal-backdrop" onClick={() => setSelectedProject(null)}>
          <section className="project-modal" onClick={(event) => event.stopPropagation()}>
            <button className="modal-close" onClick={() => setSelectedProject(null)}>×</button>
            <div className="eyebrow">تفاصيل المشروع</div>
            <h2>{selectedProject.name}</h2>
            <div className="project-status"><span className="status-dot" /> مسودة خاصة</div>
            <p className="prompt-preview">{selectedProject.prompt}</p>
            <div className="modal-meta">أُنشئ في {readableDate(selectedProject.createdAt)}</div>
            <div className="honest-note"><CircleHelp size={16} /> {selectedProject.generatedFiles ? "هذا المشروع يحتوي على ملفات HTML وCSS وJavaScript مولّدة ومحفوظة في قاعدة البيانات." : "هذه مسودة وصف فقط. افتح مساحة الذكاء الاصطناعي لإنشاء ملفات الموقع ومعاينتها."}</div>
            <button className="danger-button" onClick={() => removeProject(selectedProject)}><Trash2 size={16} /> حذف المشروع</button>
          </section>
        </div>
      )}
    </div>
  );
}

function ProjectList({ projects, loading, error, onOpen, onDelete, onAll }) {
  return (
    <section className="projects-section">
      <div className="section-title-row"><div><h2>المشاريع الأخيرة</h2><p>كل أفكارك المحفوظة في مكان واحد.</p></div>{onAll && <button className="text-button" onClick={onAll}>عرض الكل <ChevronLeft size={16} /></button>}</div>
      {loading && <div className="empty-state">جارٍ تحميل المشاريع...</div>}
      {error && <div className="notice notice-error">{error}</div>}
      {!loading && !error && projects.length === 0 && <div className="empty-state"><div className="empty-icon"><Code2 size={26} /></div><strong>لا توجد مشاريع حتى الآن</strong><span>اكتب فكرتك في الأعلى واحفظ أول مشروع لك.</span></div>}
      {!loading && projects.length > 0 && (
        <div className="project-grid">
          {projects.map((project) => (
            <article className="project-card" key={project.id}>
              <button className="project-open" onClick={() => onOpen(project)}>
                <div className="project-card-top"><div className="project-file-icon"><Code2 size={20} /></div><span className="draft-pill">مسودة</span></div>
                <h3>{project.name}</h3>
                <p>{project.prompt}</p>
                <div className="project-date">{readableDate(project.createdAt)}</div>
              </button>
              <button className="delete-project" title="حذف المشروع" onClick={() => onDelete(project)}><Trash2 size={16} /></button>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

export default App;
