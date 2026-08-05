# 数据库引擎与会话
import os
import shutil
import time
from pathlib import Path

from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker

from .config import DATABASE_URL, DB_PATH, BACKUP_DIR

engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False},
    future=True,
)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, future=True)
Base = declarative_base()


def init_db():
    """建表；确保备份目录存在"""
    BACKUP_DIR.mkdir(parents=True, exist_ok=True)
    Base.metadata.create_all(bind=engine)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# 简易备份：每天首次写入时复制一次数据库文件到 backups/legume-YYYYMMDD.db
_last_backup_day = {"day": ""}


def maybe_backup():
    try:
        day = time.strftime("%Y%m%d")
        if _last_backup_day["day"] == day:
            return
        if not DB_PATH.exists():
            return
        dest = BACKUP_DIR / f"legume-{day}.db"
        if not dest.exists():
            shutil.copy2(DB_PATH, dest)
        _last_backup_day["day"] = day
    except Exception:
        # 备份失败不应阻断主流程
        pass
