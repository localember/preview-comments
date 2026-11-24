/**
 * Local Ember preview comments: web app backend.
 * Bound or standalone. Stores one row per comment in the "Preview comments" sheet
 * (Drive: Local Ember Ops). Deploy: Deploy > New deployment > Web app,
 * Execute as: Me, Who has access: Anyone. Paste the /exec URL into
 * review-comments.js (ENDPOINT) in localember/preview-comments.
 *
 * REVIEW_KEY is a light spam filter, not a secret: it ships in the public preview JS.
 */
var SHEET_ID = '1LEkXKL8XXiiebSUO1CkeyRjGtNABsrYrbMEE5DnaGdc';
var REVIEW_KEY = 'le-review-7f3a';
var SITE_RE = /^localember\/[A-Za-z0-9._-]{1,100}$/;
var PAGE_RE = /^https:\/\/localember\.github\.io\/[^\s]{0,400}$/;
var MAX_PER_HOUR = 300;
var HEADERS = ['id', 'created', 'site', 'page', 'selector', 'snippet', 'x', 'y', 'viewport', 'author', 'comment', 'status', 'resolved note', 'resolved commit'];

function sheet_() {
  return SpreadsheetApp.openById(SHEET_ID).getSheets()[0];
}

function out_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

// Plain text only, length capped, and no leading = + - @ so a cell never becomes a formula.
function clean_(v, n) {
  v = v == null ? '' : String(v);
  v = v.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').slice(0, n);
  if (/^[=+\-@]/.test(v)) v = "'" + v;
  return v;
}

function num_(v) {
  var n = Math.round(Number(v));
  return isFinite(n) ? Math.max(-100000, Math.min(100000, n)) : '';
}

function doGet(e) {
  var p = (e && e.parameter) || {};
  if (p.key !== REVIEW_KEY) return out_({ ok: false, error: 'bad key' });
  if (!SITE_RE.test(p.site || '')) return out_({ ok: false, error: 'site not allowed' });
  var values = sheet_().getDataRange().getDisplayValues();
  var head = values.shift() || HEADERS;
  var col = {};
  head.forEach(function (h, i) { col[String(h).trim().toLowerCase()] = i; });
  var list = [];
  values.forEach(function (r) {
    if (r[col['site']] !== p.site) return;
    if (p.page && r[col['page']] !== p.page) return;
    var status = r[col['status']] || 'Open';
    if (/^test/i.test(status)) return;
    list.push({
      id: r[col['id']], created: r[col['created']], page: r[col['page']],
      selector: r[col['selector']], snippet: r[col['snippet']],
      x: Number(r[col['x']]) || 0, y: Number(r[col['y']]) || 0,
      viewport: r[col['viewport']], author: r[col['author']], comment: r[col['comment']],
      status: status, resolvedNote: r[col['resolved note']] || '', resolvedCommit: r[col['resolved commit']] || ''
    });
  });
  return out_({ ok: true, comments: list });
}

function doPost(e) {
  var d;
  try { d = JSON.parse(e.postData.contents); } catch (err) { return out_({ ok: false, error: 'bad json' }); }
  if (!d || d.key !== REVIEW_KEY) return out_({ ok: false, error: 'bad key' });
  if (!SITE_RE.test(d.site || '')) return out_({ ok: false, error: 'site not allowed' });
  if (!PAGE_RE.test(d.page || '')) return out_({ ok: false, error: 'page not allowed' });
  var text = clean_(d.comment, 4000).trim();
  if (!text) return out_({ ok: false, error: 'empty comment' });

  var cache = CacheService.getScriptCache();
  var ck = 'n:' + d.site + ':' + Utilities.formatDate(new Date(), 'UTC', 'yyyyMMddHH');
  var n = Number(cache.get(ck) || 0);
  if (n >= MAX_PER_HOUR) return out_({ ok: false, error: 'rate limit' });
  cache.put(ck, String(n + 1), 3700);

  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var sh = sheet_();
    var now = new Date();
    var id = /^C[A-Za-z0-9-]{6,40}$/.test(d.cid || '') ? d.cid : 'C' + Utilities.formatDate(now, 'America/Chicago', 'yyMMdd-HHmmss') + '-' + Math.random().toString(36).slice(2, 6);
    // Idempotent: a browser retry of the same comment (same client id) does not add a second row.
    var ids = sh.getLastRow() > 1 ? sh.getRange(2, 1, sh.getLastRow() - 1, 1).getDisplayValues() : [];
    for (var i = 0; i < ids.length; i++) if (ids[i][0] === id) return out_({ ok: true, id: id, duplicate: true, status: 'Open' });
    var created = Utilities.formatDate(now, 'America/Chicago', 'yyyy-MM-dd HH:mm:ss') + ' CT';
    var status = d.test === true ? 'Test' : 'Open';
    sh.appendRow([
      id, created, d.site, clean_(d.page, 500), clean_(d.selector, 800), clean_(d.snippet, 300),
      num_(d.x), num_(d.y), clean_(d.viewport, 60), clean_(d.author, 80), text, status, '', ''
    ]);
    return out_({ ok: true, id: id, created: created, status: status });
  } finally {
    lock.releaseLock();
  }
}
