/* TEST-LEGUME · 部署 / 登录 / Vercel 模块单测（mock API）
   验证：OAuth Device Flow 登录 · 双私有仓库自动创建 · 代码仓库文件推送 · Vercel 状态查询
   运行：NODE_PATH="$HOME/.workbuddy/binaries/node/workspace/node_modules" node .dev/deploy-vercel-test.js */
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const ASSETS = path.join(ROOT, 'assets', 'js');

let pass = 0, fail = 0;
function ok(cond, msg) {
  if (cond) { pass++; console.log('  \u2713 ' + msg); }
  else { fail++; console.error('  \u2717 ' + msg); }
}

function apiRes(payload, status) {
  status = status || 200;
  return { status: status, ok: status >= 200 && status < 300, json: function () { return Promise.resolve(payload); }, text: function () { return Promise.resolve(JSON.stringify(payload)); } };
}
function localRes(content) {
  return { status: 200, ok: true, json: function () { return Promise.resolve({}); }, text: function () { return Promise.resolve(content); } };
}

let oauthCalls = 0;

function mockFetch(url, opts) {
  const u = String(url);
  const method = (opts && opts.method) || 'GET';

  // GitHub Device Flow：申请设备码
  if (u.indexOf('github.com/login/device/code') >= 0)
    return Promise.resolve(apiRes({ device_code: 'dc123', user_code: 'ABCD-EFGH', verification_uri: 'https://github.com/login/device', interval: 0.01, expires_in: 900 }));
  // GitHub Device Flow：轮询换取令牌（首次 pending，随后返回 token）
  if (u.indexOf('github.com/login/oauth/access_token') >= 0) {
    oauthCalls++;
    if (oauthCalls === 1) return Promise.resolve(apiRes({ error: 'authorization_pending' }));
    return Promise.resolve(apiRes({ access_token: 'gho_TEST_TOKEN' }));
  }
  // GitHub REST API
  if (u.indexOf('api.github.com') >= 0) {
    let api = u.replace('https://api.github.com', '');
    const qi = api.indexOf('?'); if (qi >= 0) api = api.slice(0, qi);
    if (api === '/user' && method === 'GET') return Promise.resolve(apiRes({ login: 'me', name: 'Me' }));
    if (api === '/user/repos' && method === 'POST') return Promise.resolve(apiRes({ full_name: 'me/' + JSON.parse(opts.body).name, private: true, default_branch: 'main' }, 201));
    if (api.indexOf('/contents/') >= 0 && method === 'PUT') return Promise.resolve(apiRes({ content: { sha: 's1', path: api }, commit: { sha: 'c1' } }, 200));
    return Promise.resolve(apiRes({ message: 'nf' }, 404));
  }
  // Vercel REST API
  if (u.indexOf('api.vercel.com') >= 0) {
    let api = u.replace('https://api.vercel.com', '');
    const qi = api.indexOf('?'); if (qi >= 0) api = api.slice(0, qi);
    if (api.indexOf('/v9/projects') === 0) return Promise.resolve(apiRes({ projects: [{ id: 'p1', name: 'CODE', link: { type: 'github', repo: 'me/test-legume' }, alias: ['code.vercel.app'] }] }));
    if (api.indexOf('/v6/deployments') === 0) return Promise.resolve(apiRes({ deployments: [{ state: 'READY', url: 'https://code.vercel.app' }] }));
    return Promise.resolve(apiRes({}));
  }
  // 本地静态文件（pushCode 用 fetch 读取站点源码）
  return Promise.resolve(localRes('// mock file content for ' + u));
}

async function main() {
  const dom = new JSDOM('<!DOCTYPE html><html><head></head><body data-page="overview"></body></html>',
    { url: 'https://localhost/', pretendToBeVisual: true, runScripts: 'outside-only' });
  const win = dom.window;
  win.TextEncoder = TextEncoder; win.TextDecoder = TextDecoder;
  if (!win.btoa) win.btoa = function (s) { return Buffer.from(s, 'binary').toString('base64'); };
  if (!win.atob) win.atob = function (s) { return Buffer.from(s, 'base64').toString('binary'); };
  if (!win.matchMedia) win.matchMedia = function (q) { return { matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} }; };
  if (!win.requestAnimationFrame) win.requestAnimationFrame = function (cb) { return setTimeout(function () { cb(Date.now()); }, 0); };
  win.fetch = mockFetch;

  ['store.js', 'github.js', 'media.js', 'sync.js', 'deploy.js', 'vercel.js', 'ui.js'].forEach(function (f) {
    win.eval(fs.readFileSync(path.join(ASSETS, f), 'utf8'));
  });

  const TL = win.TL;
  console.log('\u25b6 部署 / 登录 / Vercel 模块单测（mock API）');

  ok(!!(TL.Deploy && TL.Vercel && TL.GitHub.deviceCode && TL.GitHub.deviceToken && TL.GitHub.createRepo), '部署/登录/Vercel 模块与 OAuth 方法已就绪');

  TL.Store.init();
  TL.Store.saveSettings({ owner: '', repo: '', token: '', clientId: 'cid', codeRepo: '', vercelToken: 'vt' });

  // ① Device Flow：申请设备码 → 轮询拿到令牌
  const dc = await TL.GitHub.deviceCode('repo');
  ok(dc.user_code && dc.verification_uri && dc.device_code, 'deviceCode 返回 user_code / verification_uri / device_code');
  const token = await TL.GitHub.deviceToken(dc.device_code, 10);
  ok(token === 'gho_TEST_TOKEN', 'deviceToken 轮询后返回访问令牌');

  // ② 用令牌获取用户并自动创建双私有仓库
  const user = await TL.GitHub.user();
  ok(user.login === 'me', '/user 返回登录名');
  TL.Store.saveSettings({ token: token, owner: user.login });
  const repos = await TL.Deploy.initRepos();
  ok(repos.data === 'test-legume-data' && repos.code === 'test-legume', '自动创建双私有仓库（业务数据 + 前端代码）');
  ok(TL.Store.settings().repo === 'test-legume-data' && TL.Store.settings().codeRepo === 'test-legume', '仓库名已写回设置');

  // ③ 浏览器版「上传代码」：将清单文件推送至代码仓库
  const cp = await TL.Deploy.pushCode();
  ok(cp.pushed === TL.Deploy.manifest.length, 'pushCode 推送了全部静态文件至代码仓库 main 分支');
  ok(TL.Deploy.state().status === 'synced', '代码推送状态置为 synced');

  // ④ Vercel：连接地址复用 GitHub 仓库深链 + 状态查询
  const url = TL.Vercel.connectUrl();
  ok(url.indexOf('https://vercel.com/new') === 0 && url.indexOf(encodeURIComponent('me/test-legume')) >= 0, 'connectUrl 指向 Vercel 导入页并预选仓库');
  const vs = await TL.Vercel.status();
  ok(vs.status === 'ready' && /vercel\.app/.test(vs.url), 'Vercel 状态查询返回 ready 与线上域名');

  console.log('\n部署 / 登录 / Vercel 单测：' + pass + ' 通过 / ' + fail + ' 失败');
  process.exit(fail ? 1 : 0);
}

main().catch(function (e) { console.error('FATAL', e && e.stack || e); process.exit(1); });
