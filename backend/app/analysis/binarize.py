"""板書画像から前景（チョーク・ペン線）マスクを抽出する。

照明ムラへの耐性のため CLAHE・適適応二値化・モルフォロジーを組み合わせ、
白板（明背景）／黒板（暗背景）をヒューリスティックで推定して前景を反転統一する。
"""

from __future__ import annotations

from dataclasses import dataclass

import cv2
import numpy as np


@dataclass(frozen=True)
class BinarizeResult:
    """前景（線・ストローク相当）が 255 の uint8 1ch マスク。"""

    mask: np.ndarray
    background_is_light: bool


def _edge_background_median(gray: np.ndarray) -> float:
    """縁を背景の代表として、その明度中央値を返す。"""
    h, w = gray.shape[:2]
    if h < 2 or w < 2:
        return float(np.median(gray))
    top = gray[0, :].ravel()
    bot = gray[-1, :].ravel()
    left = gray[1:-1, 0].ravel()
    right = gray[1:-1, -1].ravel()
    return float(np.median(np.concatenate([top, bot, left, right])))


def extract_chalk_mask(bgr: np.ndarray) -> BinarizeResult:
    """BGR uint8 を受け取り、前景ストロークを 255 とするマスクを返す。"""
    if bgr.ndim != 3 or bgr.shape[2] != 3:
        raise ValueError("BGR uint8 画像 (H,W,3) を想定しています")

    gray = cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY)
    blurred = cv2.GaussianBlur(gray, (3, 3), 0)
    clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8)).apply(blurred)

    bg_med = _edge_background_median(clahe)
    light_bg = bg_med > 120.0

    # 適応二値化の探索窓サイズ（必ず奇数、極端に大きくしない）
    block = max(15, min(63, round(min(clahe.shape) / 40.0))) | 1

    # 白板: 筆記が暗い → 適応二値化で暗領域を前景(255)
    # 黒板: 筆記が明るい → 明領域を前景(255)
    if light_bg:
        adaptive = cv2.adaptiveThreshold(
            clahe,
            255,
            cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
            cv2.THRESH_BINARY_INV,
            block,
            5,
        )
        _, otsu = cv2.threshold(clahe, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)
    else:
        adaptive = cv2.adaptiveThreshold(
            clahe,
            255,
            cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
            cv2.THRESH_BINARY,
            block,
            5,
        )
        _, otsu = cv2.threshold(clahe, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)

    merged = cv2.bitwise_or(adaptive, otsu)

    k = np.ones((3, 3), np.uint8)
    closed = cv2.morphologyEx(merged, cv2.MORPH_CLOSE, k, iterations=1)
    opened = cv2.morphologyEx(closed, cv2.MORPH_OPEN, k, iterations=1)

    return BinarizeResult(mask=opened, background_is_light=light_bg)
