"""参照マスクとアップロードマスクの位置合わせと誤差指標（OpenCV / NumPy）。"""

from __future__ import annotations

from dataclasses import dataclass

import cv2
import numpy as np

from app.schemas import ReferenceComparison


def _clamp01(x: float) -> float:
    return float(np.clip(x, 0.0, 1.0))


def _fg_bbox(mask: np.ndarray) -> tuple[int, int, int, int] | None:
    """前景 ( >127 ) の外接矩形。無ければ None。"""
    ys, xs = np.where(mask > 127)
    if xs.size == 0:
        return None
    y0, y1 = int(ys.min()), int(ys.max())
    x0, x1 = int(xs.min()), int(xs.max())
    return x0, y0, x1 + 1, y1 + 1


def _letterbox_binary(crop: np.ndarray, out: int) -> np.ndarray:
    """0/255 の切り出しを ``out`` 四方に収め、余白 0 で中央配置。"""
    h, w = crop.shape[:2]
    if h < 1 or w < 1:
        return np.zeros((out, out), dtype=np.uint8)
    inner = out - 4
    scale = min(inner / float(w), inner / float(h))
    nw = max(1, int(round(w * scale)))
    nh = max(1, int(round(h * scale)))
    resized = cv2.resize(crop, (nw, nh), interpolation=cv2.INTER_NEAREST)
    canvas = np.zeros((out, out), dtype=np.uint8)
    y0 = (out - nh) // 2
    x0 = (out - nw) // 2
    canvas[y0 : y0 + nh, x0 : x0 + nw] = resized
    return canvas


def _normalize_profile(p: np.ndarray) -> np.ndarray:
    p = p.astype(np.float64)
    s = float(np.sum(p))
    if s < 1e-9:
        return np.zeros_like(p)
    return p / s


def _profile_similarity(a: np.ndarray, b: np.ndarray) -> float:
    """正規化した 1D プロファイルの一致度（0〜1）。"""
    na = _normalize_profile(a)
    nb = _normalize_profile(b)
    n = min(na.size, nb.size)
    if n == 0:
        return 0.0
    na = na[:n]
    nb = nb[:n]
    dist = float(np.mean(np.abs(na - nb)))
    return _clamp01(1.0 - min(1.0, dist * 2.5))


@dataclass(frozen=True)
class LayoutScores:
    horizontalness: float
    spacing_uniformity: float
    size_consistency: float


@dataclass(frozen=True)
class FullCompareResult:
    reference_comparison: ReferenceComparison
    layout: LayoutScores


def compare_reference_masks(
    ref_mask: np.ndarray,
    upload_mask: np.ndarray,
    align_size: int = 384,
) -> FullCompareResult:
    """両マスクは同じ解像度であることを前提に、前景 bbox で切り出し同一サイズへ整形して比較する。"""
    ref_bin = (ref_mask > 127).astype(np.uint8) * 255
    up_bin = (upload_mask > 127).astype(np.uint8) * 255

    br = _fg_bbox(ref_bin)
    bu = _fg_bbox(up_bin)

    if br is None or bu is None:
        z = ReferenceComparison(
            font_similarity=0.05,
            iou=0.0,
            dice_coefficient=0.0,
            pixel_agreement=0.0,
            contour_distance_score=0.0,
        )
        lay = LayoutScores(0.1, 0.1, 0.1)
        return FullCompareResult(reference_comparison=z, layout=lay)

    xr0, yr0, xr1, yr1 = br
    xu0, yu0, xu1, yu1 = bu
    crop_r = ref_bin[yr0:yr1, xr0:xr1]
    crop_u = up_bin[yu0:yu1, xu0:xu1]

    ar = float(np.count_nonzero(crop_r > 127))
    au = float(np.count_nonzero(crop_u > 127))
    area_ratio = min(ar, au) / max(ar, au, 1.0)
    size_consistency = _clamp01(float(np.sqrt(area_ratio)))

    r = _letterbox_binary(crop_r, align_size)
    u = _letterbox_binary(crop_u, align_size)

    r01 = (r > 127).astype(np.uint8)
    u01 = (u > 127).astype(np.uint8)

    inter = int(np.sum(r01 & u01))
    sum_r = int(np.sum(r01))
    sum_u = int(np.sum(u01))
    union = sum_r + sum_u - inter
    iou = inter / float(union) if union > 0 else 0.0
    dice = (2.0 * inter) / float(sum_r + sum_u) if (sum_r + sum_u) > 0 else 0.0
    pixel_agreement = float(np.mean(r01 == u01))

    inv_r = (1 - r01) * 255
    dt = cv2.distanceTransform(inv_r, cv2.DIST_L2, 5)
    up_idx = u01 > 0
    if np.any(up_idx):
        mean_d = float(np.mean(dt[up_idx]))
        contour_distance_score = _clamp01(float(np.exp(-mean_d / 10.0)))
    else:
        contour_distance_score = 0.0

    font_similarity = _clamp01(
        0.28 * iou + 0.28 * dice + 0.24 * pixel_agreement + 0.20 * contour_distance_score
    )

    ref_comp = ReferenceComparison(
        font_similarity=font_similarity,
        iou=_clamp01(iou),
        dice_coefficient=_clamp01(dice),
        pixel_agreement=_clamp01(pixel_agreement),
        contour_distance_score=contour_distance_score,
    )

    row_r = r.sum(axis=1).astype(np.float64)
    row_u = u.sum(axis=1).astype(np.float64)
    col_r = r.sum(axis=0).astype(np.float64)
    col_u = u.sum(axis=0).astype(np.float64)

    horizontalness = _profile_similarity(row_r, row_u)
    spacing_uniformity = _profile_similarity(col_r, col_u)

    horizontalness = _clamp01(0.55 * horizontalness + 0.45 * font_similarity)
    spacing_uniformity = _clamp01(0.55 * spacing_uniformity + 0.45 * font_similarity)
    size_consistency = _clamp01(0.55 * size_consistency + 0.45 * font_similarity)

    lay = LayoutScores(
        horizontalness=horizontalness,
        spacing_uniformity=spacing_uniformity,
        size_consistency=size_consistency,
    )
    return FullCompareResult(reference_comparison=ref_comp, layout=lay)
