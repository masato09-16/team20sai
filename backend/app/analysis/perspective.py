"""台形補正（四隅検出・透視変換）のスタブ。

実装時: 輪郭・角点検出や MediaPipe（Hands / 平面推定など）や古典 CV で四隅を推定し、
cv2.warpPerspective を適用する。
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np


@dataclass(frozen=True)
class PerspectiveStubResult:
    """スタブでは入力をそのまま返す。"""

    warped_bgr: np.ndarray
    corners_detected: bool


def apply_perspective_correction(bgr: np.ndarray) -> PerspectiveStubResult:
    if bgr.ndim != 3 or bgr.shape[2] != 3:
        raise ValueError("BGR uint8 画像 (H,W,3) を想定しています")
    return PerspectiveStubResult(warped_bgr=bgr.copy(), corners_detected=False)
