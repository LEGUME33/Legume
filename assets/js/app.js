/* =====================================================================
   TEST-LEGUME · 应用引导（所有页面共用的启动流程）
   ---------------------------------------------------------------------
   页面脚本注册约定：
       TL.pages['<body data-page 的值>'] = { init: fn, render: fn }
     · init()   仅执行一次：挂载 DOM、绑定事件
     · render() 可重复执行：本地修改、云端拉取、回滚后都会自动调用
   新增页面 = 新建 html（引入同一套脚本）+ 新建 pages/<key>.js，无需改动本文件。
   ===================================================================== */
window.TL = window.TL || {};
window.TL.pages = window.TL.pages || {};

(function (TL) {
  'use strict';

  function boot() {
    var key = document.body.getAttribute('data-page') || 'overview';

    /* ① 本地兜底层就绪（断网也能到这一步） */
    TL.Store.init();

    /* ② 全站外壳：顶栏 + 常驻同步指示器 + 三大导航 */
    TL.UI.mountShell(key);

    /* ②-b 移动端：输入框/文本域聚焦时滚动到可视区中部，避免软键盘遮挡 */
    document.addEventListener('focusin', function (e) {
      var t = e.target;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) {
        setTimeout(function () { try { t.scrollIntoView({ block: 'center', behavior: 'smooth' }); } catch (err) {} }, 300);
      }
    });

    /* ③ 当前页面 */
    var page = TL.pages[key];
    if (page && page.init) {
      try { page.init(); }
      catch (e) { console.error('[App] 页面初始化失败', key, e); TL.UI.toast('页面初始化异常：' + e.message, 'error', 4200); }
    }

    TL.refreshPage = function () { if (page && page.render) page.render(); };

    /* ④ 数据变化（本地修改 / 云端拉取 / 回滚）→ 重绘当前页 */
    TL.Store.on(function (evt) {
      if (evt === 'change' && page && page.render) {
        try { page.render(); } catch (e) { console.error('[App] 渲染失败', e); }
      }
    });

    /* ⑤ 启动同步引擎：按双模式开关选择 GitHub 引擎或云端数据库引擎 */
    function startSyncLayer() {
      TL.getSync().init();
      if (TL.Deploy && TL.Deploy.init) TL.Deploy.init();
      if (TL.Vercel && TL.Vercel.init) TL.Vercel.init();
      if (TL.UI.mountStatusbar) TL.UI.mountStatusbar();
    }

    var mode = (TL.Store.settings() && TL.Store.settings().syncMode) || 'github';
    if (mode === 'cloud') {
      TL.Auth.restore();
      if (!TL.Auth.configured()) {
        // 未登录：优先弹出登录网关，阻塞交互直至登录或切回 GitHub 模式
        TL.Auth.showGate(function () { startSyncLayer(); }, function () {
          TL.Store.saveSettings({ syncMode: 'github' });
          location.reload();
        });
      } else {
        startSyncLayer();
      }
    } else {
      startSyncLayer();
    }

    /* ⑥ 快捷键：Ctrl/Cmd + S 立即同步 */
    document.addEventListener('keydown', function (e) {
      if ((e.ctrlKey || e.metaKey) && String(e.key).toLowerCase() === 's') {
        e.preventDefault();
        var m = (TL.Store.settings() && TL.Store.settings().syncMode) || 'github';
        if (m === 'cloud') {
          if (!TL.Auth.configured()) return TL.UI.toast('请先登录云端账户', 'warn');
        } else if (!TL.GitHub.configured()) {
          return TL.UI.toast('尚未配置云端同步', 'warn');
        }
        TL.UI.toast('同步中…');
        TL.getSync().syncNow()
          .then(function () { TL.UI.toast('同步完成', 'success'); })
          .catch(function (err) { TL.UI.toast('同步失败：' + err.message, 'error', 4200); });
      }
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})(window.TL);
