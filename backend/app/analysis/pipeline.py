"""板書画像の解析パイプライン。

お手本テキストから Pillow で参照マスクを生成し、アップロード画像のストロークマスクと
位置合わせした誤差からスコアを算出する（OCR なし）。
"""

from __future__ import annotations

import cv2
import numpy as np

from app.analysis.binarize import extract_chalk_mask
from app.analysis.mask_compare import compare_reference_masks
from app.analysis.metrics import compute_metrics, default_guide
from app.analysis.perspective import apply_perspective_correction
from app.analysis.reference import render_reference_mask
from app.schemas import AnalysisOverlay, AnalysisScores, BoundingBox, BanshoAnalysisResult, GridGuide, Point2D


def _resize_work_bgr(bgr: np.ndarray, max_edge: int = 1600) -> tuple[np.ndarray, float, tuple[int, int]]:
    """解析用縮小。戻り: (縮小 BGR, スケール=元/処理後の次元比, (元の高さ,元の幅))"""
    ho, wo = bgr.shape[:2]
    longest = max(ho, wo)
    if longest <= max_edge:
        return bgr.copy(), 1.0, (ho, wo)
    scale = max_edge / float(longest)
    wn = max(8, round(wo * scale))
    hn = max(8, round(ho * scale))
    work = cv2.resize(bgr, (wn, hn), interpolation=cv2.INTER_AREA)
    return work, longest / float(max_edge), (ho, wo)


def _scale_metrics_to_original(
    baselines_work: list[float],
    boxes_work: list[BoundingBox],
    guide_work: GridGuide | None,
    sx: float,
    sy: float,
    wo: int,
    ho: int,
) -> tuple[list[float], list[BoundingBox], GridGuide]:
    """解析座標から元画像ピクセル座標へ。"""
    baselines = [min(float(ho), max(0.0, float(y * sy))) for y in baselines_work]
    boxes: list[BoundingBox] = []
    for b in boxes_work:
        boxes.append(
            BoundingBox(
                x=min(float(wo), max(0.0, b.x * sx)),
                y=min(float(ho), max(0.0, b.y * sy)),
                width=max(1.0, min(float(wo), b.width * sx)),
                height=max(1.0, min(float(ho), b.height * sy)),
            )
        )

    gw = guide_work
    scaled_guide = GridGuide(
        cell_width_px=max(16.0, gw.cell_width_px * sx),
        cell_height_px=max(16.0, gw.cell_height_px * sy),
        origin=Point2D(x=min(float(wo), max(0.0, gw.origin.x * sx)), y=min(float(ho), max(0.0, gw.origin.y * sy))),
        columns=gw.columns,
        rows=gw.rows,
        rotation_deg=gw.rotation_deg,
    )
    return baselines, boxes, scaled_guide


def run_bansho_analysis(image_bgr_u8: np.ndarray, target_text: str) -> BanshoAnalysisResult:
    """BGR uint8 とお手本テキストを受け取り解析結果を返す。"""
    merged_notes: list[str] = [
        "文字認識（OCR）は行っておらず、入力いただいたお手本テキストから生成した参照形状と、"
        "写真から抽出した線のマスクを比較してスコアを算出しています。"
    ]

    perspective = apply_perspective_correction(image_bgr_u8)
    bgr_orig = perspective.warped_bgr
    ho, wo = bgr_orig.shape[:2]

    bgr_work, scale_factor, (ho_keep, wo_keep) = _resize_work_bgr(bgr_orig, max_edge=1600)
    assert ho_keep == ho and wo_keep == wo
    hn, wn = bgr_work.shape[:2]
    sx = wo / float(wn) if wn > 0 else 1.0
    sy = ho / float(hn) if hn > 0 else 1.0

    gray_work = cv2.cvtColor(bgr_work, cv2.COLOR_BGR2GRAY)
    binarize_out = extract_chalk_mask(bgr_work)
    mask_work = binarize_out.mask

    fg_ratio_work = float(np.count_nonzero(mask_work > 127) / float(hn * wn))

    if not perspective.corners_detected:
        merged_notes.append("四隅の自動検出は未対応です。なるべく正面から矩形に収めて撮影すると解析が安定しやすいです。")

    if scale_factor > 1.001:
        merged_notes.append("画像を解析用に縮小して処理しました（詳細検出への影響は軽いです）。")

    if fg_ratio_work < 5e-4:
        merged_notes.append("板書線がほとんど検出できませんでした。露光・ピント・コントラストを確認してください。")

    means_brightness = float(np.mean(gray_work))
    if means_brightness < 48.0:
        merged_notes.append("全体的に暗い画像です。明るさを上げると視認性スコアが安定しやすくなります。")

    ref = render_reference_mask(target_text, wn, hn)
    merged_notes.extend(ref.notes)

    cmp = compare_reference_masks(ref.mask, mask_work)

    try:
        metrics = compute_metrics(mask_work, gray_work)
    except ValueError as exc:
        merged_notes.append(f"レイアウト検出をスキップしました: {exc}")
        visibility = 0.25
        dg = default_guide(wo, ho)
        scores = AnalysisScores(
            horizontalness=float(cmp.layout.horizontalness) * 0.85,
            spacing_uniformity=float(cmp.layout.spacing_uniformity) * 0.85,
            size_consistency=float(cmp.layout.size_consistency) * 0.85,
            visibility=visibility,
        )
        overlay = AnalysisOverlay(image_width=wo, image_height=ho, baseline_y_positions=[], char_boxes=[], guide=dg)
        return BanshoAnalysisResult(
            scores=scores,
            overlay=overlay,
            notes=merged_notes,
            pipeline_stage="full",
            reference_comparison=cmp.reference_comparison,
        )

    merged_notes.extend(metrics.metric_notes)

    scores = AnalysisScores(
        horizontalness=float(cmp.layout.horizontalness),
        spacing_uniformity=float(cmp.layout.spacing_uniformity),
        size_consistency=float(cmp.layout.size_consistency),
        visibility=float(metrics.scores.visibility),
    )

    baselines, boxes, guide = _scale_metrics_to_original(
        metrics.baseline_y_positions,
        metrics.char_boxes,
        metrics.guide,
        sx,
        sy,
        wo,
        ho,
    )

    overlay = AnalysisOverlay(
        image_width=wo,
        image_height=ho,
        baseline_y_positions=baselines,
        char_boxes=boxes,
        guide=guide,
    )

    return BanshoAnalysisResult(
        scores=scores,
        overlay=overlay,
        notes=merged_notes,
        pipeline_stage="full",
        reference_comparison=cmp.reference_comparison,
    )
