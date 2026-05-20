"""黒板 + チョーク文字らしさの入力ゲート。"""

from __future__ import annotations

from dataclasses import dataclass

import cv2
import numpy as np

from app.analysis.binarize import extract_chalk_mask

MIN_HEIGHT = 120
MIN_WIDTH = 160
MIN_GLOBAL_STD = 3.0
MIN_DYNAMIC_RANGE = 10.0
MIN_EXTREME_RANGE = 38.0
CONFIDENCE_THRESHOLD = 0.61


@dataclass(frozen=True)
class BoardGateResult:
    accepted: bool
    confidence: float
    reason: str
    metrics: dict[str, float]


def _clamp01(x: float) -> float:
    return float(np.clip(x, 0.0, 1.0))


def _component_stats(mask_u8: np.ndarray, image_area: float) -> tuple[int, float, float, float]:
    """(有効成分数, 巨大blob比率, 細片比率, 最大成分比率)"""
    n_labels, _labels, stats, _centroids = cv2.connectedComponentsWithStats((mask_u8 > 127).astype(np.uint8))
    if n_labels <= 1:
        return 0, 1.0, 0.0, 0.0

    areas = stats[1:, cv2.CC_STAT_AREA].astype(np.float64)
    fg_area = float(np.sum(areas))
    if fg_area <= 1.0:
        return 0, 1.0, 0.0, 0.0

    min_valid = max(10.0, image_area * 0.00003)
    max_valid = image_area * 0.025
    valid_count = int(np.sum((areas >= min_valid) & (areas <= max_valid)))
    large_blob_ratio = float(np.sum(areas[areas > image_area * 0.03]) / fg_area)
    tiny_ratio = float(np.sum(areas[areas < min_valid]) / fg_area)
    max_component_ratio = float(np.max(areas) / image_area)
    return valid_count, large_blob_ratio, tiny_ratio, max_component_ratio


def _text_layout_score(mask_u8: np.ndarray, image_area: float) -> tuple[float, dict[str, float]]:
    n_labels, _labels, stats, centroids = cv2.connectedComponentsWithStats((mask_u8 > 127).astype(np.uint8))
    if n_labels <= 1:
        return 0.0, {"layout_valid_bbox_count": 0.0, "layout_row_count": 0.0, "layout_rowline_score": 0.0}

    min_area = max(10.0, image_area * 0.00003)
    max_area = image_area * 0.02
    boxes: list[tuple[float, float, float]] = []  # cx, cy, h
    for i in range(1, n_labels):
        x, y, w, h, a = stats[i]
        if a < min_area or a > max_area:
            continue
        if w < 2 or h < 2:
            continue
        aspect = w / float(max(h, 1))
        if aspect < 0.12 or aspect > 6.5:
            continue
        cx, cy = centroids[i]
        boxes.append((float(cx), float(cy), float(h)))

    if not boxes:
        return 0.0, {"layout_valid_bbox_count": 0.0, "layout_row_count": 0.0, "layout_rowline_score": 0.0}

    arr = np.array(boxes, dtype=np.float64)
    cx = arr[:, 0]
    cy = arr[:, 1]
    hs = arr[:, 2]
    med_h = max(4.0, float(np.median(hs)))
    tol = max(4.0, med_h * 0.55)

    order = np.argsort(cy)
    rows: list[list[int]] = []
    cur = [int(order[0])]
    for idx in order[1:]:
        cur_mean = float(np.mean(cy[cur]))
        if abs(float(cy[idx]) - cur_mean) <= tol:
            cur.append(int(idx))
        else:
            rows.append(cur)
            cur = [int(idx)]
    rows.append(cur)

    valid_rows = [r for r in rows if len(r) >= 3]
    rowline_scores: list[float] = []
    for r in valid_rows:
        row_x = np.sort(cx[r])
        if row_x.size < 3:
            continue
        row_gaps = np.diff(row_x)
        row_gaps = row_gaps[row_gaps > 0.5]
        if row_gaps.size < 2:
            continue
        cv_gap = float(np.std(row_gaps) / (np.mean(row_gaps) + 1e-6))
        rowline_scores.append(float(np.exp(-min(cv_gap, 4.0) * 1.2)))

    count_score = _clamp01(len(boxes) / 26.0)
    row_score = _clamp01(len(valid_rows) / 3.0)
    rowline_score = float(np.mean(rowline_scores)) if rowline_scores else 0.0
    layout_score = _clamp01(0.45 * count_score + 0.3 * row_score + 0.25 * rowline_score)
    return layout_score, {
        "layout_valid_bbox_count": float(len(boxes)),
        "layout_row_count": float(len(valid_rows)),
        "layout_rowline_score": float(rowline_score),
    }


def assess_chalkboard_image(image_bgr: np.ndarray) -> BoardGateResult:
    if image_bgr.ndim != 3 or image_bgr.shape[2] != 3:
        return BoardGateResult(False, 0.0, "画像形式が不正です", {})

    h, w = image_bgr.shape[:2]
    if h < MIN_HEIGHT or w < MIN_WIDTH:
        return BoardGateResult(False, 0.0, "画像サイズが小さすぎます", {"image_height": float(h), "image_width": float(w)})

    gray = cv2.cvtColor(image_bgr, cv2.COLOR_BGR2GRAY)
    global_std = float(np.std(gray))
    dynamic_range = float(np.percentile(gray, 99) - np.percentile(gray, 1))
    extreme_range = float(np.max(gray) - np.min(gray))
    if global_std < MIN_GLOBAL_STD or (dynamic_range < MIN_DYNAMIC_RANGE and extreme_range < MIN_EXTREME_RANGE):
        return BoardGateResult(
            False,
            0.0,
            "画像の濃淡が少なく、板書判定ができません",
            {"global_std": global_std, "dynamic_range_p99_p1": dynamic_range, "extreme_range": extreme_range},
        )

    hsv = cv2.cvtColor(image_bgr, cv2.COLOR_BGR2HSV)
    h_ch, s_ch, v_ch = hsv[:, :, 0], hsv[:, :, 1], hsv[:, :, 2]
    image_area = float(h * w)

    dark_area_ratio = float(np.mean(v_ch < 145))
    bright_area_ratio = float(np.mean(v_ch > 205))
    green_board_ratio = float(np.mean((h_ch >= 35) & (h_ch <= 95) & (s_ch >= 22) & (v_ch <= 185)))
    dark_neutral_ratio = float(np.mean((s_ch < 45) & (v_ch < 145)))

    dark_score = _clamp01((dark_area_ratio - 0.30) / 0.45)
    green_score = _clamp01((green_board_ratio + 0.55 * dark_neutral_ratio - 0.12) / 0.46)
    bright_penalty = _clamp01((bright_area_ratio - 0.20) / 0.55)
    background_score = _clamp01(0.45 * dark_score + 0.35 * green_score + 0.20 * (1.0 - bright_penalty))

    if bright_area_ratio > 0.78:
        background_score *= 0.45

    bin_out = extract_chalk_mask(image_bgr)
    chalk_mask = bin_out.mask
    chalk_ratio = float(np.count_nonzero(chalk_mask > 127) / image_area)
    used_fallback_mask = 0.0
    if chalk_ratio > 0.72:
        hi_th = max(130.0, float(np.percentile(gray, 88)))
        fallback = ((gray.astype(np.float32) >= hi_th) & (v_ch >= 120)).astype(np.uint8) * 255
        fallback_ratio = float(np.count_nonzero(fallback > 127) / image_area)
        if 0.0015 <= fallback_ratio <= 0.42:
            chalk_mask = fallback
            chalk_ratio = fallback_ratio
            used_fallback_mask = 1.0
    component_count, large_blob_ratio, tiny_ratio, max_component_ratio = _component_stats(chalk_mask, image_area)

    fg = gray[chalk_mask > 127]
    bg = gray[chalk_mask <= 127]
    if fg.size > 0 and bg.size > 0:
        contrast_delta = float(np.mean(fg) - np.mean(bg))
        contrast_score = _clamp01((contrast_delta + 6.0) / 52.0)
    else:
        contrast_delta = 0.0
        contrast_score = 0.0

    low_ratio_score = _clamp01((chalk_ratio - 0.0035) / 0.020)
    high_ratio_penalty = _clamp01((chalk_ratio - 0.18) / 0.22)
    density_score = _clamp01(low_ratio_score * (1.0 - high_ratio_penalty))
    comp_score = _clamp01(component_count / 18.0)
    blob_penalty = _clamp01(large_blob_ratio * 2.8 + max(0.0, max_component_ratio - 0.08) * 7.0)
    noise_penalty = _clamp01((tiny_ratio - 0.55) / 0.30)
    chalk_stroke_score = _clamp01(
        0.35 * density_score + 0.25 * comp_score + 0.25 * contrast_score + 0.15 * (1.0 - max(blob_penalty, noise_penalty))
    )

    text_layout_score, layout_metrics = _text_layout_score(chalk_mask, image_area)

    confidence = _clamp01(0.40 * background_score + 0.35 * chalk_stroke_score + 0.25 * text_layout_score)
    accepted = confidence >= CONFIDENCE_THRESHOLD

    if not accepted:
        if background_score < 0.35:
            reason = "黒板背景らしさが不足しています"
        elif chalk_stroke_score < 0.35:
            reason = "チョーク線らしい明るいストロークが不足しています"
        else:
            reason = "文字配置が板書らしくありません"
    else:
        reason = "黒板とチョーク文字らしい画像です"

    metrics: dict[str, float] = {
        "image_height": float(h),
        "image_width": float(w),
        "global_std": global_std,
        "dynamic_range_p99_p1": dynamic_range,
        "extreme_range": extreme_range,
        "dark_area_ratio": dark_area_ratio,
        "green_board_ratio": green_board_ratio,
        "bright_area_ratio": bright_area_ratio,
        "background_score": background_score,
        "chalk_ratio": chalk_ratio,
        "used_fallback_mask": used_fallback_mask,
        "component_count": float(component_count),
        "large_blob_ratio": large_blob_ratio,
        "max_component_ratio": max_component_ratio,
        "contrast_delta": contrast_delta,
        "contrast_score": contrast_score,
        "chalk_stroke_score": chalk_stroke_score,
        "text_layout_score": text_layout_score,
        "confidence_threshold": CONFIDENCE_THRESHOLD,
        **layout_metrics,
    }
    return BoardGateResult(accepted=accepted, confidence=confidence, reason=reason, metrics=metrics)
