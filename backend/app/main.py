"""FastAPI エントリポイント。"""

from __future__ import annotations

import cv2
import numpy as np
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response

from app.analysis.preview import render_reference_preview_png
from app.analysis.pipeline import run_bansho_analysis
from app.cors import cors_middleware_kwargs
from app.schemas import BanshoAnalysisResult, HealthResponse, ReferencePreviewRequest

app = FastAPI(title="板書上達支援 API", version="0.1.0")

app.add_middleware(CORSMiddleware, **cors_middleware_kwargs())


@app.get("/health", response_model=HealthResponse)
def health() -> HealthResponse:
    return HealthResponse()


@app.post("/analyze", response_model=BanshoAnalysisResult)
async def analyze(
    file: UploadFile = File(description="板書画像（JPEG/PNG 等）"),
    target_text: str = Form(default="", description="比較用のお手本テキスト（改行可）"),
) -> BanshoAnalysisResult:
    content_type = file.content_type or ""
    if not content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="画像ファイル（image/*）をアップロードしてください")

    text = (target_text or "").strip()
    if not text:
        raise HTTPException(
            status_code=400,
            detail="お手本テキスト（target_text）を入力してください。板書の内容と同じ文字列を指定してください。",
        )

    raw = await file.read()
    if not raw:
        raise HTTPException(status_code=400, detail="空のファイルです")

    data = np.frombuffer(raw, dtype=np.uint8)
    image = cv2.imdecode(data, cv2.IMREAD_COLOR)
    if image is None:
        raise HTTPException(status_code=400, detail="画像のデコードに失敗しました")

    try:
        return run_bansho_analysis(image, text)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@app.post("/reference-preview", response_class=Response)
async def reference_preview(payload: ReferencePreviewRequest) -> Response:
    try:
        png = render_reference_preview_png(payload.target_text, payload.width, payload.height)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    return Response(content=png, media_type="image/png")
