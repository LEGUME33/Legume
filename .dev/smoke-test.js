/* TEST-LEGUME · 三页 jsdom 冒烟测试
   验证：模块全部加载无异常 · 全页 boot 流程跑通 · 首屏渲染产出节点
   运行：NODE_PATH="$HOME/.workbuddy/binaries/node/workspace/node_modules" node .dev/smoke-test.js */
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const ASSETS = path.join(ROOT, 'assets', 'js');
const PAGES = ['index.html', 'work.html', 'study.html'];
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
  if (cond) { pass++; console.log('  \u2713 ' + msg); }
  else { fail++; console.error('  \u2717 ' + msg); }
}

function polyfill(win) {
  win.TextEncoder = TextEncoder;
  win.TextDecoder = TextDecoder;
  if (!win.btoa) win.btoa = function (s) { return Buffer.from(s, 'binary').toString('base64'); };
  if (!win.atob) win.atob = function (s) { return Buffer.from(s, 'base64').toString('binary'); };
  if (!win.matchMedia) win.matchMedia = function (q) {
    return { matches: false, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} };
  };
  if (!win.requestAnimationFrame) win.requestAnimationFrame = function (cb) { return setTimeout(function () { cb(Date.now()); }, 0); };
  if (!win.cancelAnimationFrame) win.cancelAnimationFrame = function (id) { clearTimeout(id); };
  // smoke 阶段不配置云端 → fetch 不会被触发；给个兜底避免意外网络
  if (!win.fetch) win.fetch = function () { return Promise.reject(new Error('network disabled in smoke test')); };
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
  // jsdom(outside-only) 不会自动派发 DOMContentLoaded；boot 在 app.js 中监听该事件，
  // 此处手动派发以触发全页启动流程（若已 readyState=complete 则 boot 已执行，重复派发无副作用）。
  try { win.document.dispatchEvent(new win.Event('DOMContentLoaded', { bubbles: true })); } catch (e) {}
  return win;
}

console.log('▶ 冒烟测试：模块加载 + 全页 boot + 首屏渲染');

PAGES.forEach(function (page) {
  console.log('\n[' + page + ']');
  try {
    const win = loadPage(page);
    const TL = win.TL;
    ok(!!TL, 'window.TL 存在');
    ok(!!(TL.Store && TL.Sync && TL.GitHub && TL.Media && TL.UI), '核心模块（Store/Sync/GitHub/Media/UI）全部就绪');
    ok(!!(TL.Deploy && TL.Vercel), '部署模块（Deploy/Vercel）已就绪');
    ok(!!(TL.pages && TL.pages.overview && TL.pages.work && TL.pages.study && TL.pages.monthly), '四大页面已注册（overview/work/study/monthly）');
    ok(!!win.document.getElementById('tl-sync-badge'), '顶栏·业务数据同步指示器已挂载');
    ok(!!win.document.getElementById('tl-code-badge'), '顶栏·代码部署状态指示器已挂载');
    ok(!!win.document.getElementById('tl-vercel-badge'), '顶栏·Vercel 部署状态指示器已挂载');
    ok(win.document.querySelectorAll('.tl-nav__link').length === 3, '三大固定导航渲染（共 3 项）');

    if (page === 'index.html') {
      ok(win.document.getElementById('ov-work').childElementCount > 0, '总览·工作模块预览卡已渲染');
      var monthlyCard = win.document.querySelector('a[data-card="work-monthly"]');
      ok(!!monthlyCard && monthlyCard.getAttribute('href') === 'work.html#monthly', '总览·「月度任务完成进度」卡片跳转工作页月度标签页');
      ok(win.document.getElementById('ov-study-metrics').childElementCount > 0, '总览·学习模块指标卡已渲染');
      ok(win.document.getElementById('ov-activity').childElementCount > 0, '总览·操作记录区已渲染（含空态）');
    }
    if (page === 'work.html') {
      ok(win.document.getElementById('wk-tabs').childElementCount > 0, '工作·标签栏已渲染');
      // 默认进入「工作总结」标签页；其余标签页按需渲染，先切到「每日计划」验证渲染
      var plansTab = win.document.querySelector('#wk-tabs .tl-tab[data-tab="plans"]');
      ok(!!plansTab, '工作·存在「每日计划」标签');
      plansTab.click();
      ok(win.document.getElementById('wk-plans').childElementCount > 0, '工作·切到每日计划标签页后已渲染');
      ok(!!(win.TL.AI && win.TL.Review), 'AI 分析引擎 + 复盘模板模块已就绪');
      // 复盘引擎：模板 / 自动运算 / 飞书排版
      var RV = win.TL.Review;
      ok(RV.TYPES.length === 3, '复盘模板含三类（日 / 周 / 月）');
      var sample = { type: 'month', fields: { yoyNew: '8600', yoyPrev: '6400' }, skus: [{ sku: 'A', stock: 100, sold: 80 }, { sku: 'B', stock: 100, sold: 30 }] };
      var calc = RV.calc(sample);
      ok(calc.totalSold === 110 && Math.round(calc.sellThrough * 100) === 55, '自动运算：总销量与整体动销率正确');
      ok(calc.yoy.diff === 2200 && calc.yoy.diffPct === 34, '自动运算：新机 vs 上代同比差值 / 百分比正确');
      ok(typeof RV.buildFeishu(sample) === 'string' && RV.buildFeishu(sample).indexOf('首销复盘') > -1, '飞书文档全文生成成功');
      // 填写规范：仅 4 项人工填写，其余图片 AI；首销日不得另设手动文本框，首销月不得有手动同比字段
      var dayIds = []; RV.template('day').blocks.forEach(function (b) { b.fields.forEach(function (f) { dayIds.push(f.id); }); });
      ok(dayIds.indexOf('flow') >= 0 && dayIds.indexOf('portrait') >= 0 && dayIds.indexOf('resource') >= 0, '首销日模板含 流转销/用户画像/资源位 图片板块');
      var dayHasText = false; RV.template('day').blocks.forEach(function (b){ b.fields.forEach(function(f){ if (f.type==='textarea') dayHasText = true; }); });
      ok(!dayHasText, '首销日模板无额外手动文本框（仅 4 项填写 + 图片）');
      var monthIds = []; RV.template('month').blocks.forEach(function (b) { b.fields.forEach(function (f) { monthIds.push(f.id); }); });
      ok(monthIds.indexOf('yoyNew') < 0 && monthIds.indexOf('yoyPrev') < 0, '首销月模板无手动同比字段（同比由 N-1 对比图 AI 自动生成）');
      function fieldOf(t, id) { var f = null; t.blocks.forEach(function (b) { b.fields.forEach(function (x) { if (x.id === id) f = x; }); }); return f; }
      ok(fieldOf(RV.template('week'), 'week-promo').embed === true, '首销周·推广数据图片标记为原图嵌入');
      ok(fieldOf(RV.template('week'), 'flow') == null, '首销周模板不含流转销图片区（流转销仅属首销日）');
      ok(fieldOf(RV.template('month'), 'month-compare').embed === true, '首销月·N-1 对比图标记为原图嵌入');
      ok(fieldOf(RV.template('month'), 'month-trend').embed === true, '首销月·流量趋势图标记为原图嵌入（原图保留、仅文字总结）');
      ok(fieldOf(RV.template('month'), 'flow') == null, '首销月模板不含流转销图片区（流转销仅属首销日）');
      ok(fieldOf(RV.template('day'), 'resource') && fieldOf(RV.template('week'), 'resource') && fieldOf(RV.template('month'), 'resource'), '资源位 4×4 标准表格为三类通用固定模块');
      // 禁词过滤（模拟引擎 + 真实钩子双重保障）
      var AI = win.TL.AI;
      ok(AI.forbid('给优惠券再闪降降价折扣优惠补贴满减返现赠品立减').indexOf('优惠券') < 0, 'AI 禁词过滤：优惠/折扣/补贴/满减等让利词已被替换');
      // 旧版复盘记录迁移：仅 {type,summary} 经 replace 也能被规范化
      win.TL.Store.replace('work', { reviews: [{ type: 'day', summary: '旧记录' }] });
      win.TL.Store.get('work').reviews.forEach(function (r) {
        ok(!!r.id && Array.isArray(r.images) && r.fields && typeof r.ts === 'number', '旧版复盘记录已规范化（兼容）');
      });
      // 工作总结（月度任务总结）已融合为工作页第 1 个标签页
      ok(win.document.getElementById('wk-tabs').querySelectorAll('.tl-tab').length === 3, '工作·标签页精简为 3 项（工作总结｜每日计划｜复盘总结）');
      ok(!win.document.querySelector('#wk-tabs .tl-tab[data-tab="todos"]'), '工作·独立「工作待办」标签已移除');
      ok(!win.document.getElementById('wk-todos'), '工作·独立「工作待办」分区容器已移除');
      var moTab = win.document.querySelector('#wk-tabs .tl-tab[data-tab="monthly"]');
      ok(!!moTab, '工作·存在「工作总结」标签');
      moTab.click(); // 切到该标签，验证内嵌日历看板渲染真实天数
      ok(win.document.getElementById('wk-monthly-section').style.display !== 'none', '工作·切换到月度标签后分区可见');
      var expDays = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate();
      var moCalCells = win.document.getElementById('mo-cal').querySelectorAll('.tl-calendar__cell');
      ok(moCalCells.length === 42, '融合后·月历固定渲染 42 个日期格（标准 6 周）');
      var nonMuted = win.document.getElementById('mo-cal').querySelectorAll('.tl-calendar__cell:not(.is-muted)').length;
      ok(nonMuted === expDays, '融合后·月历当前月显示 ' + expDays + ' 个真实日期（随月份 28/29/30/31 变化）');
      ok(win.document.getElementById('mo-week').querySelectorAll('.tl-calendar__cell').length === 7, '融合后·周历渲染周一至周日 7 列');
      // 日历联动：注入一条当日日计划，内嵌看板应反映完成进度
      var tk = win.TL.Store.todayKey();
      win.TL.Store.update('work', function (d) { d.plans.day.push({ id: 't1', text: '测试计划', done: true, date: tk }); }, '测试');
      var todayCell = win.document.querySelector('#mo-cal .tl-calendar__cell.is-today');
      ok(!!todayCell && todayCell.classList.contains('mo-cell--done'), '融合后·当日计划全部完成后色块状态变「完成」');
      // 复盘总结：+新建复盘 先弹类型选择弹窗（首销日/首销周/首销月）
      win.document.querySelector('#wk-tabs .tl-tab[data-tab="reviews"]').click();
      var reviewSec = win.document.getElementById('wk-reviews');
      ok(!!reviewSec.querySelector('.tl-review-title') && (reviewSec.querySelector('.tl-review-title').textContent || '').indexOf('复盘总结') >= 0, '复盘总结·头部显示标题「复盘总结」');
      var segBtns = reviewSec.querySelectorAll('.tl-review-filter .tl-seg__btn');
      ok(segBtns.length === 4, '复盘总结·头部含 4 个类型筛选按钮（全部/首销日/首销周/首销月）');
      var segLabels = Array.prototype.map.call(segBtns, function (b) { return b.textContent; }).join(',');
      ok(segLabels.indexOf('首销日小结') >= 0 && segLabels.indexOf('首销周复盘') >= 0 && segLabels.indexOf('首销月复盘') >= 0, '复盘总结·筛选按钮覆盖三类首销复盘');
      var grid = reviewSec.querySelector('.tl-review-list');
      ok(!!grid, '复盘总结·复盘卡片以网格容器渲染（双列）');
      var cardBtns = grid ? Array.prototype.map.call(grid.querySelectorAll('.tl-review-card__actions .tl-btn'), function (b) { return b.textContent; }).join(',') : '';
      ok(cardBtns.indexOf('查看') >= 0 && cardBtns.indexOf('AI 分析') >= 0 && cardBtns.indexOf('飞书') >= 0, '复盘总结·卡片操作按钮为「查看 / AI 分析 / 飞书」');
      // 类型筛选：单条 day 复盘在「首销周复盘」筛选下应被过滤为空态，切回「全部」恢复
      Array.prototype.forEach.call(segBtns, function (b) { if ((b.textContent || '') === '首销周复盘') b.click(); });
      ok(!!win.document.getElementById('wk-reviews').querySelector('.tl-review-empty'), '复盘总结·按类型筛选无匹配时显示空态');
      Array.prototype.forEach.call(win.document.getElementById('wk-reviews').querySelectorAll('.tl-review-filter .tl-seg__btn'), function (b) { if ((b.textContent || '') === '全部') b.click(); });
      var newBtns = Array.prototype.slice.call(win.document.querySelectorAll('#wk-reviews button'));
      var newBtn = newBtns.filter(function (b) { return (b.textContent || '').indexOf('新建复盘') >= 0; })[0];
      ok(!!newBtn, '复盘总结·存在「+ 新建复盘」按钮');
      newBtn.click();
      var typeCards = win.document.querySelectorAll('.tl-type-card');
      ok(typeCards.length === 3, '复盘总结·新建复盘弹出类型选择弹窗（首销日/首销周/首销月 共 3 项）');
      // 选择首销月复盘后应弹出编辑器弹窗，内含标题输入框及模板字段
      typeCards[2].click();
      ok(win.document.querySelectorAll('.tl-modal').length === 1, '复盘总结·选择类型后弹出编辑器弹窗');
      ok(!!win.document.querySelector('.tl-review-form input.tl-input'), '复盘总结·编辑器含复盘标题输入框');
      var editorLabels = Array.prototype.map.call(win.document.querySelectorAll('.tl-review-form .tl-field__label'), function (el) { return el.textContent; }).join(',');
      ok(editorLabels.indexOf('周期内总库存') >= 0 && editorLabels.indexOf('总销售数据') >= 0 && editorLabels.indexOf('分机型数量') >= 0 && editorLabels.indexOf('销量') >= 0, '复盘总结·编辑器含 4 项基础手填字段');
      ok(editorLabels.indexOf('资源位落地情况') >= 0 && editorLabels.indexOf('用户画像分析') >= 0, '复盘总结·编辑器含资源位/用户画像图片板块');
      // 模拟填写标题并关闭，验证数据已持久化到 localStorage
      var titleInput = win.document.querySelector('.tl-review-form input.tl-input');
      titleInput.value = '冒烟测试复盘';
      titleInput.dispatchEvent(new win.Event('input', { bubbles: true }));
      var persisted = JSON.parse(win.localStorage.getItem('legume.work') || '{}');
      ok(persisted.reviews && persisted.reviews[0] && persisted.reviews[0].title === '冒烟测试复盘', '复盘总结·编辑数据正确持久化到 localStorage');
      var modalNodes = win.document.querySelectorAll('.tl-modal');
      Array.prototype.forEach.call(modalNodes, function (m) { m.parentNode && m.parentNode.removeChild(m); });
    }
    if (page === 'study.html') {
      ok(!!win.document.getElementById('sd-pages') && win.document.getElementById('sd-pages').childElementCount === 2, '学习·子页面导航已渲染（学习计划/今日热点）');
      ok(!!win.document.getElementById('sd-plan-section'), '学习·学习计划子页面分区已挂载');
      var chips = win.document.querySelectorAll('.sd-plan-chip');
      ok(chips.length === 4, '学习·预设 3 个主题 + 新建主题共 4 个主题芯片（实际 ' + chips.length + '）');
      var chipLabels = Array.prototype.map.call(chips, function (c) { return c.textContent; }).join(',');
      ok(chipLabels.indexOf('AI') >= 0 && chipLabels.indexOf('产品经理') >= 0 && chipLabels.indexOf('大数据模型') >= 0, '学习·预设内置主题覆盖 AI/产品经理/大数据模型');
      var boards = win.document.querySelectorAll('.sd-board');
      ok(boards.length === 5, '学习·学习计划五大板块已渲染（年度模板/月度目标/网盘课程库/今日计划/30天打卡，实际 ' + boards.length + '）');
      var st = win.TL.Store.stats();
      ok(st.study.planTotal === 3, '学习·stats 反映 3 个预设主题');
      ok(typeof st.study.currentPlanTodayTodo === 'number', '学习·stats 暴露当前主题今日待完成课程数');
      ok(st.study.currentPlan && st.study.currentPlan.courses && Array.isArray(st.study.currentPlan.courses), '学习·当前主题含课程库数组');

      // 今日热点子页：按当前主题每日自动推送 5 条外链，且提供主题切换条
      var hTab = Array.prototype.slice.call(win.document.querySelectorAll('#sd-pages .tl-tab')).filter(function (b) { return b.getAttribute('data-page') === 'hotspot'; })[0];
      if (hTab) {
        hTab.dispatchEvent(new win.Event('click', { bubbles: true }));
        var hsItems = win.document.querySelectorAll('#sd-hotspots .tl-task');
        ok(hsItems.length === 5, '学习·今日热点按当前主题自动推送 5 条外链热点（实际 ' + hsItems.length + '）');
        var hsChips = win.document.querySelectorAll('#sd-hotspot-themes .sd-plan-chip');
        ok(hsChips.length >= 3, '学习·今日热点页提供主题切换条（≥3 个预设主题，实际 ' + hsChips.length + '）');
      }
    }
  } catch (e) {
    fail++;
    console.error('  \u2717 加载 ' + page + ' 抛出异常：' + (e && e.stack || e));
  }
});

console.log('\n冒烟测试：' + pass + ' 通过 / ' + fail + ' 失败');
process.exit(fail ? 1 : 0);
