/* =====================================================================
   TEST-LEGUME · 部署模块（TL.Deploy）
   ---------------------------------------------------------------------
   职责：
     · 鉴权成功后自动创建「代码仓库」与「业务数据仓库」两个私有仓库
     · 通过 GitHub Contents API 将静态站点源码推送至代码仓库 main 分支
       （浏览器无法运行 git，故以文件级 API 写入实现「自动上传代码」）
     · 维护「代码推送状态」，供顶栏常驻指示器展示
   说明：
     · 业务数据（data/*.json）的持久同步仍由 sync.js 负责，目标为数据仓库
     · 代码仓库仅承载静态资源；Vercel 监听其 main 分支自动构建部署
   ===================================================================== */
window.TL = window.TL || {};

(function (TL) {
  'use strict';

  var state = {
    status: 'idle',          // idle | syncing | synced | error | unconfigured
    message: '未部署',
    lastError: '',
    lastPushAt: 0
  };
  var subs = [];

  function notify() {
    subs.forEach(function (fn) { try { fn(Object.assign({}, state)); } catch (e) { console.error('[Deploy] 订阅者异常', e); } });
  }
  function set(patch) {
    Object.assign(state, patch);
    notify();
  }
  function toast(msg, type, ms) { if (TL.UI && TL.UI.toast) TL.UI.toast(msg, type, ms); }

  function timeAgo(ts) {
    if (!ts) return '';
    var s = Math.floor((Date.now() - ts) / 1000);
    if (s < 60) return s + '秒前';
    if (s < 3600) return Math.floor(s / 60) + '分钟前';
    if (s < 86400) return Math.floor(s / 3600) + '小时前';
    return Math.floor(s / 86400) + '天前';
  }

  /* 站点静态文件清单（相对站点根）。浏览器无法遍历目录，故显式登记。
     代码仓库需包含 data/*.json 种子，保证 Vercel 部署后的站点首屏不 404。 */
  var MANIFEST = [
    '.nojekyll', 'README.md',
    'index.html', 'work.html', 'study.html',
    'assets/css/tokens.css', 'assets/css/app.css',
    'assets/js/store.js', 'assets/js/github.js', 'assets/js/media.js', 'assets/js/sync.js',
    'assets/js/ui.js', 'assets/js/app.js', 'assets/js/deploy.js', 'assets/js/vercel.js',
    'assets/js/pages/overview.js', 'assets/js/pages/work.js', 'assets/js/pages/study.js',
    'data/work.json', 'data/study.json', 'data/media.json', 'data/activity.json'
  ];

  function codeTarget() {
    var c = TL.Store.settings();
    return { owner: c.owner, repo: c.codeRepo || c.repo, branch: c.branch || 'main', token: c.token };
  }

  function configured() {
    var t = codeTarget();
    return !!(t.owner && t.repo && t.token);
  }

  /** 自动创建双私有仓库（代码仓库 + 业务数据仓库） */
  function initRepos(opts) {
    opts = opts || {};
    var c = TL.Store.settings();
    if (!c.owner || !c.token) { toast('请先完成 GitHub 账号登录', 'warn'); return Promise.reject(new Error('未登录')); }

    var dataName = c.repo || 'Legume';
    var codeName = c.codeRepo || 'legume';
    set({ status: 'syncing', message: '正在创建私有仓库…' });

    return TL.GitHub.createRepo(dataName, true, 'TEST-LEGUME 业务数据仓库（自动同步）')
      .then(function () { return TL.GitHub.createRepo(codeName, true, 'TEST-LEGUME 前端代码仓库（Vercel 部署源）'); })
      .then(function () {
        TL.Store.saveSettings({ repo: dataName, codeRepo: codeName });
        set({ status: 'idle', message: '仓库已就绪 · 待推送代码' });
        toast('私有仓库已创建：' + dataName + ' / ' + codeName, 'success', 4200);
        return { data: dataName, code: codeName };
      })
      .catch(function (e) {
        state.lastError = e.message;
        set({ status: 'error', message: '创建失败：' + e.message });
        throw e;
      });
  }

  /** 将清单内静态文件推送至代码仓库 main 分支（浏览器版「自动上传代码」） */
  function pushCode() {
    var t = codeTarget();
    if (!configured()) { toast('请先完成 GitHub 账号登录', 'warn'); return Promise.reject(new Error('未配置')); }
    set({ status: 'syncing', message: '正在推送网页源码到 ' + t.repo + '…' });

    var meta = TL.Store.meta();
    meta.codeSha = meta.codeSha || {};

    var chain = MANIFEST.reduce(function (p, path) {
      return p.then(function () {
        return fetch(path + '?t=' + Date.now()).then(function (r) {
          if (!r.ok) return null;
          return r.text();
        }).then(function (text) {
          if (text === null) return;   // 该文件在当前环境不存在，跳过
          var msg = 'deploy: push ' + path + ' @ ' + new Date().toLocaleString('zh-CN');
          return TL.GitHub.putFileTo(t.owner, t.repo, t.branch, path, text, msg, meta.codeSha[path])
            .then(function (r) { if (r && r.sha) meta.codeSha[path] = r.sha; });
        });
      });
    }, Promise.resolve());

    return chain.then(function () {
      TL.Store.saveMeta(meta);
      state.lastPushAt = Date.now();
      TL.Store.saveSettings({ lastCodePushAt: state.lastPushAt });
      set({ status: 'synced', message: '代码已推送 · ' + timeAgo(state.lastPushAt) });
      toast('网页源码已推送至 ' + t.repo, 'success');
      return { pushed: MANIFEST.length };
    }).catch(function (e) {
      state.lastError = e.message;
      set({ status: 'error', message: '推送失败：' + e.message });
      throw e;
    });
  }

  function init() {
    if (!configured()) { set({ status: 'unconfigured', message: '未部署' }); return; }
    if (!TL.Store.settings().codeRepo) { set({ status: 'idle', message: '仓库未初始化' }); return; }
    set({ status: 'idle', message: '已连接 · 代码托管于 ' + codeTarget().repo });
  }

  TL.Deploy = {
    state: function () { return Object.assign({}, state); },
    on: function (fn) {
      subs.push(fn);
      fn(Object.assign({}, state));
      return function () { subs = subs.filter(function (f) { return f !== fn; }); };
    },
    init: init,
    initRepos: initRepos,
    pushCode: pushCode,
    configured: configured,
    manifest: MANIFEST,
    set: set
  };
})(window.TL);
