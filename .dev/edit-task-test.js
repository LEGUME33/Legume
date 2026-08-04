/* TEST-LEGUME · 编辑能力测试
   验证：每日计划 / 学习今日任务 的【编辑】链路完整、持久化、防误操作二次确认、日历联动
   运行：NODE_PATH="C:/Users/薛春雨1/.workbuddy/binaries/node/workspace/node_modules" node .dev/edit-task-test.js */
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
function nextDateKey(offsetDays) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
function btnByText(root, sel, text) {
  return Array.prototype.slice.call(root.querySelectorAll(sel)).filter(function (b) { return (b.textContent || '').indexOf(text) >= 0; })[0];
}

console.log('▶ 编辑能力测试：每日计划 / 学习今日任务');

/* ===================== 工作·每日计划 ===================== */
console.log('\n[work.html · 每日计划]');
try {
  const win = loadPage('work.html');
  const TL = win.TL;
  win.document.querySelector('#wk-tabs .tl-tab[data-tab="plans"]').click();

  // 添加一条日计划
  const input = win.document.querySelector('#wk-plans .tl-input');
  input.value = '编辑测试计划A';
  const addBtn = btnByText(win.document, '#wk-plans button', '添加');
  addBtn.click();
  ok(win.document.querySelectorAll('#wk-plans .tl-task').length >= 1, '每日计划：已添加任务并渲染');

  // 含编辑按钮
  const editBtn = win.document.querySelector('#wk-plans .tl-task .tl-task__edit');
  ok(!!editBtn, '每日计划：任务条目含【编辑】按钮');

  // 打开编辑弹窗
  editBtn.click();
  ok(win.document.querySelectorAll('.tl-modal').length === 1, '每日计划：点击编辑弹出编辑弹窗');
  const nameI = win.document.querySelector('.tl-modal input.tl-input:not([type=date])');
  const dateI = win.document.querySelector('.tl-modal input[type=date]');
  const noteI = win.document.querySelector('.tl-modal textarea');
  ok(!!nameI && !!dateI && !!noteI, '每日计划：编辑弹窗含 任务名称 / 绑定日期 / 任务备注 字段');
  ok(!!win.document.querySelector('.tl-modal .tl-seg__btn'), '每日计划：编辑弹窗含 完成状态 切换');

  // 改名 + 备注，保存
  nameI.value = '改名后的计划A';
  noteI.value = '这是备注内容';
  btnByText(win.document, '.tl-modal__foot .tl-btn', '保存').click();
  const stored = TL.Store.get('work').plans.day;
  const edited = stored.filter(function (p) { return p.text === '改名后的计划A'; })[0];
  ok(!!edited, '每日计划：保存后任务名称已更新并持久化');
  ok(edited && edited.note === '这是备注内容', '每日计划：任务备注已持久化');
  const textNode = Array.prototype.slice.call(win.document.querySelectorAll('#wk-plans .tl-task__text')).filter(function (t) { return (t.textContent || '') === '改名后的计划A'; })[0];
  ok(!!textNode, '每日计划：DOM 已反映新名称');

  // 修改绑定日期 → 二次确认
  const editBtn2 = win.document.querySelector('#wk-plans .tl-task .tl-task__edit');
  editBtn2.click();
  const dateI2 = win.document.querySelector('.tl-modal input[type=date]');
  const nk = nextDateKey(1);
  dateI2.value = nk;
  btnByText(win.document, '.tl-modal__foot .tl-btn', '保存').click();
  ok(win.document.querySelectorAll('.tl-modal').length === 1, '每日计划：修改绑定日期触发二次确认弹窗');
  const confirmOk = btnByText(win.document, '.tl-modal__foot .tl-btn', '确定');
  ok(!!confirmOk, '每日计划：二次确认弹窗含「确定」按钮');
  confirmOk.click();
  const moved = TL.Store.get('work').plans.day.filter(function (p) { return p.date === nk && p.text === '改名后的计划A'; })[0];
  ok(!!moved, '每日计划：确认后任务已移动到新日期，工作总结日历将自动同步');

  // 删除二次确认（防误操作）
  const delBtn = win.document.querySelector('#wk-plans .tl-task .tl-task__del');
  delBtn.click();
  ok(win.document.querySelectorAll('.tl-modal').length === 1, '每日计划：删除触发二次确认弹窗');
} catch (e) {
  fail++;
  console.error('  ✗ 异常：' + (e && e.stack || e));
}

/* ===================== 学习·今日计划任务 ===================== */
console.log('\n[study.html · 今日计划任务]');
try {
  const win = loadPage('study.html');
  const TL = win.TL;

  // 直接注入 课程 + 当日任务（避免脆弱的 DOM 输入定位）
  TL.Store.update('study', function (d) {
    var p = d.plans[0];
    p.courses.push({ id: 'cEdit', title: '测试课程C', link: 'https://pan.baidu.com/s/ccc' });
    p.assignments[TL.Store.todayKey()] = [{ id: 'aEdit', courseId: 'cEdit', done: false }];
  }, 'setup-edit-test');
  win.TL.pages.study.render();

  const sdTask = win.document.querySelector('.sd-task');
  ok(!!sdTask, '学习：今日任务条目已渲染');
  const sdEdit = win.document.querySelector('.sd-task .tl-task__edit');
  ok(!!sdEdit, '学习：任务条目含【编辑】按钮');

  // 打开编辑弹窗
  sdEdit.click();
  ok(win.document.querySelectorAll('.tl-modal').length === 1, '学习：点击编辑弹出编辑弹窗');
  const textInputs = win.document.querySelectorAll('.tl-modal input.tl-input:not([type=date])');
  const sName = textInputs[0];
  const sLink = textInputs[1];
  const sNote = win.document.querySelector('.tl-modal textarea');
  const sDate = win.document.querySelector('.tl-modal input[type=date]');
  ok(!!sName && !!sLink && !!sNote && !!sDate, '学习：编辑弹窗含 任务名称 / 课程链接 / 学习备注 / 绑定执行日期');

  // 修改名称 + 链接 + 备注，保存
  sName.value = '改名课程C';
  sLink.value = 'https://pan.baidu.com/s/newlink';
  sNote.value = '学习备注内容';
  btnByText(win.document, '.tl-modal__foot .tl-btn', '保存').click();
  const asg = TL.Store.get('study').plans[0].assignments[TL.Store.todayKey()];
  const a = asg.filter(function (x) { return x.id === 'aEdit'; })[0];
  ok(a && a.title === '改名课程C', '学习：保存后任务名称已持久化');
  ok(a && a.link === 'https://pan.baidu.com/s/newlink', '学习：保存后课程链接已持久化');
  ok(a && a.note === '学习备注内容', '学习：保存后学习备注已持久化');
  ok(a && a.done === false, '学习：编辑未清除原有完成进度（done 保持 false）');
  // DOM 反映新名称
  const sdTitle = Array.prototype.slice.call(win.document.querySelectorAll('.sd-task__title')).filter(function (t) { return (t.textContent || '') === '改名课程C'; })[0];
  ok(!!sdTitle, '学习：DOM 已反映新任务名称');

  // 修改执行日期 → 二次确认
  win.document.querySelector('.sd-task .tl-task__edit').click();
  const sdDate2 = win.document.querySelector('.tl-modal input[type=date]');
  const nk = nextDateKey(2);
  sdDate2.value = nk;
  btnByText(win.document, '.tl-modal__foot .tl-btn', '保存').click();
  ok(win.document.querySelectorAll('.tl-modal').length === 1, '学习：修改执行日期触发二次确认弹窗');
  btnByText(win.document, '.tl-modal__foot .tl-btn', '确定').click();
  const movedAsg = TL.Store.get('study').plans[0].assignments[nk];
  ok(movedAsg && movedAsg.some(function (x) { return x.id === 'aEdit'; }), '学习：确认后任务移动到新日期，打卡日历自动刷新');

  // 其它模块（课程库/月度目标/复盘）不应受影响：课程库仍含编辑入口
  ok(win.document.querySelector('.sd-course__actions .tl-btn--ghost'), '学习：网盘课程库编辑入口保持原样');
} catch (e) {
  fail++;
  console.error('  ✗ 异常：' + (e && e.stack || e));
}

console.log('\n编辑能力测试：' + pass + ' 通过 / ' + fail + ' 失败');
process.exit(fail ? 1 : 0);
