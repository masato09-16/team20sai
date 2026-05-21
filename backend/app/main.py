"""FastAPI エントリポイント。"""

from __future__ import annotations

import cv2
import numpy as np
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response

from app.analysis.board_gate import assess_chalkboard_image
from app.analysis.normalize import normalize_board_image
from app.analysis.preview import render_reference_preview_png
from app.analysis.pipeline import run_manual_text_analysis, run_ocr_analysis
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
    corrected_text: str | None = Form(default=None, description="OCR 誤認識時にユーザーが修正した文字列"),
) -> BanshoAnalysisResult:
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

    gate = assess_chalkboard_image(image)
    if not gate.accepted:
        raise HTTPException(
            status_code=422,
            detail="黒板とチョーク文字が写った画像として判定できませんでした。黒板全体を正面から撮影した画像を選んでください。",
        )

    normalized = normalize_board_image(image)

    try:
        if corrected_text and corrected_text.strip():
            return run_manual_text_analysis(
                normalized.image_bgr,
                corrected_text,
                pre_notes=normalized.notes,
                perspective_corrected=normalized.perspective_corrected,
            )
        return run_ocr_analysis(
            normalized.image_bgr,
            pre_notes=normalized.notes,
            perspective_corrected=normalized.perspective_corrected,
        )
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@app.post("/reference-preview", response_class=Response)
async def reference_preview(payload: ReferencePreviewRequest) -> Response:
    try:
        png = render_reference_preview_png(payload.target_text, payload.width, payload.height)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    return Response(content=png, media_type="image/png")
