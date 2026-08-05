# 后端冒烟测试：启动 uvicorn（线程内）+ urllib 直连接口
# 校验：健康检查 / 注册 / 登录 / JWT 鉴权 / 拉取 / 时间戳合并 / 用户隔离 / 自动备份
import os
import sys
import json
import time
import tempfile
import threading
import urllib.request
import urllib.error

# 使用临时数据库，避免污染 server/legume.db
_tmp = os.path.join(tempfile.gettempdir(), "legume_test.db")
if os.path.exists(_tmp):
    os.remove(_tmp)
os.environ["DB_PATH"] = _tmp
os.environ["SECRET_KEY"] = "test-secret-legume"
os.environ["CORS_ORIGINS"] = "*"

import uvicorn
from server.main import app

PORT = 8137
BASE = "http://127.0.0.1:%d" % PORT


def run_server():
    uvicorn.run(app, host="127.0.0.1", port=PORT, log_level="warning")


_srv = threading.Thread(target=run_server, daemon=True)
_srv.start()
time.sleep(2.5)


def req(method, path, body=None, token=None):
    url = BASE + path
    data = json.dumps(body).encode() if body is not None else None
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = "Bearer " + token
    r = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(r, timeout=5) as resp:
            return resp.status, json.loads(resp.read().decode() or "{}")
    except urllib.error.HTTPError as e:
        try:
            return e.code, json.loads(e.read().decode() or "{}")
        except Exception:
            return e.code, {}


passed = 0
failed = 0


def check(name, cond):
    global passed, failed
    if cond:
        passed += 1
        print("  ✓ " + name)
    else:
        failed += 1
        print("  ✗ " + name)


print("== 后端冒烟测试 ==")
# 1. 健康检查
s, j = req("GET", "/api/health")
check("健康检查 200", s == 200 and j.get("ok") is True)

# 2. 注册
s, j = req("POST", "/api/auth/register", {"username": "alice", "password": "secret123"})
check("注册 200", s == 200)
tok = j.get("access_token", "")
check("返回 JWT", bool(tok))

# 3. 重复注册 -> 409
s, _ = req("POST", "/api/auth/register", {"username": "alice", "password": "secret123"})
check("重复注册 409", s == 409)

# 4. 登录
s, j = req("POST", "/api/auth/login", {"username": "alice", "password": "secret123"})
check("登录 200", s == 200 and j.get("access_token"))
# 错误密码 -> 401
s, _ = req("POST", "/api/auth/login", {"username": "alice", "password": "wrong"})
check("错误密码 401", s == 401)

# 5. 身份校验
s, j = req("GET", "/api/auth/me", token=tok)
check("携带令牌 200", s == 200 and j.get("username") == "alice")
s, _ = req("GET", "/api/auth/me")
check("无令牌 401", s == 401)

# 6. 拉取（空）
s, j = req("GET", "/api/data", token=tok)
check("拉取 200", s == 200)
check("默认 4 个分类", len(j.get("categories", [])) == 4)

# 7. 提交 + 条目级时间戳合并
now = int(time.time() * 1000)
work = {"schema": 1, "plans": {"month": [], "week": [], "day": []}, "todos": [{"id": "t1", "title": "A", "updatedAt": now}], "reviews": [], "updatedAt": now}
study = {"schema": 1, "topics": [], "courses": [], "tasks": [], "hotspots": [], "plans": [], "updatedAt": now}
s, _ = req("POST", "/api/data", {"items": [{"category": "work", "content": work, "updatedAt": now}, {"category": "study", "content": study, "updatedAt": now}]}, token=tok)
check("提交 200", s == 200)
# 修改 t1（同 id，更新时间戳）+ 新增 t2
work2 = {"schema": 1, "plans": {"month": [], "week": [], "day": []}, "todos": [{"id": "t1", "title": "A-edited", "updatedAt": now + 5000}, {"id": "t2", "title": "B", "updatedAt": now + 5000}], "reviews": [], "updatedAt": now + 5000}
s, _ = req("POST", "/api/data", {"items": [{"category": "work", "content": work2, "updatedAt": now + 5000}]}, token=tok)
check("二次提交 200", s == 200)
s, j = req("GET", "/api/data", token=tok)
cats = {x["category"]: x["content"] for x in j.get("categories", [])}
todos = {t["id"]: t["title"] for t in cats.get("work", {}).get("todos", [])}
check("合并保留 t1（最新修改）", todos.get("t1") == "A-edited")
check("合并保留新增 t2", todos.get("t2") == "B")
check("study 分类未被破坏", "topics" in cats.get("study", {}))

# 8. 用户隔离：bob 看不到 alice 数据
rb = req("POST", "/api/auth/register", {"username": "bob", "password": "secret123"})[1].get("access_token", "")
s, j = req("GET", "/api/data", token=rb)
catsb = {x["category"]: x["content"] for x in j.get("categories", [])}
check("bob 的 work 为空", not catsb.get("work", {}).get("todos"))

# 9. 自动备份文件
from server import config as _cfg
backups = os.listdir(_cfg.BACKUP_DIR)
check("已生成备份文件", any("legume-" in f for f in backups))

print("\n结果：%d 通过 / %d 失败" % (passed, failed))
sys.exit(1 if failed else 0)
