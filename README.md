# TEST-LEGUME 个人工作台

> 莫兰迪色系 · GitHub Pages 部署 · GitHub 私有仓库双向同步

纯静态网页（零依赖、零构建），三页式个人工作台：总览 / 工作 / 学习。所有业务数据本地即时落盘，并通过 GitHub 私有仓库实现跨设备双向同步。

---

## ✨ 特性

- 🎨 **莫兰迪色系设计系统** — `assets/css/tokens.css` 是唯一的设计变量源（色彩 / 圆角 / 间距 / 字阶 / 阴影 / 缓动），全站组件只消费 token，杜绝样式漂移
- 📱 **响应式布局** — 桌面 / 平板 / 手机自适应
- 💾 **双层数据存储**
  1. **localStorage 本地兜底** — 断网照常可用，全部写本地，联网后由同步引擎自动补推
  2. **GitHub 私有仓库持久化** — 业务数据 + 上传图片索引以 JSON 落库 `/data`，二进制图片落 `data/image/`
- 🔐 **GitHub 账号登录（免 PAT）** — 采用官方 **OAuth Device Flow**：设置里填一次 OAuth App 的 Client ID，点「使用 GitHub 账号登录」后在 github.com 输入授权码即完成鉴权，系统自动拿到令牌并**自动创建双私有仓库**（业务数据仓库 + 前端代码仓库），无需手动生成 PAT、无需手动建仓
- 🚀 **自动代码推送 + 持久同步** — 登录后网页源码经 GitHub API 推送至代码仓库 `main` 分支；业务数据变更默认 30 秒延迟自动同步至数据仓库；设置面板提供【立即同步】【历史版本回滚】【初始化仓库并推送代码】
- ▲ **Vercel 一键部署** — 设置里「连接 Vercel」直接跳转 Vercel 授权页，**复用当前 GitHub 账号**完成授权并导入仓库；此后代码仓库有推送即自动构建部署，设置面板实时展示部署状态、线上域名、构建日志，并支持绑定自定义域名
- 📊 **顶部常驻状态栏** — 页面顶部常驻三个指示器：**业务数据同步状态** / **代码部署状态** / **Vercel 部署状态**，一眼掌握全局部署与同步态势
- ⏪ **版本回滚** — 设置面板可查看任意文件的历史提交并一键回滚
- 🧩 **可扩展架构** — 新增业务域只需在 `store.js` 的 `CATS` + `DEFAULTS` 登记，同步引擎自动接管；新增页面 = 新建 html + 新建 `pages/<key>.js`

## 📁 项目结构

```
TEST-LEGUME/
├── index.html               # 总览（首页）
├── work.html                # 工作模块（日计划 / 待办 / 复盘）
├── study.html               # 学习模块（打卡 / 课程 / 任务 / 热点）
├── .nojekyll                # 关闭 GitHub Pages 的 Jekyll 处理（保留 _ 前缀目录）
├── data/                    # 同步到 GitHub 的业务数据（种子文件随仓库提交）
│   ├── work.json            # 工作数据
│   ├── study.json           # 学习数据
│   ├── media.json           # 上传图片索引
│   └── activity.json        # 多设备操作留痕
├── assets/
│   ├── css/
│   │   ├── tokens.css       # 莫兰迪设计 token（唯一变量源）
│   │   └── app.css          # 所有组件样式（只消费 token）
│   └── js/
│       ├── store.js         # 第一层：localStorage 兜底 + 操作日志 + 派生统计
│       ├── github.js        # GitHub API 连接器（Contents / Commits / Pages，纯前端）
│       ├── media.js         # 上传图片压缩 / 本地缓存 / 云端索引 / 跨设备回源
│       ├── sync.js          # 第二层：双向同步引擎（拉取 / 推送 / 合并 / 回滚 / 30s 延迟）
│       ├── deploy.js        # 部署层：双私有仓库自动创建 + 代码仓库文件推送 + 状态机
│       ├── vercel.js        # Vercel 集成：复用 GitHub 授权、部署状态 / 域名查询、自定义域名绑定
│       ├── ui.js            # 全站 UI 壳（顶栏 / 导航 / 三态指示器 / 设置面板 / 组件库）
│       ├── app.js           # 启动引导（所有页面共用）
│       └── pages/
│           ├── overview.js  # 总览
│           ├── work.js      # 工作
│           └── study.js     # 学习
└── .dev/                    # 本地校验（不随生产部署）
    ├── test-server.js       # 零依赖静态服务器（供 jsdom 以 http 协议加载）
    ├── smoke-test.js        # 三页 jsdom 冒烟测试（模块加载 + 全页 boot + 渲染 + 三态指示器）
    ├── sync-test.js         # 同步引擎单测（mock GitHub API：拉取 / 推送 / 409 重试 / 条目级合并）
    └── deploy-vercel-test.js # 部署/登录/Vercel 单测（mock GitHub + Vercel API：OAuth / 建仓 / 推送 / 状态）
```

## 🚀 部署到线上（GitHub 账号登录 + Vercel 自动部署）

本工作台支持**纯前端全自动部署**：无需手动生成 PAT、无需手动建仓、无需配置构建命令。完整链路如下。

### 1. 一次性准备：注册 GitHub OAuth App（仅取 Client ID）

GitHub 已于 2020 年废弃「账号 + 密码」API 鉴权，浏览器也无法直连密码做登录。本工作台采用官方推荐的 **OAuth Device Flow** 实现免密登录，需在 GitHub 注册一个 OAuth App（只需 Client ID，**无需密钥**）：

1. GitHub → Settings → Developer settings → **OAuth Apps** → New OAuth App
2. Homepage URL 填 `http://localhost`（任意可达地址即可，Device Flow 不回调）
3. 创建后得到 **Client ID**（形如 `Iv1.xxxx` 或一串字母数字）
4. 在设置面板「GitHub 账号登录」里填入该 Client ID 并保存

> 这是唯一的一次性人工步骤；之后每次登录都是「点按钮 → 在 github.com 输入授权码」两步完成。
> 若你更习惯经典方式，仍可在「GitHub 私有仓库连接」里手动粘贴 Classic PAT（`repo` 权限），两者并存。

### 2. 账号登录（自动鉴权 + 自动建仓）

打开页面 → 右上角 ⚙ 设置 → **GitHub 账号登录** → 点「使用 GitHub 账号登录」：
- 页面弹出授权码与 `github.com/login/device` 链接
- 在 GitHub 输入授权码完成授权后，系统自动拿到访问令牌、读取你的用户名
- **自动连接私有仓库**：业务数据仓库 `Legume`（承载 `data/*.json` 同步）与 前端代码仓库 `legume`（Vercel 部署源）；若仓库不存在将自动创建
- 随后自动将网页源码推送至代码仓库 `main` 分支

> 也可在「部署」分组手动点【初始化仓库并推送代码】触发上述流程。

### 3. 连接 Vercel（复用 GitHub 账号一键部署）

同一设置面板「部署」分组 → 点「连接 Vercel（复用 GitHub）」：
- 浏览器打开 Vercel 授权页，**用同一个 GitHub 账号**授权并导入刚创建的代码仓库
- 此后代码仓库 `legume` 的 `main` 分支每次推送，Vercel 自动构建部署，生成永久域名（如 `https://legume.vercel.app`）
- 在「Vercel 访问令牌」处粘贴在 Vercel 后台生成的 Token（仅用于**站内查询**部署状态/域名，非部署必需），点「查询部署状态」即可看到线上地址、是否构建中、自定义域名
- 「绑定自定义域名」按提示在 DNS 添加 CNAME 指向 `cname.vercel-dns.com`

### 4.（备选）GitHub Pages 托管

若偏好 GitHub Pages，仍可在「部署」分组点【查询 Pages 状态】/【一键开启 Pages】。私有仓库 Pages 需 GitHub Pro / 团队版；免费账号可用公开仓库放站点、私有仓库放数据（代码层已解耦）。

### 顶部状态栏

页面顶部常驻三个指示器，实时反映：
- **业务数据同步状态**（绿=已同步 / 蓝=同步中 / 黄=待同步 / 红=失败 / 灰=离线）
- **代码部署状态**（推送中 / 已推送 / 失败）
- **Vercel 部署状态**（已部署 / 构建中 / 未绑定）

点击任一指示器即可打开设置面板。

## 🔒 隐私与安全

- OAuth 令牌 / PAT **仅**存本机 `localStorage`，**绝不**写入仓库、不经任何第三方
- 网页是纯静态资源，无后端、无数据中转
- 私有仓库图片无法通过公开 raw 链接访问，跨设备通过带令牌的 API 回源
- 推荐为令牌设置有效期，并在离职/转交时于 GitHub 端吊销

## 🧪 本地校验（开发用）

```bash
# 1) 安装 jsdom 到受管目录（不污染项目）
cd "$HOME/.workbuddy/binaries/node/workspace"
node -e "require('jsdom')" 2>/dev/null || npm install jsdom

# 2) 运行冒烟测试（三页 jsdom 加载 + 全量 boot + 渲染断言）
NODE_PATH="$HOME/.workbuddy/binaries/node/workspace/node_modules" \
  node .dev/smoke-test.js

# 3) 运行同步引擎单测（mock GitHub API）
NODE_PATH="$HOME/.workbuddy/binaries/node/workspace/node_modules" \
  node .dev/sync-test.js

# 4) 运行部署 / 登录 / Vercel 单测（mock GitHub + Vercel API）
NODE_PATH="$HOME/.workbuddy/binaries/node/workspace/node_modules" \
  node .dev/deploy-vercel-test.js
```

全部断言通过即代表框架、同步逻辑、登录/部署/可部署性达标（当前：冒烟 31、同步 10、部署/Vercel 10）。

## 📝 扩展指引

- **新增业务域**：在 `store.js` 的 `CATS` 追加 key，并在 `DEFAULTS` 补默认值；同步引擎自动处理该域的拉取/推送/合并。
- **新增页面**：复制 `assets/js/pages/overview.js` 模板，注册 `TL.pages['<body data-page>'] = { init, render }`，并在 `index.html` 同级新建 `<key>.html`（引入同一套脚本顺序：store→github→media→sync→deploy→vercel→ui→pages/<key>→app）。
- **组件复用**：全站统一 `taskItem` / `ring` / `progress` / `heatmap` / `previewCard` / `metric`，禁止各页面自造勾选与卡片样式。

个人使用，自由修改。
