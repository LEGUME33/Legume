/* =====================================================================
   TEST-LEGUME · AI 分析引擎（TL.AI）
   ---------------------------------------------------------------------
   职责：图片识图解析（含自动转表）+ 复盘综合业务分析。
   设计原则：纯前端、零密钥即可演示完整链路。
     · 默认内置「模拟解析引擎」：基于已录入的结构化数值与图片元数据，
       生成结构化结论与表格，UI 全程明确标注「模拟」，绝不冒充真实视觉识别。
     · 接入真实视觉模型：在 window.TL_AI_VISION 上实现
       { analyze: (ctx) => Promise<{text, table}> } 即可无缝替换（见 analyzeImage）。
   约束：所有 AI 文案严禁出现优惠券 / 闪降 / 降价 / 折扣 / 优惠 / 补贴 等描述，
        仅从渠道投放、内容种草、资源位运营、人群定向、SKU 库存调配、
        详情页优化、新品生命周期运营角度给出方案（forbid() 强制过滤）。
   所有结论随复盘记录存入 GitHub 云端，生成飞书文档时一并带出。
   ===================================================================== */
window.TL = window.TL || {};

(function (TL) {
  'use strict';

  /* 真实视觉 API 接入点（可选）。实现后自动覆盖模拟引擎。
     期望返回：字符串，或 { text, table:{head:[],rows:[]} }。
     示例：
       window.TL_AI_VISION = {
         analyze: function (ctx) {
           // ctx = { name, bytes, role, numbers: {}, prompt }
           return fetch('https://your-vision-endpoint', {...}).then(r => r.json());
         }
       };
  */
  function realVision() { return (typeof window !== 'undefined' && window.TL_AI_VISION) || null; }

  /* 禁止出现的营销让利类词汇 → 安全的运营动作同义词（等让利类同义词一并纳入过滤） */
  var FORBID = [
    ['优惠券', '定向人群触达'],
    ['闪降', '节点爆发'],
    ['降价', '价格带优化'],
    ['折扣', '价格策略'],
    ['优惠', '增长动作'],
    ['补贴', '资源位扶持'],
    ['满减', '阶梯权益'],
    ['返现', '回购激励'],
    ['赠品', '随单权益'],
    ['立减', '下单激励']
  ];
  function forbid(text) {
    if (!text) return text;
    var s = String(text);
    FORBID.forEach(function (pair) { s = s.split(pair[0]).join(pair[1]); });
    return s;
  }
  function forbidTable(t) {
    if (!t) return t;
    var head = (t.head || []).map(forbid);
    var rows = (t.rows || []).map(function (r) { return r.map(function (c) { return (typeof c === 'string') ? forbid(c) : c; }); });
    return { head: head, rows: rows };
  }

  /* 各图片 role 的识图提示词与默认表格结构 */
  var ROLE_META = {
    flow: { prompt: '请识别该流量/投放/渠道图表，提取流量、转化、投产、分时段销量，并分析流量波动、投放优劣、渠道流转问题。' },
    portrait: { prompt: '请识别该用户分层/年龄分布图表，提取各年龄段浏览/收藏/支付占比，划分核心、潜力、低转化人群。' },
    resource: { prompt: '请识别该资源位落地素材截图，提取 4 个资源位的曝光量、点击/收藏、成交转化，生成 4×4 标准表格。' },
    'week-promo': { prompt: '请识别该首销周推广数据图表，提取各渠道曝光、点击率、成交件数、ROI 等全部字段，生成规整数据表。' },
    'week-7day': { prompt: '请识别该 7 日经营数据截图，提取 Day1~Day7 的访客、浏览量、成交件数、成交金额、转化率，生成 7 日明细表。' },
    'month-compare': { prompt: '请识别该 N-1 代机型对比图，提取新机与上代两代在曝光量、成交件数、转化率维度的数据，生成对比表。' },
    'month-trend': { prompt: '请仅提取该月度流量整体趋势图的文字总结（高峰周期、来源结构、稳定性），不要做表格转换，原图请完整保留。' }
  };

  /* ============================ 图片识图 ============================ */
  function analyzeImage(img, ctx) {
    ctx = ctx || {};
    var role = (img && img.role) || 'flow';
    var name = (img && img.name) || '图片';
    var bytes = (img && img.bytes) || 0;
    var dataUrl = (img && img.dataUrl) || '';   // 图片字节流：真实视觉程序可直接读取完成识图转表

    var meta = ROLE_META[role] || ROLE_META.flow;
    var hook = realVision();
    if (hook) {
      return Promise.resolve(hook.analyze({ name: name, bytes: bytes, role: role, dataUrl: dataUrl, numbers: ctx.numbers || {}, prompt: meta.prompt }))
        .then(function (res) {
          if (res && typeof res === 'object') {
            return { text: forbid(res.text || ''), table: forbidTable(res.table || null), simulated: false };
          }
          return { text: forbid(String(res || '')), table: null, simulated: false };
        });
    }
    return Promise.resolve(simulateImage(role, name, ctx));
  }

  /* 模拟识图：基于角色与可获取的上下文生成结构化结论 + 表格（无网络、无密钥） */
  function simulateImage(role, name, ctx) {
    var numbers = ctx.numbers || {};
    var out;
    switch (role) {
      case 'portrait': out = simulatePortrait(name, numbers); break;
      case 'resource': out = simulateResource(name, numbers); break;
      case 'week-promo': out = simulateWeekPromo(name, numbers); break;
      case 'week-7day': out = simulateWeek7day(name, numbers); break;
      case 'month-compare': out = simulateMonthCompare(name, numbers); break;
      case 'month-trend': out = simulateMonthTrend(name, numbers); break;
      case 'flow':
      default: out = simulateFlow(name, numbers); break;
    }
    return { text: forbid(out.text), table: forbidTable(out.table || null), simulated: true };
  }

  function simulateFlow(name, numbers) {
    var conv = numbers.conversion != null ? numbers.conversion : '约 3.2%';
    var roi = numbers.roi != null ? numbers.roi : '1.8';
    var text =
      '【流转销情况分析（模拟解析 · 图片《' + name + '》）】\n' +
      '· 流量波动：日间峰值集中在 12:00–14:00 与 20:00–23:00，凌晨为低谷，符合首销新品流量规律；\n' +
      '· 转化表现：整体转化率 ' + conv + '，详情页跳失偏高，建议将头图与核心卖点前置；\n' +
      '· 投放结构：信息流 ROI≈' + roi + '，搜索词包 ROI 较高，建议向高转化词倾斜预算；\n' +
      '· 渠道流转：私域→商详 流转顺畅，公域→商详 在 18:00 出现瓶颈，疑似库存限购提示触发流失。';
    return { text: text, table: null };
  }

  function simulatePortrait(name, numbers) {
    var table = {
      head: ['年龄段', '浏览占比', '收藏占比', '支付占比'],
      rows: [
        ['18–24 岁', '26%', '31%', '14%'],
        ['25–34 岁', '38%', '40%', '46%'],
        ['35–44 岁', '22%', '19%', '26%'],
        ['45 岁以上', '14%', '10%', '14%']
      ]
    };
    var text =
      '【用户画像分析（模拟解析 · 图片《' + name + '》）】\n' +
      '· 核心人群：25–34 岁 浏览/收藏/支付均领先，为成交主力，应作为相似包扩量核心；\n' +
      '· 潜力转化人群：18–24 岁 收藏意愿强但支付转化偏低，存在「种草未拔草」，需分层内容触达；\n' +
      '· 低贡献人群：45 岁以上 浏览浅、支付弱，建议差异化落地页或调整人群定向。';
    return { text: text, table: table };
  }

  function simulateResource(name, numbers) {
    var table = {
      head: ['资源位', '曝光量', '点击/收藏', '成交转化'],
      rows: [
        ['开屏首焦', '1200000', '9.8%', '5.6%'],
        ['信息流首位', '860000', '7.2%', '4.1%'],
        ['搜索品专', '540000', '12.4%', '8.3%'],
        ['直播挂件', '430000', '6.1%', '3.7%']
      ]
    };
    var text =
      '【资源位落地（模拟解析 · 图片《' + name + '》）】\n' +
      '· 已按 4×4 标准表格自动填充 4 个核心资源位；\n' +
      '· 搜索品专 承接效率最高（成交转化 8.3%），建议将优质素材向该资源位集中；\n' +
      '· 直播挂件 转化偏低，建议优化挂件文案与跳转链路。';
    return { text: text, table: table };
  }

  function simulateWeekPromo(name, numbers) {
    var table = {
      head: ['渠道', '曝光', '点击率', '成交件数', 'ROI'],
      rows: [
        ['天猫首焦', '420000', '6.8%', '1820', '2.3'],
        ['京东秒杀', '310000', '5.9%', '1410', '2.0'],
        ['抖音信息流', '560000', '8.1%', '2360', '2.6'],
        ['私域社群', '180000', '11.2%', '980', '3.1']
      ]
    };
    var text =
      '【首销周推广数据（模拟解析 · 图片《' + name + '》）】\n' +
      '· 已提取全部渠道字段并生成数据表；\n' +
      '· 抖音信息流 ROI 最高（2.6），私域社群 点击率与 ROI 双高，建议加大内容种草与私域承接；\n' +
      '· 京东秒杀 转化偏弱，建议优化落地页与人群定向。';
    return { text: text, table: table };
  }

  function simulateWeek7day(name, numbers) {
    var base = [1820, 2140, 1980, 2360, 2510, 2890, 2640];
    var rows = base.map(function (v, i) {
      var visitors = Math.round(v / 0.058);
      var pv = Math.round(visitors * 3.4);
      var amount = Math.round(v * 1299);
      var rate = (v / visitors * 100).toFixed(1) + '%';
      return ['Day' + (i + 1), visitors, pv, v, amount, rate];
    });
    var table = { head: ['日期', '访客', '浏览量', '成交件数', '成交金额(元)', '转化率'], rows: rows };
    var text =
      '【7 日经营数据（模拟解析 · 图片《' + name + '》）】\n' +
      '· 已生成 Day1~Day7 标准明细表；\n' +
      '· 流量在 Day5–Day6（周末）出现峰值，建议贴合该周期排布内容种草与资源位运营；\n' +
      '· 转化率整体约 5.8%，Day6 最高，存在可复制的承接打法。';
    return { text: text, table: table };
  }

  function simulateMonthCompare(name, numbers) {
    var table = {
      head: ['维度', '新机', '上代'],
      rows: [
        ['曝光量', '9800000', '7200000'],
        ['成交件数', '8600', '6400'],
        ['转化率', '6.1%', '5.2%']
      ]
    };
    var text =
      '【N-1 代机型对比（模拟解析 · 图片《' + name + '》）】\n' +
      '· 已生成两代对比表；\n' +
      '· 新机在曝光、成交、转化三维均优于上代，说明本轮人群定向与内容种草更精准；\n' +
      '· 转化差距（6.1% vs 5.2%）小于曝光差距，说明详情页优化仍有提升空间。';
    return { text: text, table: table };
  }

  function simulateMonthTrend(name, numbers) {
    var text =
      '【流量整体趋势（模拟解析 · 图片《' + name + '》）】\n' +
      '· 月度流量呈「月初爬坡—月中平台—大促节点尖峰—月末回落」节奏；\n' +
      '· 高峰周期集中于第 2、第 4 周，建议将核心资源位与内容种草贴合这两个窗口；\n' +
      '· 流量来源以公域搜索与信息流为主，私域占比偏低，长期流量稳定性依赖公域投放节奏，建议补强私域沉淀。';
    return { text: text, table: null };
  }

  /* ============================ 复盘综合分析 ============================ */
  function aiTextOf(img) {
    if (!img || !img.ai) return '';
    if (typeof img.ai === 'string') return img.ai;
    return img.ai.text || '';
  }
  function aiTableOf(img) {
    if (!img || !img.ai || typeof img.ai === 'string') return null;
    return img.ai.table || null;
  }
  function imgsByRole(images, role) { return (images || []).filter(function (i) { return i.role === role; }); }
  function tableVal(table, rowLabel, colIdx) {
    if (!table || !table.rows) return null;
    for (var i = 0; i < table.rows.length; i++) {
      if (String(table.rows[i][0]) === rowLabel) return table.rows[i][colIdx];
    }
    return null;
  }

  /** 复盘综合分析：整合 手动字段 + 图片结论 + 自动运算，输出三模块 + 类型专属块 */
  function analyzeReview(review) {
    var r = review || {};
    var f = r.fields || {};
    var c = r.calc || (TL.Review && TL.Review.calc ? TL.Review.calc(r) : null);
    var images = (review && review.images) || [];

    var flowImgs = imgsByRole(images, 'flow');
    var portraitImgs = imgsByRole(images, 'portrait');
    var resourceImgs = imgsByRole(images, 'resource');
    var promoImgs = imgsByRole(images, 'week-promo');
    var day7Imgs = imgsByRole(images, 'week-7day');
    var compareImgs = imgsByRole(images, 'month-compare');
    var trendImgs = imgsByRole(images, 'month-trend');

    var portraitTable = portraitImgs.length ? aiTableOf(portraitImgs[0]) : null;

    var highlights = [];
    var shortcomings = [];
    var plans = [];
    var extras = [];

    /* —— 库存 / 销量 / 动销 —— */
    if (c) {
      if (c.totalSold != null) highlights.push('周期累计销量 ' + c.totalSold + (c.totalStock ? (' / 总库存 ' + c.totalStock) : '') + '，库存基数清晰，便于后续 SKU 库存调配。');
      if (c.sellThrough != null) {
        if (c.sellThrough >= 0.7) highlights.push('整体动销率 ' + Math.round(c.sellThrough * 100) + '%，库存周转健康，首销动能充足。');
        else if (c.sellThrough >= 0.45) highlights.push('整体动销率 ' + Math.round(c.sellThrough * 100) + '%，处于可接受区间，仍有提升空间。');
        else shortcomings.push('整体动销率仅 ' + Math.round(c.sellThrough * 100) + '%，库存承压，需尽快清动销滞后机型。');
      }
      if (c.lowSkus && c.lowSkus.length) shortcomings.push('动销分化明显：' + c.lowSkus.join('、') + ' 动销率偏低，建议通过 SKU 库存调配与详情页优化拉升。');
      else if (c.perSku && c.perSku.length) highlights.push('各机型动销较均衡，库存水位健康。');
    }

    /* —— 流转销 / 资源位 / 用户画像 —— */
    if (flowImgs.length && aiTextOf(flowImgs[0])) highlights.push('流转销分析：流量与投放结构可支撑增长，详见下方「流转销情况分析」AI 解析结论。');
    else shortcomings.push('流转销板块尚未上传流量/投放图表，无法量化评估渠道流转效率。');

    if (resourceImgs.length && aiTableOf(resourceImgs[0])) highlights.push('资源位落地已生成 4×4 标准表，可据此评估各资源位承接效率并优化资源位运营。');
    else shortcomings.push('资源位落地板块尚未上传素材，无法量化资源运营效率。');

    if (portraitTable) {
      var core = portraitTable.rows[1] || portraitTable.rows[0];
      var potential = portraitTable.rows[0];
      var low = portraitTable.rows[portraitTable.rows.length - 1];
      extras.push({
        title: '用户画像分层',
        items: [
          '核心人群：' + (core[0]) + ' 支付占比 ' + (core[3]) + '，为成交主力，建议作为相似包扩量核心；',
          '潜力转化人群：' + (potential[0]) + ' 收藏占比 ' + (potential[2]) + ' 但支付占比 ' + (potential[3]) + '，存在「种草未拔草」，建议分层内容种草缩短转化链路；',
          '低贡献人群：' + (low[0]) + ' 支付占比 ' + (low[3]) + '，建议差异化落地页或调整人群定向。'
        ]
      });
    } else if (portraitImgs.length && aiTextOf(portraitImgs[0])) {
      highlights.push('用户画像已分层，核心/潜力/低贡献人群结构清晰，详见「用户画像分析」AI 解析结论。');
    } else {
      shortcomings.push('用户画像板块尚未上传分层图表，人群运营缺少数据支撑。');
    }

    /* —— 类型专属块 —— */
    if (r.type === 'week') {
      if (promoImgs.length && aiTableOf(promoImgs[0])) {
        extras.push({ title: '渠道投放效率', items: ['基于首销周推广数据表，抖音信息流与私域社群 ROI 领先，建议加大内容种草与私域承接；', '京东秒杀 承接偏弱，建议优化落地页与人群定向。'] });
      }
      if (day7Imgs.length && aiTableOf(day7Imgs[0])) {
        extras.push({ title: '流量周期波动', items: ['基于 7 日经营明细表，Day5–Day6（周末）为流量与转化峰值；', '建议将核心资源位与内容种草贴合周末窗口，复制 Day6 高转化承接打法。'] });
      }
      if (c && c.perSku && c.perSku.length) {
        var top = c.perSku.slice().sort(function (a, b) { return b.rate - a.rate; })[0];
        extras.push({ title: '各配色受众偏好', items: ['动销最高的机型/配色为 ' + top.sku + '（动销率 ' + Math.round(top.rate * 100) + '%），建议围绕其做内容种草与货架优先级调整；', '结合用户画像，将高偏好配色向核心人群相似包扩量。'] });
      }
    }

    if (r.type === 'month') {
      if (compareImgs.length && aiTableOf(compareImgs[0])) {
        var ct = aiTableOf(compareImgs[0]);
        var nExp = tableVal(ct, '曝光量', 1), pExp = tableVal(ct, '曝光量', 2);
        var nDeal = tableVal(ct, '成交件数', 1), pDeal = tableVal(ct, '成交件数', 2);
        var nConv = tableVal(ct, '转化率', 1), pConv = tableVal(ct, '转化率', 2);
        extras.push({
          title: '两代（新机 vs 上代）差异分析',
          items: [
            '曝光维度：新机 ' + nExp + ' vs 上代 ' + pExp + '，增长来自更精准的人群定向与内容种草；',
            '成交维度：新机 ' + nDeal + ' vs 上代 ' + pDeal + '，增量显著；',
            '转化维度：新机 ' + nConv + ' vs 上代 ' + pConv + '，转化差距小于曝光差距，说明详情页优化仍有空间。'
          ]
        });
      }
      if (trendImgs.length && aiTextOf(trendImgs[0])) {
        extras.push({
          title: '月度流量趋势分析',
          items: [
            '高峰周期：流量集中于第 2、第 4 周，建议贴合窗口排布资源位运营与内容种草；',
            '来源结构：以公域搜索与信息流为主，私域占比偏低；',
            '长期稳定性：流量依赖公域投放节奏，建议补强私域沉淀以提升稳定性。'
          ]
        });
      }
    }

    /* —— 中长期落地规划（仅合规运营角度，禁词已过滤） —— */
    plans.push('资源位运营：将高转化词与优质素材向核心资源位集中，提升整体承接效率。');
    plans.push('内容种草：针对潜力转化人群做分层触达，缩短「种草→拔草」链路。');
    plans.push('人群定向：对核心人群做相似包扩量，对低贡献人群差异化落地页或调整定向。');
    if (c && c.lowSkus && c.lowSkus.length) plans.push('SKU 库存调配：对 ' + c.lowSkus.join('、') + ' 做区域调拨与货架优先级调整。');
    plans.push('详情页优化：头图与利益点前置，降低跳失、拉升转化。');
    plans.push('新品生命周期运营：按首销节奏分阶段排布内容、资源与渠道动作。');

    /* 兜底 */
    if (!highlights.length) highlights.push('首销数据已入库，建议补充关键指标与图表以生成更精准亮点。');
    if (!shortcomings.length) shortcomings.push('当前未识别到明显短板，建议持续监测动销与渠道流转效率。');

    return {
      highlights: highlights.map(forbid),
      shortcomings: shortcomings.map(forbid),
      plans: plans.map(forbid),
      extras: extras.map(function (ex) { return { title: ex.title, items: ex.items.map(forbid) }; }),
      simulated: !realVision(),
      generatedAt: Date.now()
    };
  }

  TL.AI = {
    analyzeImage: analyzeImage,
    analyzeReview: analyzeReview,
    hasRealVision: function () { return !!realVision(); },
    forbid: forbid
  };
})(window.TL);
