/* =====================================================================
   TEST-LEGUME · Vercel 部署模块（TL.Vercel）
   ---------------------------------------------------------------------
   职责：
     · 提供「一键连接 Vercel」链接（复用当前 GitHub 账号授权，无需单独账密/Token）
     · 查询已绑定项目的部署状态、线上访问域名、构建日志
     · 支持自定义域名绑定
   说明：
     · 实际「代码推送 → 自动构建 → 部署」由 GitHub ↔ Vercel 的 Git 集成驱动，
       在 Vercel 绑定仓库后零额外操作即可自动更新线上站点
     · 站内查询部署状态需用到 Vercel 访问令牌（在 Vercel 后台一次性生成，仅存本机）
   ===================================================================== */
window.TL = window.TL || {};

(function (TL) {
  'use strict';

  var API = 'https://api.vercel.com';

  var state = {
    status: 'idle',     // idle | checking | ready | building | unlinked | error
    message: '未连接 Vercel',
    url: '',
    building: false,
    projectId: '',
    lastError: ''
  };
  var subs = [];

  function notify() {
    subs.forEach(function (fn) { try { fn(Object.assign({}, state)); } catch (e) { console.error('[Vercel] 订阅者异常', e); } });
  }
  function set(patch) { Object.assign(state, patch); notify(); }
  function toast(msg, type, ms) { if (TL.UI && TL.UI.toast) TL.UI.toast(msg, type, ms); }
  function cfg() { return TL.Store.settings(); }

  function configured() {
    var c = cfg();
    return !!(c.vercelToken && c.owner && (c.codeRepo || c.repo));
  }

  function req(path, opts) {
    var c = cfg();
    return fetch(API + path, {
      method: (opts && opts.method) || 'GET',
      headers: Object.assign({
        'Authorization': 'Bearer ' + (c.vercelToken || ''),
        'Content-Type': 'application/json'
      }, (opts && opts.headers) || {}),
      body: (opts && opts.body) ? JSON.stringify(opts.body) : undefined
    }).then(function (r) {
      if (r.status === 204) return {};
      return r.json().catch(function () { return {}; }).then(function (j) {
        if (!r.ok) { var e = new Error((j && j.error && j.error.message) || ('Vercel API ' + r.status)); e.status = r.status; throw e; }
        return j;
      });
    });
  }

  /** 一键连接地址：打开 Vercel 的 GitHub 导入页，复用已登录的 GitHub 账号授权 */
  function connectUrl() {
    var c = cfg();
    var repo = c.codeRepo || c.repo;
    var base = 'https://vercel.com/new';
    if (c.owner && repo) {
      // Vercel 导入页深链，预选该 GitHub 仓库
      base += '?from=github&repository=' + encodeURIComponent(c.owner + '/' + repo);
    } else {
      base += '?from=github';
    }
    return base;
  }

  /** 在已连接项目列表中找到绑定了当前仓库的项目 */
  function findProject() {
    var c = cfg();
    var repo = c.codeRepo || c.repo;
    var full = c.owner + '/' + repo;
    return req('/v9/projects?limit=100').then(function (j) {
      var list = j.projects || [];
      return list.filter(function (p) {
        return p.link && p.link.type === 'github' && p.link.repo === full;
      })[0] || null;
    });
  }

  function resolveUrl(p, d) {
    // 优先取生产环境域名（alias / targets.production.alias）
    if (p.alias && p.alias.length) return 'https://' + p.alias[0];
    if (d && d.url) return d.url;
    if (p.targets && p.targets.production && p.targets.production.alias && p.targets.production.alias.length) {
      return 'https://' + p.targets.production.alias[0];
    }
    return 'https://' + p.name + '.vercel.app';
  }

  /** 查询部署状态（线上域名 + 是否构建中） */
  function status() {
    if (!configured()) { set({ status: 'idle', message: '未连接 Vercel', url: '', projectId: '' }); return Promise.resolve(state); }
    set({ status: 'checking', message: '查询部署状态…' });

    return findProject().then(function (p) {
      if (!p) { set({ status: 'unlinked', message: '尚未在 Vercel 绑定该仓库', url: '', projectId: '' }); return state; }
      state.projectId = p.id;
      return req('/v6/deployments?projectId=' + encodeURIComponent(p.id) + '&limit=1').then(function (dj) {
        var d = dj.deployments && dj.deployments[0];
        var building = !!(d && (d.state === 'BUILDING' || d.state === 'QUEUED' || d.state === 'INITIALIZING'));
        set({
          status: building ? 'building' : 'ready',
          message: building ? ('构建中 · ' + (d.state || '')) : '已部署 · 线上可访问',
          url: resolveUrl(p, d),
          building: building,
          projectId: p.id
        });
        return state;
      });
    }).catch(function (e) {
      state.lastError = e.message;
      set({ status: 'error', message: '查询失败：' + e.message });
      return state;
    });
  }

  /** 读取构建/部署日志列表 */
  function deployments(limit) {
    if (!state.projectId) return Promise.resolve([]);
    return req('/v6/deployments?projectId=' + encodeURIComponent(state.projectId) + '&limit=' + (limit || 10))
      .then(function (j) { return j.deployments || []; });
  }

  /** 读取已绑定域名（含自定义域名） */
  function domains() {
    if (!state.projectId) return Promise.resolve([]);
    return req('/v9/projects/' + encodeURIComponent(state.projectId) + '/domains')
      .then(function (j) { return j.domains || []; });
  }

  /** 绑定自定义域名 */
  function addDomain(domain) {
    if (!state.projectId) return Promise.reject(new Error('请先绑定项目'));
    return req('/v9/projects/' + encodeURIComponent(state.projectId) + '/domains', {
      method: 'POST', body: { name: domain }
    }).then(function (r) {
      toast('已提交域名绑定：' + domain + '（请在 DNS 添加 CNAME 指向 cname.vercel-dns.com）', 'success', 6000);
      return r;
    });
  }

  function init() {
    if (configured()) status().catch(function () {});
    else set({ status: 'idle', message: '未连接 Vercel' });
  }

  TL.Vercel = {
    state: function () { return Object.assign({}, state); },
    on: function (fn) {
      subs.push(fn);
      fn(Object.assign({}, state));
      return function () { subs = subs.filter(function (f) { return f !== fn; }); };
    },
    configured: configured,
    connectUrl: connectUrl,
    status: status,
    findProject: findProject,
    deployments: deployments,
    domains: domains,
    addDomain: addDomain,
    init: init,
    set: set
  };
})(window.TL);
