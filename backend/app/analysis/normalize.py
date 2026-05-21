"""解析前の共通前処理（台形補正）。"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np

from app.analysis.perspective import apply_perspective_correction


@dataclass(frozen=True)
class NormalizedBoardResult:
    image_bgr: np.ndarray
    perspective_corrected: bool
    notes: list[str]


def normalize_board_image(image_bgr: np.ndarray) -> NormalizedBoardResult:
    p = apply_perspective_correction(image_bgr)
    notes: list[str] = []
    if p.corners_detected:
        notes.append("四隅を検出し、台形補正を適用しました。")
    else:
        notes.append("四隅の自動検出が安定せず、元画像のまま解析しました。なるべく正面から矩形に収めて撮影してください。")
    return NormalizedBoardResult(image_bgr=p.warped_bgr, perspective_corrected=p.corners_detected, notes=notes)
