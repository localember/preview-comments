# preview-comments

Click-to-comment review layer for Local Ember design previews (static GitHub Pages under `localember`).
Reviewer tool only. It is not part of any client design and must never ship to a live client site.

## Add it to a preview (one line)

Copy `review-comments.js` into the preview's `assets/` and add before `</body>` on every page:

```html
<script src="/assets/review-comments.js" defer></script>
```

(Use a relative path such as `../assets/review-comments.js` on GitHub Pages project sites.)
The site key is taken from the URL: `localember.github.io/<repo>/` becomes `localember/<repo>`.
Override with `data-site="localember/<repo>"` on the tag if needed.

## How a reviewer uses it

1. Open the preview. A small dark **Review** toolbar sits bottom right. The page reads normally.
2. Tap **Comment**. Hovering outlines elements; links are paused. Click or tap any spot, type, **Save**.
3. Numbered pins show where comments are (red Open, green Resolved). Tap a pin to read it. **Done** leaves comment mode.

## Storage

Google Sheet **Preview comments** in Drive Local Ember Ops, one row per comment:
`id, created, site, page, selector, snippet, x, y, viewport, author, comment, status, resolved note, resolved commit`.
`x`/`y` are pixels from the clicked element's top-left. To resolve, set `status` to `Resolved` and fill
`resolved note` and `resolved commit`; the pin turns green. Rows with status starting `Test` are hidden.

Backend: `apps-script/Code.gs`, an Apps Script web app (Execute as: Me, Access: Anyone).
`doPost` appends (text/plain JSON, no CORS preflight; idempotent on the client id), `doGet` lists by site and page.
Guards: shared review key (spam filter only, it is public), `localember/<repo>` site allowlist,
`https://localember.github.io/` page allowlist, 4000-char limit, formula-injection guard, 300 posts per site per hour.

## Config

Live endpoint (deployed 2026-11-24): `https://script.google.com/macros/s/AKfycbwzMiuaZWsluc-3NdY9x2ea9jwLB9ZA8WYRD8Up0lbDumCoBaktIemtgh2uFHBAtJ1G/exec`

`CONFIG.ENDPOINT` at the top of `review-comments.js` is the web app `/exec` URL (not a secret). If it is empty,
comments are kept in the reviewer's browser and sent on a later visit once the endpoint is set.

## Test

`test/mock-appsscript.js` runs `Code.gs` unchanged in Node behind an HTTP server that mimics Apps Script
(302 to another origin, no preflight). `test/e2e.py` drives headless Chrome at 1440 and 390.
