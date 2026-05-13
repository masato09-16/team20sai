"""FastAPI エントリポイント。"""

from __future__ import annotations

from typing import Annotated

import cv2
import numpy as np
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware

from app.analysis.pipeline import run_bansho_analysis
from app.cors import cors_middleware_kwargs
from app.schemas import BanshoAnalysisResult, HealthResponse

app = FastAPI(title="板書上達支援 API", version="0.1.0")

app.add_middleware(CORSMiddleware, **cors_middleware_kwargs())


@app.get("/health", response_model=HealthResponse)
def health() -> HealthResponse:
    return HealthResponse()


@app.post("/analyze", response_model=BanshoAnalysisResult)
async def analyze(file: Annotated[UploadFile, File(description="板書画像（JPEG/PNG 等）")]) -> BanshoAnalysisResult:
    content_type = file.content_type or ""
    if not content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="画像ファイル（image/*）をアップロードしてください")

    raw = await file.read()
    if not raw:
        raise HTTPException(status_code=400, detail="空のファイルです")

    data = np.frombuffer(raw, dtype=np.uint8)
    image = cv2.imdecode(data, cv2.IMREAD_COLOR)
    if image is None:
        raise HTTPException(status_code=400, detail="画像のデコードに失敗しました")

    try:
        return run_bansho_analysis(image)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
