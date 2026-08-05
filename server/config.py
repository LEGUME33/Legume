# Legume Cloud Sync — 后端配置
# 通过环境变量覆盖，生产环境务必设置 SECRET_KEY 与 DB_PATH
import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent


def _load_env():
    """轻量读取 .env（避免引入 python-dotenv 额外依赖）"""
    for cand in (BASE_DIR / ".env", Path(".env")):
        if cand.exists():
            try:
                with open(cand, encoding="utf-8") as f:
                    for line in f:
                        line = line.strip()
                        if not line or line.startswith("#") or "=" not in line:
                            continue
                        k, v = line.split("=", 1)
                        k, v = k.strip(), v.strip().strip('"').strip("'")
                        os.environ.setdefault(k, v)
            except Exception:
                pass
            break


_load_env()

SECRET_KEY = os.getenv("SECRET_KEY", "change-me-in-production-legume-cloud")

# 数据库文件（SQLite），默认放在 server/legume.db
DB_PATH = Path(os.getenv("DB_PATH", str(BASE_DIR / "legume.db"))).resolve()
DATABASE_URL = f"sqlite:///{DB_PATH}"

HOST = os.getenv("HOST", "0.0.0.0")
PORT = int(os.getenv("PORT", "8000"))

# JWT 有效期（小时），默认 30 天
TOKEN_EXPIRE_HOURS = int(os.getenv("TOKEN_EXPIRE_HOURS", "720"))

# 允许的前端跨域来源（逗号分隔）；* 表示全部放开（仅建议开发/内网使用）
_CORS = os.getenv("CORS_ORIGINS", "*")
CORS_ORIGINS = [o.strip() for o in _CORS.split(",") if o.strip()] or ["*"]

BACKUP_DIR = BASE_DIR / "backups"
DATA_DIR = BASE_DIR / "data"
