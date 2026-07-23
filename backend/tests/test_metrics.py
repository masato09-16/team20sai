"""文字線抽出とレイアウト評価の回帰テスト。"""

import cv2
import numpy as np

from app.analysis.binarize import extract_chalk_mask
from app.analysis.metrics import compute_metrics


def test_blackboard_frame_does_not_dominate_chalk_mask_or_scores() -> None:
    h, w = 480, 560
    img = np.zeros((h, w, 3), dtype=np.uint8)
    img[:, :] = (44, 86, 48)
    cv2.rectangle(img, (0, 0), (70, h - 1), (220, 220, 220), thickness=-1)
    for y, text in [(140, "YAKISOBA"), (250, "CHEESE"), (360, "LEMON")]:
        cv2.putText(img, text, (150, y), cv2.FONT_HERSHEY_SIMPLEX, 1.3, (235, 235, 235), 2, cv2.LINE_AA)

    mask = extract_chalk_mask(img).mask
    fg_ratio = float(np.count_nonzero(mask > 127) / mask.size)
    metrics = compute_metrics(mask, cv2.cvtColor(img, cv2.COLOR_BGR2GRAY))

    assert fg_ratio < 0.08
    assert len(metrics.char_boxes) == 3
    assert metrics.scores.horizontalness > 0.85
    assert metrics.scores.spacing_uniformity > 0.85
    assert metrics.scores.size_consistency > 0.85


def test_fixed_rule_scoring_returns_four_axes_and_rounded_display_score() -> None:
    h, w = 420, 640
    img = np.zeros((h, w, 3), dtype=np.uint8)
    img[:, :] = (44, 86, 48)
    for y, text in [(92, "TITLE"), (178, "POINT ONE"), (264, "POINT TWO"), (350, "SUMMARY")]:
        cv2.putText(img, text, (56, y), cv2.FONT_HERSHEY_SIMPLEX, 1.15, (235, 235, 235), 2, cv2.LINE_AA)

    mask = extract_chalk_mask(img).mask
    metrics = compute_metrics(
        mask,
        cv2.cvtColor(img, cv2.COLOR_BGR2GRAY),
        board_type="summary",
        writing_direction="horizontal",
    )

    scoring = metrics.scoring
    assert scoring.board_type == "summary"
    assert scoring.writing_direction == "horizontal"
    assert scoring.display_score % 5 == 0
    assert 0.0 <= scoring.confidence <= 1.0
    assert 0.0 <= scoring.axes.visibility <= 1.0
    assert 0.0 <= scoring.axes.stability <= 1.0
    assert 0.0 <= scoring.axes.block_organization <= 1.0
    assert 0.0 <= scoring.axes.margin_interference <= 1.0
    assert scoring.density_label in {"low", "moderate", "high"}
    assert scoring.local_crowding_label in {"low", "moderate", "high"}


def test_fixed_rule_scoring_uses_board_type_weights() -> None:
    h, w = 420, 640
    img = np.zeros((h, w, 3), dtype=np.uint8)
    img[:, :] = (44, 86, 48)
    for y, text in [(82, "MAIN"), (168, "AAA"), (254, "BBB"), (340, "CCC")]:
        cv2.putText(img, text, (42, y), cv2.FONT_HERSHEY_SIMPLEX, 1.18, (235, 235, 235), 2, cv2.LINE_AA)

    mask = extract_chalk_mask(img).mask
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    lecture = compute_metrics(mask, gray, board_type="lecture").scoring
    display = compute_metrics(mask, gray, board_type="display").scoring

    assert lecture.board_type == "lecture"
    assert display.board_type == "display"
    assert abs(lecture.overall - display.overall) >= 0.001
