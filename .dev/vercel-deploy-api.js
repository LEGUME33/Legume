/* TEST-LEGUME · Vercel 部署脚本（REST API，无需 CLI）
   用法: VERCEL_TOKEN=xxx node vercel-deploy-api.js
*/
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const TOKEN = process.env.VERCEL_TOKEN;
const ROOT = path.resolve(__dirname, '..');
const API = 'https://api.vercel.com';

// 排除项：仓库元数据 / 测试脚本 / 依赖
const EXCLUDE_DIRS = new Set(['.git', '.dev', 'node_modules']);

const CONTENT_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json',
  '.md': 'text/markdown; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml'
};

function walk(dir, base, out) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    const rel = path.relative(ROOT, full).split(path.sep).join('/');
    if (entry.isDirectory()) {
      if (EXCLUDE_DIRS.has(entry.name)) continue;
      walk(full, base, out);
    } else {
      out.push({ abs: full, rel });
    }
  }
  return out;
}

async function sha1File(p) {
  return new Promise((res, rej) => {
    const h = crypto.createHash('sha1');
    const s = fs.createReadStream(p);
    s.on('data', d => h.update(d));
    s.on('end', () => res(h.digest('hex')));
    s.on('error', rej);
  });
}

async function main() {
  if (!TOKEN) { console.error('缺少 VERCEL_TOKEN 环境变量'); process.exit(1); }

  const files = walk(ROOT, ROOT, []);
  console.log(`扫描到 ${files.length} 个文件，正在计算校验和…`);

  const fileMeta = [];
  for (const f of files) {
    const buf = fs.readFileSync(f.abs);
    const sha = crypto.createHash('sha1').update(buf).digest('hex');
    fileMeta.push({ file: f.rel, sha, size: buf.length, _buf: buf });
  }

  const payload = {
    name: 'legume',
    target: 'production',
    projectSettings: { framework: null, buildCommand: null, outputDirectory: null },
    files: fileMeta.map(f => ({ file: f.file, sha: f.sha, size: f.size }))
  };

  console.log('创建部署任务…');
  const createRes = await fetch(`${API}/v13/deployments`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  const createJson = await createRes.json().catch(() => ({}));
  if (!createRes.ok) {
    console.error('创建部署失败:', createJson.error || createRes.status);
    process.exit(1);
  }

  const deployId = createJson.id;
  const uploadUrls = createJson.uploadUrls || {};
  console.log(`部署 ID: ${deployId}`);
  console.log(`线上预览: https://${createJson.url}`);

  console.log('上传文件…');
  let uploaded = 0;
  for (const f of fileMeta) {
    const url = uploadUrls[f.file] || uploadUrls[f.file.replace(/\//g, '%2F')];
    if (!url) { console.warn(`  跳过(无上传地址): ${f.file}`); continue; }
    const ext = path.extname(f.file).toLowerCase();
    const ct = CONTENT_TYPES[ext] || 'application/octet-stream';
    const up = await fetch(url, {
      method: 'PUT',
      headers: { 'Content-Type': ct },
      body: f._buf
    });
    if (!up.ok) { console.error(`  上传失败 ${f.file}: ${up.status}`); process.exit(1); }
    uploaded++;
  }
  console.log(`已上传 ${uploaded}/${fileMeta.length} 个文件`);

  // 轮询部署状态
  console.log('等待 Vercel 构建 / 部署…');
  let finalState = null;
  for (let i = 0; i < 60; i++) {
    await new Promise(r => setTimeout(r, 3000));
    const st = await fetch(`${API}/v13/deployments/${deployId}`, {
      headers: { Authorization: `Bearer ${TOKEN}` }
    }).then(r => r.json());
    const rs = st.readyState;
    if (rs === 'READY') { finalState = st; break; }
    if (rs === 'ERROR' || rs === 'CANCELED') { finalState = st; break; }
    process.stdout.write('.');
  }
  console.log('');

  if (finalState && finalState.readyState === 'READY') {
    const alias = (finalState.alias && finalState.alias[0]) || finalState.url;
    console.log('✅ 部署成功！');
    console.log(`   生产地址: https://${alias}`);
    console.log(`   预览地址: https://${finalState.url}`);
  } else {
    console.error('❌ 部署未就绪:', finalState && finalState.readyState, finalState && (finalState.errorMessage || JSON.stringify(finalState).slice(0, 300)));
    process.exit(1);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
