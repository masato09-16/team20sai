"""API / 解析結果の Pydantic モデル。"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field


class Point2D(BaseModel):
    x: float
    y: float


class BoundingBox(BaseModel):
    x: float = Field(..., ge=0)
    y: float = Field(..., ge=0)
    width: float = Field(..., gt=0)
    height: float = Field(..., gt=0)


class GridGuide(BaseModel):
    """理想グリッドの透過オーバーレイ用メタデータ（フロントが描画）。"""

    cell_width_px: float = Field(..., gt=0)
    cell_height_px: float = Field(..., gt=0)
    origin: Point2D
    columns: int = Field(..., ge=1)
    rows: int = Field(..., ge=1)
    rotation_deg: float = Field(0.0, description="グリッド全体の回転（水平度の可視化用）")


class AnalysisScores(BaseModel):
    """0.0〜1.0 を想定。1.0 が理想に近い。"""

    horizontalness: float = Field(..., ge=0.0, le=1.0)
    spacing_uniformity: float = Field(..., ge=0.0, le=1.0)
    size_consistency: float = Field(..., ge=0.0, le=1.0)
    visibility: float = Field(..., ge=0.0, le=1.0)


class AnalysisOverlay(BaseModel):
    """AR 風オーバーレイ用の軽量ヒント（画像座標系、元画像サイズ基準）。"""

    image_width: int = Field(..., gt=0)
    image_height: int = Field(..., gt=0)
    baseline_y_positions: list[float] = Field(default_factory=list)
    char_boxes: list[BoundingBox] = Field(default_factory=list)
    guide: GridGuide | None = None


class ReferenceComparison(BaseModel):
    """お手本テキストから生成した参照マスクとの比較（任意フィールド。旧クライアントは無視可）。"""

    font_similarity: float = Field(..., ge=0.0, le=1.0, description="お手本形状との総合一致度")
    iou: float = Field(..., ge=0.0, le=1.0)
    dice_coefficient: float = Field(..., ge=0.0, le=1.0)
    pixel_agreement: float = Field(..., ge=0.0, le=1.0)
    contour_distance_score: float = Field(..., ge=0.0, le=1.0)


class BanshoAnalysisResult(BaseModel):
    scores: AnalysisScores
    overlay: AnalysisOverlay
    notes: list[str] = Field(default_factory=list)
    pipeline_stage: Literal["stub", "full"] = "stub"
    reference_comparison: ReferenceComparison | None = None


class ReferencePreviewRequest(BaseModel):
    target_text: str = ""
    width: int = Field(960, ge=320, le=1600)
    height: int = Field(540, ge=180, le=1200)


class HealthResponse(BaseModel):
    status: Literal["ok"] = "ok"
    service: str = "bansho-backend"
