// Each user-generated website runs in an isolated, opaque-origin iframe.
// No network, forms, top navigation, or access to the parent ZYQMORA app.
export function renderSiteDocument(files) {
  if (!files || typeof files["index.html"] !== "string") return "";

  const css = String(files["styles.css"] || "").replace(/<\/style/gi, "<\\/style");
  const js = String(files["script.js"] || "").replace(/<\/script/gi, "<\\/script");
  const policy = '<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; img-src data:; font-src data:; media-src data:; style-src \'unsafe-inline\'; script-src \'unsafe-inline\'; connect-src \'none\'; form-action \'none\'; base-uri \'none\'; object-src \'none\'; frame-src \'none\'">';
  let html = files["index.html"];

  // The CSP must be the first thing in the document head to protect previews
  // even if generated HTML contains an additional, more permissive CSP.
  if (/<head[^>]*>/i.test(html)) {
    html = html.replace(/<head([^>]*)>/i, "<head$1>" + policy);
  } else if (/<html[^>]*>/i.test(html)) {
    html = html.replace(/<html([^>]*)>/i, "<html$1><head>" + policy + "</head>");
  } else {
    html = "<head>" + policy + "</head>" + html;
  }

  const styleTag = "<style>" + css + "</style>";
  const scriptTag = "<script>" + js + "</script>";

  html = /<link[^>]+href=["']styles\.css["'][^>]*>/i.test(html)
    ? html.replace(/<link[^>]+href=["']styles\.css["'][^>]*>/i, styleTag)
    : html.replace(/<\/head>/i, styleTag + "</head>");
  html = /<script[^>]+src=["']script\.js["'][^>]*><\/script>/i.test(html)
    ? html.replace(/<script[^>]+src=["']script\.js["'][^>]*><\/script>/i, scriptTag)
    : /<\/body>/i.test(html)
      ? html.replace(/<\/body>/i, scriptTag + "</body>")
      : html + scriptTag;

  return html;
}
