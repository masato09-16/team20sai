"""チョーク文字の二値化・ノイズ除去のスタブ。

実装時: 適応的二値化、モルフォロジー、色空間分離などを組み合わせる。
"""

from __future__ import annotations

from dataclasses import dataclass

import cv2
import numpy as np


@dataclass(frozen=True)
class BinarizeStubResult:
    mask: np.ndarray  # 0/255 uint8 1ch


def extract_chalk_mask(bgr: np.ndarray) -> BinarizeStubResult:
    if bgr.ndim != 3 or bgr.shape[2] != 3:
        raise ValueError("BGR uint8 画像 (H,W,3) を想定しています")
    gray = cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY)
    _, mask = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    return BinarizeStubResult(mask=mask)
