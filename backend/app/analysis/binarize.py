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


def _green_board_roi_mask(bgr: np.ndarray) -> np.ndarray | None:
    """緑系黒板の盤面らしい最大領域を ROI として返す。検出できなければ None。"""
    h_img, w_img = bgr.shape[:2]
    hsv = cv2.cvtColor(bgr, cv2.COLOR_BGR2HSV)
    hue, sat, val = cv2.split(hsv)
    board = ((hue >= 25) & (hue <= 95) & (sat >= 30) & (val >= 25) & (val <= 225)).astype(np.uint8) * 255
    k = np.ones((31, 31), np.uint8)
    board = cv2.morphologyEx(board, cv2.MORPH_CLOSE, k, iterations=2)
    n, labels, stats, _ = cv2.connectedComponentsWithStats((board > 127).astype(np.uint8))
    if n <= 1:
        return None

    idx = int(1 + np.argmax(stats[1:, cv2.CC_STAT_AREA]))
    x, y, w, h, area = [int(v) for v in stats[idx]]
    if area < 0.25 * h_img * w_img or w < 0.35 * w_img or h < 0.35 * h_img:
        return None

    mx = max(8, int(0.035 * w))
    my = max(4, int(0.01 * h))
    roi = np.zeros((h_img, w_img), dtype=np.uint8)
    roi[y + my : y + h - my, x + mx : x + w - mx] = 255
    return roi


def _remove_non_text_artifacts(mask: np.ndarray) -> np.ndarray:
    """黒板枠・上下端の細長い反射など、文字ではない大きな成分を落とす。"""
    h, w = mask.shape[:2]
    n, labels, stats, _ = cv2.connectedComponentsWithStats((mask > 127).astype(np.uint8))
    cleaned = np.zeros_like(mask)
    img_area = float(h * w)
    for i in range(1, n):
        sx, sy, sw, sh, area = [int(v) for v in stats[i]]
        if area < 4:
            continue
        if area > 0.035 * img_area:
            continue
        if sh > 0.42 * h or sw > 0.72 * w:
            continue
        aspect = max(float(sw) / max(float(sh), 1.0), float(sh) / max(float(sw), 1.0))
        if aspect > 18.0 and (sw > 0.18 * w or sh > 0.18 * h):
            continue
        if area < 50 and (sy < 0.035 * h or sy + sh > 0.965 * h):
            continue
        cleaned[labels == i] = 255
    return cleaned


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
    # 黒板: 筆記が明るい → 局所背景との差分でチョーク線を前景(255)
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
        merged = cv2.bitwise_or(adaptive, otsu)
    else:
        bg_kernel = max(31, min(81, round(min(gray.shape[:2]) / 12.0))) | 1
        local_bg = cv2.medianBlur(gray, bg_kernel)
        diff = cv2.subtract(gray, local_bg)
        threshold = float(np.clip(np.percentile(diff, 96.0), 14.0, 30.0))
        merged = ((diff > threshold) & (gray > 78)).astype(np.uint8) * 255
        roi = _green_board_roi_mask(bgr)
        if roi is not None:
            merged = cv2.bitwise_and(merged, roi)

    k = np.ones((3, 3), np.uint8)
    closed = cv2.morphologyEx(merged, cv2.MORPH_CLOSE, k, iterations=1)
    opened = cv2.morphologyEx(closed, cv2.MORPH_OPEN, k, iterations=1)
    if not light_bg:
        opened = _remove_non_text_artifacts(opened)

    return BinarizeResult(mask=opened, background_is_light=light_bg)
