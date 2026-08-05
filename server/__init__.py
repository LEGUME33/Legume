# Legume Cloud Sync — 后端配置
# 通过环境变量覆盖，生产环境务必设置 SECRET_KEY 与 DB_PATH
import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent

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
