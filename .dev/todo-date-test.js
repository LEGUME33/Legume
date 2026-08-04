/* TEST-LEGUME · 工作待办日期能力测试
   验证：日期选择控件 / 按日期筛选 / 远期待办 / 历史补录 / 改日期日历联动 / migrate 补日期 / 工作总结 openDay 快捷新建
   运行：NODE_PATH="C:/Users/19418/.workbuddy/binaries/node/workspace/node_modules" node .dev/todo-date-test.js */
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
function ok(cond, msg) {
  if (cond) { pass++; console.log('  ✓ ' + msg); }
  else { fail++; console.error('  ✗ ' + msg); }
}
function polyfill(win) {
  win.TextEncoder = TextEncoder; win.TextDecoder = TextDecoder;
  if (!win.btoa) win.btoa = function (s) { return Buffer.from(s, 'binary').toString('base64'); };
  if (!win.atob) win.atob = function (s) { return Buffer.from(s, 'binary').toString('binary'); };
  if (!win.matchMedia) win.matchMedia = function () { return { matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} }; };
  if (!win.requestAnimationFrame) win.requestAnimationFrame = function (cb) { return setTimeout(function () { cb(Date.now()); }, 0); };
  if (!win.cancelAnimationFrame) win.cancelAnimationFrame = function (id) { clearTimeout(id); };
  if (!win.fetch) win.fetch = function () { return Promise.reject(new Error('network disabled in test')); };
}
function loadPage(file) {
  const html = fs.readFileSync(path.join(ROOT, file), 'utf8');
  const dom = new JSDOM(html, { url: 'https://localhost/', pretendToBeVisual: true, runScripts: 'outside-only' });
  const win = dom.window;
  polyfill(win);
  SCRIPTS.forEach(function (rel) {
    const code = fs.readFileSync(path.join(ASSETS, rel), 'utf8');
    win.eval(code);
  });
  try { win.document.dispatchEvent(new win.Event('DOMContentLoaded', { bubbles: true })); } catch (e) {}
  return win;
}
function loadSeeded(file, seed) {
  const html = fs.readFileSync(path.join(ROOT, file), 'utf8');
  const dom = new JSDOM(html, { url: 'https://localhost/', pretendToBeVisual: true, runScripts: 'outside-only' });
  const win = dom.window;
  polyfill(win);
  seed(win);
  SCRIPTS.forEach(function (rel) {
    const code = fs.readFileSync(path.join(ASSETS, rel), 'utf8');
    win.eval(code);
  });
  try { win.document.dispatchEvent(new win.Event('DOMContentLoaded', { bubbles: true })); } catch (e) {}
  return win;
}
function nextDateKey(offsetDays) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
function btnByText(root, sel, text) {
  return Array.prototype.slice.call(root.querySelectorAll(sel)).filter(function (b) { return (b.textContent || '').indexOf(text) >= 0; })[0];
}
/* 打开日期弹层并跳转到 key 所在月，点击对应日期格 */
function pickDate(win, key) {
  const btn = win.document.querySelector('#wk-todos .tl-datepick__btn');
  btn.click();
  const pop = win.document.querySelector('#wk-todos .tl-datepick__pop');
  const cal = pop.querySelector('.tl-calendar');
  const p = key.split('-'); const ty = +p[0], tm = +p[1] - 1, td = +p[2];
  function cur() {
    const lab = cal.querySelector('.tl-calendar__label').textContent;
    const m = lab.match(/(\d+)\s*年\s*(\d+)\s*月/);
    return { y: +m[1], m: +m[2] - 1 };
  }
  let c = cur(), guard = 0;
  while ((c.y !== ty || c.m !== tm) && guard < 36) {
    const navs = cal.querySelectorAll('.tl-calendar__navbtn');
    const wantNext = (ty > c.y) || (ty === c.y && tm > c.m);
    navs[wantNext ? 1 : 0].click();
    c = cur(); guard++;
  }
  const cells = cal.querySelectorAll('.tl-calendar__cell');
  const target = Array.prototype.slice.call(cells).filter(function (cell) {
    return !cell.classList.contains('is-muted') && cell.querySelector('.tl-calendar__day').textContent === String(td);
  })[0];
  target.click();
}
function listTexts(win) {
  return Array.prototype.slice.call(win.document.querySelectorAll('#wk-todos .tl-task__text')).map(function (n) { return n.textContent; });
}

console.log('▶ 工作待办 · 日期选择 / 远期待办 / 历史补录 / 日历联动');

/* ===== TEST 1: 日期选择控件与默认按今日筛选 ===== */
console.log('\n[work.html · 工作待办 日期栏]');
try {
  const win = loadPage('work.html');
  const TL = win.TL;
  win.document.querySelector('#wk-tabs .tl-tab[data-tab="todos"]').click();
  ok(!!win.document.querySelector('#wk-todos .tl-datepick__btn'), '工作待办：顶部渲染日期选择控件');
  ok(!!win.document.querySelector('#wk-todos .tl-todo-count'), '工作待办：渲染日期待办统计');
  const todayK = TL.Store.todayKey(), futK = nextDateKey(5), pastK = nextDateKey(-3);
  TL.Store.update('work', function (d) {
    d.todos = [
      { id: 't1', text: '今日待办A', done: false, priority: '普通', date: todayK, note: '' },
      { id: 't2', text: '未来待办B', done: false, priority: '重要', date: futK, note: '' },
      { id: 't3', text: '历史待办C', done: false, priority: '紧急', date: pastK, note: '' }
    ];
  }, 'seed');
  TL.pages.work.render();
  const todayTexts = listTexts(win);
  ok(todayTexts.indexOf('今日待办A') >= 0, '按日期筛选：今日列表含今日待办');
  ok(todayTexts.indexOf('未来待办B') < 0 && todayTexts.indexOf('历史待办C') < 0, '按日期筛选：今日列表不含未来/历史待办');
} catch (e) { fail++; console.error('  ✗ 异常：' + (e && e.stack || e)); }

/* ===== TEST 2: 切换到未来日期可见远期待办 ===== */
console.log('\n[work.html · 远期待办]');
try {
  const win = loadPage('work.html');
  const TL = win.TL;
  win.document.querySelector('#wk-tabs .tl-tab[data-tab="todos"]').click();
  const todayK = TL.Store.todayKey(), futK = nextDateKey(5), pastK = nextDateKey(-3);
  TL.Store.update('work', function (d) {
    d.todos = [
      { id: 't1', text: '今日待办A', done: false, priority: '普通', date: todayK, note: '' },
      { id: 't2', text: '未来待办B', done: false, priority: '重要', date: futK, note: '' },
      { id: 't3', text: '历史待办C', done: false, priority: '紧急', date: pastK, note: '' }
    ];
  }, 'seed');
  TL.pages.work.render();
  pickDate(win, futK);
  const futTexts = listTexts(win);
  ok(futTexts.indexOf('未来待办B') >= 0, '远期待办：切到未来日期显示该日待办');
  ok(futTexts.indexOf('今日待办A') < 0, '远期待办：未来日期列表不含今日待办');
  ok(TL.Store.localState && TL.Store.localState().dirty === true, '远期待办：数据变更已触发本地定时存储标脏（30s 落盘）');
} catch (e) { fail++; console.error('  ✗ 异常：' + (e && e.stack || e)); }

/* ===== TEST 3: 历史补录（过去日期） ===== */
console.log('\n[work.html · 历史补录]');
try {
  const win = loadPage('work.html');
  const TL = win.TL;
  win.document.querySelector('#wk-tabs .tl-tab[data-tab="todos"]').click();
  const pastK = nextDateKey(-3);
  TL.Store.update('work', function (d) { d.todos = [{ id: 't3', text: '历史待办C', done: false, priority: '紧急', date: pastK, note: '' }]; }, 'seed');
  TL.pages.work.render();
  pickDate(win, pastK);
  ok(listTexts(win).indexOf('历史待办C') >= 0, '历史补录：切到过去日期显示该日待办');
} catch (e) { fail++; console.error('  ✗ 异常：' + (e && e.stack || e)); }

/* ===== TEST 4: 新建待办绑定当前选定日期 ===== */
console.log('\n[work.html · 新建绑定日期]');
try {
  const win = loadPage('work.html');
  const TL = win.TL;
  win.document.querySelector('#wk-tabs .tl-tab[data-tab="todos"]').click();
  const futK = nextDateKey(5);
  pickDate(win, futK);
  const input = win.document.querySelector('#wk-todos .tl-input:not([type=date])');
  input.value = '新建远期待办X';
  btnByText(win.document, '#wk-todos button', '添加').click();
  const created = TL.Store.get('work').todos.filter(function (t) { return t.text === '新建远期待办X'; })[0];
  ok(!!created, '新建待办：已创建并持久化');
  ok(created && created.date === futK, '新建待办：绑定到当前选定（未来）日期');
} catch (e) { fail++; console.error('  ✗ 异常：' + (e && e.stack || e)); }

/* ===== TEST 5: 编辑改绑定日期 → 列表与日历联动 ===== */
console.log('\n[work.html · 编辑改日期]');
try {
  const win = loadPage('work.html');
  const TL = win.TL;
  win.document.querySelector('#wk-tabs .tl-tab[data-tab="todos"]').click();
  const todayK = TL.Store.todayKey(), futK = nextDateKey(6);
  TL.Store.update('work', function (d) { d.todos = [{ id: 'e1', text: '待移动E', done: false, priority: '普通', date: todayK, note: '' }]; }, 'seed');
  TL.pages.work.render();
  win.document.querySelector('#wk-todos .tl-task .tl-task__edit').click();
  const dateI = win.document.querySelector('.tl-modal input[type=date]');
  dateI.value = futK;
  btnByText(win.document, '.tl-modal__foot .tl-btn', '保存').click();
  ok(win.document.querySelectorAll('.tl-modal').length === 1, '编辑改日期：触发二次确认弹窗');
  btnByText(win.document, '.tl-modal__foot .tl-btn', '确定').click();
  const moved = TL.Store.get('work').todos.filter(function (t) { return t.id === 'e1' && t.date === futK; })[0];
  ok(!!moved, '编辑改日期：保存后待办移动到新日期（持久化）');
  ok(listTexts(win).indexOf('待移动E') < 0, '编辑改日期：原日期列表已不含该待办');
  pickDate(win, futK);
  ok(listTexts(win).indexOf('待移动E') >= 0, '编辑改日期：新日期列表含该待办（双向联动）');
} catch (e) { fail++; console.error('  ✗ 异常：' + (e && e.stack || e)); }

/* ===== TEST 6: migrate 给无日期旧待办补日期 ===== */
console.log('\n[store migrate · 旧待办补日期]');
try {
  const win = loadSeeded('work.html', function (w) {
    w.localStorage.setItem('legume.work', JSON.stringify({
      schema: 1, plans: { month: [], week: [], day: [] },
      todos: [{ id: 'old1', text: '旧待办无日期', done: false }], reviews: []
    }));
  });
  const TL = win.TL;
  const t = TL.Store.get('work').todos[0];
  ok(!!t, 'migrate：旧待办被加载');
  ok(typeof t.date === 'string' && t.date === TL.Store.todayKey(), 'migrate：无日期旧待办默认补到当日（' + (t && t.date) + '）');
  ok(typeof t.priority === 'string' && typeof t.note === 'string', 'migrate：补齐优先级/备注字段');
} catch (e) { fail++; console.error('  ✗ 异常：' + (e && e.stack || e)); }

/* ===== TEST 7: 工作总结日历 openDay 聚合待办 + 快捷新建 ===== */
console.log('\n[work.html · 工作总结 openDay 联动]');
try {
  const win = loadPage('work.html');
  const TL = win.TL;
  win.document.querySelector('#wk-tabs .tl-tab[data-tab="monthly"]').click();
  const todayK = TL.Store.todayKey();
  TL.Store.update('work', function (d) { d.todos = [{ id: 'm1', text: '日历待办M', done: false, priority: '普通', date: todayK, note: '' }]; }, 'seed');
  TL.pages.monthly.render();
  const todayCell = win.document.querySelector('#mo-cal .tl-calendar__cell.is-today');
  ok(!!todayCell, '工作总结：月历渲染今日格');
  todayCell.click();
  ok(!!win.document.querySelector('.tl-modal'), '工作总结：点击日期弹出当日明细');
  ok(!!btnByText(win.document, '.tl-modal', '当日工作待办'), '工作总结：openDay 含「当日工作待办」区块');
  const quick = btnByText(win.document, '.tl-modal__foot .tl-btn, .tl-modal .tl-btn', '＋ 新建该日期工作待办');
  ok(!!quick, '工作总结：openDay 含「＋ 新建该日期工作待办」快捷按钮');
  quick.click();
  const nameI = win.document.querySelector('.tl-modal input.tl-input:not([type=date])');
  ok(!!nameI, '快捷新建：打开新建待办弹窗含内容输入');
  nameI.value = '从日历新建的待办';
  btnByText(win.document, '.tl-modal__foot .tl-btn', '保存').click();
  const made = TL.Store.get('work').todos.filter(function (t) { return t.text === '从日历新建的待办' && t.date === todayK; })[0];
  ok(!!made, '快捷新建：待办已创建并绑定到该日期');
} catch (e) { fail++; console.error('  ✗ 异常：' + (e && e.stack || e)); }

console.log('\n工作待办日期能力测试：' + pass + ' 通过 / ' + fail + ' 失败');
process.exit(fail ? 1 : 0);
