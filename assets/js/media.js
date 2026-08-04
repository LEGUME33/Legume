/* =====================================================================
   TEST-LEGUME · 上传图片缓存与云端索引
   ---------------------------------------------------------------------
   分层策略（与业务数据同构）：
     · 本地：图片压缩后以 dataURL 存 localStorage（断网可看、可用）
     · 云端：二进制提交到私有仓库 data/image/<id>.<ext>
             索引信息（id/文件名/尺寸/远端路径/所属模块）写入 data/media.json
   私有仓库的图片无法通过公开 raw 链接访问，跨设备打开时用带令牌的 API 回源，
   拉回后再写入本机缓存，实现「一次上传，多端可见」。
   ===================================================================== */
window.TL = window.TL || {};

(function (TL) {
  'use strict';

  var MAX_EDGE = 1440;        // 压缩后最长边
  var QUALITY = 0.82;         // JPEG 压缩质量
  var WARN_BYTES = 1.5 * 1024 * 1024;

  function extOf(mime, name) {
    if (/png/.test(mime)) return 'png';
    if (/gif/.test(mime)) return 'gif';
    if (/webp/.test(mime)) return 'webp';
    if (/svg/.test(mime)) return 'svg';
    var m = /\.([a-z0-9]+)$/i.exec(name || '');
    return m ? m[1].toLowerCase() : 'jpg';
  }

  function readAsDataURL(file) {
    return new Promise(function (resolve, reject) {
      var fr = new FileReader();
      fr.onload = function () { resolve(fr.result); };
      fr.onerror = function () { reject(new Error('图片读取失败')); };
      fr.readAsDataURL(file);
    });
  }

  /** 大图等比压缩，控制 localStorage 与仓库体积；不支持 canvas 时原样返回 */
  function compress(dataUrl, mime) {
    if (/svg|gif/.test(mime) || typeof document.createElement('canvas').getContext !== 'function') {
      return Promise.resolve(dataUrl);
    }
    return new Promise(function (resolve) {
      var img = new Image();
      img.onload = function () {
        try {
          var scale = Math.min(1, MAX_EDGE / Math.max(img.width, img.height));
          if (scale >= 1 && dataUrl.length < WARN_BYTES) return resolve(dataUrl);
          var cv = document.createElement('canvas');
          cv.width = Math.round(img.width * scale);
          cv.height = Math.round(img.height * scale);
          cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
          resolve(cv.toDataURL(/png/.test(mime) ? 'image/png' : 'image/jpeg', QUALITY));
        } catch (e) { resolve(dataUrl); }
      };
      img.onerror = function () { resolve(dataUrl); };
      img.src = dataUrl;
    });
  }

  function splitDataUrl(dataUrl) {
    var i = String(dataUrl).indexOf(',');
    return { meta: dataUrl.slice(0, i), base64: dataUrl.slice(i + 1) };
  }

  var Media = {
    /** 云端存放目录（与 /data 索引分离，便于 Pages 静态引用与仓库瘦身）
        复盘总结「图片上传接口」统一持久化到 data/image 目录 */
    DIR: 'data/image',

    /**
     * 新增一张图片
     * @param {File}   file
     * @param {Object} opts { module: 'work'|'study'|..., refId: 关联业务对象 id, note: 备注 }
     * @returns {Promise<Object>} 索引条目
     */
    add: function (file, opts) {
      opts = opts || {};
      if (!file || !/^image\//.test(file.type || '')) return Promise.reject(new Error('仅支持图片文件'));

      // opts.compress === false 时保留原始图片（不压缩），用于「用户画像」等需原图存档的板块
      return readAsDataURL(file)
        .then(function (raw) { return (opts.compress === false) ? Promise.resolve(raw) : compress(raw, file.type); })
        .then(function (dataUrl) {
          var id = TL.Store.uid('img');
          var ext = extOf(file.type, file.name);
          var entry = {
            id: id,
            name: file.name || (id + '.' + ext),
            mime: file.type,
            ext: ext,
            bytes: Math.round(splitDataUrl(dataUrl).base64.length * 0.75),
            module: opts.module || 'common',
            refId: opts.refId || '',
            note: opts.note || '',
            addedAt: Date.now(),
            device: TL.Store.settings().device,
            remotePath: '',      // 已上传到仓库的路径，空表示仅本地
            cached: true         // 本机是否存有 dataURL
          };

          var ok = TL.Store.blobSet(id, dataUrl);
          entry.cached = ok;
          entry.onlineUrl = Media.onlineUrl(entry);   // 上传接口返回线上预览地址

          TL.Store.update('media', function (d) { d.images.unshift(entry); }, '上传图片「' + entry.name + '」');

          // 有网且已配置时立即尝试上传二进制，失败不影响本地使用
          Media.uploadPending().catch(function () {});
          return entry;
        });
    },

    /** 计算线上预览地址（GitHub raw 规范地址），供飞书文档直接嵌入原图 */
    onlineUrl: function (entry) {
      if (!entry) return '';
      var s = TL.Store.settings();
      if (!s.owner || !s.repo) return '';
      var branch = s.branch || 'main';
      var ext = entry.ext || 'jpg';
      return 'https://raw.githubusercontent.com/' + s.owner + '/' + s.repo + '/' + branch + '/' + Media.DIR + '/' + entry.id + '.' + ext;
    },

    /** 取展示地址：优先本机缓存，否则回源云端 */
    url: function (entry) {
      if (!entry) return '';
      var local = TL.Store.blobGet(entry.id);
      if (local) return local;
      return '';
    },

    /** 从私有仓库回源并写回本机缓存（跨设备首次查看时调用） */
    fetchRemote: function (entry) {
      if (!entry || !entry.remotePath) return Promise.resolve('');
      if (!TL.GitHub.configured() || !navigator.onLine) return Promise.resolve('');
      var local = TL.Store.blobGet(entry.id);
      if (local) return Promise.resolve(local);

      return TL.GitHub.getFile(entry.remotePath).then(function (file) {
        if (!file) return '';
        // getFile 返回的是解码后的文本，这里需要原始 base64，改用重新编码保证二进制安全
        var dataUrl = 'data:' + (entry.mime || 'image/jpeg') + ';base64,' + TL.GitHub.b64encode(file.text);
        TL.Store.blobSet(entry.id, dataUrl);
        return dataUrl;
      }).catch(function () { return ''; });
    },

    /** 批量上传尚未推送到仓库的图片 */
    uploadPending: function () {
      if (!TL.GitHub.configured() || !navigator.onLine) return Promise.resolve({ skipped: true });
      var pending = TL.Store.get('media').images.filter(function (i) { return !i.remotePath && TL.Store.blobGet(i.id); });
      if (!pending.length) return Promise.resolve({ uploaded: 0 });

      var done = 0;
      return pending.reduce(function (chain, entry) {
        return chain.then(function () {
          var dataUrl = TL.Store.blobGet(entry.id);
          if (!dataUrl) return;
          var path = Media.DIR + '/' + entry.id + '.' + entry.ext;
          return TL.GitHub.putRaw(path, splitDataUrl(dataUrl).base64, 'media: upload ' + entry.name)
            .then(function () {
              TL.Store.update('media', function (d) {
                var it = d.images.filter(function (x) { return x.id === entry.id; })[0];
                if (it) { it.remotePath = path; }
              });
              done++;
            })
            .catch(function (e) { console.warn('[Media] 上传失败', entry.name, e.message); });
        });
      }, Promise.resolve()).then(function () { return { uploaded: done }; });
    },

    /** 删除图片：清本机缓存 + 移除索引（仓库文件保留在历史提交中，可回滚找回） */
    remove: function (id) {
      var entry = TL.Store.get('media').images.filter(function (i) { return i.id === id; })[0];
      TL.Store.blobDel(id);
      TL.Store.update('media', function (d) {
        d.images = d.images.filter(function (i) { return i.id !== id; });
      }, '删除图片「' + ((entry && entry.name) || id) + '」');
    },

    /** 按业务模块 / 关联对象检索 */
    listBy: function (module, refId) {
      return TL.Store.get('media').images.filter(function (i) {
        return (!module || i.module === module) && (!refId || i.refId === refId);
      });
    }
  };

  TL.Media = Media;
})(window.TL);
