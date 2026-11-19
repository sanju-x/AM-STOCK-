// AM Motors Stock & Trend dashboard: Cloudflare Pages advanced-mode worker.
// Serves the dashboard and downloads its reports from Google Drive on the server,
// so the page can re-read every report and rebuild itself (button "Refresh from Google Drive").
//
// Two ways to reach Drive (same as the PDI Yard site):
//  A) PUBLIC LINKS (default, no setup): each report shared "Anyone with the link → Viewer".
//  B) SERVICE ACCOUNT (optional, keeps files private): set the secret GOOGLE_SERVICE_ACCOUNT
//     (the whole JSON key) and share the reports with the service account's email as Viewer.
//
// A report's file changed (new link)? Set a variable in Cloudflare Pages → Settings → Variables and Secrets,
// e.g. FILE_DMS_OPEN = the new Drive link (or ID), then create a new deployment. Names are listed in FILES below.
//
// Routes:
//   GET /api/drive?list=1        → the reports and their Drive IDs (+ modified time with a service account)
//   GET /api/drive?f=stock.xlsx  → the file's bytes (Google Sheets are exported as .xlsx)

const FILES = {   // key: [variable name, default Drive ID, name]
  "booking.xlsx":    ["FILE_BOOKING",    "15SO5FZPftIyli2Pqp_mbw-1AFxkU9Oue", "Pending_booking_report.xlsx"],
  "invoice.xlsx":    ["FILE_INVOICE",    "1XiV2v1G_3vKDjzhQsO44rkTluV_H1zOU", "sales_invoice_report.xlsx"],
  "stock.xlsx":      ["FILE_STOCK",      "1zNqp-9UlA2THEuOGXVtfTFnlPSdvmXQ9", "stock_report.xlsx"],
  "today_all.xlsx":  ["FILE_TODAY_ALL",  "170bRxKvFeTRrqhn-u01-iliCEiEVbGWI", "Today All.xlsx"],
  "dms_open.xlsx":   ["FILE_DMS_OPEN",   "1-LMfCfQ_1I8mMpJf-1z-AyYJNfbd5EIN", "DMS opening stock"],
  "idms_open.xlsx":  ["FILE_IDMS_OPEN",  "1g0EsUKSPfrOyffIEIX7kdYUm0WL0Ky6Y", "IDMS opening stock"],
  "ibnd.xlsx":       ["FILE_IBND",       "1WAC-ubcYUNUkj4SiJiWShcmizdUCBU89", "ibnd_report.xlsx"],
  "target.xlsx":     ["FILE_TARGET",     "1iuFaMapBkrmTjJwnmjjVyoPilqJuEUvR", "TARGET WHOLESALE & RETAIL.xlsx"],
  "incentive.xlsx":  ["FILE_INCENTIVE",  "193cEvTmMYNQY2RGt3fmEHs1bmiEwn_oP", "INCENTIVE SALE.xlsx"],
  "tvp_status.xlsx": ["FILE_TVP_STATUS", "1WdcuNpT8ffeAu8nExIPOalQLqbnSuhUj", "TVP STATUS.xlsx"],
  "tvp_stock.xlsx":  ["FILE_TVP_STOCK",  "1uCgNIgzJiupIcxbobs9GsVe4HUnMnqbj", "TVP STOCK.xlsx"],
};
const SHEET_MIME = "application/vnd.google-apps.spreadsheet";
const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
let tokenCache = { token: "", exp: 0 };

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname === "/api/drive") {
      try { return await drive(url, env, ctx); }
      catch (e) { return json({ error: "server", message: String(e && e.message || e) }, 502); }
    }
    return env.ASSETS.fetch(request);
  }
};

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });
}
const idFrom = (v) => { const m = String(v || "").match(/\/d\/([A-Za-z0-9_-]{20,})|[?&]id=([A-Za-z0-9_-]{20,})|^([A-Za-z0-9_-]{20,})$/); return m ? (m[1] || m[2] || m[3]) : ""; };
const files = (env) => Object.entries(FILES).map(([key, [v, id, name]]) => ({ key, id: idFrom(env[v]) || id, name, variable: v }));

async function drive(url, env, ctx) {
  const all = files(env), sa = !!env.GOOGLE_SERVICE_ACCOUNT;
  if (url.searchParams.get("list")) {
    if (!sa) return json({ mode: "public", files: all });
    const token = await accessToken(env);
    const out = await Promise.all(all.map(async f => {
      const r = await fetch(`https://www.googleapis.com/drive/v3/files/${f.id}?fields=name,modifiedTime,mimeType&supportsAllDrives=true`, { headers: { Authorization: "Bearer " + token } });
      return r.ok ? { ...f, ...(await r.json()) } : { ...f, error: r.status };
    }));
    return json({ mode: "service-account", files: out });
  }
  const f = all.find(x => x.key === url.searchParams.get("f"));
  if (!f) return json({ error: "not_allowed" }, 403);
  return sa ? privateFile(f, env) : publicFile(f, url, ctx);
}

async function publicFile(f, url, ctx) {
  const cache = caches.default, key = new Request("https://am-stock-cache.local/" + f.id);
  if (!url.searchParams.get("fresh")) { const hit = await cache.match(key); if (hit) return hit; }
  // try as an uploaded Excel file first, then as a Google Sheet (exported to .xlsx)
  let r = await fetch(`https://drive.usercontent.google.com/download?id=${f.id}&export=download&confirm=t`, { redirect: "follow" });
  if (!r.ok || /text\/html/.test(r.headers.get("content-type") || ""))
    r = await fetch(`https://docs.google.com/spreadsheets/d/${f.id}/export?format=xlsx`, { redirect: "follow" });
  if (!r.ok || /text\/html/.test(r.headers.get("content-type") || ""))
    return json({ error: "not_public", message: `${f.name} could not be downloaded. In Google Drive set its sharing to "Anyone with the link → Viewer".` }, 502);
  const res = new Response(r.body, { headers: {
    "content-type": XLSX_MIME, "cache-control": "public, max-age=60",
    "x-file-name": encodeURIComponent(f.name), "x-file-modified": r.headers.get("last-modified") || "" } });
  ctx && ctx.waitUntil && ctx.waitUntil(cache.put(key, res.clone()));
  return res;
}

async function privateFile(f, env) {
  const token = await accessToken(env);
  const api = (p) => fetch("https://www.googleapis.com/drive/v3/" + p, { headers: { Authorization: "Bearer " + token } });
  const meta = await api(`files/${f.id}?fields=name,mimeType,modifiedTime&supportsAllDrives=true`);
  if (!meta.ok) return json({ error: "not_found", message: `${f.name}: Google Drive answered ${meta.status}. Share it with the service account email as Viewer.` }, meta.status);
  const m = await meta.json();
  const r = m.mimeType === SHEET_MIME
    ? await api(`files/${f.id}/export?mimeType=${encodeURIComponent(XLSX_MIME)}`)
    : await api(`files/${f.id}?alt=media&supportsAllDrives=true`);
  if (!r.ok) return json({ error: "download_failed", message: `${f.name}: ${(await r.text()).slice(0, 200)}` }, r.status);
  return new Response(r.body, { headers: {
    "content-type": XLSX_MIME, "cache-control": "private, no-store",
    "x-file-name": encodeURIComponent(m.name || f.name), "x-file-modified": m.modifiedTime || "" } });
}

// Service-account sign-in: a signed JWT exchanged for a Drive read-only token (cached ~55 min).
async function accessToken(env) {
  const now = Math.floor(Date.now() / 1000);
  if (tokenCache.token && tokenCache.exp - 60 > now) return tokenCache.token;
  let sa;
  try { sa = JSON.parse(env.GOOGLE_SERVICE_ACCOUNT); } catch (e) { throw new Error("GOOGLE_SERVICE_ACCOUNT is not valid JSON. Paste the whole key file."); }
  const enc = (o) => b64url(new TextEncoder().encode(JSON.stringify(o)));
  const head = enc({ alg: "RS256", typ: "JWT" });
  const claim = enc({ iss: sa.client_email, scope: "https://www.googleapis.com/auth/drive.readonly", aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600 });
  const pem = String(sa.private_key || "").replace(/-----[^-]+-----/g, "").replace(/\s+/g, "");
  const der = Uint8Array.from(atob(pem), c => c.charCodeAt(0));
  const key = await crypto.subtle.importKey("pkcs8", der, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(head + "." + claim)));
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
    body: "grant_type=" + encodeURIComponent("urn:ietf:params:oauth:grant-type:jwt-bearer") + "&assertion=" + head + "." + claim + "." + b64url(sig)
  });
  const t = await r.json();
  if (!r.ok || !t.access_token) throw new Error("Google sign-in failed: " + (t.error_description || t.error || r.status));
  tokenCache = { token: t.access_token, exp: now + (t.expires_in || 3600) };
  return t.access_token;
}
function b64url(bytes) { let s = ""; for (const b of bytes) s += String.fromCharCode(b); return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); }
