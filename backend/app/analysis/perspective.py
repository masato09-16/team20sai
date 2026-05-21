"""台形補正（四隅検出・透視変換）。

黒板らしい四角形輪郭が十分に信頼できる場合のみ
透視変換を適用し、それ以外は入力画像をそのまま返す。
"""

from __future__ import annotations

from dataclasses import dataclass

import cv2
import numpy as np


@dataclass(frozen=True)
class PerspectiveResult:
    """透視補正の結果。"""

    warped_bgr: np.ndarray
    corners_detected: bool


def _order_quad_points(pts: np.ndarray) -> np.ndarray:
    """4点を [tl, tr, br, bl] の順へ並べ替える。"""
    p = pts.astype(np.float32)
    s = p.sum(axis=1)
    d = np.diff(p, axis=1).reshape(-1)
    ordered = np.zeros((4, 2), dtype=np.float32)
    ordered[0] = p[np.argmin(s)]  # top-left
    ordered[2] = p[np.argmax(s)]  # bottom-right
    ordered[1] = p[np.argmin(d)]  # top-right
    ordered[3] = p[np.argmax(d)]  # bottom-left
    return ordered


def _quad_quality_score(quad: np.ndarray) -> float:
    """四角形らしさの簡易品質スコア（0〜1）。"""
    edges = np.roll(quad, -1, axis=0) - quad
    lengths = np.linalg.norm(edges, axis=1)
    if np.min(lengths) < 1e-6:
        return 0.0

    # 角度が 90 度に近いほど高得点（cos=0 が直角）
    cos_vals: list[float] = []
    for i in range(4):
        v1 = quad[(i - 1) % 4] - quad[i]
        v2 = quad[(i + 1) % 4] - quad[i]
        n1 = float(np.linalg.norm(v1))
        n2 = float(np.linalg.norm(v2))
        if n1 < 1e-6 or n2 < 1e-6:
            return 0.0
        c = abs(float(np.dot(v1, v2) / (n1 * n2 + 1e-9)))
        cos_vals.append(c)
    angle_score = float(np.clip(1.0 - np.mean(cos_vals) * 1.9, 0.0, 1.0))

    # 向かい合う辺の長さが近いほど高得点
    pair_ratio_1 = min(lengths[0], lengths[2]) / max(lengths[0], lengths[2], 1e-6)
    pair_ratio_2 = min(lengths[1], lengths[3]) / max(lengths[1], lengths[3], 1e-6)
    parallel_score = float(np.clip((pair_ratio_1 + pair_ratio_2) * 0.5, 0.0, 1.0))
    return float(np.clip(0.65 * angle_score + 0.35 * parallel_score, 0.0, 1.0))


def _detect_board_quad(bgr: np.ndarray) -> np.ndarray | None:
    h, w = bgr.shape[:2]
    img_area = float(h * w)
    gray = cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY)
    blur = cv2.GaussianBlur(gray, (5, 5), 0)

    # 照明条件の差に強くするため、エッジ画像と閾値画像の双方から候補探索
    edges = cv2.Canny(blur, 60, 180)
    edges = cv2.morphologyEx(edges, cv2.MORPH_CLOSE, np.ones((5, 5), dtype=np.uint8), iterations=1)
    th = cv2.adaptiveThreshold(blur, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY, 31, 7)
    th = cv2.morphologyEx(th, cv2.MORPH_CLOSE, np.ones((7, 7), dtype=np.uint8), iterations=1)

    candidates = [edges, th]
    best_quad: np.ndarray | None = None
    best_score = 0.0

    min_area = 0.18 * img_area
    max_area = 0.97 * img_area
    min_aspect = 0.6
    max_aspect = 3.4

    for src in candidates:
        contours, _ = cv2.findContours(src, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        for cnt in contours:
            peri = cv2.arcLength(cnt, True)
            if peri < 1.0:
                continue
            approx = cv2.approxPolyDP(cnt, 0.02 * peri, True)
            if len(approx) != 4 or not cv2.isContourConvex(approx):
                continue

            quad = _order_quad_points(approx.reshape(4, 2))
            area = float(cv2.contourArea(quad))
            if area < min_area or area > max_area:
                continue

            widths = [
                float(np.linalg.norm(quad[1] - quad[0])),
                float(np.linalg.norm(quad[2] - quad[3])),
            ]
            heights = [
                float(np.linalg.norm(quad[3] - quad[0])),
                float(np.linalg.norm(quad[2] - quad[1])),
            ]
            est_w = max(1.0, sum(widths) * 0.5)
            est_h = max(1.0, sum(heights) * 0.5)
            aspect = est_w / est_h
            if aspect < min_aspect or aspect > max_aspect:
                continue

            rect = cv2.minAreaRect(quad)
            rect_area = max(1.0, float(rect[1][0] * rect[1][1]))
            rectangularity = area / rect_area
            if rectangularity < 0.68:
                continue

            quality = _quad_quality_score(quad)
            if quality < 0.52:
                continue

            coverage = area / img_area
            score = quality * 0.72 + rectangularity * 0.18 + coverage * 0.10
            if score > best_score:
                best_score = score
                best_quad = quad

    return best_quad


def _warp_from_quad(bgr: np.ndarray, quad: np.ndarray) -> np.ndarray | None:
    h, w = bgr.shape[:2]
    tl, tr, br, bl = quad
    width_top = float(np.linalg.norm(tr - tl))
    width_bottom = float(np.linalg.norm(br - bl))
    height_left = float(np.linalg.norm(bl - tl))
    height_right = float(np.linalg.norm(br - tr))

    out_w = int(round(max(width_top, width_bottom)))
    out_h = int(round(max(height_left, height_right)))
    if out_w < 64 or out_h < 64:
        return None

    # 元画像に対して極端に小さすぎ/大きすぎる補正は避ける
    out_area_ratio = (out_w * out_h) / float(max(h * w, 1))
    out_aspect = out_w / float(max(out_h, 1))
    in_aspect = w / float(max(h, 1))
    aspect_similarity = min(out_aspect, in_aspect) / max(out_aspect, in_aspect, 1e-6)
    if out_area_ratio < 0.2 or out_area_ratio > 1.05 or aspect_similarity < 0.45:
        return None

    dst = np.array(
        [[0.0, 0.0], [float(out_w - 1), 0.0], [float(out_w - 1), float(out_h - 1)], [0.0, float(out_h - 1)]],
        dtype=np.float32,
    )
    mat = cv2.getPerspectiveTransform(quad.astype(np.float32), dst)
    return cv2.warpPerspective(bgr, mat, (out_w, out_h), flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_REPLICATE)


def apply_perspective_correction(bgr: np.ndarray) -> PerspectiveResult:
    if bgr.ndim != 3 or bgr.shape[2] != 3:
        raise ValueError("BGR uint8 画像 (H,W,3) を想定しています")
    quad = _detect_board_quad(bgr)
    if quad is None:
        return PerspectiveResult(warped_bgr=bgr.copy(), corners_detected=False)
    warped = _warp_from_quad(bgr, quad)
    if warped is None:
        return PerspectiveResult(warped_bgr=bgr.copy(), corners_detected=False)
    return PerspectiveResult(warped_bgr=warped, corners_detected=True)
