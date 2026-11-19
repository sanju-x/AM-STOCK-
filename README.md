# AM Motors · Stock & Trend Analysis dashboard

One-page website (`index.html`) with 7 pages: Forecast & Insights, Model · Variant · Colour, Stock, IBND, WS & Retail Target, Pending Bookings, Data.

## Files

| File | What it does |
|---|---|
| `index.html` | The dashboard (page, code and the data built in) |
| `_worker.js` | Small server that runs on Cloudflare with the site and downloads the reports from Google Drive (same as the PDI Yard site) |
| `_headers` | No caching, no search indexing |

## Refresh from Google Drive

On the **Data** page, **⟳ Refresh from Google Drive**:
1. downloads all 11 reports from Drive through `_worker.js`,
2. updates Stock and IBND straight away,
3. rebuilds **every page** (forecast, plan table, targets, bookings…) in the browser with the same build code, then reloads with the new data.

The site also checks Drive on its own when it is opened and every 30 minutes while open, then offers **Reload** when new data is ready.
The first refresh on a computer downloads the Python engine (about 30 MB from cdn.jsdelivr.net) and takes 1–2 minutes. After that the browser keeps it and a refresh takes about 30–60 seconds.
The rebuilt data is kept in that browser; each computer refreshes its own copy.

### Option 1: public links (default, nothing to set up)

Share each report in Drive as **Anyone with the link → Viewer**. stock_report and ibnd_report are already shared this way for the PDI site.

| Report | Drive file ID | Variable to change it |
|---|---|---|
| Pending bookings | `15SO5FZPftIyli2Pqp_mbw-1AFxkU9Oue` | `FILE_BOOKING` |
| Sales invoices | `1XiV2v1G_3vKDjzhQsO44rkTluV_H1zOU` | `FILE_INVOICE` |
| Current stock | `1zNqp-9UlA2THEuOGXVtfTFnlPSdvmXQ9` | `FILE_STOCK` |
| Today All (Dis, Ind, Plan, Non Oms) | `170bRxKvFeTRrqhn-u01-iliCEiEVbGWI` | `FILE_TODAY_ALL` |
| DMS opening stock | `1-LMfCfQ_1I8mMpJf-1z-AyYJNfbd5EIN` | `FILE_DMS_OPEN` |
| IDMS opening stock | `1g0EsUKSPfrOyffIEIX7kdYUm0WL0Ky6Y` | `FILE_IDMS_OPEN` |
| IBND | `1WAC-ubcYUNUkj4SiJiWShcmizdUCBU89` | `FILE_IBND` |
| WS & retail target | `1iuFaMapBkrmTjJwnmjjVyoPilqJuEUvR` | `FILE_TARGET` |
| Incentive sale | `193cEvTmMYNQY2RGt3fmEHs1bmiEwn_oP` | `FILE_INCENTIVE` |
| TVP status | `1WdcuNpT8ffeAu8nExIPOalQLqbnSuhUj` | `FILE_TVP_STATUS` |
| TVP stock | `1uCgNIgzJiupIcxbobs9GsVe4HUnMnqbj` | `FILE_TVP_STOCK` |

If a file is not shared, the Data page names it.

**Keep the same link each day:** in Drive, right-click the file → **File information → Manage versions → Upload new version**.
If a link changes (for example next month's DMS / IDMS opening stock), set the variable in Cloudflare: Pages project → **Settings → Variables and Secrets** → Add, type Text, value = the new Drive link. Then create a new deployment.
The target file needs the new month's sheets (e.g. `DEC 2026 NEXA`, `DEC 2026 ARENA`).

### Option 2: private files with a service account

Set the secret `GOOGLE_SERVICE_ACCOUNT` (the whole JSON key) in Cloudflare and share the reports with the service account's email as Viewer. It is the same key and steps as the PDI Yard site; you can reuse that key.

## Publish on Cloudflare Pages

- **Direct upload:** Workers & Pages → your project → **Create new deployment** → drop this folder (`index.html`, `_worker.js`, `_headers`).
- **GitHub:** put the three files in the repo root (replace the old ones). Cloudflare settings: build command empty, output directory `/`.

Keep the site behind **Cloudflare Access** (Settings → Access policy). The reports hold customer and booking details.

## Notes

- Inside Claude (the claude.ai copy), the Refresh button uses Claude's Google Drive connection and reloads Stock and IBND.
- **Load reports** on the Stock / IBND pages still works for a local file.
- Keys 1–7 switch pages.
