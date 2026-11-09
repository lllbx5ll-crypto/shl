import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import PublishedSite from "./PublishedSite.jsx";
import "./styles.css";

// Publishing a project creates a public Firestore snapshot.
// The link opens this path directly; Firebase Hosting sends index.html here.
const segments = window.location.pathname.split("/").filter(Boolean);
const isPublicSite = segments.length === 2 && segments[0] === "s";
const siteId = isPublicSite ? decodeURIComponent(segments[1]) : "";
const validSiteId = /^[A-Za-z0-9_-]{5,200}$/.test(siteId);

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    {isPublicSite && validSiteId ? <PublishedSite siteId={siteId} /> : <App />}
  </React.StrictMode>
);
