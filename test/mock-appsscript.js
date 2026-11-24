// Runs Code.gs unchanged in Node with in-memory Sheets/Cache/Lock mocks, behind an HTTP server that
// mimics Apps Script web app behavior (POST /exec -> 302 to a different origin that serves the result, CORS *).
const http = require('http'), fs = require('fs'), vm = require('vm'), url = require('url');
const DB = process.argv[2] || '/tmp/mock-sheet.json';
let rows = fs.existsSync(DB) ? JSON.parse(fs.readFileSync(DB)) : [['id','created','site','page','selector','snippet','x','y','viewport','author','comment','status','resolved note','resolved commit']];
const save = () => fs.writeFileSync(DB, JSON.stringify(rows, null, 1));
const cache = {};
const pad = n => String(n).padStart(2, '0');
const ctx = {
  SpreadsheetApp: { openById: () => ({ getSheets: () => [{ getDataRange: () => ({ getDisplayValues: () => rows.map(r => r.map(v => String(v))) }), appendRow: r => { rows.push(r); save(); }, getLastRow: () => rows.length, getRange: (r0, c0, n) => ({ getDisplayValues: () => rows.slice(r0 - 1, r0 - 1 + n).map(r => [String(r[c0 - 1])]) }) }] }) },
  ContentService: { MimeType: { JSON: 'json' }, createTextOutput: t => ({ setMimeType: () => ({ body: t }) }) },
  CacheService: { getScriptCache: () => ({ get: k => cache[k] || null, put: (k, v) => { cache[k] = v; } }) },
  LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
  Utilities: { formatDate: (d, tz, f) => { const s = d.toLocaleString('sv-SE', { timeZone: tz === 'UTC' ? 'UTC' : tz }); const [D, T] = s.split(' '); const [Y, M, Dd] = D.split('-'); const [h, m, sec] = T.split(':');
    return f.replace('yyyy', Y).replace('yy', Y.slice(2)).replace('MM', M).replace('dd', Dd).replace('HH', h).replace('mm', m).replace('ss', sec); } },
  JSON, Math, Number, String, isFinite, Date
};
vm.createContext(ctx); vm.runInContext(fs.readFileSync(__dirname + '/../apps-script/Code.gs', 'utf8'), ctx);
const results = {}; let n = 0;
const cors = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' };
http.createServer((req, res) => {
  const u = url.parse(req.url, true);
  if (req.method === 'OPTIONS') { res.writeHead(405); return res.end(); } // Apps Script has no preflight support
  if (u.pathname === '/exec' && req.method === 'GET') { res.writeHead(200, cors); return res.end(ctx.doGet({ parameter: u.query }).body); }
  if (u.pathname === '/exec' && req.method === 'POST') {
    let b = ''; req.on('data', c => b += c); req.on('end', () => {
      const id = 'r' + (++n); results[id] = ctx.doPost({ postData: { contents: b, type: req.headers['content-type'] } }).body;
      res.writeHead(302, { 'Access-Control-Allow-Origin': '*', Location: `http://127.0.0.1:${PORT2}/echo?id=${id}` }); res.end();
    }); return;
  }
  res.writeHead(404); res.end();
}).listen(+process.env.PORT1 || 8701);
const PORT2 = +process.env.PORT2 || 8702;
http.createServer((req, res) => { const u = url.parse(req.url, true); res.writeHead(200, cors); res.end(results[u.query.id] || '{"ok":false}'); }).listen(PORT2);
console.log('mock ready');
