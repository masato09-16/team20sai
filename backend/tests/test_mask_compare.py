"""参照マスク比較ロジックの単体テスト（二値マスク直接）。"""

import numpy as np

from app.analysis.mask_compare import compare_reference_masks


def test_compare_identical_masks_high_iou() -> None:
    m = np.zeros((120, 160), dtype=np.uint8)
    m[40:90, 30:130] = 255
    out = compare_reference_masks(m, m)
    assert out.reference_comparison.iou > 0.85
    assert out.reference_comparison.font_similarity > 0.75


def test_compare_nonempty_vs_empty_low_score() -> None:
    """アップロード側に前景が無い場合は一致度が低い。"""
    ref = np.zeros((120, 160), dtype=np.uint8)
    ref[40:90, 30:130] = 255
    empty = np.zeros((120, 160), dtype=np.uint8)
    out = compare_reference_masks(ref, empty)
    assert out.reference_comparison.font_similarity < 0.2
    assert out.reference_comparison.iou == 0.0
