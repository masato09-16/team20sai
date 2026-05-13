"""板書解析パイプライン（スタブ実装）。"""

from __future__ import annotations

import numpy as np

from app.analysis.binarize import extract_chalk_mask
from app.analysis.metrics import compute_stub_metrics
from app.analysis.perspective import apply_perspective_correction
from app.schemas import AnalysisOverlay, BanshoAnalysisResult


def run_bansho_analysis(image_bgr_u8: np.ndarray) -> BanshoAnalysisResult:
    """BGR / uint8 / (H,W,3) の画像を受け取り解析結果を返す。"""
    perspective = apply_perspective_correction(image_bgr_u8)
    binarized = extract_chalk_mask(perspective.warped_bgr)
    metrics = compute_stub_metrics(binarized.mask)

    h, w = perspective.warped_bgr.shape[:2]
    overlay = AnalysisOverlay(
        image_width=w,
        image_height=h,
        baseline_y_positions=metrics.baseline_y_positions,
        char_boxes=metrics.char_boxes,
        guide=metrics.guide,
    )

    notes: list[str] = []
    if not perspective.corners_detected:
        notes.append("四隅検出は未実装のため、台形補正はスキップされています（スタブ）。")
    notes.append("スコアはプレースホルダです。実画像に基づく算出は今後実装します。")

    return BanshoAnalysisResult(
        scores=metrics.scores,
        overlay=overlay,
        notes=notes,
        pipeline_stage="stub",
    )
