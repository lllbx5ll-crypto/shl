import { useEffect, useMemo, useState } from "react";
import { doc, getDoc } from "firebase/firestore";
import { db } from "./firebase.js";
import { renderSiteDocument } from "./sitePreview.js";
import "./publishedSite.css";

// A public website URL is /s/{siteId}, served by the same Firebase Hosting SPA.
// This page deliberately does not require login, and runs user HTML in a sandbox.
export default function PublishedSite({ siteId }) {
  const [site, setSite] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    getDoc(doc(db, "publishedSites", siteId))
      .then((snapshot) => {
        if (cancelled) return;
        if (!snapshot.exists() || snapshot.data()?.status !== "published") {
          setError("هذا الموقع غير منشور أو أوقف صاحبه نشره.");
          return;
        }
        const published = snapshot.data();
        if (!published.files || typeof published.files["index.html"] !== "string") {
          setError("ملفات هذا الموقع غير متاحة.");
          return;
        }
        setSite(published);
      })
      .catch(() => {
        if (!cancelled) setError("تعذر عرض الموقع. تحقق من اتصال الإنترنت وقواعد Firestore.");
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [siteId]);

  useEffect(() => {
    if (!site) return;
    document.title = site.name + " — ZYQMORA";
    return () => { document.title = "ZYQMORA AI"; };
  }, [site]);

  const html = useMemo(() => renderSiteDocument(site?.files), [site]);

  if (loading) {
    return <main className="published-state" role="status"><span className="published-loader" /> جارٍ فتح الموقع...</main>;
  }
  if (error) {
    return <main className="published-state"><h1>الموقع غير متاح</h1><p>{error}</p><a href="/">العودة إلى ZYQMORA AI</a></main>;
  }
  return (
    <main className="published-page">
      <iframe
        title={site.name || "موقع تم إنشاؤه عبر ZYQMORA"}
        className="published-site-frame"
        srcDoc={html}
        sandbox="allow-scripts"
        referrerPolicy="no-referrer"
      />
    </main>
  );
}
