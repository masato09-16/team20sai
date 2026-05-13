"""水平度・等間隔性・サイズ一貫性・視認性の算出スタブ。

実装時:
- 水平度: 行ベースライン推定（Hough / テキスト行クラスタ）と傾き分散
- 等間隔: 連結成分または検出ボックスの x 間隔の変動係数
- サイズ: 高さ分布の変動係数
- 視認性: コントラスト、エッジ密度、ぼけ推定など
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np

from app.schemas import AnalysisScores, BoundingBox, GridGuide, Point2D


@dataclass(frozen=True)
class MetricStubResult:
    scores: AnalysisScores
    baseline_y_positions: list[float]
    char_boxes: list[BoundingBox]
    guide: GridGuide


def compute_stub_metrics(mask: np.ndarray) -> MetricStubResult:
    h, w = int(mask.shape[0]), int(mask.shape[1])
    if h <= 0 or w <= 0:
        raise ValueError("マスクサイズが不正です")

    # ダミーの行ベースライン（水平グリッド）
    rows = 4
    baseline_y_positions = [h * (i + 1) / (rows + 1) for i in range(rows)]

    # ダミーの文字ボックス（等間隔に並べたプレースホルダ）
    cols = 6
    box_w = w / (cols + 2)
    box_h = h / (rows + 2)
    char_boxes: list[BoundingBox] = []
    for r in range(rows):
        y = baseline_y_positions[r] - box_h * 0.55
        for c in range(cols):
            x = box_w * (c + 1)
            char_boxes.append(BoundingBox(x=x, y=y, width=box_w * 0.65, height=box_h))

    guide = GridGuide(
        cell_width_px=box_w,
        cell_height_px=box_h,
        origin=Point2D(x=box_w, y=box_h),
        columns=cols,
        rows=rows,
        rotation_deg=0.0,
    )

    scores = AnalysisScores(
        horizontalness=0.82,
        spacing_uniformity=0.74,
        size_consistency=0.79,
        visibility=0.88,
    )
    return MetricStubResult(
        scores=scores,
        baseline_y_positions=baseline_y_positions,
        char_boxes=char_boxes,
        guide=guide,
    )
