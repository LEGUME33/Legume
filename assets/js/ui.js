/* =====================================================================
   TEST-LEGUME · 全站通用 UI 层
   ---------------------------------------------------------------------
   提供：常驻顶栏（含云端同步状态指示器）/ 三大导航 / 弹窗 / Toast /
         设置面板（GitHub 连接 · 立即同步 · 历史版本回滚 · Pages 部署）/
         统一任务勾选项 / 进度环 / 打卡热力图 / 可跳转预览卡片
   后续所有细分模块必须复用这些组件，禁止各页面自造样式与交互。
   ===================================================================== */
window.TL = window.TL || {};

(function (TL) {
  'use strict';

  /* 顶层三大固定导航 */
  var NAV = [
    { key: 'overview', label: '总览', href: 'index.html' },
    { key: 'work',     label: '工作', href: 'work.html' },
    { key: 'study',    label: '学习', href: 'study.html' }
  ];

  /* ------------------------------ DOM 助手 ------------------------------ */
  function h(tag, attrs, children) {
    var el = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      if (k === 'class') el.className = attrs[k];
      else if (k === 'html') el.innerHTML = attrs[k];
      else if (k === 'text') el.textContent = attrs[k];
      else if (k.slice(0, 2) === 'on') el.addEventListener(k.slice(2).toLowerCase(), attrs[k]);
      else if (attrs[k] !== null && attrs[k] !== undefined) el.setAttribute(k, attrs[k]);
    });
    (children || []).forEach(function (c) {
      if (c === null || c === undefined || c === false) return;
      el.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    });
    return el;
  }

  function svg(tag, attrs, children) {
    var el = document.createElementNS('http://www.w3.org/2000/svg', tag);
    Object.keys(attrs || {}).forEach(function (k) { el.setAttribute(k, attrs[k]); });
    (children || []).forEach(function (c) { if (c) el.appendChild(c); });
    return el;
  }

  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }

  function esc(s) {
    return String(s === undefined || s === null ? '' : s).replace(/[&<>"']/g, function (m) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[m];
    });
  }

  function fmtTime(ts) {
    if (!ts) return '—';
    var d = new Date(ts);
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0') +
           ' ' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
  }

  /* ------------------------------ 主题（浅色 / 深色 / 跟随系统） ------------------------------ */
  var THEME_LABEL = { system: '跟随系统', light: '浅色', dark: '深色' };

  function prefersDark() {
    try { return window.matchMedia('(prefers-color-scheme: dark)').matches; } catch (e) { return false; }
  }

  function applyTheme(mode) {
    var m = mode || TL.Store.settings().theme || 'system';
    var real = m === 'system' ? (prefersDark() ? 'dark' : 'light') : m;
    document.documentElement.setAttribute('data-theme', real);
    var btn = $('#tl-theme-btn');
    if (btn) {
      btn.textContent = m === 'system' ? '◐' : (real === 'dark' ? '☾' : '☀');
      btn.title = '主题：' + THEME_LABEL[m];
    }
  }

  function cycleTheme() {
    var order = ['system', 'light', 'dark'];
    var cur = TL.Store.settings().theme || 'system';
    var next = order[(order.indexOf(cur) + 1) % order.length];
    TL.Store.saveSettings({ theme: next });
    applyTheme(next);
    toast('主题：' + THEME_LABEL[next]);
  }

  /* ------------------------------ Toast ------------------------------ */
  function toast(msg, type, ms) {
    var root = $('#tl-toast-root');
    if (!root) { root = h('div', { id: 'tl-toast-root', class: 'tl-toasts' }); document.body.appendChild(root); }
    var node = h('div', { class: 'tl-toast tl-toast--' + (type || 'info') }, [
      h('i', { class: 'tl-toast__dot' }),
      h('span', { text: msg })
    ]);
    root.appendChild(node);
    setTimeout(function () {
      node.style.transition = 'opacity .25s, transform .25s';
      node.style.opacity = '0';
      node.style.transform = 'translateX(16px)';
      setTimeout(function () { node.remove(); }, 260);
    }, ms || 2600);
  }

  /* ------------------------------ 弹窗 ------------------------------ */
  function modal(opts) {
    var root = $('#tl-modal-root');
    if (!root) { root = h('div', { id: 'tl-modal-root' }); document.body.appendChild(root); }
    root.innerHTML = '';

    var panel = h('div', { class: 'tl-modal__panel' + (opts.wide ? ' tl-modal__panel--wide' : '') });
    var wrap = h('div', { class: 'tl-modal' }, [h('div', { class: 'tl-modal__mask', onClick: close }), panel]);

    panel.appendChild(h('div', { class: 'tl-modal__head' }, [
      h('div', { class: 'tl-modal__title', text: opts.title || '' }),
      h('button', { class: 'tl-iconbtn tl-modal__close', title: '关闭', onClick: close, html: '&times;' })
    ]));

    var body = h('div', { class: 'tl-modal__body' });
    if (typeof opts.content === 'string') body.innerHTML = opts.content;
    else if (opts.content) body.appendChild(opts.content);
    panel.appendChild(body);

    if (opts.actions && opts.actions.length) {
      var foot = h('div', { class: 'tl-modal__foot' });
      opts.actions.forEach(function (a) {
        foot.appendChild(h('button', {
          class: 'tl-btn tl-btn--' + (a.type || 'secondary'),
          text: a.label,
          onClick: function () { a.onClick && a.onClick({ close: close, body: body }); }
        }));
      });
      panel.appendChild(foot);
    }

    root.appendChild(wrap);
    function close() { root.innerHTML = ''; }
    document.addEventListener('keydown', function onEsc(e) {
      if (e.key === 'Escape') { close(); document.removeEventListener('keydown', onEsc); }
    });
    return { close: close, body: body };
  }

  function confirm(title, message, onOk) {
    modal({
      title: title,
      content: h('p', { class: 'tl-sub', text: message }),
      actions: [
        { label: '取消', type: 'ghost', onClick: function (m) { m.close(); } },
        { label: '确定', type: 'primary', onClick: function (m) { m.close(); onOk && onOk(); } }
      ]
    });
  }

  /* ------------------------------ 统一任务项（全站唯一勾选交互） ------------------------------ */
  function taskItem(opts) {
    var body = h('div', { class: 'tl-task__body' }, [
      h('span', { class: 'tl-task__text', text: opts.text }),
      opts.note ? h('span', { class: 'tl-task__note', text: opts.note }) : null
    ]);
    var kids = [
      h('span', { class: 'tl-check', role: 'checkbox', tabindex: '0', 'aria-checked': String(!!opts.done), 'aria-label': opts.text }),
      body,
      opts.meta ? h('span', { class: 'tl-task__meta', text: opts.meta }) : null
    ];
    if (opts.onEdit) kids.push(h('button', { class: 'tl-task__edit', title: '编辑', html: '&#9998;' }));
    if (opts.onDelete) kids.push(h('button', { class: 'tl-task__del', title: '删除', html: '&times;' }));
    var node = h('div', { class: 'tl-task' + (opts.done ? ' is-done' : '') + (opts.level ? ' tl-task--level-' + opts.level : '') }, kids);

    function toggle() {
      var next = !node.classList.contains('is-done');
      node.classList.toggle('is-done', next);
      $('.tl-check', node).setAttribute('aria-checked', String(next));
      opts.onToggle && opts.onToggle(next);
    }

    $('.tl-check', node).addEventListener('click', toggle);
    $('.tl-check', node).addEventListener('keydown', function (e) {
      if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); toggle(); }
    });
    $('.tl-task__text', node).addEventListener('click', toggle);
    if (opts.onEdit) $('.tl-task__edit', node).addEventListener('click', function (e) { e.stopPropagation(); opts.onEdit(); });
    if (opts.onDelete) $('.tl-task__del', node).addEventListener('click', function (e) { e.stopPropagation(); opts.onDelete(); });
    return node;
  }

  /* ------------------------------ 进度环 ------------------------------ */
  function ring(rate, opts) {
    opts = opts || {};
    var size = opts.size || 92;
    var sw = opts.stroke || 9;
    var r = (size - sw) / 2;
    var c = 2 * Math.PI * r;
    var pct = Math.max(0, Math.min(100, rate || 0));

    var bar = svg('circle', {
      class: 'tl-ring__bar', cx: size / 2, cy: size / 2, r: r,
      'stroke-width': sw, 'stroke-dasharray': c.toFixed(2), 'stroke-dashoffset': c.toFixed(2)
    });

    var node = svg('svg', { class: 'tl-ring', width: size, height: size, viewBox: '0 0 ' + size + ' ' + size, role: 'img', 'aria-label': '完成度 ' + pct + '%' }, [
      svg('circle', { class: 'tl-ring__track', cx: size / 2, cy: size / 2, r: r, 'stroke-width': sw }),
      bar,
      svg('text', { class: 'tl-ring__label', x: size / 2, y: size / 2, 'text-anchor': 'middle', 'dominant-baseline': 'central' })
    ]);
    node.querySelector('.tl-ring__label').textContent = (opts.label !== undefined ? opts.label : pct + '%');

    // 下一帧再赋值，触发描边动画
    var draw = function () { bar.setAttribute('stroke-dashoffset', (c * (1 - pct / 100)).toFixed(2)); };
    if (window.requestAnimationFrame) requestAnimationFrame(draw); else draw();
    return node;
  }

  /* ------------------------------ 线性进度条 ------------------------------ */
  function progress(rate, label) {
    var bar = h('i', { class: 'tl-progress__bar' });
    var row = h('div', { class: 'tl-progress-row' }, [
      h('div', { class: 'tl-progress' }, [bar]),
      h('span', { text: label !== undefined ? label : (rate + '%') })
    ]);
    var draw = function () { bar.style.width = Math.max(0, Math.min(100, rate)) + '%'; };
    if (window.requestAnimationFrame) requestAnimationFrame(draw); else draw();
    return row;
  }

  /* ------------------------------ 30 天打卡热力图 ------------------------------ */
  function heatmap(days) {
    return h('div', { class: 'tl-heat' }, (days || []).map(function (d) {
      return h('i', {
        class: 'tl-heat__cell' + (d.on ? ' is-on' : '') + (d.today ? ' is-today' : ''),
        title: d.d + (d.on ? ' · 已打卡' : ' · 未打卡')
      });
    }));
  }

  /* ------------------------------ 可跳转预览卡片 ------------------------------ */
  function previewCard(opts) {
    var card = h('a', { class: 'tl-card tl-card--link', href: opts.href, 'data-card': opts.key || '' }, [
      h('div', { class: 'tl-card__head' }, [
        h('span', { class: 'tl-card__title', text: opts.title }),
        opts.tag ? h('span', { class: 'tl-tag' + (opts.tagType ? ' tl-tag--' + opts.tagType : ''), text: opts.tag }) : null,
        h('span', { class: 'tl-card__go', text: '查看 →' })
      ]),
      h('div', { class: 'tl-card__body' }, opts.body || []),
      opts.foot ? h('div', { class: 'tl-card__foot', text: opts.foot }) : null
    ]);
    return card;
  }

  function metric(value, label, tone, unit) {
    return h('div', { class: 'tl-metric' + (tone ? ' tl-metric--' + tone : '') }, [
      h('div', { class: 'tl-metric__value' }, [
        document.createTextNode(String(value)),
        unit ? h('small', { text: unit }) : null
      ]),
      h('div', { class: 'tl-metric__label', text: label })
    ]);
  }

  /* ------------------------------ 顶栏 + 导航 ------------------------------ */
  function mountShell(pageKey) {
    var topbar = h('header', { class: 'tl-topbar' }, [
      h('a', { class: 'tl-brand', href: 'index.html' }, [
        h('span', { class: 'tl-brand__mark', text: 'TL' }),
        h('span', {}, [
          h('div', { class: 'tl-brand__name', text: 'TEST-LEGUME' }),
          h('div', { class: 'tl-brand__sub', text: '个人工作台' })
        ])
      ]),
      h('button', { class: 'tl-sync', id: 'tl-sync-badge', 'data-state': 'idle', title: '点击打开云端同步设置' }, [
        h('i', { class: 'tl-sync__dot' }),
        h('span', { class: 'tl-sync__text', text: '同步空闲' })
      ]),
      h('button', { class: 'tl-sync tl-local', id: 'tl-local-badge', 'data-state': 'saved', title: '本地自动保存状态' }, [
        h('i', { class: 'tl-sync__dot' }),
        h('span', { class: 'tl-sync__text', text: '本地已保存' })
      ]),
      h('button', { class: 'tl-sync', id: 'tl-code-badge', 'data-state': 'idle', title: '代码部署状态', onClick: openSettings }, [
        h('i', { class: 'tl-sync__dot' }),
        h('span', { class: 'tl-sync__text', text: '代码·待部署' })
      ]),
      h('button', { class: 'tl-sync', id: 'tl-vercel-badge', 'data-state': 'idle', title: 'Vercel 部署状态', onClick: openSettings }, [
        h('i', { class: 'tl-sync__dot' }),
        h('span', { class: 'tl-sync__text', text: 'Vercel·未连接' })
      ]),
      h('button', { class: 'tl-iconbtn', id: 'tl-theme-btn', title: '切换主题', onClick: cycleTheme, text: '◐' }),
      h('button', { class: 'tl-iconbtn', id: 'tl-setting-btn', title: '设置', onClick: openSettings, text: '⚙' })
    ]);

    var nav = h('nav', { class: 'tl-nav' }, [
      h('div', { class: 'tl-nav__inner' }, NAV.map(function (n) {
        return h('a', {
          class: 'tl-nav__link' + (n.key === pageKey ? ' is-active' : ''),
          href: n.href, text: n.label,
          'aria-current': n.key === pageKey ? 'page' : null
        });
      }))
    ]);

    document.body.insertBefore(nav, document.body.firstChild);
    document.body.insertBefore(topbar, document.body.firstChild);
    if (!$('#tl-modal-root')) document.body.appendChild(h('div', { id: 'tl-modal-root' }));
    if (!$('#tl-toast-root')) document.body.appendChild(h('div', { id: 'tl-toast-root', class: 'tl-toasts' }));

    $('#tl-sync-badge').addEventListener('click', openSettings);

    // 同步状态 → 常驻指示器（顶部状态栏四态：同步空闲 / 正在同步 / 同步成功 / 同步失败）
    TL.Sync.on(function (s) {
      var badge = $('#tl-sync-badge');
      if (!badge) return;
      var phase = s.phase || 'idle';
      // 四态中文文案
      var TEXT = { idle: '同步空闲', syncing: '正在同步', success: '同步成功', failed: '同步失败' };
      // 映射到底层 data-state 以复用现有配色（idle 复用默认灰、syncing→info、success→synced、failed→error）
      var STATE = { idle: 'idle', syncing: 'syncing', success: 'synced', failed: 'error' };
      badge.setAttribute('data-state', STATE[phase] || 'idle');
      badge.setAttribute('data-phase', phase);
      $('.tl-sync__text', badge).textContent = TEXT[phase] || '同步空闲';
      badge.title = (s.lastError ? ('同步失败：' + s.lastError) : '云端同步 · ' + (TEXT[phase] || '同步空闲')) +
                    (s.message ? (' · ' + s.message) : '');
    });

    // 本地自动保存状态 → 常驻指示器（30s 轮询兜底 + 关页强制落盘）
    if (TL.Store.onLocal) TL.Store.onLocal(function (ls) {
      var b = $('#tl-local-badge');
      if (!b) return;
      if (ls.dirty) {
        b.setAttribute('data-state', 'saving');
        $('.tl-sync__text', b).textContent = '本地保存中…';
        b.title = '有未保存改动，将在 30 秒内自动写入本地缓存';
      } else {
        b.setAttribute('data-state', 'saved');
        var t = ls.lastSavedAt ? fmtTime(ls.lastSavedAt) : '';
        $('.tl-sync__text', b).textContent = '本地已保存';
        b.title = '本地已保存' + (t ? (' · ' + t) : '');
      }
    });

    // 代码部署状态 → 常驻指示器
    TL.Deploy.on(function (s) {
      var b = $('#tl-code-badge');
      if (!b) return;
      b.setAttribute('data-state', s.status === 'unconfigured' ? 'idle' : s.status);
      var label = { idle: '待部署', syncing: '推送中', synced: '已推送', error: '失败' }[s.status] || '待部署';
      $('.tl-sync__text', b).textContent = '代码·' + label;
      b.title = '代码部署状态：' + s.message;
    });

    // Vercel 部署状态 → 常驻指示器
    TL.Vercel.on(function (s) {
      var b = $('#tl-vercel-badge');
      if (!b) return;
      b.setAttribute('data-state', s.status === 'idle' ? 'idle' : s.status);
      var label = { idle: '未连接', checking: '查询中', ready: '已部署', building: '构建中', unlinked: '未绑定', error: '失败' }[s.status] || '未连接';
      $('.tl-sync__text', b).textContent = 'Vercel·' + label;
      b.title = 'Vercel：' + s.message + (s.url ? (' · ' + s.url) : '');
    });

    applyTheme();
    try {
      window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function () {
        if ((TL.Store.settings().theme || 'system') === 'system') applyTheme('system');
      });
    } catch (e) { /* 旧浏览器忽略 */ }
  }

  function kv(k, v) { return h('div', { class: 'tl-kv' }, [h('span', { text: k }), h('b', { text: v || '—' })]); }

  /* ------------------------------ 设置面板 ------------------------------ */
  function openSettings() {
    var c = TL.Store.settings();
    var s = TL.Sync.state();
    var box = h('div', {});

    function field(label, key, val, ph, type) {
      return h('label', { class: 'tl-field' }, [
        h('span', { class: 'tl-field__label', text: label }),
        h('input', { class: 'tl-input', type: type || 'text', value: val || '', placeholder: ph || '', 'data-k': key, autocomplete: 'off', spellcheck: 'false' })
      ]);
    }

    /* ① GitHub 账号登录（免 PAT，系统自动授权） */
    box.appendChild(h('div', { class: 'tl-setting-group' }, [
      h('div', { class: 'tl-setting-group__title', text: 'GitHub 账号登录（免 PAT）' }),
      h('div', { class: 'tl-field__tip', text: '点击下方按钮，在 github.com 输入授权码即可完成登录，系统自动写入令牌；若你已有 PAT（ghp_/gho_），可直接在下方「GitHub 私有仓库连接」中粘贴令牌，跳过此步。' }),
      field('GitHub OAuth App Client ID', 'clientId', c.clientId, '在 GitHub 注册的 OAuth App 的 Client ID（仅需一次，无需密钥）'),
      h('div', { class: 'tl-inline-form', style: 'margin-top:12px' }, [
        h('button', { class: 'tl-btn tl-btn--primary', text: '使用 GitHub 账号登录', onClick: startGitHubLogin }),
        c.token ? h('button', { class: 'tl-btn tl-btn--ghost', text: '退出登录（清除令牌）', onClick: doLogout }) : null
      ]),
      h('div', { class: 'tl-note', text: 'GitHub 已于 2020 年废弃「账号+密码」API 鉴权，本工作台采用官方 OAuth Device Flow：浏览器无法直连密码，但可安全免密登录。' })
    ]));

    /* ② GitHub 私有仓库连接（含双仓库） */
    box.appendChild(h('div', { class: 'tl-setting-group' }, [
      h('div', { class: 'tl-setting-group__title', text: 'GitHub 私有仓库连接' }),
      field('GitHub 用户名', 'owner', c.owner, '登录后自动填充', 'text'),
      field('业务数据仓库（data 同步目标）', 'repo', c.repo, '例如 Legume'),
      field('前端代码仓库（Vercel 部署源）', 'codeRepo', c.codeRepo, '例如 legume'),
      field('访问令牌（手动粘贴 PAT / OAuth 自动写入）', 'token', c.token, 'ghp_xxx 或 gho_xxx（需 repo 权限，仅存本机）', 'password'),
      field('目标分支', 'branch', c.branch || 'main', 'main'),
      h('label', { class: 'tl-field' }, [
        h('span', { class: 'tl-field__label', text: 'GitHub 同步冷却（秒，建议 ≥60）' }),
        h('input', { class: 'tl-input', type: 'number', min: '5', max: '300', value: String(c.delaySec || 60), 'data-k': 'delaySec' })
      ]),
      h('div', { class: 'tl-note', text: '令牌仅保存在本机浏览器 localStorage，不会写入仓库、不经过任何第三方服务。业务数据同步至「业务数据仓库」，静态源码托管于「前端代码仓库」。' }),
      h('div', { class: 'tl-field__tip', text: '本地兜底：所有改动每 30 秒自动写入浏览器本地缓存，关闭/刷新页面前强制落盘，断网也能正常使用；云端同步在变更后静默冷却 60 秒再推送（短时间多次修改只合并提交一次），失败则每 3 分钟自动重试。' })
    ]));

    /* ② 同步状态与操作 */
    box.appendChild(h('div', { class: 'tl-setting-group' }, [
      h('div', { class: 'tl-setting-group__title', text: '同步状态与操作' }),
      kv('当前状态', s.message),
      kv('最近拉取', fmtTime(c.lastPullAt)),
      kv('最近推送', fmtTime(c.lastPushAt)),
      kv('本机标识', c.device),
      h('div', { class: 'tl-inline-form', style: 'margin-top:12px' }, [
        h('button', { class: 'tl-btn tl-btn--primary', text: '立即同步', onClick: doSyncNow }),
        h('button', { class: 'tl-btn tl-btn--secondary', text: '历史版本回滚', onClick: openHistory }),
        h('button', { class: 'tl-btn tl-btn--ghost', text: '校验连接', onClick: doVerify })
      ])
    ]));

    /* ③ 部署：代码仓库 · Vercel · Pages */
    box.appendChild(h('div', { class: 'tl-setting-group' }, [
      h('div', { class: 'tl-setting-group__title', text: '部署：代码仓库 · Vercel · Pages' }),
      h('div', { class: 'tl-field__tip', text: '登录后自动创建「业务数据仓库」与「前端代码仓库」两个私有仓库；网页源码经 GitHub API 推送至代码仓库 main 分支，Vercel 监听该分支自动构建部署。' }),
      h('div', { class: 'tl-inline-form', style: 'margin-top:12px' }, [
        h('button', { class: 'tl-btn tl-btn--primary', text: '初始化仓库并推送代码', onClick: doInitAndPush }),
        h('button', { class: 'tl-btn tl-btn--secondary', text: '仅推送代码', onClick: doPushCode })
      ]),
      h('div', { class: 'tl-subpanel', id: 'tl-deploy-state', style: 'margin-top:12px' },
        [h('span', { text: '代码状态：' + TL.Deploy.state().message })]),
      h('div', { class: 'tl-setting-group__subtitle', text: 'Vercel（复用 GitHub 账号一键部署）' }),
      field('Vercel 访问令牌', 'vercelToken', c.vercelToken, '在 Vercel 后台生成的 Token（仅用于站内查询部署状态）', 'password'),
      h('div', { class: 'tl-inline-form', style: 'margin-top:12px' }, [
        h('button', { class: 'tl-btn tl-btn--primary', text: '连接 Vercel（复用 GitHub）', onClick: doVercelConnect }),
        h('button', { class: 'tl-btn tl-btn--secondary', text: '查询部署状态', onClick: doVercelStatus }),
        h('button', { class: 'tl-btn tl-btn--ghost', text: '绑定自定义域名', onClick: doVercelDomain })
      ]),
      h('div', { class: 'tl-subpanel', id: 'tl-vercel-state', style: 'margin-top:12px' },
        [h('span', { text: 'Vercel：' + TL.Vercel.state().message + (TL.Vercel.state().url ? (' · ' + TL.Vercel.state().url) : '') })]),
      h('div', { class: 'tl-field__tip', style: 'margin-top:10px', text: 'GitHub Pages 仍可作为备选静态托管：' }),
      h('div', { class: 'tl-inline-form' }, [
        h('button', { class: 'tl-btn tl-btn--secondary tl-btn--sm', text: '查询 Pages 状态', onClick: doPagesInfo }),
        h('button', { class: 'tl-btn tl-btn--secondary tl-btn--sm', text: '一键开启 Pages', onClick: doEnablePages })
      ])
    ]));

    /* ④ 本地数据 */
    box.appendChild(h('div', { class: 'tl-setting-group' }, [
      h('div', { class: 'tl-setting-group__title', text: '本地数据' }),
      h('div', { class: 'tl-inline-form' }, [
        h('button', { class: 'tl-btn tl-btn--secondary tl-btn--sm', text: '导出 JSON 备份', onClick: exportAll }),
        h('button', { class: 'tl-btn tl-btn--danger tl-btn--sm', text: '清空本机缓存', onClick: clearLocal })
      ]),
      h('div', { class: 'tl-field__tip', text: '清空仅影响本机 localStorage，云端仓库数据不受影响，可通过【立即同步】重新拉回。' })
    ]));

    var m = modal({
      title: '工作台设置',
      wide: true,
      content: box,
      actions: [
        { label: '关闭', type: 'ghost', onClick: function (mm) { mm.close(); } },
        { label: '保存配置', type: 'primary', onClick: function (mm) { saveForm(mm.body); mm.close(); } }
      ]
    });

    function saveForm(root) {
      var patch = {};
      $$('[data-k]', root).forEach(function (input) {
        var k = input.getAttribute('data-k');
        patch[k] = k === 'delaySec' ? Math.max(5, parseInt(input.value, 10) || 30) : input.value.trim();
      });
      TL.Store.saveSettings(patch);
      TL.Sync.refresh();
      toast('配置已保存', 'success');
      if (TL.GitHub.configured()) {
        TL.Sync.syncNow()
          .then(function () { toast('云端同步完成', 'success'); TL.refreshPage && TL.refreshPage(); })
          .catch(function (e) { toast('同步失败：' + e.message, 'error', 4200); });
      }
    }

    function needConfig() {
      saveForm(m.body);
      if (!TL.GitHub.configured()) { toast('请先填写用户名 / 仓库 / 令牌', 'warn'); return true; }
      return false;
    }

    function doVerify() {
      if (needConfig()) return;
      toast('正在校验…');
      TL.GitHub.verify().then(function (info) {
        modal({
          title: '连接校验通过',
          content: h('div', {}, [
            kv('仓库', info.fullName),
            kv('私有仓库', info.private ? '是' : '否（建议改用私有仓库）'),
            kv('默认分支', info.defaultBranch),
            kv('写入权限', info.canPush ? '有' : '无'),
            kv('Pages', info.pagesUrl || '尚未开启')
          ]),
          actions: [{ label: '好的', type: 'primary', onClick: function (mm) { mm.close(); } }]
        });
      }).catch(function (e) { toast('校验失败：' + e.message, 'error', 4600); });
    }

    function doSyncNow() {
      if (needConfig()) return;
      if (TL.Store.flushLocal) TL.Store.flushLocal();   // 先确保本地最新改动已落盘
      toast('开始同步…');
      TL.Sync.syncNow().then(function () {
        toast('同步完成', 'success');
        TL.refreshPage && TL.refreshPage();
      }).catch(function (e) { toast('同步失败：' + e.message, 'error', 4600); });
    }

    function doPagesInfo() {
      if (needConfig()) return;
      TL.GitHub.pagesInfo().then(function (p) {
        if (!p) return toast('该仓库尚未开启 Pages', 'warn');
        modal({
          title: 'GitHub Pages',
          content: h('div', {}, [kv('访问地址', p.url), kv('构建状态', p.status), kv('站点源', (p.branch || '') + ' ' + (p.path || ''))]),
          actions: [{ label: '好的', type: 'primary', onClick: function (mm) { mm.close(); } }]
        });
      }).catch(function (e) { toast('查询失败：' + e.message, 'error', 4200); });
    }

    function doEnablePages() {
      if (needConfig()) return;
      confirm('开启 GitHub Pages？', '将以当前分支根目录作为站点源发布工作台，生成公开访问链接。', function () {
        TL.GitHub.enablePages().then(function (p) {
          modal({
            title: 'Pages 已开启',
            content: h('div', {}, [kv('访问地址', p.url), h('div', { class: 'tl-note', text: '首次构建需要 1-2 分钟，稍后用任意设备浏览器打开该链接即可。' })]),
            actions: [{ label: '好的', type: 'primary', onClick: function (mm) { mm.close(); } }]
          });
        }).catch(function (e) { toast('开启失败：' + e.message + '（免费账号的私有仓库不支持 Pages，可将站点放公开仓库、数据仍同步到私有仓库）', 'error', 6000); });
      });
    }

    function exportAll() {
      var dump = { exportedAt: new Date().toISOString() };
      TL.Store.CATS.forEach(function (cat) { dump[cat] = TL.Store.get(cat); });
      var blob = new Blob([JSON.stringify(dump, null, 2)], { type: 'application/json' });
      var a = h('a', { href: URL.createObjectURL(blob), download: 'legume-backup-' + TL.Store.todayKey() + '.json' });
      document.body.appendChild(a); a.click(); a.remove();
      toast('备份已导出', 'success');
    }

    function clearLocal() {
      confirm('确认清空本机缓存？', '将删除本机所有工作台业务数据与图片缓存（云端仓库不受影响）。', function () {
        TL.Store.CATS.forEach(function (cat) { localStorage.removeItem(TL.Store.NS + '.' + cat); });
        localStorage.removeItem(TL.Store.NS + '.meta');
        Object.keys(localStorage).forEach(function (k) {
          if (k.indexOf(TL.Store.NS + '.blob.') === 0) localStorage.removeItem(k);
        });
        location.reload();
      });
    }

    /* —— 新增：GitHub OAuth 账号登录（免 PAT） —— */
    function startGitHubLogin() {
      if (!c.clientId) { toast('请先在上方填写 GitHub OAuth App 的 Client ID', 'warn', 4200); return; }
      toast('正在申请授权码…');
      TL.GitHub.deviceCode('repo').then(function (dc) {
        var pending = true;
        var m = modal({
          title: 'GitHub 账号登录',
          wide: true,
          content: h('div', {}, [
            h('p', { class: 'tl-sub', text: '请在浏览器打开下方地址，输入授权码完成登录（无需创建 PAT）：' }),
            h('div', { class: 'tl-login-code' }, [
              h('a', { class: 'tl-login-code__link', href: dc.verification_uri, target: '_blank', rel: 'noopener', text: dc.verification_uri }),
              h('div', { class: 'tl-login-code__value', text: dc.user_code })
            ]),
            h('p', { class: 'tl-note', text: '授权码有效期约 ' + Math.round((dc.expires_in || 900) / 60) + ' 分钟。登录成功后将自动创建私有仓库并推送代码。' })
          ]),
          actions: [
            { label: '打开授权页', type: 'primary', onClick: function () { window.open(dc.verification_uri, '_blank', 'noopener'); } },
            { label: '取消', type: 'ghost', onClick: function (mm) { pending = false; mm.close(); } }
          ]
        });
        TL.GitHub.deviceToken(dc.device_code, (dc.interval || 5) * 1000).then(function (tok) {
          if (!pending) return;
          try { m.close(); } catch (e) {}
          toast('授权成功，正在获取账号…');
          TL.GitHub.user().then(function (u) {
            TL.Store.saveSettings({ token: tok, owner: u.login, authMethod: 'oauth' });
            toast('已登录为 ' + u.login, 'success');
            // 鉴权成功后自动创建双私有仓库并推送代码
            doInitAndPush();
          }).catch(function (e) { toast('获取账号失败：' + e.message, 'error', 4200); });
        }).catch(function (e) {
          if (pending) { try { m.close(); } catch (_) {} toast('登录失败：' + e.message, 'error', 5200); }
        });
      }).catch(function (e) { toast('申请授权码失败：' + e.message, 'error', 4600); });
    }

    function doLogout() {
      confirm('退出 GitHub 登录？', '将清除本机保存的访问令牌（仓库与本地数据保留，可重新登录）。', function () {
        TL.Store.saveSettings({ token: '', authMethod: 'pat' });
        TL.Sync.refresh();
        TL.Deploy.init();
        TL.Vercel.init();
        toast('已退出登录', 'success');
      });
    }

    /* —— 新增：代码部署 —— */
    function doInitAndPush() {
      if (!TL.GitHub.configured()) { toast('请先完成 GitHub 账号登录', 'warn'); return; }
      toast('正在初始化仓库并推送代码…');
      TL.Deploy.initRepos().then(function () { return TL.Deploy.pushCode(); })
        .then(function () {
          toast('代码已部署至 GitHub · Vercel 将自动构建', 'success', 4200);
          TL.Vercel.status().catch(function () {});
        })
        .catch(function (e) { toast('失败：' + e.message, 'error', 5200); });
    }

    function doPushCode() {
      if (!TL.GitHub.configured()) { toast('请先完成 GitHub 账号登录', 'warn'); return; }
      toast('开始推送网页源码…');
      TL.Deploy.pushCode().catch(function (e) { toast('推送失败：' + e.message, 'error', 5200); });
    }

    /* —— 新增：Vercel —— */
    function doVercelConnect() {
      if (!TL.GitHub.configured()) { toast('请先完成 GitHub 登录并初始化代码仓库', 'warn'); return; }
      var url = TL.Vercel.connectUrl();
      window.open(url, '_blank', 'noopener');
      toast('已打开 Vercel 授权页，用 GitHub 账号授权并导入仓库即可', 'success', 5200);
    }

    function doVercelStatus() {
      if (!TL.Vercel.configured()) { toast('请先在设置中填写 Vercel 访问令牌', 'warn'); return; }
      toast('查询部署状态…');
      TL.Vercel.status().then(function (s) {
        return TL.Vercel.domains().then(function (doms) {
          var domainList = (doms || []).map(function (d) { return d.name + (d.verified ? '（已验证）' : '（待验证）'); }).join('、') || '无';
          modal({
            title: 'Vercel 部署状态',
            content: h('div', {}, [
              kv('部署状态', s.message),
              kv('线上地址', s.url || '—'),
              kv('构建中', s.building ? '是' : '否'),
              kv('自定义域名', domainList)
            ]),
            actions: [
              { label: '打开线上站点', type: 'primary', onClick: function (mm) { mm.close(); if (s.url) window.open(s.url, '_blank', 'noopener'); } },
              { label: '好的', type: 'ghost', onClick: function (mm) { mm.close(); } }
            ]
          });
        });
      }).catch(function (e) { toast('查询失败：' + e.message, 'error', 4600); });
    }

    function doVercelDomain() {
      if (!TL.Vercel.configured()) { toast('请先填写 Vercel 访问令牌', 'warn'); return; }
      TL.Vercel.status().then(function (s) {
        if (!s.projectId) return toast('请先在 Vercel 绑定该仓库（点击「连接 Vercel」并授权）', 'warn');
        modal({
          title: '绑定自定义域名',
          content: h('div', {}, [
            h('div', { class: 'tl-field__tip', text: '输入你的域名（如 app.example.com）。绑定后请在 DNS 添加 CNAME 指向 cname.vercel-dns.com。' }),
            h('input', { class: 'tl-input', id: 'tl-domain-input', placeholder: 'app.example.com', autocomplete: 'off' })
          ]),
          actions: [
            { label: '取消', type: 'ghost', onClick: function (mm) { mm.close(); } },
            { label: '绑定', type: 'primary', onClick: function (mm) {
              var dom = (($('#tl-domain-input') && $('#tl-domain-input').value) || '').trim();
              mm.close();
              if (!dom) return toast('域名不能为空', 'warn');
              TL.Vercel.addDomain(dom).catch(function (e) { toast('绑定失败：' + e.message, 'error', 5200); });
            } }
          ]
        });
      });
    }
  }

  /* ------------------------------ 历史版本回滚 ------------------------------ */
  var HIST_CATS = [
    { v: 'work',     t: '工作数据 data/work.json' },
    { v: 'study',    t: '学习数据 data/study.json' },
    { v: 'media',    t: '图片索引 data/media.json' },
    { v: 'activity', t: '操作记录 data/activity.json' }
  ];

  function openHistory() {
    if (!TL.GitHub.configured()) return toast('请先完成 GitHub 配置', 'warn');

    var picker = h('div', { class: 'tl-inline-form', style: 'margin-bottom:14px' }, [
      h('select', { class: 'tl-select', id: 'tl-hist-cat' }, HIST_CATS.map(function (o) {
        return h('option', { value: o.v, text: o.t });
      })),
      h('button', { class: 'tl-btn tl-btn--secondary', text: '加载历史', onClick: load })
    ]);
    var list = h('div', { id: 'tl-hist-list' }, [h('div', { class: 'tl-empty', text: '选择数据文件后点击「加载历史」' })]);

    modal({
      title: '历史版本回滚',
      wide: true,
      content: h('div', {}, [picker, list]),
      actions: [{ label: '关闭', type: 'ghost', onClick: function (m) { m.close(); } }]
    });

    function load() {
      var cat = $('#tl-hist-cat').value;
      list.innerHTML = '<div class="tl-empty">加载中…</div>';
      TL.Sync.history(cat, 20).then(function (commits) {
        list.innerHTML = '';
        if (!commits.length) { list.appendChild(h('div', { class: 'tl-empty', text: '该文件暂无提交历史' })); return; }
        commits.forEach(function (cm, i) {
          list.appendChild(h('div', { class: 'tl-history-item' }, [
            h('div', { class: 'tl-history-item__main' }, [
              h('div', { class: 'tl-history-item__msg', text: cm.message.split('\n')[0] }),
              h('div', { class: 'tl-history-item__sha', text: cm.short + ' · ' + new Date(cm.date).toLocaleString('zh-CN') + ' · ' + cm.author })
            ]),
            h('button', { class: 'tl-btn tl-btn--ghost tl-btn--sm', text: '查看', onClick: function () { view(cat, cm); } }),
            i === 0
              ? h('span', { class: 'tl-tag', text: '最新' })
              : h('button', {
                  class: 'tl-btn tl-btn--secondary tl-btn--sm', text: '回滚到此版本',
                  onClick: function () { doRollback(cat, cm); }
                })
          ]));
        });
      }).catch(function (e) {
        list.innerHTML = '';
        list.appendChild(h('div', { class: 'tl-empty', text: '加载失败：' + e.message }));
      });
    }

    function view(cat, cm) {
      TL.Sync.preview(cat, cm.sha).then(function (data) {
        var counts = Object.keys(data).filter(function (k) { return Array.isArray(data[k]); })
          .map(function (k) { return k + ' × ' + data[k].length; }).join('　');
        modal({
          title: '版本 ' + cm.short,
          wide: true,
          content: h('div', {}, [
            h('div', { class: 'tl-kv' }, [h('span', { text: '提交时间' }), h('b', { text: new Date(cm.date).toLocaleString('zh-CN') })]),
            h('div', { class: 'tl-kv' }, [h('span', { text: '数据概览' }), h('b', { text: counts || '—' })]),
            h('pre', {
              class: 'tl-subpanel',
              style: 'max-height:320px;overflow:auto;font-family:var(--font-mono);font-size:var(--fs-cap);white-space:pre-wrap;margin-top:12px',
              text: JSON.stringify(data, null, 2).slice(0, 4000)
            })
          ]),
          actions: [
            { label: '关闭', type: 'ghost', onClick: function (mm) { mm.close(); } },
            { label: '回滚到此版本', type: 'primary', onClick: function (mm) { mm.close(); doRollback(cat, cm); } }
          ]
        });
      }).catch(function (e) { toast('读取失败：' + e.message, 'error', 4200); });
    }

    function doRollback(cat, cm) {
      confirm('确认回滚？', '将用 ' + cm.short + ' 版本覆盖当前 ' + cat + ' 数据，并推送为最新版本。', function () {
        TL.Sync.rollback(cat, cm.sha).then(function () {
          toast('已回滚到 ' + cm.short, 'success');
          TL.refreshPage && TL.refreshPage();
        }).catch(function (e) { toast('回滚失败：' + e.message, 'error', 4600); });
      });
    }
  }

  /* ------------------------------ 日历（周 / 月，周一为自然周起点） ------------------------------ */
  function calendar(opts) {
    opts = opts || {};
    var weekStart = (opts.weekStart != null) ? opts.weekStart : 1; // 1 = 周一
    var view = opts.view || 'month';
    var now = new Date();
    var todayKey = TL.Store.todayKey();
    var cursor = view === 'month'
      ? { y: opts.year != null ? opts.year : now.getFullYear(), m: opts.month != null ? opts.month : now.getMonth() }
      : (opts.weekAnchor ? new Date(opts.weekAnchor) : new Date());

    var root = h('div', { class: 'tl-calendar tl-calendar--' + view });

    function keyOf(d) {
      return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    }
    function startOfWeek(d) {
      var x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
      var off = (x.getDay() + 7 - weekStart) % 7;
      x.setDate(x.getDate() - off);
      return x;
    }
    function weekdayLabels() {
      var labels = ['日', '一', '二', '三', '四', '五', '六'];
      var arr = [];
      for (var i = 0; i < 7; i++) arr.push(labels[(weekStart + i) % 7]);
      return arr;
    }

    function step(dir) {
      if (view === 'month') {
        cursor = { y: cursor.y + Math.floor((cursor.m + dir) / 12), m: (cursor.m + dir + 12) % 12 };
      } else {
        cursor = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate() + dir * 7);
      }
      build();
    }

    function build() {
      root.innerHTML = '';
      var dates = [];
      var label;
      if (view === 'month') {
        var first = new Date(cursor.y, cursor.m, 1);
        label = cursor.y + ' 年 ' + (cursor.m + 1) + ' 月';
        var start = startOfWeek(first);
        for (var i = 0; i < 42; i++) dates.push(new Date(start.getFullYear(), start.getMonth(), start.getDate() + i));
      } else {
        var ws = startOfWeek(cursor);
        var we = new Date(ws.getFullYear(), ws.getMonth(), ws.getDate() + 6);
        label = (ws.getMonth() + 1) + '/' + ws.getDate() + ' – ' + (we.getMonth() + 1) + '/' + we.getDate();
        for (var j = 0; j < 7; j++) dates.push(new Date(ws.getFullYear(), ws.getMonth(), ws.getDate() + j));
      }

      root.appendChild(h('div', { class: 'tl-calendar__nav' }, [
        h('button', { class: 'tl-calendar__navbtn', text: '‹', title: '上一' + (view === 'month' ? '月' : '周'), onClick: function () { step(-1); } }),
        h('span', { class: 'tl-calendar__label', text: label }),
        h('button', { class: 'tl-calendar__navbtn', text: '›', title: '下一' + (view === 'month' ? '月' : '周'), onClick: function () { step(1); } }),
        h('button', { class: 'tl-calendar__today', text: '今天', onClick: function () {
          cursor = view === 'month' ? { y: now.getFullYear(), m: now.getMonth() } : new Date();
          build();
        } })
      ]));

      var head = h('div', { class: 'tl-calendar__head' });
      weekdayLabels().forEach(function (w) { head.appendChild(h('span', { class: 'tl-calendar__wd', text: w })); });
      root.appendChild(head);

      var grid = h('div', { class: 'tl-calendar__grid' });
      dates.forEach(function (d) {
        var key = keyOf(d);
        var muted = view === 'month' && d.getMonth() !== cursor.m;
        var cls = 'tl-calendar__cell' + (muted ? ' is-muted' : '') + (key === todayKey ? ' is-today' : '') + (opts.selected === key ? ' is-selected' : '');
        if (opts.cellClass) cls += ' ' + opts.cellClass(key, d);
        var children = [h('span', { class: 'tl-calendar__day', text: String(d.getDate()) })];
        if (opts.cellContent) {
          var extra = opts.cellContent(key, d);
          if (extra) children.push(h('div', { class: 'tl-calendar__body' }, [extra]));
        }
        var cell = h('div', { class: cls }, children);
        if (opts.onSelect && (!opts.cellClickable || opts.cellClickable(key, d))) {
          cell.addEventListener('click', function () { opts.onSelect(key, d); });
        }
        grid.appendChild(cell);
      });
      root.appendChild(grid);
    }

    build();
    return root;
  }

  /* ------------------------------ 全局底部状态栏（云端连接实时状态） ------------------------------ */

  /** 将 TL.Sync / TL.Deploy / TL.Vercel 内部状态映射为底部状态栏的 sb 属性值 */
  function mapSyncState(s) {
    if (!navigator.onLine) return 'offline';
    var phase = s.phase || 'idle';
    var status = s.status;
    if (phase === 'syncing' || status === 'syncing') return 'syncing';
    if (status === 'pending' || phase === 'pending') return 'syncing';   /* 待同步也显示"正在同步"态 */
    if (status === 'error' || phase === 'failed') return 'error';
    if (status === 'offline') return 'offline';
    if (!TL.GitHub.configured() || status === 'unconfigured') return 'disconnected';
    /* synced / idle → 已连接 */
    return 'connected';
  }

  function syncText(s) {
    var sb = mapSyncState(s);
    var TEXT = {
      connected:  '已连接云端·自动同步',
      syncing:   '正在同步至GitHub',
      error:     '同步失败',
      offline:   '离线模式',
      disconnected: '未连接云端·仅本地'
    };
    return TEXT[sb] || '未连接云端·仅本地';
  }

  function mapDeployState(s) {
    if (!navigator.onLine) return 'offline';
    if (s.status === 'synced' || s.status === 'ready') return 'ready';
    if (s.status === 'syncing' || s.status === 'pushing') return 'pushing';
    if (s.status === 'error') return 'error';
    /* idle / unconfigured → 待部署 */
    return 'pending-deploy';
  }

  function deployText(s) {
    var sb = mapDeployState(s);
    var TEXT = {
      ready:         '代码·已就绪',
      pushing:        '代码·推送中',
      error:         '代码·部署失败',
      'pending-deploy': '代码·待部署',
      offline:       '离线模式'
    };
    return TEXT[sb] || '代码·待部署';
  }

  function mapVercelState(s) {
    if (!navigator.onLine) return 'offline';
    if (s.status === 'ready') return 'ready';
    if (s.status === 'building') return 'building';
    if (s.status === 'checking') return 'checking';
    if (s.status === 'unlinked' || s.status === 'idle' || s.status === 'error' || !TL.Vercel.configured()) return 'unlinked';
    return 'ready';
  }

  function vercelText(s) {
    var sb = mapVercelState(s);
    var TEXT = {
      ready:     'Vercel·已连通',
      building:  'Vercel·构建中',
      checking:  'Vercel·查询中',
      unlinked:  'Vercel·未连接',
      offline:   '离线模式'
    };
    return TEXT[sb] || 'Vercel·未连接';
  }

  /** 刷新单个 pill 的视觉状态（data-sb + 文字 + title 悬浮提示） */
  function refreshPill(pill, sb, text, detailTitle) {
    if (!pill) return;
    pill.setAttribute('data-sb', sb);
    var dot = pill.querySelector('.tl-statusbar__dot');
    var txt = pill.querySelector('.tl-statusbar__text');
    if (txt) txt.textContent = text;
    pill.title = detailTitle || text;
  }

  /** 底部状态栏详情弹窗 */
  function showStatusDetail(title, stateObj, extraRows) {
    var rows = [];
    rows.push(kv('当前状态', stateObj.message || '—'));
    if (stateObj.lastPushAt) rows.push(kv('最近推送', fmtTime(stateObj.lastPushAt)));
    if (stateObj.lastPullAt) rows.push(kv('最近拉取', fmtTime(stateObj.lastPullAt)));
    if (stateObj.url) rows.push(kv('线上地址', stateObj.url));
    if (stateObj.lastError) rows.push(kv('最近错误', stateObj.lastError));
    if (stateObj.status === 'offline' || !navigator.onLine) {
      rows.push(h('div', { class: 'tl-note', text: '当前网络不可用，所有云端功能暂停，数据正常读写本地缓存。' }));
    }
    (extraRows || []).forEach(function (r) { rows.push(r); });
    modal({ title: title, content: h('div', {}, rows), actions: [{ label: '关闭', type: 'ghost', onClick: function (m) { m.close(); } }] });
  }

  function mountStatusbar() {
    // 防止重复挂载
    if ($('#tl-statusbar')) return;

    document.body.classList.add('has-statusbar');

    // ---- 构建 DOM ----
    var bar = h('div', { id: 'tl-statusbar', class: 'tl-statusbar' }, [
      /* ① 云端同步（GitHub） */
      h('button', { class: 'tl-statusbar__pill', id: 'sb-sync', type: 'button', onClick: function () {
        showStatusDetail('云端同步详情', TL.Sync.state(), [
          kv('同步阶段', (TL.Sync.state().phase || 'idle').toUpperCase()),
          h('div', { class: 'tl-inline-form', style: 'margin-top:12px' }, [
            h('button', { class: 'tl-btn tl-btn--primary tl-btn--sm', text: '立即同步', onClick: function () {
              if (TL.GitHub.configured()) { TL.Sync.syncNow().catch(function () {}); }
            }})
          ])
        ]);
      }}, [
        h('i', { class: 'tl-statusbar__dot' }),
        h('span', { class: 'tl-statusbar__text', text: '检测中…' })
      ]),
      /* ② 代码部署状态 */
      h('button', { class: 'tl-statusbar__pill', id: 'sb-deploy', type: 'button', onClick: function () {
        showStatusDetail('代码部署详情', TL.Deploy.state(), [
          kv('代码仓库', (TL.Store.settings().codeRepo || TL.Store.settings().repo) || '—'),
          h('div', { class: 'tl-inline-form', style: 'margin-top:12px' }, [
            h('button', { class: 'tl-btn tl-btn--primary tl-btn--sm', text: '推送代码', onClick: function () {
              TL.Deploy.pushCode().catch(function () {});
            }})
          ])
        ]);
      }}, [
        h('i', { class: 'tl-statusbar__dot' }),
        h('span', { class: 'tl-statusbar__text', text: '检测中…' })
      ]),
      /* ③ Vercel 连通状态 */
      h('button', { class: 'tl-statusbar__pill', id: 'sb-vercel', type: 'button', onClick: function () {
        var vs = TL.Vercel.state();
        showStatusDetail('Vercel 部署详情', vs, [
          kv('项目 ID', vs.projectId || '未绑定'),
          kv('构建中', vs.building ? '是' : '否'),
          h('div', { class: 'tl-inline-form', style: 'margin-top:12px' }, [
            h('button', { class: 'tl-btn tl-btn--secondary tl-btn--sm', text: '刷新状态', onClick: function () {
              TL.Vercel.status().catch(function () {});
            }})
          ])
        ]);
      }}, [
        h('i', { class: 'tl-statusbar__dot' }),
        h('span', { class: 'tl-statusbar__text', text: '检测中…' })
      ]),
      /* ④ 明暗模式切换 */
      h('button', { class: 'tl-statusbar__btn', id: 'sb-theme', type: 'button', title: '切换明暗主题', onClick: cycleTheme, text: '◐' }),
      /* ⑤ 设置 */
      h('button', { class: 'tl-statusbar__btn', id: 'sb-settings', type: 'button', title: '工作台设置', onClick: openSettings, text: '⚙' })
    ]);

    document.body.appendChild(bar);

    var syncPill   = $('#sb-sync');
    var deployPill = $('#sb-deploy');
    var vercelPill = $('#sb-vercel');

    /** 统一刷新全部三个状态 pill */
    function refreshAll() {
      var ss = TL.Sync.state();
      var ds = TL.Deploy.state();
      var vs = TL.Vercel.state();

      var isOffline = !navigator.onLine;

      // 离线兜底：全部置灰
      if (isOffline) {
        refreshPill(syncPill,   'offline',   '离线模式',       '网络不可用，仅本地读写');
        refreshPill(deployPill, 'offline',   '离线模式',       '网络不可用，无法部署');
        refreshPill(vercelPill, 'offline',   '离线模式',       '网络不可用，无法连通');
        return;
      }

      refreshPill(syncPill,   mapSyncState(ss),   syncText(ss),   ss.message + (ss.lastError ? ('\n失败原因：' + ss.lastError) : ''));
      refreshPill(deployPill, mapDeployState(ds), deployText(ds), ds.message + (ds.lastError ? ('\n失败原因：' + ds.lastError) : ''));
      refreshPill(vercelPill, mapVercelState(vs), vercelText(vs), vs.message + (vs.lastError ? ('\n失败原因：' + vs.lastError) : '') + (vs.url ? ('\n线上地址：' + vs.url) : ''));

      // 同步主题按钮图标
      applyTheme();
    }

    // ---- 订阅各模块状态变化 ----
    TL.Sync.on(refreshAll);
    TL.Deploy.on(refreshAll);
    TL.Vercel.on(refreshAll);

    // ---- 网络状态监听 ----
    window.addEventListener('online', refreshAll);
    window.addEventListener('offline', refreshAll);

    // ---- 每 60 秒主动轮询刷新（确保状态不过期） ----
    var pollTimer = setInterval(function () {
      TL.Sync.refresh();
      // Vercel 也定期刷新一次
      if (TL.Vercel.configured()) TL.Vercel.status().catch(function () {});
    }, 60000);

    // ---- 首次渲染 ----
    refreshAll();

    // 页面卸载时清理定时器
    window.addEventListener('beforeunload', function () { clearInterval(pollTimer); });

    return { refresh: refreshAll, destroy: function () { clearInterval(pollTimer); bar.remove(); document.body.classList.remove('has-statusbar'); } };
  }

  TL.UI = {
    h: h, svg: svg, $: $, $$: $$, esc: esc, fmtTime: fmtTime,
    mountShell: mountShell,
    applyTheme: applyTheme,
    toast: toast,
    modal: modal,
    confirm: confirm,
    taskItem: taskItem,
    ring: ring,
    progress: progress,
    heatmap: heatmap,
    calendar: calendar,
    previewCard: previewCard,
    metric: metric,
    openSettings: openSettings,
    openHistory: openHistory,
    mountStatusbar: mountStatusbar
  };
})(window.TL);
