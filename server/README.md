# 云端数据库同步服务 · 部署文档

Legume 工作台的最终同步方案：**前端静态页（GitHub Pages / 任意静态托管）→ FastAPI 后端（云服务器，IP + 8000 端口免备案直连）→ SQLite 云端数据库**。
彻底脱离 GitHub API，电脑 / 手机浏览器跨设备稳定同步。GitHub 模式作为过渡方案长期保留。

---

## 一、服务端部署（Ubuntu 22.04）

### 1. 准备服务器
- 一台具备公网 IP 的云服务器（国内服务器可免备案直连 `http://IP:8000`）。
- 在安全组 / 防火墙开放 **8000** 端口（TCP 入站）。

### 2. 安装 Python 3.10+
```bash
sudo apt update
sudo apt install -y python3 python3-venv python3-pip
```

### 3. 部署代码
将本仓库 `server/` 目录整体上传到 `/opt/legume-cloud`（或 `git clone` 后取 `server/` 子目录）：
```bash
sudo mkdir -p /opt/legume-cloud
sudo cp -r server /opt/legume-cloud/server
sudo chown -R www-data:www-data /opt/legume-cloud
```

### 4. 建虚拟环境并安装依赖
```bash
cd /opt/legume-cloud
python3 -m venv venv
./venv/bin/pip install --upgrade pip
./venv/bin/pip install -r server/requirements.txt
```

### 5. 配置环境变量
```bash
cp server/.env.example server/.env
nano server/.env
```
- `SECRET_KEY`：改为一段**足够长的随机字符串**（建议 ≥32 字节，否则 JWT 会告警）。
- `CORS_ORIGINS`：开发期可填 `*`；生产建议填前端域名，逗号分隔。
- `DB_PATH`：默认 `./legume.db`（位于 server/ 目录），无需修改。
- `PORT`：默认 `8000`。

### 6. 配置 systemd 开机自启
```bash
sudo cp server/legume-cloud.service /etc/systemd/system/legume-cloud.service
sudo nano /etc/systemd/system/legume-cloud.service   # 确认 User / 路径 / SECRET_KEY
sudo systemctl daemon-reload
sudo systemctl enable legume-cloud
sudo systemctl start legume-cloud
sudo systemctl status legume-cloud    # 应显示 active (running)
```

### 7. 验证
```bash
curl http://localhost:8000/api/health
# 返回 {"ok":true,"service":"legume-cloud","version":"1.0.0"}
```

日志查看：`sudo journalctl -u legume-cloud -f`

---

## 二、前端接入（浏览器端）

1. 打开工作台「设置 → 同步模式」，选择 **云端数据库**。
2. 在「云端数据库」分组填写**服务地址**，例如 `http://1.2.3.4:8000`（你的服务器公网 IP）。
3. 点「登录云端账户」：
   - 首次使用点「注册并登录」创建账户；
   - 已注册直接「登录」。
4. 登录成功后页面会自动拉取云端数据；本地任意修改经节流（默认 30s）后自动提交到服务器。
5. 切回前台 / 刷新会自动校验云端版本并拉取更新。
6. 状态栏同步标签可查看最近同步时间、失败原因；「重新校验连接」可手动诊断。

> 数据冲突策略：服务端按条目时间戳合并（同 `id` 保留最后修改版本，新增条目不互删），与 GitHub 模式一致。

---

## 三、接口一览

| 方法 | 路径 | 说明 | 鉴权 |
|------|------|------|------|
| GET  | `/api/health` | 健康检查 | 否 |
| POST | `/api/auth/register` | 注册并返回 JWT | 否 |
| POST | `/api/auth/login` | 登录返回 JWT | 否 |
| GET  | `/api/auth/me` | 当前用户 | 是 |
| GET  | `/api/data` | 拉取全部业务数据 | 是 |
| POST | `/api/data` | 批量提交变更（时间戳合并） | 是 |

JWT 通过 `Authorization: Bearer <token>` 头传递；默认有效期 30 天（可在 `.env` 调整）。

---

## 四、备份与维护

- 每次写入后服务会**自动备份**数据库到 `server/backups/legume-YYYYMMDD.db`（每天首次写入一份）。
- 如需手动备份：直接复制 `server/legume.db` 即可。
- 升级：覆盖 `server/` 代码后 `sudo systemctl restart legume-cloud`。

---

## 五、本地开发 / 自测

```bash
cd server
python3 -m venv venv && ./venv/bin/pip install -r requirements.txt
python -m server.test_smoke      # 运行接口冒烟测试（注册/登录/合并/隔离/备份）
# 或本地起服务：
./venv/bin/python -m uvicorn server.main:app --host 0.0.0.0 --port 8000
```
