/* TEST-LEGUME · 【工作】模块重构专项测试
   覆盖：
     一、页面结构   —— 独立【工作待办】Tab / 分区移除，顶部 Tab 精简为 3 项
     二、重要等级   —— 新建 / 编辑弹窗含【重要程度】下拉，默认低优先级，条目底色随等级，完成后删除线 + 淡化
     三、数据联动   —— 旧待办自动迁移并入每日计划；日历按等级色点区分多条计划；
                      点击日期弹窗加载 当日日计划 + 归属本周周计划 + 归属本月月计划；打卡校验逻辑不变
     四、周期区分   —— 日计划（单日）/ 周计划（周一~周日）/ 月计划（自然月）筛选
     五、功能保留   —— 新增 / 编辑 / 删除、日期自由选择、30s 本地存储标脏、改日期/改周期二次确认
   运行：NODE_PATH="C:/Users/19418/.workbuddy/binaries/node/workspace/node_modules" node .dev/plan-refactor-test.js */
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
function loadSeeded(file, seed) {
  const html = fs.readFileSync(path.join(ROOT, file), 'utf8');
  const dom = new JSDOM(html, { url: 'https://localhost/', pretendToBeVisual: true, runScripts: 'outside-only' });
  const win = dom.window;
  polyfill(win);
  if (seed) seed(win);
  SCRIPTS.forEach(function (rel) { win.eval(fs.readFileSync(path.join(ASSETS, rel), 'utf8')); });
  try { win.document.dispatchEvent(new win.Event('DOMContentLoaded', { bubbles: true })); } catch (e) {}
  return win;
}
function loadPage(file) { return loadSeeded(file, null); }

/* ---------- 日期工具（与实现保持一致：周一为周起点） ---------- */
function pad(n) { return String(n).padStart(2, '0'); }
function keyOf(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
function offsetKey(n) { const d = new Date(); d.setDate(d.getDate() + n); return keyOf(d); }
function mondayOfToday() { const d = new Date(); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return d; }
function sundayOfToday() { const d = mondayOfToday(); d.setDate(d.getDate() + 6); return d; }

function btnByText(root, sel, text) {
  return Array.prototype.slice.call(root.querySelectorAll(sel)).filter(function (b) { return (b.textContent || '').indexOf(text) >= 0; })[0];
}
function planTexts(win) {
  return Array.prototype.slice.call(win.document.querySelectorAll('#wk-plans .tl-task__text')).map(function (n) { return n.textContent; });
}
/* 切换每日计划的周期筛选：日计划 / 周计划 / 月计划 */
function switchScope(win, label) {
  btnByText(win.document, '#wk-plans .tl-tabs .tl-tab', label).click();
}
/* 打开日期弹层，跨月翻页到 key 所在月，点击对应日期格 */
function pickDate(win, key) {
  const btn = win.document.querySelector('#wk-plans .tl-datepick__btn');
  btn.click();
  const cal = win.document.querySelector('#wk-plans .tl-datepick__pop .tl-calendar');
  const p = key.split('-'); const ty = +p[0], tm = +p[1] - 1, td = +p[2];
  function cur() {
    const m = cal.querySelector('.tl-calendar__label').textContent.match(/(\d+)\s*年\s*(\d+)\s*月/);
    return { y: +m[1], m: +m[2] - 1 };
  }
  let c = cur(), guard = 0;
  while ((c.y !== ty || c.m !== tm) && guard < 36) {
    const navs = cal.querySelectorAll('.tl-calendar__navbtn');
    navs[((ty > c.y) || (ty === c.y && tm > c.m)) ? 1 : 0].click();
    c = cur(); guard++;
  }
  Array.prototype.slice.call(cal.querySelectorAll('.tl-calendar__cell')).filter(function (cell) {
    return !cell.classList.contains('is-muted') && cell.querySelector('.tl-calendar__day').textContent === String(td);
  })[0].click();
}

console.log('▶ 工作模块重构 · 结构精简 / 重要等级 / 周期区分 / 数据联动');

/* ===== 一、页面结构调整 ===== */
console.log('\n[一 · 页面结构：Tab 精简为 3 项，独立待办入口移除]');
try {
  const win = loadPage('work.html');
  const tabs = Array.prototype.slice.call(win.document.querySelectorAll('#wk-tabs .tl-tab')).map(function (b) { return b.textContent; });
  ok(tabs.length === 3, '顶部 Tab 共 3 项（实际：' + tabs.join(' | ') + '）');
  ok(tabs.join('|') === '工作总结|每日计划|复盘总结', 'Tab 顺序为：工作总结｜每日计划｜复盘总结');
  ok(!win.document.querySelector('#wk-tabs .tl-tab[data-tab="todos"]'), '独立【工作待办】Tab 已移除');
  ok(!win.document.getElementById('wk-todos'), '独立【工作待办】分区容器已移除');
  ok(!win.TL.pages.work.openTodoModal, '旧 openTodoModal 接口已下线');
  ok(typeof win.TL.pages.work.openPlanModal === 'function', '统一 openPlanModal 接口已提供');
} catch (e) { fail++; console.error('  ✗ 异常：' + (e && e.stack || e)); }

/* ===== 四、计划周期区分（日 / 周 / 月） ===== */
console.log('\n[四 · 周期区分：日计划（单日）/ 周计划（周一~周日）/ 月计划（自然月）]');
try {
  const win = loadPage('work.html');
  const TL = win.TL;
  win.document.querySelector('#wk-tabs .tl-tab[data-tab="plans"]').click();
  const scopeTabs = Array.prototype.slice.call(win.document.querySelectorAll('#wk-plans .tl-tabs .tl-tab')).map(function (b) { return b.textContent; });
  ok(scopeTabs.join('|') === '日计划|周计划|月计划', '每日计划顶部含周期切换：' + scopeTabs.join(' | '));

  const todayK = TL.Store.todayKey();
  const monK = keyOf(mondayOfToday()), sunK = keyOf(sundayOfToday());
  const outWeekK = offsetKey(20);
  const ym = todayK.slice(0, 7);
  TL.Store.update('work', function (d) {
    d.plans.day = [{ id: 'd1', text: '今日日计划', done: false, level: 'low', date: todayK, note: '', scope: 'day' }];
    d.plans.week = [
      { id: 'w1', text: '本周周一计划', done: false, level: 'mid', date: monK, note: '', scope: 'week' },
      { id: 'w2', text: '本周周日计划', done: false, level: 'high', date: sunK, note: '', scope: 'week' },
      { id: 'w3', text: '区间外周计划', done: false, level: 'low', date: outWeekK, note: '', scope: 'week' }
    ];
    d.plans.month = [
      { id: 'm1', text: '本月月计划', done: false, level: 'high', date: ym + '-05', note: '', scope: 'month' },
      { id: 'm2', text: '跨月月计划', done: false, level: 'low', date: (ym === '2099-12' ? '2098-01' : '2099-12') + '-05', note: '', scope: 'month' }
    ];
  }, 'seed');
  TL.pages.work.render();

  ok(planTexts(win).join(',') === '今日日计划', '日计划：仅展示当日绑定条目');
  switchScope(win, '周计划');
  const wt = planTexts(win);
  ok(wt.indexOf('本周周一计划') >= 0 && wt.indexOf('本周周日计划') >= 0, '周计划：完整覆盖周一至周日两端边界');
  ok(wt.indexOf('区间外周计划') < 0, '周计划：不含本周区间外条目');
  switchScope(win, '月计划');
  const mt = planTexts(win);
  ok(mt.indexOf('本月月计划') >= 0 && mt.indexOf('跨月月计划') < 0, '月计划：按完整自然月过滤');
  ok(!!win.document.querySelector('#wk-plans input[type=month]'), '月计划：日期栏切换为月份选择器');
} catch (e) { fail++; console.error('  ✗ 异常：' + (e && e.stack || e)); }

/* ===== 二、重要等级配置 ===== */
console.log('\n[二 · 重要等级：高（深红）/ 中（橙黄）/ 低（浅灰），默认低优先级]');
try {
  const win = loadPage('work.html');
  const TL = win.TL;
  win.document.querySelector('#wk-tabs .tl-tab[data-tab="plans"]').click();
  const sel = win.document.querySelector('#wk-plans .tl-select');
  ok(!!sel, '新增区含【重要程度】下拉');
  const opts = Array.prototype.slice.call(sel.querySelectorAll('option')).map(function (o) { return o.value + ':' + o.textContent; });
  ok(opts.join('|') === 'high:高优先级|mid:中优先级|low:低优先级', '等级选项为 高 / 中 / 低（' + opts.join(' ') + '）');
  ok(sel.value === 'low', '默认选中【低优先级】');

  const input = win.document.querySelector('#wk-plans .tl-input');
  input.value = '默认等级计划';
  btnByText(win.document, '#wk-plans button', '添加').click();
  const made = TL.Store.get('work').plans.day.filter(function (p) { return p.text === '默认等级计划'; })[0];
  ok(!!made && made.level === 'low', '新建计划默认写入 level=low');
  ok(!!made && made.date === TL.Store.todayKey() && made.scope === 'day', '新建计划绑定当前选定日期与周期');

  TL.Store.update('work', function (d) {
    d.plans.day = [
      { id: 'h', text: '高优计划', done: false, level: 'high', date: TL.Store.todayKey(), note: '', scope: 'day' },
      { id: 'm', text: '中优计划', done: false, level: 'mid', date: TL.Store.todayKey(), note: '', scope: 'day' },
      { id: 'l', text: '低优计划', done: true, level: 'low', date: TL.Store.todayKey(), note: '', scope: 'day' }
    ];
  }, 'seed');
  TL.pages.work.render();
  ok(win.document.querySelectorAll('#wk-plans .tl-task--level-high').length === 1, '条目渲染高优先级底色类 .tl-task--level-high');
  ok(win.document.querySelectorAll('#wk-plans .tl-task--level-mid').length === 1, '条目渲染中优先级底色类 .tl-task--level-mid');
  ok(win.document.querySelectorAll('#wk-plans .tl-task--level-low').length === 1, '条目渲染低优先级底色类 .tl-task--level-low');
  const doneNode = win.document.querySelector('#wk-plans .tl-task.is-done');
  ok(!!doneNode && doneNode.classList.contains('tl-task--level-low'), '勾选完成条目同时带 is-done（统一删除线 + 淡化）与等级类');
  const metas = Array.prototype.slice.call(win.document.querySelectorAll('#wk-plans .tl-task__meta')).map(function (n) { return n.textContent; });
  ok(metas.indexOf('高优先级') >= 0 && metas.indexOf('中优先级') >= 0, '条目 meta 位展示等级文案');

  const css = fs.readFileSync(path.join(ROOT, 'assets', 'css', 'app.css'), 'utf8');
  const tokens = fs.readFileSync(path.join(ROOT, 'assets', 'css', 'tokens.css'), 'utf8');
  ok(/\.tl-task--level-high\s*\{[^}]*--c-level-high-soft/.test(css), '样式：高优先级使用 --c-level-high-soft 淡色底');
  ok(/--c-level-high:/.test(tokens) && /--c-level-mid:/.test(tokens) && /--c-level-low:/.test(tokens), 'tokens：三档等级色已登记（莫兰迪柔和色）');
  const darkBlock = tokens.split('[data-theme="dark"]')[1] || '';
  ok(/--c-level-high:/.test(darkBlock) && /--c-level-low:/.test(darkBlock), 'tokens：暗色主题同名变量已适配（自动切换）');
} catch (e) { fail++; console.error('  ✗ 异常：' + (e && e.stack || e)); }

/* ===== 三-① 旧待办数据自动迁移 ===== */
console.log('\n[三① · 旧待办历史数据自动迁移并入每日计划]');
try {
  const win = loadSeeded('work.html', function (w) {
    w.localStorage.setItem('legume.work', JSON.stringify({
      schema: 1, plans: { month: [], week: [], day: [] },
      todos: [
        { id: 'old1', text: '旧紧急待办', done: false, priority: '紧急', date: '2026-07-01', note: '备注A' },
        { id: 'old2', text: '旧重要待办', done: true, priority: '重要', date: '2026-07-02', note: '' },
        { id: 'old3', text: '旧普通无日期待办', done: false 
        }
      ], reviews: []
    }));
  });
  const TL = win.TL;
  const w = TL.Store.get('work');
  ok(w.todos.length === 0, '迁移后旧 todos 已清空（单一数据源）');
  const day = w.plans.day;
  ok(day.length === 3, '3 条旧待办全部并入 plans.day');
  const a = day.filter(function (p) { return p.id === 'old1'; })[0];
  const b = day.filter(function (p) { return p.id === 'old2'; })[0];
  const c = day.filter(function (p) { return p.id === 'old3'; })[0];
  ok(!!a && a.level === 'high' && a.date === '2026-07-01' && a.note === '备注A', '优先级映射：紧急 → 高优先级，日期 / 备注原样保留');
  ok(!!b && b.level === 'mid' && b.done === true, '优先级映射：重要 → 中优先级，完成态保留');
  ok(!!c && c.level === 'low' && c.date === TL.Store.todayKey(), '优先级映射：普通/缺省 → 低优先级，无日期补当日');
  ok(day.every(function (p) { return p.scope === 'day'; }), '迁移条目周期统一标记为日计划');

  // 幂等：同一份 todos 再次进入（云端半合并态）不产生重复
  TL.Store.replace('work', {
    plans: { month: [], week: [], day: day.slice() },
    todos: [{ id: 'old1', text: '旧紧急待办', done: false, priority: '紧急', date: '2026-07-01', note: '备注A' }],
    reviews: []
  });
  ok(TL.Store.get('work').plans.day.filter(function (p) { return p.id === 'old1'; }).length === 1, '迁移幂等：重复载入不产生重复条目');
} catch (e) { fail++; console.error('  ✗ 异常：' + (e && e.stack || e)); }

/* ===== 五 · 编辑：改等级 / 改周期 / 改日期（二次确认 + 跨周期移动） ===== */
console.log('\n[五 · 编辑保留：改等级 / 改周期 / 改日期，大幅修改二次确认]');
try {
  const win = loadPage('work.html');
  const TL = win.TL;
  win.document.querySelector('#wk-tabs .tl-tab[data-tab="plans"]').click();
  const todayK = TL.Store.todayKey();
  TL.Store.update('work', function (d) {
    d.plans.day = [{ id: 'e1', text: '待调整计划', done: false, level: 'low', date: todayK, note: '', scope: 'day' }];
    d.plans.week = [];
  }, 'seed');
  TL.pages.work.render();
  win.document.querySelector('#wk-plans .tl-task .tl-task__edit').click();
  const modal = win.document.querySelector('.tl-modal');
  const labels = Array.prototype.slice.call(modal.querySelectorAll('.tl-field__label')).map(function (n) { return n.textContent; });
  ok(labels.join('|') === '计划内容|周期类型|绑定日期|重要程度|完成状态|备注', '编辑弹窗字段：' + labels.join(' / '));
  const sels = modal.querySelectorAll('select');
  sels[0].value = 'week';   // 周期类型 → 周计划
  sels[1].value = 'high';   // 重要程度 → 高优先级
  btnByText(win.document, '.tl-modal__foot .tl-btn', '保存').click();
  ok(win.document.querySelectorAll('.tl-modal').length === 1, '改周期触发二次确认弹窗');
  btnByText(win.document, '.tl-modal__foot .tl-btn', '确定').click();
  const after = TL.Store.get('work');
  ok(after.plans.day.filter(function (p) { return p.id === 'e1'; }).length === 0, '跨周期移动：已从日计划数组移除');
  const moved = after.plans.week.filter(function (p) { return p.id === 'e1'; })[0];
  ok(!!moved && moved.scope === 'week' && moved.level === 'high', '跨周期移动：写入周计划并保留新等级（high）');
  ok(TL.Store.localState && TL.Store.localState().dirty === true, '变更已触发本地定时存储标脏（30s 落盘）');

  // 改日期同样二次确认
  const futK = offsetKey(9);
  switchScope(win, '周计划');
  win.document.querySelector('#wk-plans .tl-task .tl-task__edit').click();
  win.document.querySelector('.tl-modal input[type=date]').value = futK;
  btnByText(win.document, '.tl-modal__foot .tl-btn', '保存').click();
  ok(win.document.querySelectorAll('.tl-modal').length === 1, '改绑定日期触发二次确认弹窗');
  btnByText(win.document, '.tl-modal__foot .tl-btn', '确定').click();
  ok(TL.Store.get('work').plans.week.filter(function (p) { return p.id === 'e1' && p.date === futK; }).length === 1, '改绑定日期：持久化到新日期');

  // 删除保留
  TL.pages.work.render();
  win.document.querySelector('#wk-plans .tl-task .tl-task__del').click();
  btnByText(win.document, '.tl-modal__foot .tl-btn', '确定').click();
  ok(TL.Store.get('work').plans.week.length === 0, '删除能力保留（二次确认后移除）');
} catch (e) { fail++; console.error('  ✗ 异常：' + (e && e.stack || e)); }

/* ===== 三-②③ 日历联动 + 打卡校验 ===== */
console.log('\n[三②③ · 日历按等级标识 / 点击日期聚合三类计划 / 打卡校验不变]');
try {
  const win = loadPage('work.html');
  const TL = win.TL;
  win.document.querySelector('#wk-tabs .tl-tab[data-tab="monthly"]').click();
  const todayK = TL.Store.todayKey();
  const ym = todayK.slice(0, 7);
  TL.Store.update('work', function (d) {
    d.plans.day = [
      { id: 'c1', text: '当日高优计划', done: false, level: 'high', date: todayK, note: '', scope: 'day' },
      { id: 'c2', text: '当日低优计划', done: false, level: 'low', date: todayK, note: '', scope: 'day' }
    ];
    d.plans.week = [{ id: 'c3', text: '归属本周周计划', done: false, level: 'mid', date: keyOf(mondayOfToday()), note: '', scope: 'week' }];
    d.plans.month = [{ id: 'c4', text: '归属本月月计划', done: false, level: 'low', date: ym + '-01', note: '', scope: 'month' }];
  }, 'seed');
  TL.pages.monthly.render();

  const cell = win.document.querySelector('#mo-cal .tl-calendar__cell.is-today');
  ok(!!cell, '月历渲染今日格');
  ok(!!cell.querySelector('.mo-cell__lv--high') && !!cell.querySelector('.mo-cell__lv--low'), '日历格：按优先级颜色分别标识当日多条计划');
  ok(cell.querySelector('.mo-cell__plan') && cell.querySelector('.mo-cell__plan').textContent === '2', '日历格：展示当日计划条数徽标');
  ok(cell.classList.contains('mo-cell--todo'), '打卡校验：存在未完成日计划时该日未打卡（mo-cell--todo）');

  cell.click();
  const dlg = win.document.querySelector('.tl-modal');
  const txt = dlg.textContent;
  ok(txt.indexOf('当日日计划') >= 0 && txt.indexOf('当日高优计划') >= 0, 'openDay：加载当日日计划');
  ok(txt.indexOf('本周周计划') >= 0 && txt.indexOf('归属本周周计划') >= 0, 'openDay：加载归属本周的周计划');
  ok(txt.indexOf('本月月计划') >= 0 && txt.indexOf('归属本月月计划') >= 0, 'openDay：加载归属本月的月计划');
  ok(!!dlg.querySelector('.tl-task--level-high') && !!dlg.querySelector('.tl-task--level-mid'), 'openDay：条目沿用等级底色');
  const quick = btnByText(win.document, '.tl-modal .tl-btn', '＋ 新建该日期日计划');
  ok(!!quick, 'openDay：含「＋ 新建该日期日计划」快捷入口');
  quick.click();
  const nameI = win.document.querySelector('.tl-modal input.tl-input:not([type=date])');
  nameI.value = '从日历新建的计划';
  btnByText(win.document, '.tl-modal__foot .tl-btn', '保存').click();
  ok(TL.Store.get('work').plans.day.filter(function (p) { return p.text === '从日历新建的计划' && p.date === todayK; }).length === 1, '快捷新建：写入日计划并绑定该日期');

  // 打卡：当日全部日计划勾选完成后方可标记完成
  TL.Store.update('work', function (d) { d.plans.day.forEach(function (p) { if (p.date === todayK) p.done = true; }); }, 'finish');
  TL.pages.monthly.render();
  const cell2 = win.document.querySelector('#mo-cal .tl-calendar__cell.is-today');
  ok(cell2.classList.contains('mo-cell--done'), '打卡校验：当日全部绑定计划完成后判定为已打卡（mo-cell--done）');
} catch (e) { fail++; console.error('  ✗ 异常：' + (e && e.stack || e)); }

/* ===== 概览卡片指向 ===== */
console.log('\n[联动 · 首页概览卡片指向每日计划]');
try {
  const win = loadPage('index.html');
  const card = btnByText(win.document, 'a, .tl-card', '未完成计划');
  ok(!!card, '首页概览卡片文案更新为「未完成计划」');
  const link = win.document.querySelector('a[href="work.html#plans"]');
  ok(!!link, '概览卡片跳转指向 work.html#plans（不再有独立待办入口）');
} catch (e) { fail++; console.error('  ✗ 异常：' + (e && e.stack || e)); }

console.log('\n工作模块重构测试：' + pass + ' 通过 / ' + fail + ' 失败');
process.exit(fail ? 1 : 0);
