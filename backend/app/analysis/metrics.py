"""二値マスクから連結成分・行クラスタを推定し、板書らしさスコアを算出する。

OCR は行わず、形状・レイアウト統計のみで評価する。
"""

from __future__ import annotations

from dataclasses import dataclass

import cv2
import numpy as np

from app.schemas import AnalysisScores, BoundingBox, GridGuide, Point2D


@dataclass(frozen=True)
class TextLineBox:
    x: int
    y: int
    width: int
    height: int


@dataclass(frozen=True)
class MetricComputationResult:
    scores: AnalysisScores
    baseline_y_positions: list[float]
    char_boxes: list[BoundingBox]
    guide: GridGuide
    """解析工程内の警告（ユーザー向けノートにつなぐ）"""
    metric_notes: list[str]


def _clamp01(x: float) -> float:
    return float(np.clip(x, 0.0, 1.0))


def _coefficient_of_variation(values: np.ndarray) -> float:
    if values.size == 0:
        return 1.0
    m = float(np.mean(values))
    if m < 1e-9:
        return 1.0
    return float(np.std(values) / m)


def default_guide(w: int, h: int) -> GridGuide:
    cw = max(float(w) / 10.0, 16.0)
    ch = max(float(h) / 10.0, 16.0)
    return GridGuide(
        cell_width_px=cw,
        cell_height_px=ch,
        origin=Point2D(x=min(cw * 0.8, float(w) * 0.05), y=min(ch * 0.8, float(h) * 0.05)),
        columns=min(12, max(4, round(w / cw))),
        rows=min(12, max(4, round(h / ch))),
        rotation_deg=0.0,
    )


def compute_visibility_score(mask: np.ndarray, gray_u8: np.ndarray) -> tuple[float, list[str]]:
    """アップロード画像のコントラスト・マスク品質から視認性のみ算出する（0〜1）。"""
    h, w = int(mask.shape[0]), int(mask.shape[1])
    notes: list[str] = []
    if gray_u8.shape[:2] != (h, w):
        raise ValueError("マスクとグレースケールのサイズが一致しません")

    fg_ratio = float(np.count_nonzero(mask > 127) / float(h * w))
    gx = gray_u8.astype(np.float64)
    contrast_sigma = float(np.std(gx) / (255.0 + 1e-9))
    q10, q90 = np.percentile(gx.ravel(), [10.0, 90.0])
    spread = float((q90 - q10) / 255.0)

    lap = cv2.Laplacian(gray_u8, cv2.CV_64F, ksize=3)
    sharp = float(min(3.5, np.std(lap) / 25.0))

    fg_target_lo, fg_target_hi = 0.005, 0.28
    if fg_ratio < fg_target_lo:
        density_score = fg_ratio / fg_target_lo * 0.35
        notes.append("前景検出が非常に稀です（板書領域が写っているか、照明を確認してください）。")
    elif fg_ratio > fg_target_hi:
        density_score = fg_target_hi / fg_ratio
        density_score = _clamp01(density_score**1.25)
        if fg_ratio > 0.45:
            notes.append("二値マスクが濃くなっています。背景と混ざっている可能性があります。")
    else:
        mid = float((fg_target_lo + fg_target_hi) / 2.0)
        density_score = _clamp01(float(1.0 - abs(np.log(max(fg_ratio, 1e-6)) - np.log(mid)) / 3.8))

    if contrast_sigma < 0.035:
        notes.append("全体的なコントラストがやや不足しています。露光または照明を強めると改善する場合があります。")

    brightness_mean = float(np.mean(gx) / 255.0)
    bright_ok = np.exp(-((brightness_mean - 0.52) ** 2) / 0.12)

    visibility = _clamp01(
        _clamp01(2.8 * contrast_sigma) * 0.22
        + _clamp01(spread * 4.5) * 0.26
        + sharp * 0.18
        + density_score * 0.24
        + float(bright_ok) * 0.10
    )
    return visibility, notes


def _cluster_rows(cy_s: np.ndarray, heights_s: np.ndarray) -> list[np.ndarray]:
    """各連結成分のインデックスを行ごとに分ける（y 位置の単連結クラスタリング）。"""
    if cy_s.size == 0:
        return []
    order = np.argsort(cy_s)
    med_h = float(np.median(heights_s)) if heights_s.size else 8.0
    gap_tol = max(5.0, 0.38 * med_h)

    clusters: list[list[int]] = []
    current: list[int] = [int(order[0])]
    base_y = float(cy_s[order[0]])

    for idx in order[1:]:
        yi = float(cy_s[idx])
        mean_y = float(np.mean([cy_s[j] for j in current]))
        if abs(yi - mean_y) <= gap_tol:
            current.append(int(idx))
        else:
            clusters.append(current)
            current = [int(idx)]
    clusters.append(current)
    return [np.array(c, dtype=np.int32) for c in clusters]


def _detect_text_line_boxes(mask: np.ndarray) -> list[TextLineBox]:
    """チョーク線マスクから、文字列の行単位の外接矩形を推定する。"""
    h, w = mask.shape[:2]
    if h <= 2 or w <= 2:
        return []

    k_w = max(21, min(65, round(w / 18.0)))
    k_h = max(5, min(17, round(h / 100.0)))
    dilated = cv2.dilate((mask > 127).astype(np.uint8) * 255, cv2.getStructuringElement(cv2.MORPH_RECT, (k_w, k_h)))
    dilated = cv2.morphologyEx(
        dilated,
        cv2.MORPH_CLOSE,
        cv2.getStructuringElement(cv2.MORPH_RECT, (max(17, round(w / 24.0)), 3)),
        iterations=1,
    )
    n, _labels, stats, _ = cv2.connectedComponentsWithStats((dilated > 127).astype(np.uint8))

    boxes: list[TextLineBox] = []
    img_area = float(h * w)
    for i in range(1, n):
        sx, sy, sw, sh, area = [int(v) for v in stats[i]]
        if area < max(80.0, 0.0005 * img_area):
            continue
        if sw < 0.08 * w or sh < 0.025 * h:
            continue
        if sw > 0.92 * w or sh > 0.28 * h:
            continue
        if sy < 0.03 * h and sh < 0.05 * h:
            continue
        boxes.append(TextLineBox(x=sx, y=sy, width=sw, height=sh))

    boxes.sort(key=lambda b: (b.y, b.x))
    merged: list[TextLineBox] = []
    for box in boxes:
        if not merged:
            merged.append(box)
            continue
        prev = merged[-1]
        overlap = min(prev.y + prev.height, box.y + box.height) - max(prev.y, box.y)
        if overlap > 0.35 * min(prev.height, box.height):
            x0 = min(prev.x, box.x)
            y0 = min(prev.y, box.y)
            x1 = max(prev.x + prev.width, box.x + box.width)
            y1 = max(prev.y + prev.height, box.y + box.height)
            merged[-1] = TextLineBox(x=x0, y=y0, width=x1 - x0, height=y1 - y0)
        else:
            merged.append(box)
    return merged


def _score_line_horizontalness(mask: np.ndarray, line_boxes: list[TextLineBox]) -> float:
    if not line_boxes:
        return 0.35

    scores: list[float] = []
    for box in line_boxes:
        x0, y0 = box.x, box.y
        sub = mask[y0 : y0 + box.height, x0 : x0 + box.width]
        ys, xs = np.where(sub > 127)
        if xs.size < 8:
            scores.append(0.75)
            continue
        xs = xs.astype(np.float64) + float(x0)
        ys = ys.astype(np.float64) + float(y0)
        bins = np.linspace(float(x0), float(x0 + box.width), 8)
        bin_x: list[float] = []
        bin_y: list[float] = []
        for j in range(len(bins) - 1):
            selected = (xs >= bins[j]) & (xs < bins[j + 1])
            if int(np.count_nonzero(selected)) >= 4:
                bin_x.append(float((bins[j] + bins[j + 1]) / 2.0))
                bin_y.append(float(np.median(ys[selected])))
        if len(bin_x) < 3:
            scores.append(0.78)
            continue
        bx = np.array(bin_x, dtype=np.float64)
        by = np.array(bin_y, dtype=np.float64)
        slope, intercept = np.polyfit(bx, by, 1)
        angle_deg = abs(float(np.degrees(np.arctan(float(slope)))))
        residual = float(np.std(by - (slope * bx + intercept)))
        residual_norm = residual / max(float(box.height), 1.0)
        angle_score = float(np.exp(-((angle_deg / 12.0) ** 2)))
        residual_score = float(np.exp(-((residual_norm / 0.22) ** 2)))
        scores.append(_clamp01(0.58 * angle_score + 0.42 * residual_score))

    return _clamp01(float(np.mean(scores)))


def _score_line_spacing(line_boxes: list[TextLineBox], image_height: int) -> float:
    if len(line_boxes) < 2:
        return 0.82 if line_boxes else 0.35
    centers = np.array([b.y + b.height / 2.0 for b in line_boxes], dtype=np.float64)
    gaps = np.diff(np.sort(centers))
    if gaps.size == 0:
        return 0.82
    cv = _coefficient_of_variation(gaps)
    gap_med = float(np.median(gaps))
    min_reasonable_gap = max(12.0, image_height * 0.035)
    gap_score = _clamp01(gap_med / min_reasonable_gap) if gap_med < min_reasonable_gap else 1.0
    uniformity = float(np.exp(-max(0.0, cv - 0.12) * 3.0))
    return _clamp01(0.82 * uniformity + 0.18 * gap_score)


def _score_line_size_consistency(line_boxes: list[TextLineBox]) -> float:
    if not line_boxes:
        return 0.35
    if len(line_boxes) == 1:
        return 0.84
    heights = np.array([b.height for b in line_boxes], dtype=np.float64)
    cv_h = _coefficient_of_variation(heights)
    return _clamp01(float(np.exp(-max(0.0, cv_h - 0.20) * 3.0)))


def _score_stroke_quality(mask: np.ndarray, gray_u8: np.ndarray) -> float:
    fg = (mask > 127).astype(np.uint8)
    fg_count = int(np.count_nonzero(fg))
    if fg_count < 12:
        return 0.2

    img_area = float(mask.shape[0] * mask.shape[1])
    fg_ratio = fg_count / max(img_area, 1.0)

    dt = cv2.distanceTransform(fg, cv2.DIST_L2, 3)
    mean_radius = float(np.mean(dt[fg > 0])) if fg_count > 0 else 0.0
    mean_thickness = 2.0 * mean_radius
    if mean_thickness < 1.15:
        thickness_score = _clamp01(mean_thickness / 1.15)
    else:
        thickness_score = float(np.exp(-((mean_thickness - 2.8) / 2.3) ** 2))

    n, _labels, stats, _ = cv2.connectedComponentsWithStats(fg)
    if n <= 1:
        noise_score = 0.3
    else:
        areas = stats[1:, cv2.CC_STAT_AREA].astype(np.float64)
        noise_area_thr = max(6.0, 0.00002 * img_area)
        tiny_ratio = float(np.count_nonzero(areas < noise_area_thr) / max(1, areas.size))
        noise_score = _clamp01(1.0 - tiny_ratio * 1.8)

    opened = cv2.morphologyEx(fg * 255, cv2.MORPH_OPEN, cv2.getStructuringElement(cv2.MORPH_RECT, (2, 2)))
    continuity = float(np.count_nonzero(opened > 127) / max(1, fg_count))
    continuity_score = _clamp01(continuity * 1.25)

    density_target = 0.06
    density_score = _clamp01(float(np.exp(-abs(np.log(max(fg_ratio, 1e-6)) - np.log(density_target)) / 2.8)))

    gx = gray_u8.astype(np.float32)
    fg_pix = gx[fg > 0]
    bg_pix = gx[fg == 0]
    if fg_pix.size > 8 and bg_pix.size > 8:
        fg_mean = float(np.mean(fg_pix))
        bg_mean = float(np.mean(bg_pix))
        contrast_score = _clamp01(abs(fg_mean - bg_mean) / 95.0)
    else:
        contrast_score = 0.5

    return _clamp01(
        0.30 * thickness_score
        + 0.22 * continuity_score
        + 0.20 * noise_score
        + 0.14 * density_score
        + 0.14 * contrast_score
    )


def _suppress_outer_border(mask: np.ndarray, margin_ratio: float = 0.02) -> np.ndarray:
    h, w = mask.shape[:2]
    margin = max(2, int(round(min(h, w) * margin_ratio)))
    out = mask.copy()
    out[:margin, :] = 0
    out[h - margin :, :] = 0
    out[:, :margin] = 0
    out[:, w - margin :] = 0
    return out


def compute_metrics(mask: np.ndarray, gray_u8: np.ndarray) -> MetricComputationResult:
    """mask: 前景 255 の 1ch。gray_u8: 同一解像度のグレースケール。"""
    h, w = int(mask.shape[0]), int(mask.shape[1])
    metric_notes: list[str] = []
    if h <= 2 or w <= 2:
        raise ValueError("マスクサイズが不正です")
    if gray_u8.shape[:2] != (h, w):
        raise ValueError("マスクとグレースケールのサイズが一致しません")

    mask_eval = _suppress_outer_border(mask)

    fg_ratio = float(np.count_nonzero(mask_eval > 127) / float(h * w))
    _, labels, stats, _ = cv2.connectedComponentsWithStats((mask_eval > 127).astype(np.uint8))

    boxes_x: list[int] = []
    boxes_y: list[int] = []
    boxes_w: list[int] = []
    boxes_h: list[int] = []
    areas: list[float] = []
    cx_s: list[float] = []
    cy_s: list[float] = []

    img_area = float(h * w)
    min_area = max(28.0, 0.00008 * img_area)
    max_area = 0.35 * img_area
    max_h_frac = 0.75

    for i in range(1, stats.shape[0]):
        sx, sy, sw, sh, sa = stats[i]
        if sa < min_area or sa > max_area:
            continue
        if sw < 2 or sh < 2:
            continue
        if sw > w * 0.95 or sh > h * 0.95:
            continue
        if float(sh) > h * max_h_frac:
            continue
        boxes_x.append(int(sx))
        boxes_y.append(int(sy))
        boxes_w.append(int(sw))
        boxes_h.append(int(sh))
        areas.append(float(sa))
        cx_s.append(float(sx + sw / 2.0))
        cy_s.append(float(sy + sh / 2.0))

    n_blob = len(areas)

    char_boxes: list[BoundingBox] = []
    for sx, sy, sw, sh in zip(boxes_x, boxes_y, boxes_w, boxes_h, strict=True):
        char_boxes.append(
            BoundingBox(
                x=max(0.0, float(sx)),
                y=max(0.0, float(sy)),
                width=max(1.0, float(sw)),
                height=max(1.0, float(sh)),
            )
        )

    if n_blob < 10:
        metric_notes.append("文字線の検出が少ないため、スコアは参考程度になります（撮影を近づける・コントラストを強めることをお試しください）。")

    baseline_y_positions: list[float] = []

    heights_arr = np.array(boxes_h, dtype=np.float64)
    widths_arr = np.array(boxes_w, dtype=np.float64)
    areas_arr = np.array(areas, dtype=np.float64)
    cx = np.array(cx_s, dtype=np.float64)
    cy = np.array(cy_s, dtype=np.float64)

    rows = _cluster_rows(cy, heights_arr.astype(np.float64))

    # 行ごとベースライン（下端の加重最大に近い：マスク下端の代表的 y）
    for row_idx in rows:
        if row_idx.size == 0:
            continue
        bottoms = np.array(boxes_y, dtype=np.float64)[row_idx] + np.array(boxes_h, dtype=np.float64)[row_idx]
        baseline_y_positions.append(float(np.percentile(bottoms, 92)))

    baseline_y_positions.sort()

    # --- horizontalness ---
    disp_scores: list[float] = []
    for row_idx in rows:
        if row_idx.size < 2:
            continue
        cyy = cy[row_idx]
        row_h_est = float(np.median(heights_arr[row_idx])) if row_idx.size else 1.0
        normed_std = float(np.std(cyy) / (row_h_est + 1e-6))
        disp_scores.append(min(normed_std, 2.5))

    if disp_scores:
        align_score = float(np.exp(-np.mean(disp_scores) * 3.8))
    else:
        align_score = 0.35 if n_blob >= 3 else 0.2

    tilt_score = 1.0
    if len(baseline_y_positions) >= 2:
        xr = np.arange(len(baseline_y_positions), dtype=np.float64)
        by = np.array(baseline_y_positions, dtype=np.float64)
        slope, _intercept = np.polyfit(xr, by, 1)
        med_h_blob = float(np.median(heights_arr)) if heights_arr.size > 0 else float(h / 24.0)
        slope_norm = abs(float(slope)) / (med_h_blob + 1e-6)
        tilt_score = float(np.exp(-slope_norm * 2.0))

    if len(rows) < 2:
        horizontalness = _clamp01(0.55 * align_score + 0.45 * (0.85 if n_blob < 12 else tilt_score))
    else:
        horizontalness = _clamp01(0.62 * align_score + 0.38 * tilt_score)

    # --- spacing_uniformity (行内ギャップの変動係数) ---
    row_gap_cvs: list[float] = []
    for row_idx in rows:
        if row_idx.size < 4:
            continue
        rr = np.sort(cx[row_idx])
        gaps = np.diff(rr)
        gaps = gaps[gaps > 0.25]
        if gaps.size >= 3:
            row_gap_cvs.append(_coefficient_of_variation(gaps))

    if row_gap_cvs:
        spacing_uniformity = _clamp01(float(np.mean([np.exp(-cv * 2.2) for cv in row_gap_cvs])))
    else:
        spacing_uniformity = 0.4 if n_blob < 15 else _clamp01(0.85 * align_score)

    # --- size_consistency ---
    if heights_arr.size >= 4:
        cv_h = _coefficient_of_variation(heights_arr)
        cv_a = _coefficient_of_variation(areas_arr) if areas_arr.size >= 4 else cv_h
        size_consistency = _clamp01(
            np.exp(-cv_h * 1.6) * 0.55 + np.exp(min(cv_a, 5.0) * -1.1) * 0.45
        )
    elif heights_arr.size >= 1:
        cv_h = _coefficient_of_variation(heights_arr)
        size_consistency = _clamp01(float(np.exp(-cv_h * 1.9)))
    else:
        size_consistency = 0.15

    # --- visibility ---
    visibility, vis_notes = compute_visibility_score(mask, gray_u8)
    metric_notes.extend(vis_notes)

    line_boxes = _detect_text_line_boxes(mask_eval)
    if line_boxes:
        line_horizontalness = _score_line_horizontalness(mask, line_boxes)
        line_spacing = _score_line_spacing(line_boxes, h)
        line_size = _score_line_size_consistency(line_boxes)
        horizontalness = _clamp01(0.85 * line_horizontalness + 0.15 * horizontalness)
        spacing_uniformity = _clamp01(0.75 * line_spacing + 0.25 * spacing_uniformity)
        size_consistency = _clamp01(0.75 * line_size + 0.25 * size_consistency)
        baseline_y_positions = [float(b.y + b.height * 0.82) for b in line_boxes]
        char_boxes = [
            BoundingBox(x=float(b.x), y=float(b.y), width=float(b.width), height=float(b.height))
            for b in line_boxes
        ]

    line_alignment = _clamp01(float(horizontalness))
    spacing_balance = _clamp01(float(spacing_uniformity))
    stroke_quality = _score_stroke_quality(mask_eval, gray_u8)
    readability = _clamp01(
        0.34 * line_alignment
        + 0.22 * size_consistency
        + 0.20 * spacing_balance
        + 0.18 * stroke_quality
        + 0.06 * visibility
    )

    if stroke_quality < 0.58:
        metric_notes.append("線が薄い・かすれる・ノイズが多い可能性があります。線の濃さや撮影距離を調整してください。")
    if line_alignment < 0.55:
        metric_notes.append("行の傾きや上下ぶれが見られます。行の高さとベースラインを揃えると読みやすくなります。")

    scores = AnalysisScores(
        readability=readability,
        line_alignment=line_alignment,
        spacing_balance=spacing_balance,
        stroke_quality=_clamp01(float(stroke_quality)),
        horizontalness=line_alignment,
        spacing_uniformity=spacing_balance,
        size_consistency=_clamp01(float(size_consistency)),
        visibility=_clamp01(float(visibility)),
    )

    # --- GridGuide ---
    if char_boxes:
        bx = np.array(boxes_x, dtype=np.float64)
        bwv = np.array(boxes_w, dtype=np.float64)
        bw = float(np.percentile(np.sort(bwv), 42)) + 4.0
        bh_med = float(np.median(heights_arr)) + 6.0
        x_min = float(max(0.0, bx.min() - 0.06 * bw))
        y_top = float(max(0.0, float(np.percentile(boxes_y, 5)) - 0.2 * bh_med))
        cw = float(max(bw, 24.0))
        ch = float(max(bh_med, 22.0))
        span_x = float(w - x_min)
        cols = max(3, min(24, round(span_x / cw)))
        n_row = len(baseline_y_positions) if baseline_y_positions else max(3, round(h / ch))
        n_row = int(np.clip(n_row, 3, min(22, round(h / ch))))

        rotation = 0.0
        if len(baseline_y_positions) >= 2:
            xr2 = np.arange(len(baseline_y_positions), dtype=np.float64)
            by2 = np.array(baseline_y_positions, dtype=np.float64)
            slope2, _ = np.polyfit(xr2, by2, 1)
            # 行順に並んだベースラインのわずかな傾き（表示用）：ピクセル/行 をセル高で正規化
            rotation = float(np.clip(np.degrees(np.arctan(slope2 / max(ch, 24.0))), -14.0, 14.0))

        guide = GridGuide(
            cell_width_px=cw,
            cell_height_px=ch,
            origin=Point2D(x=x_min, y=y_top),
            columns=int(min(48, cols)),
            rows=max(3, min(24, int(n_row))),
            rotation_deg=rotation,
        )
    else:
        guide = default_guide(w, h)

    return MetricComputationResult(
        scores=scores,
        baseline_y_positions=sorted(baseline_y_positions),
        char_boxes=char_boxes,
        guide=guide,
        metric_notes=metric_notes,
    )
