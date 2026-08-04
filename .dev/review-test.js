/* TEST-LEGUME · 复盘/AI 逻辑专项测试
   验证：复盘模板结构 · AI 识图按 role 出表 · AI 综合分析三模块 + 类型专属块 · 禁词过滤 · 飞书嵌入表格且无禁词
   运行：WINMOD=$(cygpath -w "$HOME/.workbuddy/binaries/node/workspace/node_modules") && \
     NODE_PATH="$WINMOD" node .dev/review-test.js */
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const ASSETS = path.join(ROOT, 'assets', 'js');
const SCRIPTS = [
  'store.js', 'github.js', 'media.js', 'sync.js', 'deploy.js', 'vercel.js', 'ui.js',
  'ai.js', 'review.js'
];
const FORBID = ['优惠券', '闪降', '降价', '折扣', '优惠', '补贴'];

let pass = 0, fail = 0;
function ok(cond, msg) { if (cond) { pass++; console.log('  ✓ ' + msg); } else { fail++; console.error('  ✗ ' + msg); } }
function hasForbid(text) { return FORBID.some(function (w) { return (text || '').indexOf(w) >= 0; }); }

function polyfill(win) {
  win.TextEncoder = TextEncoder; win.TextDecoder = TextDecoder;
  if (!win.btoa) win.btoa = function (s) { return Buffer.from(s, 'binary').toString('base64'); };
  if (!win.atob) win.atob = function (s) { return Buffer.from(s, 'base64').toString('binary'); };
  if (!win.matchMedia) win.matchMedia = function () { return { matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} }; };
  if (!win.requestAnimationFrame) win.requestAnimationFrame = function (cb) { return setTimeout(function () { cb(Date.now()); }, 0); };
  if (!win.cancelAnimationFrame) win.cancelAnimationFrame = function (id) { clearTimeout(id); };
  if (!win.fetch) win.fetch = function () { return Promise.reject(new Error('network disabled')); };
}

function loadAll() {
  const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', { url: 'https://localhost/', pretendToBeVisual: true, runScripts: 'outside-only' });
  const win = dom.window;
  polyfill(win);
  SCRIPTS.forEach(function (rel) { win.eval(fs.readFileSync(path.join(ASSETS, rel), 'utf8')); });
  return win;
}

async function main() {
  const win = loadAll();
  const TL = win.TL;
  ok(!!(TL && TL.Review && TL.AI), 'TL.Review 与 TL.AI 均就绪');
  ok(TL.Review.TYPES.length === 3, '复盘模板含三类（日 / 周 / 月）');

  // 模板结构：基础信息仅 4 项手填 + 图片驱动
  const common = TL.Review.template('week').blocks[0];
  const manual = common.fields.filter(function (f) { return f.type === 'number' || f.type === 'sku'; });
  ok(manual.length === 4, '基础信息仅保留 4 项人工填写（总库存/总销售/分机型/销量）');
  const imgFields = common.fields.filter(function (f) { return f.type === 'image'; });
  ok(imgFields.length === 1 && imgFields[0].id === 'resource', '通用基础信息图片板块仅含资源位 4×4（流转销/用户画像按类型拆分）');
  function allIds(type) { var ids = []; TL.Review.template(type).blocks.forEach(function (b) { b.fields.forEach(function (f) { ids.push(f.id); }); }); return ids; }
  var dayIds = allIds('day');
  ok(dayIds.indexOf('flow') >= 0 && dayIds.indexOf('portrait') >= 0 && dayIds.indexOf('resource') >= 0, '首销日：流转销/用户画像/资源位 图片板块齐备');
  var weekIds = allIds('week');
  ok(weekIds.indexOf('portrait') >= 0 && weekIds.indexOf('flow') < 0, '首销周：含用户画像、不含流转销（流转销仅属首销日）');
  var monthIds2 = allIds('month');
  ok(monthIds2.indexOf('portrait') >= 0 && monthIds2.indexOf('flow') < 0, '首销月：含用户画像、不含流转销（流转销仅属首销日）');

  // analyzeImage 按 role 出表
  console.log('\n[analyzeImage · 按 role 转表]');
  const cases = [
    { role: 'flow', name: 'a.png', hasTable: false },
    { role: 'month-trend', name: 'b.png', hasTable: false },
    { role: 'portrait', name: 'c.png', hasTable: true },
    { role: 'resource', name: 'd.png', hasTable: true, rows: 4, cols: 4 },
    { role: 'week-promo', name: 'e.png', hasTable: true },
    { role: 'week-7day', name: 'f.png', hasTable: true, rows: 7 },
    { role: 'month-compare', name: 'g.png', hasTable: true }
  ];
  for (let i = 0; i < cases.length; i++) {
    const c = cases[i];
    const r = await TL.AI.analyzeImage({ name: c.name, bytes: 0, role: c.role }, {});
    ok(!!r.text, c.role + '：返回文本结论');
    ok(!!r.table === c.hasTable, c.role + '：表格生成符合预期（' + (c.hasTable ? '有表' : '无表，原图保留') + '）');
    if (c.hasTable) {
      ok(Array.isArray(r.table.head) && r.table.head.length > 0, c.role + '：表格含表头');
      ok(r.table.rows.length === (c.rows || r.table.rows.length), c.role + '：表格行数正确' + (c.rows ? '（' + c.rows + ' 行）' : ''));
      if (c.cols) ok(r.table.rows.every(function (row) { return row.length === c.cols; }), c.role + '：表格列数正确（' + c.cols + ' 列）');
    }
  }

  // analyzeReview：三模块 + 类型专属块 + 禁词
  console.log('\n[analyzeReview · 三模块 + 禁词过滤]');
  function collectText(rep) {
    return [].concat(rep.highlights || [], rep.shortcomings || [], rep.plans || [])
      .concat((rep.extras || []).reduce(function (acc, ex) { return acc.concat(ex.items || []); }, []))
      .join('\n');
  }

  const weekReview = {
    type: 'week',
    fields: { yoyNew: '8600', yoyPrev: '6400' },
    skus: [{ sku: '远峰蓝', stock: 100, sold: 80 }, { sku: '凝夜紫', stock: 100, sold: 30 }],
    images: [
      { id: 'i1', role: 'flow', ai: { text: '流转销结论', table: null } },
      { id: 'i2', role: 'portrait', ai: { text: '画像结论', table: { head: ['年龄段', '浏览占比', '收藏占比', '支付占比'], rows: [['18–24 岁', '26%', '31%', '14%'], ['25–34 岁', '38%', '40%', '46%'], ['35–44 岁', '22%', '19%', '26%'], ['45 岁以上', '14%', '10%', '14%']] } } },
      { id: 'i3', role: 'resource', ai: { text: '资源位结论', table: { head: ['资源位', '曝光量', '点击/收藏', '成交转化'], rows: [['开屏首焦', '1200000', '9.8%', '5.6%'], ['信息流首位', '860000', '7.2%', '4.1%'], ['搜索品专', '540000', '12.4%', '8.3%'], ['直播挂件', '430000', '6.1%', '3.7%']] } } },
      { id: 'i4', role: 'week-promo', ai: { text: '推广结论', table: { head: ['渠道', '曝光', '点击率', '成交件数', 'ROI'], rows: [['抖音信息流', '560000', '8.1%', '2360', '2.6'], ['私域社群', '180000', '11.2%', '980', '3.1']] } } },
      { id: 'i5', role: 'week-7day', ai: { text: '7日结论', table: { head: ['日期', '访客', '浏览量', '成交件数', '成交金额(元)', '转化率'], rows: [['Day1', '31000', '105000', '1820', '2360000', '5.8%']] } } }
    ],
    calc: TL.Review.calc({ skus: [{ sku: '远峰蓝', stock: 100, sold: 80 }, { sku: '凝夜紫', stock: 100, sold: 30 }] })
  };
  const weekRep = await TL.AI.analyzeReview(weekReview);
  ok(!!weekRep.highlights && !!weekRep.shortcomings && !!weekRep.plans, '周复盘：输出三模块（亮点/短板/中长期规划）');
  ok(!!weekRep.extras && weekRep.extras.length >= 3, '周复盘：含类型专属块（配色偏好/流量波动/渠道效率）');
  ok(!hasForbid(collectText(weekRep)), '周复盘：AI 文案无任何优惠类禁词');

  const monthReview = {
    type: 'month',
    fields: { yoyNew: '8600', yoyPrev: '6400' },
    skus: [{ sku: 'A', stock: 100, sold: 80 }, { sku: 'B', stock: 100, sold: 30 }],
    images: [
      { id: 'm1', role: 'flow', ai: { text: '流转销结论', table: null } },
      { id: 'm2', role: 'portrait', ai: { text: '画像结论', table: { head: ['年龄段', '浏览占比', '收藏占比', '支付占比'], rows: [['18–24 岁', '26%', '31%', '14%'], ['25–34 岁', '38%', '40%', '46%'], ['35–44 岁', '22%', '19%', '26%'], ['45 岁以上', '14%', '10%', '14%']] } } },
      { id: 'm3', role: 'resource', ai: { text: '资源位结论', table: { head: ['资源位', '曝光量', '点击/收藏', '成交转化'], rows: [['开屏首焦', '1200000', '9.8%', '5.6%'], ['信息流首位', '860000', '7.2%', '4.1%'], ['搜索品专', '540000', '12.4%', '8.3%'], ['直播挂件', '430000', '6.1%', '3.7%']] } } },
      { id: 'm4', role: 'month-compare', ai: { text: '对比结论', table: { head: ['维度', '新机', '上代'], rows: [['曝光量', '9800000', '7200000'], ['成交件数', '8600', '6400'], ['转化率', '6.1%', '5.2%']] } } },
      { id: 'm5', role: 'month-trend', ai: { text: '趋势结论（原图保留）', table: null } }
    ],
    calc: TL.Review.calc({ skus: [{ sku: 'A', stock: 100, sold: 80 }, { sku: 'B', stock: 100, sold: 30 }] })
  };
  const monthRep = await TL.AI.analyzeReview(monthReview);
  ok(!!monthRep.highlights && !!monthRep.shortcomings && !!monthRep.plans, '月复盘：输出三模块');
  ok(!!monthRep.extras && monthRep.extras.some(function (e) { return e.title.indexOf('两代') >= 0; }), '月复盘：含 N-1 两代差异分析块');
  ok(!!monthRep.extras && monthRep.extras.some(function (e) { return e.title.indexOf('趋势') >= 0; }), '月复盘：含流量趋势分析块');
  ok(!hasForbid(collectText(monthRep)), '月复盘：AI 文案无任何优惠类禁词');

  // 用户画像分层：核心/潜力转化/低贡献
  const portraitExtra = (weekRep.extras || []).filter(function (e) { return e.title === '用户画像分层'; })[0];
  ok(!!portraitExtra && portraitExtra.items.length === 3, '用户画像分层输出核心/潜力转化/低贡献三类');

  // buildFeishu：嵌入表格 + 无禁词（与真实流程一致：先写入 aiReport 再生成文档）
  console.log('\n[buildFeishu · 表格嵌入 + 禁词过滤]');
  monthReview.aiReport = monthRep;
  const fsText = TL.Review.buildFeishu(monthReview);
  ok(fsText.indexOf('首销复盘') >= 0, '飞书文档含标题头');
  ok(fsText.indexOf('|') >= 0, '飞书文档嵌入了 Markdown 表格');
  ok(fsText.indexOf('做得好亮点') >= 0 && fsText.indexOf('现存短板') >= 0 && fsText.indexOf('中长期落地规划') >= 0, '飞书文档含三模块标题');
  ok(!hasForbid(fsText), '飞书文档全文无优惠类禁词');

  // 真实视觉 API 接入点：返回对象应被接受并过滤禁词
  console.log('\n[真实视觉 API 接入点]');
  win.TL_AI_VISION = { analyze: function () { return Promise.resolve({ text: '建议发优惠券拉动转化', table: { head: ['维度', '新机', '上代'], rows: [['曝光量', '1', '2']] } }); } };
  const real = await TL.AI.analyzeImage({ name: 'x.png', bytes: 0, role: 'month-compare' }, {});
  ok(real.simulated === false, '接入真实视觉 API 后 simulated=false');
  ok(real.text.indexOf('优惠券') < 0, '真实 API 返回的禁词被强制过滤');

  console.log('\n复盘/AI 专项测试：' + pass + ' 通过 / ' + fail + ' 失败');
  process.exit(fail ? 1 : 0);
}

main().catch(function (e) { console.error(e); process.exit(1); });
