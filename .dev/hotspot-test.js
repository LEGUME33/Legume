/* TEST-LEGUME · 今日热点专项测试（驱动真实页面 DOM）
   验证：按当前学习计划主题每日自动推送 5 条外链 · 已读置灰持久化 ·
        切换主题推送集随之变化 · 双端同步标脏 + 云端 data 目录落盘映射
   运行：WINMOD=$(cygpath -w "$HOME/.workbuddy/binaries/node/workspace/node_modules") && \
     NODE_PATH="$WINMOD" node .dev/hotspot-test.js */
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const ASSETS = path.join(ROOT, 'assets', 'js');
const SCRIPTS = [
  'store.js', 'github.js', 'media.js', 'sync.js', 'deploy.js', 'vercel.js', 'ui.js',
  'ai.js', 'review.js',
  path.join('pages', 'overview.js'),
  path.join('pages', 'work.js'),
  path.join('pages', 'study.js'),
  path.join('pages', 'monthly.js')
];

let pass = 0, fail = 0;
function ok(cond, msg) { if (cond) { pass++; console.log('  ✓ ' + msg); } else { fail++; console.error('  ✗ ' + msg); } }

function polyfill(win) {
  win.TextEncoder = TextEncoder; win.TextDecoder = TextDecoder;
  if (!win.btoa) win.btoa = function (s) { return Buffer.from(s, 'binary').toString('base64'); };
  if (!win.atob) win.atob = function (s) { return Buffer.from(s, 'base64').toString('binary'); };
  if (!win.matchMedia) win.matchMedia = function () { return { matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} }; };
  if (!win.requestAnimationFrame) win.requestAnimationFrame = function (cb) { return setTimeout(function () { cb(Date.now()); }, 0); };
  if (!win.cancelAnimationFrame) win.cancelAnimationFrame = function (id) { clearTimeout(id); };
  if (!win.fetch) win.fetch = function () { return Promise.reject(new Error('network disabled')); };
}

const BODY = `
  <div id="sd-pages"></div>
  <section id="sd-plan-section">
    <div id="sd-plan-bar"></div>
    <div id="sd-plan-grid"></div>
  </section>
  <section id="sd-hotspot-section" style="display:none">
    <div class="sd-hotspot-themes" id="sd-hotspot-themes"></div>
    <div id="sd-hotspots"></div>
  </section>
  <div id="mo-filter"></div><div id="mo-cal"></div><div id="mo-week"></div>
`;

console.log('▶ 今日热点专项测试（驱动真实页面）');

(async function () {
  const dom = new JSDOM('<!DOCTYPE html><html><body>' + BODY + '</body></html>', { url: 'https://localhost/', pretendToBeVisual: true, runScripts: 'outside-only' });
  const win = dom.window;
  polyfill(win);
  SCRIPTS.forEach(function (f) { win.eval(fs.readFileSync(path.join(ASSETS, f), 'utf8')); });

  const TL = win.TL;
  const today = TL.Store.todayKey();

  // 拦截同步标脏，验证热点改动触发 study 域双端同步
  let dirtyCat = null;
  const origMark = TL.Sync.markDirty;
  TL.Sync.markDirty = function (cat) { dirtyCat = cat; return origMark(cat); };

  TL.Store.init();
  TL.pages.study.init();

  // 切到「今日热点」子页面
  const tabs = win.document.querySelectorAll('#sd-pages .tl-tab');
  ok(tabs.length === 2, '学习页含两个子页面标签（学习计划 / 今日热点）');
  const hotspotTab = Array.prototype.slice.call(tabs).filter(function (b) { return b.getAttribute('data-page') === 'hotspot'; })[0];
  hotspotTab.dispatchEvent(new win.Event('click', { bubbles: true }));

  const plan = TL.Store.get('study').plans[0];
  const themeName = plan.name;

  // ① 每日按当前主题自动推送 5 条
  const s1 = TL.Store.get('study');
  const push1 = s1.hotspots.filter(function (h) { return h.source === 'push' && h.themeId === plan.id && h.date === today; });
  ok(push1.length === 5, '当前主题「' + themeName + '」当日自动推送 5 条热点');
  ok(push1.every(function (h) { return h.url && /^https?:\/\//.test(h.url); }), '推送热点均含可跳转外链');

  // ② 阅读状态：勾选已读 → 整条置灰（is-done）+ 持久化
  const firstCheck = win.document.querySelector('#sd-hotspots .tl-task .tl-check');
  ok(!!firstCheck, '首条热点渲染出前置勾选框');
  firstCheck.dispatchEvent(new win.Event('click', { bubbles: true }));
  const hsId = push1[0].id;
  const after = TL.Store.get('study').hotspots.filter(function (h) { return h.id === hsId; })[0];
  ok(after && after.read === true, '勾选后热点阅读状态标记为已读并写入存储');
  const persisted = JSON.parse(win.localStorage.getItem('legume.study') || '{}');
  ok(persisted.hotspots.some(function (h) { return h.id === hsId && h.read; }), '已读状态已持久化到 localStorage（双端同步落盘）');
  const doneNode = win.document.querySelector('#sd-hotspots .tl-task.is-done');
  ok(!!doneNode, '已读热点 DOM 应用 is-done（文字变灰 + 删除横线）');

  // ③ 重新渲染（切走再切回）后，已读状态不丢、数量仍为 5
  tabs[0].dispatchEvent(new win.Event('click', { bubbles: true }));
  hotspotTab.dispatchEvent(new win.Event('click', { bubbles: true }));
  const push2 = TL.Store.get('study').hotspots.filter(function (h) { return h.source === 'push' && h.themeId === plan.id && h.date === today; });
  ok(push2.length === 5, '重新进入页面仍保持当日 5 条推送（不重复生成）');
  ok(push2.filter(function (h) { return h.read; }).length === 1, '重新进入后已读标记保留（持久化生效）');

  // ④ 切换学习计划主题 → 推送集随主题变化
  const plan2 = TL.Store.get('study').plans[1];
  const chip2 = Array.prototype.slice.call(win.document.querySelectorAll('#sd-hotspot-themes .sd-plan-chip')).filter(function (b) { return b.textContent === plan2.name; })[0];
  ok(!!chip2, '今日热点页提供主题切换条');
  chip2.dispatchEvent(new win.Event('click', { bubbles: true }));
  const push3 = TL.Store.get('study').hotspots.filter(function (h) { return h.source === 'push' && h.themeId === plan2.id && h.date === today; });
  ok(push3.length === 5, '切换到「' + plan2.name + '」后按该主题重新推送 5 条');

  // ⑤ 双端同步一致性：标脏 + 云端 data 目录映射
  ok(dirtyCat === 'study', '热点改动触发 study 域双端同步标脏');
  ok(TL.Sync.filePath('study') === 'data/study.json', '热点数据云端落盘路径为 data/study.json');
  TL.Sync.markDirty = origMark;

  console.log('\n今日热点专项测试：' + pass + ' 通过 / ' + fail + ' 失败');
  process.exit(fail ? 1 : 0);
})().catch(function (e) { console.error('FATAL', e && e.stack || e); process.exit(1); });
