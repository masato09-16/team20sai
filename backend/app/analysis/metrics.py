"""二値マスクから連結成分・行クラスタを推定し、板書らしさスコアを算出する。

OCR は行わず、形状・レイアウト統計のみで評価する。
"""

from __future__ import annotations

from dataclasses import dataclass

import cv2
import numpy as np

from app.schemas import (
    AnalysisScores,
    BlackboardType,
    BoundingBox,
    FixedRuleAxisScores,
    FixedRuleScoring,
    GridGuide,
    Point2D,
    WritingDirection,
)


@dataclass(frozen=True)
class TextLineBox:
    x: int
    y: int
    width: int
    height: int


@dataclass(frozen=True)
class MetricComputationResult:
    scores: AnalysisScores
    scoring: FixedRuleScoring
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


def _robust_cv(values: np.ndarray) -> float:
    if values.size == 0:
        return 1.0
    med = float(np.median(values))
    if med < 1e-9:
        return 1.0
    mad = float(np.median(np.abs(values.astype(np.float64) - med)))
    return float(1.4826 * mad / med)


def _score_less_is_better(value: float, good: float, bad: float) -> float:
    if bad <= good:
        return 1.0 if value <= good else 0.0
    return _clamp01(1.0 - (float(value) - good) / (bad - good))


def _score_more_is_better(value: float, bad: float, good: float) -> float:
    if good <= bad:
        return 1.0 if value >= good else 0.0
    return _clamp01((float(value) - bad) / (good - bad))


def _score_band(value: float, low_bad: float, good_low: float, good_high: float, high_bad: float) -> float:
    if value < good_low:
        return _score_more_is_better(value, low_bad, good_low)
    if value > good_high:
        return _score_less_is_better(value, good_high, high_bad)
    return 1.0


def _percentile(values: list[float] | np.ndarray, q: float, default: float) -> float:
    arr = np.array(values, dtype=np.float64)
    if arr.size == 0:
        return default
    return float(np.percentile(arr, q))


def _label_density(value: float) -> str:
    if value < 0.025:
        return "low"
    if value < 0.16:
        return "moderate"
    return "high"


def _label_crowding(value: float) -> str:
    if value < 0.34:
        return "low"
    if value < 0.62:
        return "moderate"
    return "high"


_BOARD_TYPE_WEIGHTS: dict[str, tuple[float, float, float, float]] = {
    "lecture": (0.40, 0.25, 0.20, 0.15),
    "exercise": (0.35, 0.25, 0.25, 0.15),
    "idea": (0.30, 0.15, 0.35, 0.20),
    "summary": (0.35, 0.20, 0.30, 0.15),
    "display": (0.25, 0.10, 0.40, 0.25),
}

_SIZE_RATIO_RULES: dict[str, tuple[float, float, float, float]] = {
    "lecture": (0.018, 0.050, 0.150, 0.240),
    "exercise": (0.016, 0.046, 0.150, 0.240),
    "idea": (0.014, 0.040, 0.155, 0.250),
    "summary": (0.018, 0.052, 0.160, 0.250),
    "display": (0.010, 0.032, 0.150, 0.260),
}


def _gap_statistics_for_rows(
    rows: list[np.ndarray],
    boxes_x: np.ndarray,
    boxes_w: np.ndarray,
    widths_arr: np.ndarray,
) -> tuple[float, float]:
    ratios: list[float] = []
    center_gap_cvs: list[float] = []
    for row_idx in rows:
        if row_idx.size < 2:
            continue
        order = row_idx[np.argsort(boxes_x[row_idx])]
        local_width = float(np.median(widths_arr[order])) if order.size else 1.0
        local_width = max(local_width, 1.0)
        edges = [(float(boxes_x[i]), float(boxes_x[i] + boxes_w[i])) for i in order]
        for (_, right), (left_next, _) in zip(edges, edges[1:], strict=False):
            ratios.append((left_next - right) / local_width)
        centers = boxes_x[order].astype(np.float64) + boxes_w[order].astype(np.float64) / 2.0
        gaps = np.diff(centers)
        gaps = gaps[gaps > 0.25]
        if gaps.size >= 3:
            center_gap_cvs.append(_robust_cv(gaps))
    return _percentile(ratios, 20.0, 0.35), _percentile(center_gap_cvs, 50.0, 0.25)


def _vertical_straightness(
    columns: list[np.ndarray],
    cx: np.ndarray,
    boxes_w: np.ndarray,
) -> float:
    if not columns:
        return 0.35
    scores: list[float] = []
    for col_idx in columns:
        if col_idx.size < 2:
            continue
        local_w = float(np.median(boxes_w[col_idx])) if col_idx.size else 1.0
        disp = float(np.std(cx[col_idx]) / max(local_w, 1.0))
        scores.append(float(np.exp(-disp * 3.8)))
    if not scores:
        return 0.78
    return _clamp01(float(np.mean(scores)))


def _column_gap_cv(columns: list[np.ndarray], cx: np.ndarray) -> float:
    if len(columns) < 2:
        return 0.25
    centers = [float(np.median(cx[idx])) for idx in columns if idx.size > 0]
    if len(centers) < 2:
        return 0.25
    gaps = np.diff(np.sort(np.array(centers, dtype=np.float64)))
    gaps = gaps[gaps > 0.25]
    return _robust_cv(gaps) if gaps.size >= 2 else 0.25


def _grid_local_crowding(mask_eval: np.ndarray, median_height: float) -> float:
    h, w = mask_eval.shape[:2]
    cell = int(max(32.0, min(180.0, median_height * 3.0)))
    densities: list[float] = []
    fg = mask_eval > 127
    for y in range(0, h, cell):
        for x in range(0, w, cell):
            sub = fg[y : min(h, y + cell), x : min(w, x + cell)]
            if sub.size:
                densities.append(float(np.count_nonzero(sub) / sub.size))
    return _percentile(densities, 95.0, 0.0)


def _max_box_overlap(line_boxes: list[TextLineBox]) -> float:
    if len(line_boxes) < 2:
        return 0.0
    max_overlap = 0.0
    for i, a in enumerate(line_boxes):
        ax1, ay1 = a.x + a.width, a.y + a.height
        area_a = max(1.0, float(a.width * a.height))
        for b in line_boxes[i + 1 :]:
            bx1, by1 = b.x + b.width, b.y + b.height
            ix = max(0, min(ax1, bx1) - max(a.x, b.x))
            iy = max(0, min(ay1, by1) - max(a.y, b.y))
            if ix <= 0 or iy <= 0:
                continue
            area_b = max(1.0, float(b.width * b.height))
            max_overlap = max(max_overlap, float(ix * iy) / min(area_a, area_b))
    return max_overlap


def _line_gap_ratios(line_boxes: list[TextLineBox]) -> list[float]:
    if len(line_boxes) < 2:
        return []
    ordered = sorted(line_boxes, key=lambda b: (b.y, b.x))
    median_height = max(1.0, float(np.median([b.height for b in ordered])))
    return [
        float((b.y - (a.y + a.height)) / median_height)
        for a, b in zip(ordered, ordered[1:], strict=False)
    ]


def _compute_fixed_rule_scoring(
    mask_eval: np.ndarray,
    gray_u8: np.ndarray,
    *,
    board_type: BlackboardType,
    writing_direction: WritingDirection,
    line_boxes: list[TextLineBox],
    rows: list[np.ndarray],
    columns: list[np.ndarray],
    boxes_x: np.ndarray,
    boxes_y: np.ndarray,
    boxes_w: np.ndarray,
    boxes_h: np.ndarray,
    areas_arr: np.ndarray,
    cx: np.ndarray,
    cy: np.ndarray,
    horizontalness: float,
    spacing_uniformity: float,
    size_consistency: float,
    stroke_quality: float,
    capture_visibility: float,
) -> FixedRuleScoring:
    h, w = int(mask_eval.shape[0]), int(mask_eval.shape[1])
    fg = mask_eval > 127
    fg_ratio = float(np.count_nonzero(fg) / max(1, h * w))
    n_blob = int(areas_arr.size)

    median_h = float(np.median(boxes_h)) if boxes_h.size else float(h / 24.0)
    median_w = float(np.median(boxes_w)) if boxes_w.size else float(w / 40.0)
    median_h = max(1.0, median_h)
    median_w = max(1.0, median_w)

    low_bad, good_low, good_high, high_bad = _SIZE_RATIO_RULES.get(str(board_type), _SIZE_RATIO_RULES["lecture"])
    size_ratio = median_h / max(1.0, float(h))
    char_size_score = _score_band(size_ratio, low_bad, good_low, good_high, high_bad)

    if np.count_nonzero(fg) > 8 and np.count_nonzero(~fg) > 8:
        fg_median = float(np.median(gray_u8[fg]))
        bg_median = float(np.median(gray_u8[~fg]))
        contrast_delta = abs(fg_median - bg_median)
    else:
        contrast_delta = 0.0
    contrast_score = _score_more_is_better(contrast_delta, 12.0, 58.0)

    gap_q20, gap_cv = _gap_statistics_for_rows(rows, boxes_x, boxes_w, boxes_w) if n_blob else (0.0, 1.0)
    char_gap_score = _score_more_is_better(gap_q20, -0.05, 0.30)

    tiny_ratio = 1.0
    if n_blob:
        tiny_area = max(6.0, float(np.median(areas_arr)) * 0.10)
        tiny_ratio = float(np.count_nonzero(areas_arr < tiny_area) / max(1, n_blob))
    fragment_score = _score_less_is_better(tiny_ratio, 0.06, 0.35)

    visibility_axis = _clamp01(
        0.40 * char_size_score
        + 0.27 * contrast_score
        + 0.20 * char_gap_score
        + 0.13 * fragment_score
    )

    size_cv = _robust_cv(boxes_h.astype(np.float64)) if boxes_h.size else 1.0
    size_var_score = _score_less_is_better(size_cv, 0.10, 0.42)

    line_straight_score = float(horizontalness)
    if writing_direction == "vertical":
        line_straight_score = _vertical_straightness(columns, cx, boxes_w)
        gap_cv = _column_gap_cv(columns, cx)
    elif writing_direction == "mixed":
        vertical_score = _vertical_straightness(columns, cx, boxes_w)
        line_straight_score = max(float(horizontalness), vertical_score)
        gap_cv = min(gap_cv, _column_gap_cv(columns, cx))
    gap_cv_score = _score_less_is_better(gap_cv, 0.18, 0.75)
    stability_axis = _clamp01(0.35 * size_var_score + 0.40 * line_straight_score + 0.25 * gap_cv_score)

    line_gap_values = _line_gap_ratios(line_boxes)
    block_sep_raw = _percentile(line_gap_values, 20.0, 0.65)
    block_separation_score = _score_more_is_better(block_sep_raw, 0.12, 0.62)

    overlap_raw = _max_box_overlap(line_boxes)
    block_overlap_score = _score_less_is_better(overlap_raw, 0.01, 0.15)

    if line_boxes:
        lefts = np.array([b.x for b in line_boxes], dtype=np.float64)
        edge_disp = 1.4826 * float(np.median(np.abs(lefts - np.median(lefts)))) / max(1.0, float(w))
    else:
        edge_disp = 0.08
    edge_alignment_score = _score_less_is_better(edge_disp, 0.018, 0.095)

    hierarchy_score = 0.72
    if line_boxes:
        line_heights = np.array([b.height for b in line_boxes], dtype=np.float64)
        ratio = float(np.max(line_heights) / max(1.0, np.median(line_heights)))
        hierarchy_score = 0.62 + 0.38 * _score_more_is_better(ratio, 1.02, 1.35)

    block_axis = _clamp01(
        0.40 * block_separation_score
        + 0.20 * block_overlap_score
        + 0.17 * edge_alignment_score
        + 0.23 * hierarchy_score
    )

    local_crowding = _grid_local_crowding(mask_eval, median_h)
    crowding_score = _score_less_is_better(local_crowding, 0.34, 0.68)

    line_whitespace = _score_more_is_better(_percentile(line_gap_values, 20.0, 0.45), 0.08, 0.45)
    if writing_direction == "vertical":
        line_whitespace = gap_cv_score

    edge_contact_ratio = 1.0
    if n_blob:
        edge_margin_x = 0.025 * float(w)
        edge_margin_y = 0.025 * float(h)
        contacts = (
            (boxes_x <= edge_margin_x)
            | (boxes_y <= edge_margin_y)
            | ((boxes_x + boxes_w) >= (float(w) - edge_margin_x))
            | ((boxes_y + boxes_h) >= (float(h) - edge_margin_y))
        )
        edge_contact_ratio = float(np.count_nonzero(contacts) / max(1, n_blob))
    edge_contact_score = _score_less_is_better(edge_contact_ratio, 0.02, 0.22)

    margin_axis = _clamp01(0.50 * crowding_score + 0.25 * line_whitespace + 0.25 * edge_contact_score)

    weights = _BOARD_TYPE_WEIGHTS.get(str(board_type), _BOARD_TYPE_WEIGHTS["lecture"])
    overall = _clamp01(
        weights[0] * visibility_axis
        + weights[1] * stability_axis
        + weights[2] * block_axis
        + weights[3] * margin_axis
    )

    caps: list[str] = []
    if visibility_axis < 0.30:
        overall = min(overall, 0.59)
        caps.append("visibility_under_30")
    if size_ratio < low_bad:
        overall = min(overall, 0.64)
        caps.append("major_text_too_small")
    if overlap_raw >= 0.15:
        overall = min(overall, 0.69)
        caps.append("block_overlap_over_15_percent")

    component_confidence = _score_more_is_better(float(n_blob), 6.0, 24.0)
    line_confidence = _score_more_is_better(float(len(line_boxes)), 1.0, 3.0)
    confidence = _clamp01(0.42 * component_confidence + 0.28 * line_confidence + 0.18 * capture_visibility + 0.12 * contrast_score)

    notes: list[str] = []
    if confidence < 0.50:
        notes.append("画像処理で拾えた文字量が少ないため、点数の信頼度は低めです。明るさと黒板全体の収まりを確認してください。")
    if char_size_score < 0.55:
        notes.append("文字サイズが基準から外れています。遠くから読める大きさを意識すると改善しやすいです。")
    if char_gap_score < 0.55:
        notes.append("文字間が詰まり気味の部分があります。半文字分の余白を足す意識で書くと読みやすくなります。")
    if line_straight_score < 0.55:
        notes.append("行または列の流れに傾きが見られます。1行書いたら少し下がって高さを確認してください。")
    if local_crowding >= 0.62:
        notes.append("局所的に文字や線が密集しています。全体量ではなく、接触している部分を少し離すのが効果的です。")

    display_score = int(np.clip(round(overall * 100.0 / 5.0) * 5, 0, 100))
    axes = FixedRuleAxisScores(
        visibility=visibility_axis,
        stability=stability_axis,
        block_organization=block_axis,
        margin_interference=margin_axis,
    )
    return FixedRuleScoring(
        board_type=board_type,
        writing_direction=writing_direction,
        axes=axes,
        overall=overall,
        display_score=display_score,
        confidence=confidence,
        density_ratio=fg_ratio,
        density_label=_label_density(fg_ratio),
        local_crowding=local_crowding,
        local_crowding_label=_label_crowding(local_crowding),
        caps=caps,
        notes=notes,
    )


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


def compute_metrics(
    mask: np.ndarray,
    gray_u8: np.ndarray,
    board_type: BlackboardType = "lecture",
    writing_direction: WritingDirection = "horizontal",
) -> MetricComputationResult:
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

    boxes_x_arr = np.array(boxes_x, dtype=np.float64)
    boxes_y_arr = np.array(boxes_y, dtype=np.float64)
    boxes_w_arr = np.array(boxes_w, dtype=np.float64)
    boxes_h_arr = np.array(boxes_h, dtype=np.float64)
    heights_arr = boxes_h_arr
    widths_arr = boxes_w_arr
    areas_arr = np.array(areas, dtype=np.float64)
    cx = np.array(cx_s, dtype=np.float64)
    cy = np.array(cy_s, dtype=np.float64)

    rows = _cluster_rows(cy, heights_arr.astype(np.float64))
    columns = _cluster_rows(cx, widths_arr.astype(np.float64))

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

    scoring = _compute_fixed_rule_scoring(
        mask_eval,
        gray_u8,
        board_type=board_type,
        writing_direction=writing_direction,
        line_boxes=line_boxes,
        rows=rows,
        columns=columns,
        boxes_x=boxes_x_arr,
        boxes_y=boxes_y_arr,
        boxes_w=boxes_w_arr,
        boxes_h=boxes_h_arr,
        areas_arr=areas_arr,
        cx=cx,
        cy=cy,
        horizontalness=line_alignment,
        spacing_uniformity=spacing_balance,
        size_consistency=size_consistency,
        stroke_quality=stroke_quality,
        capture_visibility=visibility,
    )
    metric_notes.extend(scoring.notes)

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
        scoring=scoring,
        baseline_y_positions=sorted(baseline_y_positions),
        char_boxes=char_boxes,
        guide=guide,
        metric_notes=metric_notes,
    )
