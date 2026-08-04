/* TEST-LEGUME · 通用日历组件（周/月，周一为自然周起点）专项测试
   验证：月历 42 格 + 周一表头 + 自然月边界补齐；周历 7 格且严格周一起；
        工作复盘日历按 ts 落格；学习今日计划/打卡日历渲染。
   运行：WINMOD=$(cygpath -w "$HOME/.workbuddy/binaries/node/workspace/node_modules") && \
     NODE_PATH="$WINMOD" node .dev/calendar-test.js */
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
  path.join('pages', 'monthly.js'),
  'app.js'
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

function load() {
  const dom = new JSDOM('<!DOCTYPE html><html><body>' +
    '<header class="tl-topbar"></header><nav class="tl-nav"></nav>' +
    '<div id="wk-tabs"></div>' +
    '<div id="wk-plans"></div><div id="wk-todos"></div>' +
    '<div id="wk-reviews"></div><div id="wk-monthly-section"><div id="mo-filter"></div><div id="mo-cal"></div><div id="mo-week"></div></div>' +
    '<div id="sd-pages"></div><div id="sd-plan-bar"></div>' +
    '<div id="sd-plan-section"></div><div id="sd-plan-grid"></div>' +
    '<div id="sd-hotspot-section"></div><div id="sd-hotspots"></div>' +
    '</body></html>', { url: 'https://localhost/', pretendToBeVisual: true, runScripts: 'outside-only' });
  const win = dom.window;
  polyfill(win);
  SCRIPTS.forEach(function (rel) { win.eval(fs.readFileSync(path.join(ASSETS, rel), 'utf8')); });
  try { win.document.dispatchEvent(new win.Event('DOMContentLoaded', { bubbles: true })); } catch (e) {}
  return win;
}

console.log('▶ 通用日历组件专项测试');

(async function () {
  const win = load();
  const TL = win.TL;
  const doc = win.document;

  // ---------- 1. 组件层：月历 ----------
  const cal = TL.UI.calendar({ view: 'month', year: 2026, month: 0 }); // 2026-01
  ok(cal.classList.contains('tl-calendar--month'), '月历根节点含 tl-calendar--month');
  const cells = cal.querySelectorAll('.tl-calendar__cell');
  ok(cells.length === 42, '月历固定渲染 42 个日期格（6 周）');
  const wds = cal.querySelectorAll('.tl-calendar__wd');
  ok(wds.length === 7 && wds[0].textContent === '一', '星期表头从「一」（周一）起，严格自然周起点');
  let muted = 0; cal.querySelectorAll('.tl-calendar__cell.is-muted').forEach(function () { muted++; });
  ok(muted > 0, '月历含相邻月补齐格（is-muted 存在），自然月 1~末日边界正确');

  // ---------- 2. 组件层：周历 ----------
  const anchor = new Date(2026, 1, 11); // 2026-02-11（周三）
  const dow = (anchor.getDay() + 6) % 7;
  const mon = new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate() - dow);
  const wk = TL.UI.calendar({ view: 'week', weekAnchor: anchor });
  ok(wk.classList.contains('tl-calendar--week'), '周历根节点含 tl-calendar--week');
  const wkCells = wk.querySelectorAll('.tl-calendar__cell');
  ok(wkCells.length === 7, '周历固定 7 个日期格');
  const firstDay = wkCells[0].querySelector('.tl-calendar__day').textContent;
  const lastDay = wkCells[6].querySelector('.tl-calendar__day').textContent;
  ok(firstDay === String(mon.getDate()), '周历首格为当周周一（自然周起点）');
  ok(lastDay === String(mon.getDate() + 6), '周历末格为当周周日，覆盖完整自然周');

  // ---------- 3. 组件层：onSelect 回调 + 今日高亮 ----------
  let picked = null;
  const cal2 = TL.UI.calendar({ view: 'month', year: 2026, month: 0, onSelect: function (k) { picked = k; } });
  const c0 = cal2.querySelectorAll('.tl-calendar__cell')[10];
  c0.dispatchEvent(new win.Event('click', { bubbles: true }));
  ok(!!picked && picked.length === 10 && picked.charAt(4) === '-' && picked.charAt(7) === '-', '点击日期格触发 onSelect 并回传 YYYY-MM-DD 键（' + picked + '）');

  // ---------- 4. 集成：工作·工作总结 月历/周历 分布切换（用户要求） ----------
  TL.pages.work.init();
  const revTab = doc.querySelector('#wk-tabs .tl-tab[data-tab="reviews"]');
  revTab.dispatchEvent(new win.Event('click', { bubbles: true }));
  ok(!doc.querySelector('#wk-reviews .tl-review-view'), '复盘总结已移除月历/周历切换（按用户要求，分布落到工作总结）');

  const monthlyTab = doc.querySelector('#wk-tabs .tl-tab[data-tab="monthly"]');
  monthlyTab.dispatchEvent(new win.Event('click', { bubbles: true }));
  const moSegBtns = Array.prototype.slice.call(doc.querySelectorAll('#mo-filter .tl-seg__btn'));
  const moMonthBtn = moSegBtns.filter(function (b) { return b.textContent === '月历'; })[0];
  const moWeekBtn = moSegBtns.filter(function (b) { return b.textContent === '周历'; })[0];
  ok(!!moMonthBtn && !!moWeekBtn, '工作总结渲染出「月历 / 周历」分布切换');
  ok(doc.querySelector('#mo-cal').style.display !== 'none', '默认显示自然月历看板（当月真实天数）');
  moWeekBtn.dispatchEvent(new win.Event('click', { bubbles: true }));
  ok(doc.querySelector('#mo-cal').style.display === 'none' && doc.querySelector('#mo-week').style.display !== 'none', '切到「周历」后显示自然周视图、隐藏月历');
  moMonthBtn.dispatchEvent(new win.Event('click', { bubbles: true }));
  ok(doc.querySelector('#mo-cal').style.display !== 'none' && doc.querySelector('#mo-week').style.display === 'none', '切回「月历」后恢复自然月看板');

  // 新增：工作总结胶囊日历专项断言
  const statsText = (doc.querySelector('#mo-filter .mo-stats') || {}).textContent || '';
  ok(/本月已打卡\s*\d+\s*\/\s*\d+\s*天/.test(statsText), '工作总结显示「本月已打卡 X / XX 天」动态统计');
  ok(!!doc.querySelector('#mo-cal .tl-calendar__today'), '月历头部存在「今天」快捷按钮');

  // 点击一个当月日期格应弹出日计划明细弹窗
  const clickableCell = doc.querySelector('#mo-cal .tl-calendar__cell:not(.is-muted)');
  if (clickableCell) {
    clickableCell.dispatchEvent(new win.Event('click', { bubbles: true }));
    const modalTitle = (doc.querySelector('#tl-modal-root .tl-modal__title') || {}).textContent || '';
    ok(modalTitle.indexOf('日计划明细') >= 0, '点击日期格弹出「日计划明细」弹窗');
    const closeBtn = doc.querySelector('#tl-modal-root .tl-modal__close');
    if (closeBtn) closeBtn.dispatchEvent(new win.Event('click', { bubbles: true }));
  }

  // 注入一条今日已完成日计划，检查对应日期格应用完成态
  const todayKey = TL.Store.todayKey();
  TL.Store.update('work', function (d) {
    d.plans.day = d.plans.day.filter(function (p) { return p.id !== 'cal-t1'; });
    d.plans.day.push({ id: 'cal-t1', text: '日历测试计划', done: true, date: todayKey });
  }, '日历测试注入');
  // 测试页当前激活页不是 monthly，手动触发一次月度视图刷新以验证联动
  TL.pages.monthly.render();
  const todayCell = doc.querySelector('#mo-cal .tl-calendar__cell.is-today');
  ok(!!todayCell && todayCell.classList.contains('mo-cell--done'), '今日日计划全部完成后日期格显示 mo-cell--done 完成标识');

  // ---------- 5. 集成：学习·今日计划日历渲染 ----------
  TL.pages.study.init();
  const planMonthBtn = Array.prototype.slice.call(doc.querySelectorAll('#sd-plan-grid .tl-review-view .tl-seg__btn')).filter(function (b) { return b.textContent === '月历'; })[0];
  ok(!!planMonthBtn, '今日计划渲染出「月历」视图切换按钮');
  planMonthBtn.dispatchEvent(new win.Event('click', { bubbles: true }));
  ok(!!doc.querySelector('#sd-plan-grid .tl-calendar'), '点击「月历」后今日计划区渲染出日历');

  // ---------- 6. 集成：学习·打卡周历 7 格 ----------
  const checkinWeekBtn = Array.prototype.slice.call(doc.querySelectorAll('#sd-plan-grid .tl-review-view .tl-seg__btn')).filter(function (b) { return b.textContent === '周历'; })[1];
  ok(!!checkinWeekBtn, '打卡面板渲染出「周历」视图切换按钮');
  checkinWeekBtn.dispatchEvent(new win.Event('click', { bubbles: true }));
  const ckCal = doc.querySelectorAll('#sd-plan-grid .tl-calendar--week');
  let seven = false; ckCal.forEach(function (c) { if (c.querySelectorAll('.tl-calendar__cell').length === 7) seven = true; });
  ok(seven, '打卡「周历」渲染出 7 格的自然周视图');

  console.log('\n日历组件专项测试：' + pass + ' 通过 / ' + fail + ' 失败');
  process.exit(fail ? 1 : 0);
})();
