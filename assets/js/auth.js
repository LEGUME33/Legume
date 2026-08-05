/* 云端数据库模式 —— 账户与鉴权（TL.Auth）
 * JWT 持久化到 localStorage（镜像写入 IndexedDB），未登录禁止读写个人数据。
 * 与 GitHub 模式并存，由 settings.syncMode 决定启用哪套同步引擎。
 */
(function (TL) {
  var NS = 'legume';
  var TOKEN_KEY = NS + '.auth.token';
  var USER_KEY = NS + '.auth.user';
  var _token = '';
  var _user = '';
  var _onUnauth = null; // 令牌失效（401）时回调，由 app.js 注册为弹登录网关

  function cloudUrl() {
    var s = (TL.Store && TL.Store.settings) ? TL.Store.settings() : {};
    return (s.cloudUrl || '').replace(/\/+$/, '');
  }

  function restore() {
    try {
      _token = localStorage.getItem(TOKEN_KEY) || '';
      _user = localStorage.getItem(USER_KEY) || '';
    } catch (e) { _token = ''; _user = ''; }
    return !!_token;
  }

  function save(token, user) {
    _token = token || '';
    _user = user || '';
    try {
      localStorage.setItem(TOKEN_KEY, _token);
      localStorage.setItem(USER_KEY, _user);
    } catch (e) {}
    if (TL.KV && TL.KV.set) {
      TL.KV.set(TOKEN_KEY, _token);
      TL.KV.set(USER_KEY, _user);
    }
  }

  function clear() {
    _token = ''; _user = '';
    try {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(USER_KEY);
    } catch (e) {}
    if (TL.KV && TL.KV.del) {
      TL.KV.del(TOKEN_KEY);
      TL.KV.del(USER_KEY);
    }
  }

  function request(path, opts) {
    opts = opts || {};
    var headers = Object.assign({ 'Content-Type': 'application/json' }, opts.headers || {});
    if (_token) headers['Authorization'] = 'Bearer ' + _token;
    var ctrl = (typeof AbortController !== 'undefined') ? new AbortController() : null;
    var p = fetch(cloudUrl() + path, {
      method: opts.method || 'GET',
      headers: headers,
      body: opts.body ? JSON.stringify(opts.body) : undefined,
      cache: 'no-store',
      signal: ctrl ? ctrl.signal : undefined
    });
    var timer = (ctrl && opts.timeout) ? setTimeout(function () { ctrl.abort(); }, opts.timeout || 15000) : null;
    function onUnauth() {
      if (res.status === 401) {
        clear();
        try { if (_onUnauth) _onUnauth(); } catch (e) {}
      }
    }
    return p.then(function (res) {
      if (timer) clearTimeout(timer);
      return res.json().then(function (j) {
        if (!res.ok) { onUnauth(); throw new Error(j.detail || ('请求失败 ' + res.status)); }
        return j;
      }, function () {
        if (!res.ok) { onUnauth(); throw new Error('请求失败 ' + res.status); }
        return {};
      });
    }).catch(function (err) {
      if (timer) clearTimeout(timer);
      throw err;
    });
  }

  function register(username, password) {
    return request('/api/auth/register', { method: 'POST', body: { username: username, password: password } })
      .then(function (r) { save(r.access_token, r.username); return r; });
  }

  function login(username, password) {
    return request('/api/auth/login', { method: 'POST', body: { username: username, password: password } })
      .then(function (r) { save(r.access_token, r.username); return r; });
  }

  /* 活跃设备续期：用当前有效令牌换取新令牌，配合后端 1 年有效期实现永久登录 */
  function refresh() {
    if (!_token) return Promise.reject(new Error('未登录'));
    return request('/api/auth/refresh', { method: 'POST' })
      .then(function (r) { save(r.access_token, r.username); return r; });
  }

  function setUnauthHandler(fn) { _onUnauth = fn; }

  /* 登录网关：云模式未登录时优先弹出，阻塞页面交互直至登录 / 切换 GitHub 模式 */
  function showGate(onSuccess, onSwitchGithub) {
    var H = TL.UI.h;
    var overlay = H('div', { class: 'tl-auth-gate__overlay' });
    var box = H('div', { class: 'tl-auth-gate' }, [
      H('div', { class: 'tl-auth-gate__title', text: '登录云端账户' }),
      H('div', { class: 'tl-auth-gate__sub', text: '云端数据库模式需要登录后才可以读取 / 修改个人数据' }),
      H('label', { class: 'tl-field' }, [
        H('span', { class: 'tl-field__label', text: '账号' }),
        H('input', { class: 'tl-input', type: 'text', value: '', placeholder: '3-64 个字符', 'data-k': 'au', autocomplete: 'off' })
      ]),
      H('label', { class: 'tl-field' }, [
        H('span', { class: 'tl-field__label', text: '密码' }),
        H('input', { class: 'tl-input', type: 'password', value: '', placeholder: '6 位以上', 'data-k': 'ap', autocomplete: 'off' })
      ]),
      H('div', { class: 'tl-inline-form', style: 'margin-top:14px' }, [
        H('button', { class: 'tl-btn tl-btn--primary', text: '登录', onClick: doLogin }),
        H('button', { class: 'tl-btn tl-btn--ghost', text: '注册并登录', onClick: doRegister })
      ]),
      onSwitchGithub ? H('button', { class: 'tl-btn tl-btn--link tl-auth-gate__switch', text: '改用 GitHub 同步模式', onClick: function () { onSwitchGithub(); } }) : null
    ]);
    overlay.appendChild(box);

    function val(k) { return box.querySelector('[data-k="' + k + '"]').value; }
    function doLogin() {
      var u = (val('au') || '').trim(), p = val('ap') || '';
      if (!u || !p) return TL.UI.toast('请输入账号和密码', 'warn');
      TL.UI.toast('登录中…');
      login(u, p).then(function () {
        TL.UI.toast('登录成功', 'success');
        overlay.remove();
        if (onSuccess) onSuccess();
      }).catch(function (e) { TL.UI.toast('登录失败：' + e.message, 'error', 4200); });
    }
    function doRegister() {
      var u = (val('au') || '').trim(), p = val('ap') || '';
      if (u.length < 3) return TL.UI.toast('账号至少 3 个字符', 'warn');
      if (p.length < 6) return TL.UI.toast('密码至少 6 位', 'warn');
      TL.UI.toast('注册中…');
      register(u, p).then(function () {
        TL.UI.toast('注册并登录成功', 'success');
        overlay.remove();
        if (onSuccess) onSuccess();
      }).catch(function (e) { TL.UI.toast('注册失败：' + e.message, 'error', 4200); });
    }

    document.body.appendChild(overlay);
  }

  TL.Auth = {
    cloudUrl: cloudUrl,
    restore: restore,
    save: save,
    clear: clear,
    token: function () { return _token; },
    user: function () { return _user; },
    configured: function () { return !!(cloudUrl() && _token); },
    request: request,
    register: register,
    login: login,
    refresh: refresh,
    setUnauthHandler: setUnauthHandler,
    logout: clear,
    showGate: showGate
  };
})(window.TL);
