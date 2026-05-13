"""CORS 設定（本番では BACKEND_CORS_ORIGINS でオリジンを限定する）。"""

from __future__ import annotations

import os


def cors_middleware_kwargs() -> dict:
    """Starlette CORSMiddleware に渡す kwargs。

    ``BACKEND_CORS_ORIGINS`` が未設定または空のときは開発の利便のため ``*`` を許可。
    ワイルドカードと ``allow_credentials=True`` は両立しないため、その場合は credentials を無効化する。
    """
    raw = os.getenv("BACKEND_CORS_ORIGINS", "").strip()
    if not raw:
        return {
            "allow_origins": ["*"],
            "allow_credentials": False,
            "allow_methods": ["*"],
            "allow_headers": ["*"],
        }

    origins = [o.strip() for o in raw.split(",") if o.strip()]
    if not origins:
        return {
            "allow_origins": ["*"],
            "allow_credentials": False,
            "allow_methods": ["*"],
            "allow_headers": ["*"],
        }

    return {
        "allow_origins": origins,
        "allow_credentials": True,
        "allow_methods": ["*"],
        "allow_headers": ["*"],
    }
