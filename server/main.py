# Legume Cloud Sync —— FastAPI 主程序
# 前端静态页（github.io / 任意静态托管）→ 本服务（云端数据库）→ SQLite
import json

from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session

from . import config, merge
from .auth import create_token, get_current_user, hash_password, verify_password
from .db import SessionLocal, engine, get_db, init_db, maybe_backup
from .models import DataStore, User
from .schemas import (
    CategoryData,
    CommitRequest,
    DataResponse,
    LoginRequest,
    RegisterRequest,
    TokenResponse,
)

VALID_CATS = {"work", "study", "media", "activity"}

app = FastAPI(title="Legume Cloud Sync", version="1.0.0")

# CORS：开发期可放开为 *；生产建议限定前端域名
if config.CORS_ORIGINS == ["*"]:
    allow_origins = ["*"]
else:
    allow_origins = config.CORS_ORIGINS

app.add_middleware(
    CORSMiddleware,
    allow_origins=allow_origins,
    allow_credentials=False,  # 令牌走 Authorization 头，无需 cookie
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def on_startup():
    init_db()


@app.get("/api/health")
def health():
    return {"ok": True, "service": "legume-cloud", "version": "1.0.0"}


# ---------------- 鉴权 ----------------
@app.post("/api/auth/register", response_model=TokenResponse)
def register(req: RegisterRequest, db: Session = Depends(get_db)):
    if db.query(User).filter(User.username == req.username).first():
        raise HTTPException(status_code=409, detail="用户名已存在")
    user = User(username=req.username, password_hash=hash_password(req.password))
    db.add(user)
    db.commit()
    db.refresh(user)
    return TokenResponse(access_token=create_token(user.username), username=user.username)


@app.post("/api/auth/login", response_model=TokenResponse)
def login(req: LoginRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.username == req.username).first()
    if not user or not verify_password(req.password, user.password_hash):
        raise HTTPException(status_code=401, detail="用户名或密码错误")
    return TokenResponse(access_token=create_token(user.username), username=user.username)


@app.get("/api/auth/me")
def me(user: User = Depends(get_current_user)):
    return {"username": user.username, "id": user.id}


# ---------------- 数据同步 ----------------
@app.get("/api/data", response_model=DataResponse)
def get_data(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    rows = db.query(DataStore).filter(DataStore.user_id == user.id).all()
    cats = []
    for r in rows:
        try:
            content = json.loads(r.content)
        except Exception:
            content = {}
        cats.append(CategoryData(category=r.category, content=content, updatedAt=r.updated_at or 0))
    have = {c.category for c in cats}
    for cat in VALID_CATS:
        if cat not in have:
            cats.append(CategoryData(category=cat, content={}, updatedAt=0))
    return DataResponse(categories=cats)


@app.post("/api/data", response_model=DataResponse)
def commit_data(req: CommitRequest, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    for item in req.items:
        if item.category not in VALID_CATS:
            continue
        incoming = item.content if isinstance(item.content, dict) else {}
        incoming_updated = item.updatedAt or incoming.get("updatedAt", 0) or 0

        row = (
            db.query(DataStore)
            .filter(DataStore.user_id == user.id, DataStore.category == item.category)
            .first()
        )
        if row is None:
            merged = incoming
            merged_updated = incoming_updated
            row = DataStore(
                user_id=user.id,
                category=item.category,
                content=json.dumps(merged, ensure_ascii=False),
                updated_at=merged_updated,
            )
            db.add(row)
        else:
            try:
                server = json.loads(row.content)
            except Exception:
                server = {}
            merged = merge.merge_data(server, incoming)
            merged_updated = max(server.get("updatedAt", 0) or 0, incoming_updated)
            merged["updatedAt"] = merged_updated
            row.content = json.dumps(merged, ensure_ascii=False)
            row.updated_at = merged_updated
    db.commit()
    maybe_backup()
    # 返回合并后的全量数据，前端据此刷新
    return get_data(user, db)
