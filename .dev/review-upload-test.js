/* TEST-LEGUME · 复盘总结「图片上传接口」专项测试
   验证：统一校验（格式/≤10MB）· onlineUrl 规范地址 · 批量上传（含失败隔离）·
         飞书文档嵌入线上地址 · 真实视觉钩子收到图片字节流(dataUrl)
   运行：WINMOD=$(cygpath -w "$HOME/.workbuddy/binaries/node/workspace/node_modules") && \
     NODE_PATH="$WINMOD" node .dev/review-upload-test.js */
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const ASSETS = path.join(ROOT, 'assets', 'js');
const SCRIPTS = [
  'store.js', 'github.js', 'media.js', 'sync.js', 'deploy.js', 'vercel.js', 'ui.js',
  'ai.js', 'review.js', 'review-upload.js'
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
  const dom = new JSDOM('<!DOCTYPE html><html><body><div id="tl-modal-root"></div></body></html>', { url: 'https://localhost/', pretendToBeVisual: true, runScripts: 'outside-only' });
  const win = dom.window;
  polyfill(win);
  SCRIPTS.forEach(function (rel) { win.eval(fs.readFileSync(path.join(ASSETS, rel), 'utf8')); });
  return win;
}

const fakeFile = function (name, type, size) { return { name: name, type: type, size: size == null ? 1024 : size }; };

async function main() {
  const win = loadAll();
  const TL = win.TL;
  ok(!!(TL && TL.ReviewUpload), 'TL.ReviewUpload 上传接口模块就绪');
  ok(!!(TL && TL.Media && TL.Media.onlineUrl), 'TL.Media.onlineUrl 就绪');

  // 统一设置仓库坐标，使 onlineUrl 可生成
  TL.Store.saveSettings({ owner: 'LEGUME33', repo: 'Legume', branch: 'main' });
  const C = TL.ReviewUpload.CONFIG;
  ok(C.accept.join(',') === 'image/png,image/jpeg,image/jpg', '上传接口仅接受 PNG/JPG/JPEG');
  ok(C.maxBytes === 10 * 1024 * 1024, '单图上限为 10MB');
  ok(C.githubDir === 'data/image', '云端持久目录为 data/image');

  // 格式 + 体积校验
  console.log('\n[validate · 格式 / 体积]');
  ok(TL.ReviewUpload.validate(fakeFile('a.png', 'image/png')).ok, 'PNG 通过校验');
  ok(TL.ReviewUpload.validate(fakeFile('a.jpg', 'image/jpeg')).ok, 'JPG 通过校验');
  ok(!TL.ReviewUpload.validate(fakeFile('a.gif', 'image/gif')).ok, 'GIF 被拒绝（仅 PNG/JPG/JPEG）');
  ok(!TL.ReviewUpload.validate(fakeFile('a.webp', 'image/webp')).ok, 'WEBP 被拒绝');
  ok(!TL.ReviewUpload.validate(fakeFile('a.png', 'image/png', 11 * 1024 * 1024)).ok, '超 10MB 被拒绝');
  ok(TL.ReviewUpload.validate(fakeFile('a.png', 'image/png', 9 * 1024 * 1024)).ok, '9MB 通过校验');

  // onlineUrl 规范地址
  console.log('\n[onlineUrl · 线上预览地址]');
  const url = TL.ReviewUpload.onlineUrl({ id: 'img_123', ext: 'png' });
  ok(/^https:\/\/raw\.githubusercontent\.com\/LEGUME33\/Legume\/main\/data\/image\/img_123\.png$/.test(url), 'onlineUrl 为规范 GitHub raw 地址：' + url);
  ok(TL.Media.onlineUrl({ id: 'img_9', ext: 'jpg' }).indexOf('data/image/img_9.jpg') > -1, 'Media.onlineUrl 同样指向 data/image 目录');

  // 批量上传：mock Media.add（jsdom 无 FileReader/canvas），含一张非法格式验证失败隔离
  console.log('\n[uploadBatch · 批量 + 失败隔离]');
  let addSeq = 0;
  TL.Media.add = function (file, opts) {
    addSeq++;
    return Promise.resolve({ id: 'up_' + addSeq, name: file.name, ext: 'png', onlineUrl: '', remotePath: '' });
  };
  const batch = await TL.ReviewUpload.uploadBatch([
    fakeFile('ok1.png', 'image/png'),
    fakeFile('bad.gif', 'image/gif'),
    fakeFile('ok2.jpg', 'image/jpeg')
  ], { module: 'work', refId: 'rv1', note: 'test', compress: true });
  ok(batch.length === 3, '批量返回 3 条结构化结果');
  ok(batch[0].entry && batch[0].entry.id && !batch[0].error, '合法 PNG → 成功（含 entry）');
  ok(!batch[1].entry && /格式/.test(batch[1].error || ''), '非法 GIF → 失败（error 含「格式」原因）');
  ok(batch[2].entry && !batch[2].error, '合法 JPG → 成功');
  ok(batch[0].entry.onlineUrl && batch[0].entry.onlineUrl.indexOf('up_1') > -1, '成功条目已写回 onlineUrl：' + (batch[0].entry.onlineUrl || ''));

  // 单张校验失败直接 reject（不进 Media.add）
  console.log('\n[uploadOne · 直接 reject]');
  let addCalled = 0;
  const origAdd = TL.Media.add;
  TL.Media.add = function () { addCalled++; return Promise.resolve({ id: 'x', name: 'x', ext: 'png' }); };
  let rejected = false;
  try { await TL.ReviewUpload.uploadOne(fakeFile('big.webp', 'image/webp', 20 * 1024 * 1024)); }
  catch (e) { rejected = true; }
  ok(rejected && addCalled === 0, '超大/非法格式在 uploadOne 直接拒绝，未进入 Media.add');
  TL.Media.add = origAdd;

  // 飞书文档嵌入线上地址（embed 字段）
  console.log('\n[buildFeishu · 嵌入线上地址]');
  const rev = TL.Review.template('week');
  const promoField = rev.blocks[1].fields.filter(function (f) { return f.id === 'week-promo'; })[0];
  ok(promoField && promoField.embed === true, '首销周推广数据字段 embed=true（原图嵌入文档）');
  const sample = {
    type: 'week', title: 'T1', fields: {}, calc: TL.Review.calc({}),
    images: [{ id: 'i1', role: 'week-promo', name: 'promo.png',
      onlineUrl: 'https://raw.githubusercontent.com/LEGUME33/Legume/main/data/image/i1.png',
      ai: { text: '已提取全部渠道字段并生成数据表', table: { head: ['渠道', '曝光'], rows: [['天猫', '420000']] } } }]
  };
  const fsText = TL.Review.buildFeishu(sample);
  ok(fsText.indexOf('![原图](https://raw.githubusercontent.com/LEGUME33/Legume/main/data/image/i1.png)') > -1, '飞书文档已用线上地址嵌入原图');
  ok(fsText.indexOf('线上地址：') > -1, '飞书文档保留「线上地址」说明（原图不压缩）');
  ok(!hasForbid(fsText), '飞书文档无优惠/折扣/降价等禁词');

  // 真实视觉钩子收到图片字节流
  console.log('\n[AI · 真实钩子接收 dataUrl]');
  let captured = null;
  win.TL_AI_VISION = { analyze: function (ctx) { captured = ctx; return Promise.resolve({ text: 'REAL', table: null }); } };
  const real = await TL.AI.analyzeImage({ name: 'c.png', role: 'resource', dataUrl: 'data:image/png;base64,AAAABBBB' }, {});
  ok(real.simulated === false && real.text === 'REAL', '已切换真实视觉引擎');
  ok(captured && captured.dataUrl === 'data:image/png;base64,AAAABBBB', '真实钩子 ctx 携带图片字节流 dataUrl');
  ok(TL.AI.forbid('投放优惠券') === '投放定向人群触达', '禁词过滤仍生效（不变量）');
  delete win.TL_AI_VISION;

  console.log('\n复盘/上传接口专项测试：' + pass + ' 通过 / ' + fail + ' 失败');
  process.exit(fail ? 1 : 0);
}

main().catch(function (e) { console.error(e); process.exit(1); });
