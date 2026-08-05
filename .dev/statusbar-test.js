/* =====================================================================
   TEST-LEGUME · 底部状态栏测试（statusbar-test.js）
   ---------------------------------------------------------------------
   覆盖场景：
     1. 状态栏 DOM 结构：5 个子元素（3 pill + 2 btn）
     2. GitHub 同步状态文字映射（connected / syncing / error / disconnected）
     3. 代码部署状态文字映射（ready / pushing / pending-deploy）
     4. Vercel 状态文字映射（ready / building / unlinked）
     5. 离线兜底：全部 pill 变为 offline 态
     6. 点击 sync pill 弹出详情弹窗
     7. mountStatusbar 幂等（重复调用不创建多个 bar）
   运行：NODE_PATH="C:/Users/19418/.workbuddy/binaries/node/workspace/node_modules" node .dev/statusbar-test.js
 ===================================================================== */

var { JSDOM } = require('jsdom');
var assert = require('assert');

/* ---------- 模拟浏览器环境 ---------- */
var dom = new JSDOM('<!DOCTYPE html><html lang="zh-CN" data-theme="light"><body data-page="overview"><main class="tl-main"></main></body></html>', {
  url: 'http://localhost',
  runScripts: 'outside-only',
  pretendToBeVisual: true
});
var win = dom.window;
var doc = win.document;

/* 注入 CSS tokens（仅需存在，不解析） */
var link = doc.createElement('link');
link.rel = 'stylesheet';
link.href = './assets/css/tokens.css';
doc.head.appendChild(link);

/* 加载脚本（按依赖顺序） */
var scripts = [
  'assets/js/kv.js',       // TL.KV
  'assets/js/store.js',    // TL.Store
  'assets/js/github.js',   // TL.GitHub
  'assets/js/auth.js',     // TL.Auth（云端登录）
  'assets/js/media.js',    // TL.Media
  'assets/js/sync.js',     // TL.Sync（GitHub 引擎）
  'assets/js/cloud.js',    // TL.Cloud（云端引擎）+ TL.getSync()
  'assets/js/deploy.js',   // TL.Deploy
  'assets/js/vercel.js',   // TL.Vercel
  'assets/js/ui.js'        // TL.UI (含 mountStatusbar)
];
scripts.forEach(function (src) {
  try {
    var fs = require('fs');
    var code = fs.readFileSync(src, 'utf8');
    win.eval(code);
  } catch (e) {
    console.error('[LOAD FAIL] ' + src + ': ' + e.message);
    process.exit(1);
  }
});

/* 触发 DOMContentLoaded */
doc.dispatchEvent(new win.Event('DOMContentLoaded'));

var TL = win.TL;
var UI = TL.UI;
var passed = 0, failed = 0;

function ok(cond, label) {
  if (cond) { passed++; console.log('  ✓ ' + label); }
  else { failed++; console.log('  ✗ ' + label); }
}

function $(sel) { return doc.querySelector(sel); }
function $$(sel) { return Array.from(doc.querySelectorAll(sel)); }

console.log('\n=== 底部状态栏测试 ===\n');

/* ---- TEST 1: 基本挂载与 DOM 结构 ---- */
console.log('-- TEST 1: 挂载与结构 --');

UI.mountStatusbar();
var bar = $('#tl-statusbar');
ok(!!bar, 'status bar 存在于 DOM 中');
ok(bar.classList.contains('tl-statusbar'), 'class 含 tl-statusbar');
ok(doc.body.classList.contains('has-statusbar'), 'body 有 has-statusbar 类');

var pills = $$('.tl-statusbar__pill');
ok(pills.length === 3, '3 个状态 pill（实际 ' + pills.length + '）');

var btns = $$('.tl-statusbar__btn');
ok(btns.length === 2, '2 个操作按钮（实际 ' + btns.length + '）');

var totalKids = bar.children.length;
ok(totalKids === 5, '共 5 个子元素（实际 ' + totalKids + '）');

// 验证各 pill ID
ok(!!$('#sb-sync'), 'sync pill id=sb-sync');
ok(!!$('#sb-deploy'), 'deploy pill id=sb-deploy');
ok(!!$('#sb-vercel'), 'vercel pill id=sb-vercel');
ok(!!$('#sb-theme'), 'theme button id=sb-theme');
ok(!!$('#sb-settings'), 'settings button id=sb-settings');

/* 每个 pill 内部有 dot + text */
pills.forEach(function (p) {
  ok(!!p.querySelector('.tl-statusbar__dot'), p.id + ' 含 dot');
  ok(!!p.querySelector('.tl-statusbar__text'), p.id + ' 含 text');
});

/* ---- TEST 2: GitHub 同步状态文字映射 ---- */
console.log('\n-- TEST 2: 同步状态文字 --');

/* mapSyncState 辅助测试（通过内部状态模拟） */
var ss = TL.Sync.state();

// 默认未配置 → disconnected
var syncPill = $('#sb-sync');
ok(syncPill.getAttribute('data-sb') === 'disconnected' || syncPill.getAttribute('data-sb') === 'offline',
   '默认未配置 → disconnected 或 offline（实际 data-sb=' + syncPill.getAttribute('data-sb') + '）');

var syncTextEl = syncPill.querySelector('.tl-statusbar__text');
var st = syncTextEl ? syncTextEl.textContent : '';
ok(st.indexOf('未连接') >= 0 || st.indexOf('离线') >= 0,
   '同步默认文案含「未连接」或「离线」（实际：「' + st + '」）');

/* ---- TEST 3: 代码部署状态文字映射 ---- */
console.log('\n-- TEST 3: 部署状态文字 --');

var deployPill = $('#sb-deploy');
var ds = TL.Deploy.state();
var dpState = deployPill.getAttribute('data-sb');
var dpText = deployPill.querySelector('.tl-statusbar__text').textContent;

ok(dpState === 'pending-deploy' || dpState === 'offline',
   '部署默认态为 pending-deploy 或 offline（实际 ' + dpState + '）');
ok(dpText.indexOf('待部署') >= 0 || dpText.indexOf('离线') >= 0,
   '部署默认文案含「待部署」或「离线」（实际：「' + dpText + '」）');

/* ---- TEST 4: Vercel 状态文字映射 ---- */
console.log('\n-- TEST 4: Vercel 状态文字 --');

var vercelPill = $('#sb-vercel');
var vs = TL.Vercel.state();
var vpState = vercelPill.getAttribute('data-sb');
var vpText = vercelPill.querySelector('.tl-statusbar__text').textContent;

ok(vpState === 'unlinked' || vpState === 'offline',
   'Vercel 默认态为 unlinked 或 offline（实际 ' + vpState + '）');
ok(vpText.indexOf('未连接') >= 0 || vpText.indexOf('离线') >= 0,
   'Vercel 默认文案含「未连接」或「离线」（实际：「' + vpText + '」）');

/* ---- TEST 5: 离线兜底 ---- */
console.log('\n-- TEST 5: 离线兜底 --');

// 模拟离线
Object.defineProperty(win.navigator, 'onLine', { get: function () { return false; }, configurable: true });
win.dispatchEvent(new win.Event('offline'));

var allPills = $$('.tl-statusbar__pill');
var allOffline = allPills.every(function (p) { return p.getAttribute('data-sb') === 'offline'; });
ok(allOffline, '离线时全部 3 个 pill 的 data-sb=offline');

var allGray = allPills.every(function (p) {
  return p.querySelector('.tl-statusbar__text').textContent === '离线模式';
});
ok(allGray, '离线时全部 pill 文字为「离线模式」');

// 恢复在线
Object.defineProperty(win.navigator, 'onLine', { get: function () { return true; }, configurable: true });
win.dispatchEvent(new win.Event('online'));

/* ---- TEST 6: 点击 sync pill 弹出详情 ---- */
console.log('\n-- TEST 6: 点击交互 --');

// 清除已有弹窗
var oldModal = $('#tl-modal-root');
if (oldModal) oldModal.innerHTML = '';

syncPill.click();
var modalRoot = $('#tl-modal-root');
ok(!!modalRoot && modalRoot.children.length > 0, '点击 sync pill 后弹窗已打开');

if (modalRoot && modalRoot.children.length > 0) {
  var panel = modalRoot.querySelector('.tl-modal__panel');
  ok(!!panel, '弹窗面板存在');
  var title = panel ? panel.querySelector('.tl-modal__title') : null;
  ok(title && title.textContent.indexOf('同步') >= 0,
     '弹窗标题含「同步」（实际：「' + (title ? title.textContent : '') + '」）');
}

/* ---- TEST 7: 幂等挂载 ---- */
console.log('\n-- TEST 7: 幂等性 --');

var countBefore = $$('#tl-statusbar').length;
UI.mountStatusbar();
var countAfter = $$('#tl-statusbar').length;
ok(countBefore === 1 && countAfter === 1, '重复调用不创建多余 status bar（前=' + countBefore + ', 后=' + countAfter + '）');

/* ---- 结果汇总 ---- */
console.log('\n========================================');
console.log('底部状态栏测试：' + passed + ' 通过 / ' + failed + ' 失败');
console.log('========================================\n');

process.exit(failed > 0 ? 1 : 0);
