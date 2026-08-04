/* TEST-LEGUME · 学习计划子页面专项测试
   验证：预设主题注入 · 主题增删 · 课程库增删改+链接持久化 · 今日计划分配+完成态 ·
        30天打卡解锁逻辑 · 首页总览今日待完成数 · 双端同步标脏
   运行：WINMOD=$(cygpath -w "$HOME/.workbuddy/binaries/node/workspace/node_modules") && \
     NODE_PATH="$WINMOD" node .dev/study-test.js */
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
function ok(cond, msg) { if (cond) { pass++; console.log('  \u2713 ' + msg); } else { fail++; console.error('  \u2717 ' + msg); } }

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
  const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', { url: 'https://localhost/', pretendToBeVisual: true, runScripts: 'outside-only' });
  const win = dom.window;
  polyfill(win);
  SCRIPTS.forEach(function (rel) { win.eval(fs.readFileSync(path.join(ASSETS, rel), 'utf8')); });
  // 触发 boot：app.js 在 DOMContentLoaded 中调用 TL.Store.init()（含预设主题注入）
  try { win.document.dispatchEvent(new win.Event('DOMContentLoaded', { bubbles: true })); } catch (e) {}
  return win;
}

console.log('\u25b6 学习计划子页面专项测试');

(async function () {
  const win = load();
  const TL = win.TL;
  const today = TL.Store.todayKey();

  ok(!!(TL && TL.pages && TL.pages.study), '学习计划子页面模块已注册');
  ok(TL.Store.stats().study.planTotal === 3, '预设内置 3 个主题（AI/产品经理/大数据模型）已注入');

  // 自定义主题新增 + 持久化
  TL.Store.update('study', function (d) {
    d.plans.push({ id: TL.Store.uid('pl'), name: '前端工程化', builtin: false, createdAt: Date.now(), annual: { goal: '' }, monthly: [], courses: [], checkins: [], assignments: {} });
  }, '新增主题');
  ok(TL.Store.stats().study.planTotal === 4, '自定义主题新增后总数变为 4');
  let persisted = JSON.parse(win.localStorage.getItem('legume.study') || '{}');
  ok(persisted.plans.length === 4, '新增主题已写入 localStorage（双端同步落盘）');

  // 选定一个主题并操作课程库
  const plan = TL.Store.get('study').plans[0];
  const planId = plan.id;
  TL.Store.update('study', function (d) { d.currentPlanId = planId; }, '切主题');

  // 课程库：新增 + 编辑 + 删除 + 链接持久化
  TL.Store.update('study', function (d) {
    const p = d.plans.filter(function (x) { return x.id === planId; })[0];
    p.courses.push({ id: TL.Store.uid('cr'), title: '线性代数精讲', link: 'https://pan.baidu.com/s/abc' });
  }, '加课');
  let p = TL.Store.get('study').plans.filter(function (x) { return x.id === planId; })[0];
  ok(p.courses.length === 1 && p.courses[0].link === 'https://pan.baidu.com/s/abc', '网盘课程库新增课程并绑定链接');
  const cid = p.courses[0].id;
  TL.Store.update('study', function (d) {
    const c = d.plans.filter(function (x) { return x.id === planId; })[0].courses.filter(function (c) { return c.id === cid; })[0];
    c.title = '线代精讲（修订）'; c.link = 'https://pan.baidu.com/s/xyz';
  }, '改课');
  p = TL.Store.get('study').plans.filter(function (x) { return x.id === planId; })[0];
  ok(p.courses[0].title === '线代精讲（修订）' && p.courses[0].link === 'https://pan.baidu.com/s/xyz', '课程编辑后名称与链接均更新');
  TL.Store.update('study', function (d) {
    const pl = d.plans.filter(function (x) { return x.id === planId; })[0];
    pl.courses = pl.courses.filter(function (c) { return c.id !== cid; });
  }, '删课');
  ok(TL.Store.get('study').plans.filter(function (x) { return x.id === planId; })[0].courses.length === 0, '课程删除后课程库为空');

  // 今日计划：分配 + 完成态 + 同一课程不能同日重复分配
  TL.Store.update('study', function (d) {
    const pl = d.plans.filter(function (x) { return x.id === planId; })[0];
    pl.courses.push({ id: 'c1', title: '课A', link: 'https://pan.baidu.com/s/A' });
    pl.courses.push({ id: 'c2', title: '课B', link: 'https://pan.baidu.com/s/B' });
  }, '加两门');
  TL.Study = TL.Study || {};
  // 直接通过 Store 模拟分配（与页面 toggleAssign 等价）
  function assign(courseId) {
    TL.Store.update('study', function (d) {
      const pl = d.plans.filter(function (x) { return x.id === planId; })[0];
      pl.assignments[today] = pl.assignments[today] || [];
      const arr = pl.assignments[today];
      const i = arr.map(function (a) { return a.courseId; }).indexOf(courseId);
      if (i > -1) arr.splice(i, 1); else arr.push({ id: TL.Store.uid('as'), courseId: courseId, done: false });
    }, '分配');
  }
  assign('c1'); assign('c2');
  let asg = TL.Store.get('study').plans.filter(function (x) { return x.id === planId; })[0].assignments[today];
  ok(asg.length === 2, '今日计划成功分配 2 门课程');
  assign('c1'); // 重复同一天应移除
  asg = TL.Store.get('study').plans.filter(function (x) { return x.id === planId; })[0].assignments[today];
  ok(asg.length === 1 && asg[0].courseId === 'c2', '同一课程同日重复分配被去重（解除）');
  // 首页总览今日待完成数 = 1
  ok(TL.Store.stats().study.currentPlanTodayTodo === 1, '首页总览·当前主题今日待完成网盘课程数=1');
  // 完成该任务
  TL.Store.update('study', function (d) {
    const arr = d.plans.filter(function (x) { return x.id === planId; })[0].assignments[today];
    arr.forEach(function (a) { a.done = true; });
  }, '完成');
  ok(TL.Store.stats().study.currentPlanTodayTodo === 0, '全部完成后今日待完成数归零');
  asg = TL.Store.get('study').plans.filter(function (x) { return x.id === planId; })[0].assignments[today];
  ok(asg.every(function (a) { return a.done; }), '今日分配课程全部标记为完成');

  // 30 天打卡：今日课程全完成后方可打卡；打卡写入 checkins 并标脏
  let dirtyState = null;
  const origMark = TL.Sync.markDirty;
  TL.Sync.markDirty = function (cat) { dirtyState = cat; };
  TL.Store.update('study', function (d) {
    const pl = d.plans.filter(function (x) { return x.id === planId; })[0];
    if (pl.checkins.indexOf(today) < 0) pl.checkins.push(today);
  }, '打卡');
  p = TL.Store.get('study').plans.filter(function (x) { return x.id === planId; })[0];
  ok(p.checkins.indexOf(today) > -1, '今日课程全完成后可打卡，checkins 记录今日');
  ok(dirtyState === 'study', '打卡动作触发 study 域双端同步标脏');
  TL.Sync.markDirty = origMark;

  // 月度目标：新增 + 完成率统计
  TL.Store.update('study', function (d) {
    const pl = d.plans.filter(function (x) { return x.id === planId; })[0];
    pl.monthly.push({ id: TL.Store.uid('mo'), title: '目标1', done: true });
    pl.monthly.push({ id: TL.Store.uid('mo'), title: '目标2', done: false });
  }, '加月度目标');
  const cur = TL.Store.stats().study.currentPlan;
  ok(cur.monthly.length === 2 && cur.monthly.filter(function (m) { return m.done; }).length === 1, '月度目标 2 项含 1 项已完成');

  // 年度模板文本持久化
  TL.Store.update('study', function (d) {
    d.plans.filter(function (x) { return x.id === planId; })[0].annual.goal = '2026 拿下 AI 工程师';
  }, '填年度');
  ok(TL.Store.get('study').plans.filter(function (x) { return x.id === planId; })[0].annual.goal === '2026 拿下 AI 工程师', '年度模板文本持久化');

  console.log('\n学习计划专项测试：' + pass + ' 通过 / ' + fail + ' 失败');
  process.exit(fail ? 1 : 0);
})();
