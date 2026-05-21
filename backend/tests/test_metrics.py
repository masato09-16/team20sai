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
