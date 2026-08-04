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

    /* ⑤ 启动同步引擎：自动拉取云端最新数据并与本地合并 */
    TL.Sync.init();

    /* ⑤-b 启动部署层：初始化代码仓库状态 + Vercel 部署状态查询 */
    if (TL.Deploy && TL.Deploy.init) TL.Deploy.init();
    if (TL.Vercel && TL.Vercel.init) TL.Vercel.init();

    /* ⑥ 快捷键：Ctrl/Cmd + S 立即同步 */
    document.addEventListener('keydown', function (e) {
      if ((e.ctrlKey || e.metaKey) && String(e.key).toLowerCase() === 's') {
        e.preventDefault();
        if (!TL.GitHub.configured()) return TL.UI.toast('尚未配置云端同步', 'warn');
        TL.UI.toast('同步中…');
        TL.Sync.syncNow()
          .then(function () { TL.UI.toast('同步完成', 'success'); })
          .catch(function (err) { TL.UI.toast('同步失败：' + err.message, 'error', 4200); });
      }
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})(window.TL);
