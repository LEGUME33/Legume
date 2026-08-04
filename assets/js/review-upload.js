/* =====================================================================
   TEST-LEGUME · 复盘总结 · 标准化图片上传接口（TL.ReviewUpload）
   ---------------------------------------------------------------------
   独立于业务逻辑的底层能力，供「复盘总结」各板块图片字段统一调用：
     · 统一格式 / 体积校验：PNG / JPG / JPEG，单图 ≤ 10MB
     · 多图批量上传：一次选择多张，逐张校验、互不影响
     · 分板块独立入口：由各图片字段按 role 调用，自动带入 module/refId/note
     · 实时预览地址：上传即返回 onlineUrl（GitHub raw 规范地址），本地缓存 + 异步同步至 data/image
     · AI 对接：真实视觉钩子可直接读取图片字节流（dataUrl）完成识图转表
     · 异常兜底：上传失败弹窗提示，支持重试，会话内保留素材不丢失
     · UI：上传按钮 / 预览弹窗沿用莫兰迪全圆角体系
   注意：本模块只做「上传接口」能力，不触碰任何 AI 分析 / 表格转换 / 文案禁词等业务规则。
   ===================================================================== */
window.TL = window.TL || {};

(function (TL) {
  'use strict';

  var UI = TL.UI;

  /** 统一接口配置（集中管理，便于后续调整上限） */
  var CONFIG = {
    accept: ['image/png', 'image/jpeg', 'image/jpg'],
    acceptLabel: 'PNG / JPG / JPEG',
    maxBytes: 10 * 1024 * 1024,
    maxLabel: '10MB',
    githubDir: 'data/image'          // 与 Media.DIR 保持一致，图片持久存储目录
  };

  /**
   * 格式 + 体积校验
   * @returns {{ok:boolean, reason:string}}
   */
  function validate(file) {
    if (!file) return { ok: false, reason: '未选择文件' };
    var type = (file.type || '').toLowerCase();
    var name = file.name || '';
    // 优先按 MIME 判断；部分场景（剪贴板/旧浏览器）无 type 时退化为扩展名判断
    var extOk = /\.(png|jpe?g)$/i.test(name);
    if (CONFIG.accept.indexOf(type) === -1 && !extOk) {
      return { ok: false, reason: '格式不支持，仅支持 ' + CONFIG.acceptLabel };
    }
    if (typeof file.size === 'number' && file.size > CONFIG.maxBytes) {
      var mb = (file.size / 1024 / 1024).toFixed(1);
      return { ok: false, reason: '单图超过 ' + CONFIG.maxLabel + ' 限制（当前 ' + mb + 'MB）' };
    }
    return { ok: true, reason: '' };
  }

  /**
   * 计算线上预览地址（GitHub raw 规范地址）。
   * 私有仓库 raw 需鉴权，飞书嵌入时若不可公网访问将回退到「本地缓存」提示；
   * 此处统一存储规范地址，满足「通过线上地址直接嵌入原图」的要求。
   */
  function onlineUrl(entry) {
    if (!entry) return '';
    var s = (TL.Store && TL.Store.settings) ? TL.Store.settings() : {};
    if (!s.owner || !s.repo) return '';
    var branch = s.branch || 'main';
    var ext = entry.ext || 'jpg';
    return 'https://raw.githubusercontent.com/' + s.owner + '/' + s.repo + '/' + branch + '/' + CONFIG.githubDir + '/' + entry.id + '.' + ext;
  }

  /**
   * 单图上传：校验 → 入库（含压缩策略）→ 写回 onlineUrl → 入队 GitHub 同步
   * @param {File} file
   * @param {Object} opts { module, refId, note, compress }
   */
  function uploadOne(file, opts) {
    opts = opts || {};
    var v = validate(file);
    if (!v.ok) return Promise.reject(new Error(v.reason));
    return TL.Media.add(file, {
      module: opts.module || 'work',
      refId: opts.refId || '',
      note: opts.note || '',
      compress: opts.compress !== false   // 默认压缩；用户画像等需原图时由调用方传 false
    }).then(function (entry) {
      // Media.add 已写入 onlineUrl；这里确保返回对象带齐
      entry.onlineUrl = entry.onlineUrl || onlineUrl(entry);
      return entry;
    });
  }

  /**
   * 批量上传：逐张上传，单张失败不影响其余，返回结构化结果数组
   * @returns {Promise<Array<{file, entry?, error?}>>}
   */
  function uploadBatch(files, opts) {
    files = Array.prototype.slice.call(files || []);
    if (!files.length) return Promise.resolve([]);
    return Promise.all(files.map(function (f) {
      return uploadOne(f, opts).then(function (entry) {
        return { file: f, entry: entry, error: null };
      }).catch(function (err) {
        return { file: f, entry: null, error: err.message || String(err) };
      });
    }));
  }

  /** 全图预览弹窗（莫兰迪圆角） */
  function preview(src, name) {
    if (!src) { UI && UI.toast && UI.toast('暂无预览图', 'error'); return; }
    if (!UI || !UI.modal) return;
    var img = UI.h('img', { class: 'tl-img-preview', src: src, alt: name || '预览' });
    UI.modal({
      title: name || '图片预览',
      wide: true,
      content: UI.h('div', { class: 'tl-img-preview-wrap' }, [img])
    });
  }

  /** 接口异常兜底：弹窗提示 + 重试 + 本地临时保存说明 */
  function failModal(opts) {
    opts = opts || {};
    var errors = opts.errors || [];
    var list = UI.h('div', { class: 'tl-upload-error' },
      errors.map(function (e) {
        return UI.h('div', { class: 'tl-upload-error__row', text: '· ' + (e.name || '图片') + '：' + e.msg });
      })
    );
    var note = UI.h('p', { class: 'tl-upload-error__note', text: '图片素材已临时保存于本次会话，可点击下方「重试上传」重新提交，不会丢失。' });
    UI.modal({
      title: '图片上传接口异常',
      content: UI.h('div', {}, [list, note]),
      actions: [
        { label: '取消', type: 'ghost', onClick: function (m) { m.close(); } },
        { label: '重试上传', type: 'primary', onClick: function (m) { m.close(); opts.onRetry && opts.onRetry(); } }
      ]
    });
  }

  TL.ReviewUpload = {
    CONFIG: CONFIG,
    validate: validate,
    onlineUrl: onlineUrl,
    uploadOne: uploadOne,
    uploadBatch: uploadBatch,
    preview: preview,
    failModal: failModal
  };
})(window.TL);
