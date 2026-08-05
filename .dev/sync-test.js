/* TEST-LEGUME · 同步引擎单测（mock GitHub API）
   验证：打开即自动拉取 · 本地编辑后推送 · sha 冲突(409)自动重试 · 条目级合并
   运行：NODE_PATH="$HOME/.workbuddy/binaries/node/workspace/node_modules" node .dev/sync-test.js */
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..');
const ASSETS = path.join(ROOT, 'assets', 'js');

let pass = 0, fail = 0;
function ok(cond, msg) {
  if (cond) { pass++; console.log('  \u2713 ' + msg); }
  else { fail++; console.error('  \u2717 ' + msg); }
}

/* ---------------- 内存版 GitHub 模拟服务 ---------------- */
const repo = new Map();          // 'data/work.json' -> { sha, b64 }
const history = new Map();       // 'data/work.json' -> [{ sha, text }]
let counter = 0;
function shaOf(s) { return crypto.createHash('sha1').update(s + '::' + (counter++)).digest('hex'); }
function res(payload, status) {
  status = status || 200;
  return { status: status, ok: status >= 200 && status < 300, json: function () { return Promise.resolve(payload); }, text: function () { return Promise.resolve(JSON.stringify(payload)); } };
}
function b64(s) { return Buffer.from(s, 'utf8').toString('base64'); }
function fromB64(b) { return Buffer.from(b, 'base64').toString('utf8'); }
function pushHistory(key, text, sha) {
  if (!history.has(key)) history.set(key, []);
  history.get(key).push({ sha: sha, text: text });
}

function mockFetch(url, opts) {
  const method = (opts && opts.method) || 'GET';
  let api = String(url).replace('https://api.github.com', '');
  const qi = api.indexOf('?'); var q = '';
  if (qi >= 0) { q = api.slice(qi + 1); api = api.slice(0, qi); }
  function param(name) { const m = q.match(new RegExp('(?:^|&)' + name + '=([^&]*)')); return m ? decodeURIComponent(m[1]) : null; }

  if (api === '/repos/me/wb' && method === 'GET')
    return Promise.resolve(res({ full_name: 'me/wb', private: true, default_branch: 'main', permissions: { push: true }, has_pages: false }, 200));
  if (api === '/repos/me/wb/pages')
    return Promise.resolve(res({ message: 'Not Found' }, 404));
  if (api === '/repos/me/wb/commits') {
    const key = param('path');
    const list = (history.get(key) || []).map(function (c) {
      return { sha: c.sha, commit: { message: 'data: sync', committer: { date: new Date().toISOString() } } };
    });
    return Promise.resolve(res(list, 200));
  }
  if (api.indexOf('/repos/me/wb/contents/') === 0) {
    const key = api.slice('/repos/me/wb/contents/'.length);
    if (method === 'GET') {
      const ref = param('ref');
      let entry = repo.get(key);
      if (ref && history.has(key)) {
        const h = history.get(key).filter(function (c) { return c.sha === ref; })[0];
        if (h) entry = { sha: h.sha, b64: b64(h.text) };
      }
      if (!entry) return Promise.resolve(res({ message: 'Not Found' }, 404));
      return Promise.resolve(res({ sha: entry.sha, content: entry.b64, size: entry.b64.length }, 200));
    }
    if (method === 'PUT') {
      const body = JSON.parse(opts.body);
      const existing = repo.get(key);
      if (body.sha && existing && existing.sha !== body.sha)
        return Promise.resolve(res({ message: 'sha conflict' }, 409)); // 模拟其他设备先提交
      const ns = shaOf(key + body.content);
      repo.set(key, { sha: ns, b64: body.content });
      pushHistory(key, fromB64(body.content), ns);
      return Promise.resolve(res({ content: { sha: ns, path: key }, commit: { sha: ns } }, 200));
    }
  }
  return Promise.resolve(res({ message: 'unexpected ' + api }, 404));
}

function seed(key, obj) { repo.set(key, { sha: shaOf(key), b64: b64(JSON.stringify(obj)) }); }

async function main() {
  const dom = new JSDOM('<!DOCTYPE html><html><head></head><body data-page="overview"></body></html>',
    { url: 'https://localhost/', pretendToBeVisual: true, runScripts: 'outside-only' });
  const win = dom.window;
  win.TextEncoder = TextEncoder; win.TextDecoder = TextDecoder;
  if (!win.btoa) win.btoa = function (s) { return Buffer.from(s, 'binary').toString('base64'); };
  if (!win.atob) win.atob = function (s) { return Buffer.from(s, 'base64').toString('binary'); };
  if (!win.matchMedia) win.matchMedia = function (q) { return { matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} }; };
  if (!win.requestAnimationFrame) win.requestAnimationFrame = function (cb) { return setTimeout(function () { cb(Date.now()); }, 0); };
  win.fetch = mockFetch;

  ['store.js', 'github.js', 'media.js', 'sync.js', 'ui.js'].forEach(function (f) {
    win.eval(fs.readFileSync(path.join(ASSETS, f), 'utf8'));
  });

  const TL = win.TL;
  console.log('▶ 同步引擎单测（mock GitHub API）');

  ok(!!(TL.Store && TL.Sync && TL.GitHub && TL.Media && TL.UI), '核心模块全部就绪');
  ok(TL.GitHub.b64decode(TL.GitHub.b64encode('中文测试🌟')) === '中文测试🌟', 'b64 中文往返编解码正确');

  TL.Store.init();
  TL.Store.saveSettings({ owner: 'me', repo: 'wb', token: 't', branch: 'main' });
  ok(TL.GitHub.configured(), 'GitHub 已配置');

  // 预置云端数据
  seed('data/work.json', { schema: 1, plans: { month: [], week: [], day: [{ id: 'p1', title: '种子计划', done: true }] }, todos: [], reviews: [], updatedAt: 1700000000000 });
  seed('data/study.json', { schema: 1, topics: [], courses: [], tasks: [], hotspots: [], updatedAt: 0 });
  seed('data/media.json', { schema: 1, images: [], updatedAt: 0 });
  seed('data/activity.json', { schema: 1, logs: [], updatedAt: 0 });

  // ① 打开即自动拉取
  await TL.Sync.init();
  const pulled = TL.Store.get('work');
  ok(pulled.plans.day.length === 1 && pulled.plans.day[0].id === 'p1', '打开即自动拉取云端 work 种子数据');

  // ② 本地编辑 + 直接推送（工作域已以「每日计划」为唯一数据源）
  TL.Store.update('work', function (d) { d.plans.day.push({ id: 't1', text: '本地日计划', done: false, level: 'low', date: '2026-07-01', note: '', scope: 'day' }); }, 'add plan');
  const p1 = await TL.Sync.push();
  ok(p1.pushed && p1.pushed.indexOf('work') >= 0, 'push 推送了 work');
  const wStored = JSON.parse(fromB64(repo.get('data/work.json').b64));
  ok(wStored.plans.day.length === 2 && wStored.plans.day.filter(function (p) { return p.id === 't1'; })[0].text === '本地日计划', '远端 work.json 已包含本地新增日计划');

  // ③ sha 冲突(409)后自动取最新 sha 重试
  TL.Store.update('work', function (d) { d.plans.day.push({ id: 't2', text: '第二次', done: false, level: 'mid', date: '2026-07-02', note: '', scope: 'day' }); }, 'add2');
  const meta = TL.Store.meta(); meta.sha.work = 'WRONGSHA'; TL.Store.saveMeta(meta);
  const p2 = await TL.Sync.push();
  ok(p2.pushed && p2.pushed.indexOf('work') >= 0, 'sha 冲突(409)后自动取最新 sha 重试成功');
  const w2 = JSON.parse(fromB64(repo.get('data/work.json').b64));
  ok(w2.plans.day.length === 3, '重试后远端包含两次新增（覆盖 409 前的内容）');

  // ④ 条目级合并（同 id 较新侧覆盖、独有项保留、嵌套数组与 updatedAt 取大值）
  const older = { a: [{ id: 1, x: 1 }], b: { c: [{ id: 'x', v: 1 }] }, updatedAt: 100 };
  const newer = { a: [{ id: 1, x: 2 }, { id: 2, y: 3 }], b: { c: [{ id: 'x', v: 9 }] }, d: [{ id: 3 }], updatedAt: 200 };
  const m = TL.Sync._merge(older, newer);
  ok(m.a.length === 2 && m.a.filter(function (i) { return i.id === 1; })[0].x === 2 && !!m.a.filter(function (i) { return i.id === 2; })[0], 'merge：同 id 较新侧覆盖、独有项保留');
  ok(m.b.c[0].v === 9 && m.d.length === 1 && m.updatedAt === 200, 'merge：嵌套数组归并、updatedAt 取大值');

  // ⑤ 云端落盘路径：所有业务域映射到 data/<cat>.json
  TL.Store.CATS.forEach(function (cat) {
    ok(TL.Sync.filePath(cat) === 'data/' + cat + '.json', '同步云端路径映射 data/' + cat + '.json（' + cat + '）');
  });

  // ⑥ 历史版本回滚：listCommits 取最早版本 sha → rollback → 远端恢复该版本
  const commits = await TL.GitHub.listCommits('data/work.json', 20);
  ok(commits.length >= 1, 'listCommits 返回历史版本列表（含已推送版本）');
  const earliest = commits[0]; // 历史数组 oldest-first，首个即最早版本
  await TL.Sync.rollback('work', earliest.sha);
  const rolled = JSON.parse(fromB64(repo.get('data/work.json').b64));
  ok(rolled.plans.day.length === 2 && rolled.plans.day.filter(function (p) { return p.id === 't2'; }).length === 0,
    '回滚后远端恢复为最早历史版本的日计划（2 条 · p1 + t1，不含后续新增 t2）');
  ok(!!(TL.Sync.history && TL.Sync.rollback && TL.Sync.syncNow), '历史版本回滚 / 手动同步接口均可用');

  console.log('\n同步引擎单测：' + pass + ' 通过 / ' + fail + ' 失败');
  process.exit(fail ? 1 : 0);
}

main().catch(function (e) { console.error('FATAL', e && e.stack || e); process.exit(1); });
