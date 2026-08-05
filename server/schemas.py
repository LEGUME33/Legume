# Pydantic 请求/响应模型
from typing import Any, List, Optional

from pydantic import BaseModel, Field


class RegisterRequest(BaseModel):
    username: str = Field(..., min_length=3, max_length=64)
    password: str = Field(..., min_length=6, max_length=128)


class LoginRequest(BaseModel):
    username: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    username: str


class CategoryCommit(BaseModel):
    category: str
    content: Any = {}
    updatedAt: int = 0


class CommitRequest(BaseModel):
    items: List[CategoryCommit]


class CategoryData(BaseModel):
    category: str
    content: Any
    updatedAt: int


class DataResponse(BaseModel):
    categories: List[CategoryData]
