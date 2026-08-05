# 数据库模型
import time

from sqlalchemy import BigInteger, Column, ForeignKey, Integer, String, Text, UniqueConstraint

from .db import Base


class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True, autoincrement=True)
    username = Column(String(64), unique=True, index=True, nullable=False)
    password_hash = Column(String(256), nullable=False)
    created_at = Column(BigInteger, default=lambda: int(time.time() * 1000))


class DataStore(Base):
    __tablename__ = "data_stores"
    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("users.id"), index=True, nullable=False)
    category = Column(String(32), nullable=False)
    content = Column(Text, nullable=False, default="{}")
    updated_at = Column(BigInteger, default=0)
    __table_args__ = (UniqueConstraint("user_id", "category", name="uq_user_category"),)
