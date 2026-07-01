"""板書画像の解析パイプライン（reference / ocr 両モード）。"""

from __future__ import annotations

from typing import Literal

import cv2
import numpy as np

from app.analysis.binarize import extract_chalk_mask
from app.analysis.mask_compare import compare_reference_masks
from app.analysis.metrics import compute_metrics, default_guide
from app.analysis.ocr import OCRResult, recognize_board_text
from app.analysis.reference import render_reference_mask
from app.schemas import AnalysisOverlay, AnalysisScores, BoundingBox, BanshoAnalysisResult, GridGuide, Point2D

AnalysisMode = Literal["reference", "ocr", "manual"]


def _clamp01(x: float) -> float:
    return float(np.clip(x, 0.0, 1.0))


def _blend_layout_score(metric_score: float, ref_score: float, ref_weight: float = 0.0) -> float:
    """実画像レイアウトを主評価とし、参照比較は極小補助に留める。"""
    rw = float(np.clip(ref_weight, 0.0, 0.4))
    mw = 1.0 - rw
    return _clamp01(mw * float(metric_score) + rw * float(ref_score))


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


def _run_with_reference_text(
    bgr_orig: np.ndarray,
    target_text: str,
    merged_notes: list[str],
    mode: AnalysisMode,
    perspective_corrected: bool,
    recognized_text: str | None = None,
    ocr_confidence: float | None = None,
    ocr_engine: str | None = None,
    ocr_needs_review: bool = False,
    ocr_issue: str | None = None,
) -> BanshoAnalysisResult:
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
            readability=0.35,
            line_alignment=float(cmp.layout.horizontalness) * 0.75,
            spacing_balance=float(cmp.layout.spacing_uniformity) * 0.75,
            stroke_quality=0.35,
            horizontalness=float(cmp.layout.horizontalness) * 0.75,
            spacing_uniformity=float(cmp.layout.spacing_uniformity) * 0.75,
            size_consistency=float(cmp.layout.size_consistency) * 0.75,
            visibility=visibility,
        )
        overlay = AnalysisOverlay(image_width=wo, image_height=ho, baseline_y_positions=[], char_boxes=[], guide=dg)
        return BanshoAnalysisResult(
            scores=scores,
            overlay=overlay,
            notes=merged_notes,
            pipeline_stage="full",
            reference_comparison=cmp.reference_comparison,
            mode=mode,
            recognized_text=recognized_text,
            ocr_confidence=ocr_confidence,
            ocr_engine=ocr_engine,
            ocr_needs_review=ocr_needs_review,
            ocr_issue=ocr_issue,
            perspective_corrected=perspective_corrected,
        )

    merged_notes.extend(metrics.metric_notes)

    scores = AnalysisScores(
        readability=float(metrics.scores.readability),
        line_alignment=float(metrics.scores.line_alignment),
        spacing_balance=float(metrics.scores.spacing_balance),
        stroke_quality=float(metrics.scores.stroke_quality),
        horizontalness=_blend_layout_score(metrics.scores.horizontalness, cmp.layout.horizontalness),
        spacing_uniformity=_blend_layout_score(metrics.scores.spacing_uniformity, cmp.layout.spacing_uniformity),
        size_consistency=_blend_layout_score(metrics.scores.size_consistency, cmp.layout.size_consistency),
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
        mode=mode,
        recognized_text=recognized_text,
        ocr_confidence=ocr_confidence,
        ocr_engine=ocr_engine,
        ocr_needs_review=ocr_needs_review,
        ocr_issue=ocr_issue,
        perspective_corrected=perspective_corrected,
    )


def _run_shape_only(
    bgr_orig: np.ndarray,
    merged_notes: list[str],
    mode: AnalysisMode,
    perspective_corrected: bool,
    recognized_text: str | None = None,
    ocr_confidence: float | None = None,
    ocr_engine: str | None = None,
    ocr_needs_review: bool = False,
    ocr_issue: str | None = None,
) -> BanshoAnalysisResult:
    """OCR 文字列や参照比較がなくても、字形メトリクス中心で評価を返す。"""
    ho, wo = bgr_orig.shape[:2]
    bgr_work, scale_factor, (ho_keep, wo_keep) = _resize_work_bgr(bgr_orig, max_edge=1600)
    assert ho_keep == ho and wo_keep == wo
    hn, wn = bgr_work.shape[:2]
    sx = wo / float(wn) if wn > 0 else 1.0
    sy = ho / float(hn) if hn > 0 else 1.0

    gray_work = cv2.cvtColor(bgr_work, cv2.COLOR_BGR2GRAY)
    binarize_out = extract_chalk_mask(bgr_work)
    mask_work = binarize_out.mask

    if scale_factor > 1.001:
        merged_notes.append("画像を解析用に縮小して処理しました（詳細検出への影響は軽いです）。")

    try:
        metrics = compute_metrics(mask_work, gray_work)
    except ValueError as exc:
        merged_notes.append(f"レイアウト検出をスキップしました: {exc}")
        dg = default_guide(wo, ho)
        scores = AnalysisScores(
            readability=0.35,
            line_alignment=0.35,
            spacing_balance=0.35,
            stroke_quality=0.35,
            horizontalness=0.35,
            spacing_uniformity=0.35,
            size_consistency=0.35,
            visibility=0.25,
        )
        overlay = AnalysisOverlay(image_width=wo, image_height=ho, baseline_y_positions=[], char_boxes=[], guide=dg)
        return BanshoAnalysisResult(
            scores=scores,
            overlay=overlay,
            notes=merged_notes,
            pipeline_stage="full",
            reference_comparison=None,
            mode=mode,
            recognized_text=recognized_text,
            ocr_confidence=ocr_confidence,
            ocr_engine=ocr_engine,
            ocr_needs_review=ocr_needs_review,
            ocr_issue=ocr_issue,
            perspective_corrected=perspective_corrected,
        )

    merged_notes.extend(metrics.metric_notes)
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
        scores=metrics.scores,
        overlay=overlay,
        notes=merged_notes,
        pipeline_stage="full",
        reference_comparison=None,
        mode=mode,
        recognized_text=recognized_text,
        ocr_confidence=ocr_confidence,
        ocr_engine=ocr_engine,
        ocr_needs_review=ocr_needs_review,
        ocr_issue=ocr_issue,
        perspective_corrected=perspective_corrected,
    )


def run_reference_analysis(
    image_bgr_u8: np.ndarray,
    target_text: str,
    pre_notes: list[str] | None = None,
    perspective_corrected: bool = False,
) -> BanshoAnalysisResult:
    merged_notes: list[str] = list(pre_notes or [])
    merged_notes.append(
        "入力いただいたお手本テキストから生成した参照形状と、写真から抽出した線のマスクを比較してスコアを算出しています。"
    )
    return _run_with_reference_text(
        image_bgr_u8,
        target_text,
        merged_notes=merged_notes,
        mode="reference",
        perspective_corrected=perspective_corrected,
    )


def run_ocr_analysis(
    image_bgr_u8: np.ndarray,
    pre_notes: list[str] | None = None,
    perspective_corrected: bool = False,
) -> BanshoAnalysisResult:
    merged_notes: list[str] = list(pre_notes or [])
    merged_notes.append(
        "OCR 文字列は比較の補助に使い、主評価は可読性・行の整い・文字サイズ安定・字間行間・線の安定感で行います。"
    )
    try:
        ocr = recognize_board_text(image_bgr_u8)
    except Exception:
        merged_notes.append("OCR 実行中にエラーが発生しました。文字列は未確定として扱います。")
        merged_notes.append("文字そのものの評価は継続しています。必要であれば文字列を手入力して再解析してください。")
        return _run_shape_only(
            image_bgr_u8,
            merged_notes=merged_notes,
            mode="ocr",
            perspective_corrected=perspective_corrected,
            recognized_text=None,
            ocr_confidence=None,
            ocr_engine=None,
            ocr_needs_review=True,
            ocr_issue="runtime_error",
        )

    merged_notes.extend(ocr.notes)
    issue = ocr.error_code
    recognized_text = ocr.text.strip()
    confidence = float(ocr.confidence)

    if not ocr.available or issue in {"ocr_unavailable", "ocr_init_failed", "ocr_runtime_failed"}:
        merged_notes.append("OCR が利用できないため、文字列は未確定です。必要なら手入力で再解析してください。")
        return _run_shape_only(
            image_bgr_u8,
            merged_notes=merged_notes,
            mode="ocr",
            perspective_corrected=perspective_corrected,
            recognized_text=None,
            ocr_confidence=None,
            ocr_engine=ocr.engine,
            ocr_needs_review=True,
            ocr_issue=issue or "ocr_unavailable",
        )

    if not recognized_text:
        merged_notes.append("文字を認識できませんでしたが、字形評価は継続しました。必要なら文字列を手入力して再解析してください。")
        return _run_shape_only(
            image_bgr_u8,
            merged_notes=merged_notes,
            mode="ocr",
            perspective_corrected=perspective_corrected,
            recognized_text=None,
            ocr_confidence=confidence,
            ocr_engine=ocr.engine,
            ocr_needs_review=True,
            ocr_issue="empty_recognition",
        )

    if confidence < 0.35:
        merged_notes.append("OCR 信頼度が低いため、文字列は要確認です。必要であれば修正して再解析してください。")
        return _run_with_reference_text(
            image_bgr_u8,
            recognized_text,
            merged_notes=merged_notes,
            mode="ocr",
            perspective_corrected=perspective_corrected,
            recognized_text=recognized_text,
            ocr_confidence=confidence,
            ocr_engine=ocr.engine,
            ocr_needs_review=True,
            ocr_issue="low_confidence",
        )

    return _run_with_reference_text(
        image_bgr_u8,
        recognized_text,
        merged_notes=merged_notes,
        mode="ocr",
        perspective_corrected=perspective_corrected,
        recognized_text=recognized_text,
        ocr_confidence=confidence,
        ocr_engine=ocr.engine,
    )


def run_manual_text_analysis(
    image_bgr_u8: np.ndarray,
    corrected_text: str,
    pre_notes: list[str] | None = None,
    perspective_corrected: bool = False,
) -> BanshoAnalysisResult:
    text = corrected_text.strip()
    if not text:
        raise ValueError("修正後の文字列を入力してください。")

    merged_notes: list[str] = list(pre_notes or [])
    merged_notes.append(
        "ユーザーが修正した文字列を補助に使い、主評価は可読性・行の整い・文字サイズ安定・字間行間・線の安定感で行います。"
    )
    return _run_with_reference_text(
        image_bgr_u8,
        text,
        merged_notes=merged_notes,
        mode="manual",
        perspective_corrected=perspective_corrected,
        recognized_text=text,
        ocr_confidence=None,
        ocr_engine="manual",
    )


def run_bansho_analysis(image_bgr_u8: np.ndarray, target_text: str) -> BanshoAnalysisResult:
    """後方互換: target_text を使う reference モード。"""
    return run_reference_analysis(image_bgr_u8, target_text, pre_notes=None, perspective_corrected=False)
