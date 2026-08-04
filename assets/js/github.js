/* =====================================================================
   TEST-LEGUME · GitHub API 连接器（纯前端，无需任何后端服务）
   ---------------------------------------------------------------------
   依赖：Contents API（读写文件）/ Commits API（历史版本）/ Pages API（部署）
   凭据：classic PAT 只保存在本机 localStorage，绝不写入仓库、不经第三方
   ===================================================================== */
window.TL = window.TL || {};

(function (TL) {
  'use strict';

  var API = 'https://api.github.com';

  /* ---------- UTF-8 安全的 Base64（中文内容必须走这条路径） ---------- */
  function b64encode(str) {
    var bytes = new TextEncoder().encode(str);
    var bin = '';
    for (var i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin);
  }

  function b64decode(b64) {
    var bin = atob(String(b64).replace(/\s/g, ''));
    var bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  }

  function cfg() { return TL.Store.settings(); }

  function configured() {
    var c = cfg();
    return !!(c.owner && c.repo && c.token);
  }

  function base() {
    var c = cfg();
    return '/repos/' + encodeURIComponent(c.owner) + '/' + encodeURIComponent(c.repo);
  }

  function request(path, options, ov) {
    var c = ov || cfg();
    var opts = options || {};
    return fetch(API + path, {
      method: opts.method || 'GET',
      headers: Object.assign({
        'Authorization': 'Bearer ' + (c.token || ''),
        'Accept': 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28'
      }, opts.headers || {}),
      body: opts.body ? JSON.stringify(opts.body) : undefined,
      cache: 'no-store'
    }).then(function (res) {
      if (res.status === 404) return { __notFound: true, __status: 404 };
      if (res.status === 204) return {};
      return res.json().catch(function () { return {}; }).then(function (json) {
        if (!res.ok) {
          var err = new Error(json.message || ('GitHub API ' + res.status));
          err.status = res.status;
          err.detail = json;
          throw err;
        }
        return json;
      });
    });
  }

  TL.GitHub = {
    b64encode: b64encode,
    b64decode: b64decode,
    configured: configured,

    /** 校验凭据、仓库可写性与 Pages 状态 */
    verify: function () {
      return request(base()).then(function (repo) {
        if (repo.__notFound) throw new Error('仓库不存在，或 PAT 缺少 repo 权限');
        return {
          fullName: repo.full_name,
          private: repo.private,
          defaultBranch: repo.default_branch,
          canPush: !!(repo.permissions && repo.permissions.push),
          hasPages: !!repo.has_pages,
          pagesUrl: repo.has_pages ? ('https://' + cfg().owner + '.github.io/' + cfg().repo + '/') : ''
        };
      });
    },

    /** 读取文本文件；传 ref 可读取任意历史版本 */
    getFile: function (path, ref) {
      var q = '?ref=' + encodeURIComponent(ref || cfg().branch || 'main') + '&t=' + Date.now();
      return request(base() + '/contents/' + path + q).then(function (r) {
        if (r.__notFound) return null;
        return { sha: r.sha, text: b64decode(r.content || ''), size: r.size };
      });
    },

    /** 写入 / 更新文本文件 */
    putFile: function (path, text, message, sha) {
      return this.putRaw(path, b64encode(text), message, sha);
    },

    /** 写入 / 更新二进制文件（内容为已 base64 编码的字符串，用于图片上传） */
    putRaw: function (path, base64Content, message, sha) {
      var body = {
        message: message || ('chore: sync ' + path),
        content: base64Content,
        branch: cfg().branch || 'main'
      };
      if (sha) body.sha = sha;
      return request(base() + '/contents/' + path, { method: 'PUT', body: body })
        .then(function (r) {
          return { sha: r.content && r.content.sha, path: r.content && r.content.path, commit: r.commit && r.commit.sha };
        });
    },

    /** 删除文件 */
    delFile: function (path, sha, message) {
      return request(base() + '/contents/' + path, {
        method: 'DELETE',
        body: { message: message || ('chore: remove ' + path), sha: sha, branch: cfg().branch || 'main' }
      });
    },

    /** 指定文件的提交历史（历史版本回滚数据源） */
    listCommits: function (path, limit) {
      var q = '?path=' + encodeURIComponent(path) +
              '&sha=' + encodeURIComponent(cfg().branch || 'main') +
              '&per_page=' + (limit || 20) + '&t=' + Date.now();
      return request(base() + '/commits' + q).then(function (list) {
        if (!Array.isArray(list)) return [];
        return list.map(function (c) {
          return {
            sha: c.sha,
            short: c.sha.slice(0, 7),
            message: (c.commit && c.commit.message) || '',
            date: c.commit && c.commit.committer && c.commit.committer.date,
            author: (c.commit && c.commit.author && c.commit.author.name) || ''
          };
        });
      });
    },

    /* ---------------- GitHub Pages 部署 ---------------- */

    /** 查询 Pages 站点信息 */
    pagesInfo: function () {
      return request(base() + '/pages').then(function (p) {
        if (p.__notFound) return null;
        return { url: p.html_url, status: p.status, branch: p.source && p.source.branch, path: p.source && p.source.path };
      });
    },

    /** 开启 Pages（以当前分支根目录为站点源） */
    enablePages: function () {
      var branch = cfg().branch || 'main';
      return request(base() + '/pages', {
        method: 'POST',
        body: { source: { branch: branch, path: '/' } }
      }).then(function (p) {
        return { url: p.html_url || ('https://' + cfg().owner + '.github.io/' + cfg().repo + '/'), status: p.status };
      });
    },

    /* ---------------- GitHub OAuth Device Flow（免 PAT 账号登录） ---------------- */
    /**
     * 申请设备码。需在设置中填入 GitHub OAuth App 的 Client ID（仅需注册一次，无需密钥）。
     * 浏览器无法用「账号+密码」直连 GitHub API（该方式已于 2020 年废弃且受 CORS 限制），
     * Device Flow 是官方推荐的前端免密登录方案：用户到 github.com/login/device 输入返回的码即完成授权。
     */
    deviceCode: function (scope) {
      var cid = cfg().clientId;
      if (!cid) return Promise.reject(new Error('请先在设置中填写 GitHub OAuth App 的 Client ID'));
      return fetch('https://github.com/login/device/code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify({ client_id: cid, scope: scope || 'repo' })
      }).then(function (r) { return r.json(); });
    },

    /**
     * 轮询换取访问令牌。成功后返回 access_token。
     * error 处理：authorization_pending 继续轮询；slow_down 加倍间隔；其余抛出可读错误。
     */
    deviceToken: function (deviceCode, intervalMs) {
      var cid = cfg().clientId;
      var step = (intervalMs || 5000);
      var map = {
        access_denied: '已取消授权',
        expired_token: '授权码已过期，请重新登录',
        unsupported_grant_type: '该 OAuth App 未启用 Device Flow',
        incorrect_client_credentials: 'Client ID 不正确',
        invalid_grant: '授权失败，请重试'
      };
      function poll() {
        return fetch('https://github.com/login/oauth/access_token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
          body: JSON.stringify({
            client_id: cid,
            device_code: deviceCode,
            grant_type: 'urn:ietf:params:oauth:grant-type:device_code'
          })
        }).then(function (r) { return r.json(); }).then(function (j) {
          if (j.access_token) return j.access_token;
          if (j.error === 'authorization_pending') {
            return new Promise(function (res) { setTimeout(function () { res(poll()); }, step); });
          }
          if (j.error === 'slow_down') {
            step = step * 2;
            return new Promise(function (res) { setTimeout(function () { res(poll()); }, step); });
          }
          throw new Error(map[j.error] || ('授权失败：' + (j.error || 'unknown')));
        });
      }
      return poll();
    },

    /** 读取当前登录用户（OAuth 登录后用于自动填充 owner） */
    user: function () {
      return request('/user').then(function (u) {
        return { login: u.login, name: u.name, avatar: u.avatar_url };
      });
    },

    /** 创建私有仓库（auto_init 让仓库自带初始提交，便于随后写入文件） */
    createRepo: function (name, isPrivate, desc) {
      return request('/user/repos', {
        method: 'POST',
        body: {
          name: name,
          private: isPrivate !== false,
          description: desc || 'TEST-LEGUME 自动同步仓库',
          auto_init: true,
          has_issues: false, has_wiki: false, has_projects: false
        }
      }).then(function (r) {
        return { fullName: r.full_name, private: r.private, defaultBranch: r.default_branch };
      }).catch(function (e) {
        if (e.status === 422) return { exists: true, name: name };   // 已存在
        throw e;
      });
    },

    /** 查询仓库是否存在及其可见性 */
    repoExists: function (owner, repo) {
      return request('/repos/' + encodeURIComponent(owner) + '/' + encodeURIComponent(repo)).then(function (r) {
        if (r.__notFound) return { exists: false };
        return { exists: true, private: r.private, defaultBranch: r.default_branch };
      });
    },

    /** 跨仓库写入：推送到「代码仓库」(owner/repo 由参数指定)，用于部署源码 */
    putFileTo: function (owner, repo, branch, path, text, message, sha) {
      return this.putRawTo(owner, repo, branch, path, b64encode(text), message, sha);
    },

    putRawTo: function (owner, repo, branch, path, base64Content, message, sha) {
      var body = {
        message: message || ('chore: sync ' + path),
        content: base64Content,
        branch: branch || 'main'
      };
      if (sha) body.sha = sha;
      return request('/repos/' + encodeURIComponent(owner) + '/' + encodeURIComponent(repo) + '/contents/' + path, {
        method: 'PUT', body: body
      }).then(function (r) {
        return { sha: r.content && r.content.sha, path: r.content && r.content.path, commit: r.commit && r.commit.sha };
      });
    }
  };
})(window.TL);
