// 用 Vercel 账号令牌验证部署项目与最新部署状态
const TOKEN = process.env.VERCEL_TOKEN;
const BASE = 'https://api.vercel.com';

async function api(path) {
  const res = await fetch(BASE + path, {
    headers: { Authorization: `Bearer ${TOKEN}` },
  });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = { _raw: text }; }
  return { status: res.status, json };
}

(async () => {
  // 1) 验证令牌 + 拿到当前账号
  const me = await api('/v2/user');
  if (me.status !== 200) {
    console.log('令牌验证失败:', me.status, JSON.stringify(me.json).slice(0, 200));
    process.exit(1);
  }
  console.log('✅ 令牌有效，账号:', me.json.user?.username || me.json.user?.email || me.json.user?.login || '(unknown)');

  // 2) 列出项目，找到 legume 相关
  const proj = await api('/v9/projects?limit=100');
  const list = proj.json.projects || [];
  const target = list.find(p => (p.name || '').toLowerCase().includes('legume')) || list[0];
  if (!target) {
    console.log('未找到项目。已有项目数:', list.length);
    list.slice(0, 10).forEach(p => console.log(' -', p.name, p.id));
    return;
  }
  console.log('✅ 项目:', target.name, '(id:', target.id + ')');
  console.log('   主域名:', (target.domains && target.domains[0]) || target.target || '—');
  console.log('   框架:', target.framework || '—', '| 根目录:', target.rootDirectory || '(默认)');

  // 3) 最新部署
  const dep = await api(`/v6/deployments?projectId=${target.id}&limit=3`);
  const deps = dep.json.deployments || [];
  if (deps.length) {
    const d = deps[0];
    console.log('✅ 最新部署:', d.uid);
    console.log('   状态:', d.readyState, '| 环境:', d.target || '—');
    console.log('   创建时间:', new Date(d.created).toISOString());
    console.log('   访问地址:', `https://${d.url}`);
  } else {
    console.log('暂无部署记录');
  }

  // 4) 自定义域名
  const dom = await api(`/v9/projects/${target.id}/domains`);
  const doms = dom.json.domains || [];
  if (doms.length) {
    console.log('🌐 已绑域名:');
    doms.forEach(x => console.log('   -', x.name, '(' + x.verified + ')'));
  } else {
    console.log('🌐 暂无自定义域名');
  }
})();
