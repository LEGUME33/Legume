/* =====================================================================
   TEST-LEGUME · 复盘总结模板 / 自动运算 / 飞书文档生成（TL.Review）
   ---------------------------------------------------------------------
   三类首销复盘模板（day/week/month），结构对齐 O70C 首销小结、
   O70C 首销周复盘、P67 首销月复盘文档逻辑。

   填写规范（首销日/首销周/首销月通用）：
     · 仅人工手动填写：周期内总库存 / 总销售数据 / 分机型数量 / 销量
     · 流转销、用户画像、资源位落地：全部上传图片 → AI 自动识图生成
       · 资源位落地：AI 识别素材截图后自动填充 4×4 标准表格
       · 用户画像：AI 识图后直接嵌入表格展示，原图保留不压缩
   分类型图片：
     · 首销周：推广数据图 → 数据表；7 日经营图 → 7 日明细表
     · 首销月：N-1 代对比图 → 对比表；流量趋势图 → 原图保留 + 趋势文字
   所有数据经 TL.Store 落本地 + 30 秒延迟同步 GitHub；图片走 TL.Media
   压缩缓存 + 仓库二进制 + data/media.json 索引；AI 结论随记录同步。
   ===================================================================== */
window.TL = window.TL || {};

(function (TL) {
  'use strict';

  var TYPE_LABEL = { day: '首销日小结', week: '首销周复盘', month: '首销月复盘' };
  var TYPES = [
    { key: 'day', label: '首销日小结', hint: '适配 O70C 首销日小结' },
    { key: 'week', label: '首销周复盘', hint: '适配 O70C 首销周复盘' },
    { key: 'month', label: '首销月复盘', hint: '适配 P67 首销月复盘' }
  ];

  function num(v) { var n = parseFloat(v); return isFinite(n) ? n : 0; }

  /* 从已识别图片中取 AI 表格，便于自动运算复用（如 N-1 对比图 → 同比） */
  function imgTable(images, role) {
    var im = (images || []).filter(function (i) { return i.role === role; })[0];
    if (im && im.ai && typeof im.ai !== 'string' && im.ai.table) return im.ai.table;
    return null;
  }
  function tblVal(t, label, idx) {
    if (!t || !t.rows) return null;
    for (var i = 0; i < t.rows.length; i++) { if (String(t.rows[i][0]) === label) return t.rows[i][idx]; }
    return null;
  }

  /* 图片 role → 上传入口短名（用于编辑器按钮与 AI 提示） */
  var ROLE_UP = {
    flow: '流量/投放图',
    portrait: '用户画像图',
    resource: '资源位素材图',
    'week-promo': '推广数据图',
    'week-7day': '7 日经营图',
    'month-compare': 'N-1 对比图',
    'month-trend': '流量趋势图'
  };

  /* ------------------------------ 模板定义 ------------------------------ */
  // 通用基础信息（首销日/周/月 均复用）：仅 4 项人工填写 + 资源位落地 4×4 标准表格（AI 识别填充）
  // 流转销仅属首销日；用户画像为周/月通用图片区；其余图片区按类型专属拆分。
  var COMMON = {
    title: '基础信息（仅人工填写：周期内总库存 / 总销售数据 / 分机型数量 / 销量）',
    fields: [
      { id: 'totalStock', label: '周期内总库存', type: 'number', ph: '如 5000' },
      { id: 'totalSales', label: '总销售数据', type: 'number', ph: '如 3200' },
      { id: 'skus', label: '分机型数量（各机型 库存 / 销量）', type: 'sku' },
      { id: 'sales', label: '销量', type: 'number', ph: '如 2800' },
      { id: 'resource', label: '资源位落地情况（内置 4×4 标准表格，上传素材截图后 AI 自动填充，无需手填）', type: 'image' }
    ]
  };

  var TEMPLATES = {
    // 首销日小结：保留原有日复盘表单结构（4 手动项 + 流转销 + 用户画像 + 资源位）
    day: {
      label: TYPE_LABEL.day,
      blocks: [
        COMMON,
        {
          title: '首销日专属板块（图片 AI 自动识别，原图嵌入，无需手填）',
          fields: [
            { id: 'flow', label: '流转销情况分析（上传流量/投放/渠道截图，AI 自动识图，无需手填）', type: 'image' },
            { id: 'portrait', label: '用户画像分析（上传分层占比/年龄分布图，AI 自动识图并嵌入表格，原图留存不压缩）', type: 'image' }
          ]
        }
      ]
    },
    week: {
      label: TYPE_LABEL.week,
      blocks: [
        COMMON,
        {
          title: '首销周复盘专属板块（图片 AI 自动转表，原图嵌入）',
          fields: [
            { id: 'portrait', label: '用户画像分析（上传分层占比/年龄分布图，AI 自动识图并嵌入表格，原图留存不压缩）', type: 'image' },
            { id: 'week-promo', label: '首销周推广数据（上传推广图表，AI 自动提取全部字段生成数据表，原图嵌入）', type: 'image', embed: true },
            { id: 'week-7day', label: '7 日经营数据（上传截图：访客/浏览量/成交件数/成交金额/转化率，AI 自动生成 7 日明细表）', type: 'image' }
          ]
        }
      ]
    },
    month: {
      label: TYPE_LABEL.month,
      blocks: [
        COMMON,
        {
          title: '首销月复盘专属板块（图片 AI 自动转表，原图留存）',
          fields: [
            { id: 'portrait', label: '用户画像分析（上传分层占比/年龄分布图，AI 自动识图并嵌入表格，原图留存不压缩）', type: 'image' },
            { id: 'month-compare', label: 'N-1 代机型对比图（上传对比图，AI 自动识别两代流量/销量/转化并生成对比表，原图嵌入）', type: 'image', embed: true },
            { id: 'month-trend', label: '流量整体趋势图（原图完整保留嵌入文档，AI 仅提取趋势文字总结，不做表格转换）', type: 'image', embed: true }
          ]
        }
      ]
    }
  };

  /* ------------------------------ 自动运算 ------------------------------ */
  function calc(review) {
    var r = review || {};
    var skus = Array.isArray(r.skus) ? r.skus : [];
    var totalStock = 0, totalSold = 0, lowSkus = [];
    var perSku = skus.map(function (s) {
      var stock = num(s.stock), sold = num(s.sold);
      totalStock += stock; totalSold += sold;
      var rate = stock > 0 ? sold / stock : 0;
      if (rate < 0.45) lowSkus.push(s.sku || '未命名');
      return { sku: s.sku || '未命名', stock: stock, sold: sold, rate: rate };
    });
    var sellThrough = totalStock > 0 ? totalSold / totalStock : 0;

    var f = r.fields || {};
    // 同比优先取自 N-1 对比图 AI 表格（首销月专属）；无图时回退到手动字段
    var ny = num(f.yoyNew), py = num(f.yoyPrev);
    var compT = imgTable(r.images, 'month-compare');
    if (compT) {
      var nDeal = tblVal(compT, '成交件数', 1), pDeal = tblVal(compT, '成交件数', 2);
      if (nDeal != null) ny = num(nDeal);
      if (pDeal != null) py = num(pDeal);
    }
    var yoy = { n: ny, p: py, diff: ny - py, diffPct: py > 0 ? Math.round((ny - py) / py * 100) : null };

    return {
      totalStock: totalStock, totalSold: totalSold, sellThrough: sellThrough,
      perSku: perSku, lowSkus: lowSkus, yoy: yoy
    };
  }

  /* ------------------------------ 飞书文档排版 ------------------------------ */
  // 表格转 Markdown（飞书文档粘贴可直接渲染为规整表格）
  function tableToMd(table) {
    var lines = [];
    if (table && table.head) lines.push('| ' + table.head.join(' | ') + ' |');
    if (table && table.head) lines.push('| ' + table.head.map(function () { return '---'; }).join(' | ') + ' |');
    (table && table.rows || []).forEach(function (row) {
      lines.push('| ' + row.map(function (c) { return String(c == null ? '' : c); }).join(' | ') + ' |');
    });
    return lines;
  }

  function aiOf(img) {
    if (!img || !img.ai) return { text: '', table: null };
    if (typeof img.ai === 'string') return { text: img.ai, table: null };
    return { text: img.ai.text || '', table: img.ai.table || null };
  }
  function forbidCell(c) {
    if (typeof c !== 'string') return c;
    return (TL.AI && TL.AI.forbid) ? TL.AI.forbid(c) : c;
  }

  function buildFeishu(review) {
    var r = review || {};
    var f = r.fields || {};
    var c = r.calc || calc(r);
    var lines = [];
    lines.push('# 【首销复盘】' + (TYPE_LABEL[r.type] || '复盘') + (r.title ? ' · ' + r.title : ''));
    lines.push('');
    lines.push('> 类型：' + (TYPE_LABEL[r.type] || '—') + '　|　生成时间：' + TL.UI.fmtTime(Date.now()) + (r.aiReport ? '　|　含 AI 综合分析' : ''));
    lines.push('');

    TEMPLATES[r.type].blocks.forEach(function (block) {
      lines.push('## ' + block.title);
      block.fields.forEach(function (field) {
        if (field.type === 'sku') {
          lines.push('**' + field.label + '**');
          if (r.skus && r.skus.length) {
            r.skus.forEach(function (s) {
              lines.push('- ' + (s.sku || '未命名') + '：库存 ' + num(s.stock) + ' / 已售 ' + num(s.sold));
            });
          } else lines.push('（未录入）');
          return;
        }
        if (field.type === 'image') {
          var role = field.id;
          var embedOriginal = !!field.embed;
          var imgs = (r.images || []).filter(function (i) { return i.role === role; });
          lines.push('**' + field.label + '**');
          if (!imgs.length) { lines.push('（未上传图片）'); return; }
          imgs.forEach(function (i) {
            var a = aiOf(i);
            lines.push('- 图片《' + (i.name || '未命名') + '》');
            // 通过图片上传接口存储的线上地址直接嵌入原图（飞书随复盘文档同步导出）
            if (i.onlineUrl) lines.push('  ![原图](' + i.onlineUrl + ')');
            if (embedOriginal) lines.push('  > 原图已嵌入本文档（线上地址：' + (i.onlineUrl || '本地缓存') + '，完整保留不压缩）');
            if (a.table) {
              lines.push('  **AI 自动生成表格：**');
              lines.push('  | ' + a.table.head.map(forbidCell).join(' | ') + ' |');
              lines.push('  | ' + a.table.head.map(function () { return '---'; }).join(' | ') + ' |');
              a.table.rows.forEach(function (row) { lines.push('  | ' + row.map(forbidCell).join(' | ') + ' |'); });
            }
            if (a.text) {
              lines.push('  **AI 解析结论：**');
              forbidCell(a.text).split('\n').forEach(function (ln) { if (ln.trim()) lines.push('  ' + ln); });
            }
          });
          return;
        }
        if (field.type === 'auto') {
          lines.push('**' + field.label + '**');
          if (field.calc === 'monthly') lines.push('- 月度总销量：' + c.totalSold + '　整体动销率：' + Math.round(c.sellThrough * 100) + '%');
          else if (field.calc === 'sku') {
            if (c.perSku.length) c.perSku.forEach(function (s) { lines.push('- ' + s.sku + '：动销率 ' + Math.round(s.rate * 100) + '%（库存 ' + s.stock + ' / 已售 ' + s.sold + '）'); });
            else lines.push('（未录入分库存）');
          } else if (field.calc === 'yoy') {
            lines.push('- 新机：' + c.yoy.n + '　上代：' + c.yoy.p + '　差值：' + (c.yoy.diff >= 0 ? '+' : '') + c.yoy.diff + (c.yoy.diffPct != null ? ('（' + (c.yoy.diffPct >= 0 ? '+' : '') + c.yoy.diffPct + '%）') : ''));
          }
          return;
        }
        var v = f[field.id];
        lines.push('**' + field.label + '**');
        lines.push(v ? String(v) : '（未填写）');
      });
      lines.push('');
    });

    if (r.aiReport) {
      lines.push('## AI 综合业务分析');
      var rep = r.aiReport;
      pushModule(lines, '做得好亮点', rep.highlights);
      pushModule(lines, '现存短板', rep.shortcomings);
      pushModule(lines, '中长期落地规划', rep.plans);
      (rep.extras || []).forEach(function (ex) { pushModule(lines, ex.title, ex.items); });
      lines.push('');
    }
    return lines.join('\n');
  }

  function pushModule(lines, title, items) {
    lines.push('**' + title + '**');
    (items && items.length ? items : ['（无）']).forEach(function (x) { lines.push('- ' + x); });
  }

  function summaryOf(review) {
    var t = TYPE_LABEL[review.type] || '复盘';
    return (review.title ? (t + '：' + review.title) : t);
  }

  TL.Review = {
    TYPES: TYPES,
    TYPE_LABEL: TYPE_LABEL,
    ROLE_UP: ROLE_UP,
    template: function (type) { return TEMPLATES[type] || TEMPLATES.day; },
    calc: calc,
    buildFeishu: buildFeishu,
    summaryOf: summaryOf,
    num: num
  };
})(window.TL);
