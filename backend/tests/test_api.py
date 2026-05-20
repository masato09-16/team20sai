"""API の最低限の振る舞いテスト。"""

import cv2
import numpy as np
import pytest
from fastapi.testclient import TestClient

from app.analysis.reference import render_reference_mask
from app.main import app


def _tiny_png_bytes() -> bytes:
    img = np.zeros((24, 32, 3), dtype=np.uint8)
    img[:] = (40, 80, 120)
    ok, buf = cv2.imencode(".png", img)
    assert ok
    return buf.tobytes()


def _encode_png_bgr(img_bgr: np.ndarray) -> bytes:
    ok, buf = cv2.imencode(".png", img_bgr)
    assert ok and buf is not None
    return buf.tobytes()


@pytest.fixture
def client() -> TestClient:
    return TestClient(app)


def _post_analyze(client: TestClient, png_bytes: bytes, target_text: str) -> object:
    files = {"file": ("t.png", png_bytes, "image/png")}
    data = {"target_text": target_text}
    return client.post("/analyze", files=files, data=data)


def test_health_ok(client: TestClient) -> None:
    res = client.get("/health")
    assert res.status_code == 200
    data = res.json()
    assert data.get("status") == "ok"


def test_reference_preview_empty_text_returns_png(client: TestClient) -> None:
    res = client.post("/reference-preview", json={"target_text": "", "width": 960, "height": 540})
    assert res.status_code == 200
    assert res.headers.get("content-type", "").startswith("image/png")
    assert res.content.startswith(b"\x89PNG\r\n\x1a\n")
    assert len(res.content) > 2000
    decoded = cv2.imdecode(np.frombuffer(res.content, dtype=np.uint8), cv2.IMREAD_COLOR)
    assert decoded is not None
    assert decoded.shape[:2] == (540, 960)
    assert float(np.std(decoded)) > 1.0


def test_reference_preview_normal_text_returns_png(client: TestClient) -> None:
    res = client.post("/reference-preview", json={"target_text": "二次方程式の解の公式", "width": 960, "height": 540})
    assert res.status_code == 200
    assert res.headers.get("content-type", "").startswith("image/png")
    assert res.content.startswith(b"\x89PNG\r\n\x1a\n")
    assert len(res.content) > 2000
    decoded = cv2.imdecode(np.frombuffer(res.content, dtype=np.uint8), cv2.IMREAD_COLOR)
    assert decoded is not None
    assert decoded.shape[:2] == (540, 960)
    assert float(np.std(decoded)) > 2.5

    empty_res = client.post("/reference-preview", json={"target_text": "", "width": 960, "height": 540})
    empty_decoded = cv2.imdecode(np.frombuffer(empty_res.content, dtype=np.uint8), cv2.IMREAD_COLOR)
    assert empty_decoded is not None
    mean_abs_diff = float(np.mean(np.abs(decoded.astype(np.float32) - empty_decoded.astype(np.float32))))
    assert mean_abs_diff > 0.25


def test_reference_preview_out_of_range_returns_422(client: TestClient) -> None:
    res = client.post("/reference-preview", json={"target_text": "abc", "width": 200, "height": 540})
    assert res.status_code == 422
    res2 = client.post("/reference-preview", json={"target_text": "abc", "width": 960, "height": 1400})
    assert res2.status_code == 422


def test_analyze_requires_target_text(client: TestClient) -> None:
    files = {"file": ("t.png", _tiny_png_bytes(), "image/png")}
    res = client.post("/analyze", files=files, data={"target_text": "  "})
    assert res.status_code == 400
    assert "お手本" in res.json().get("detail", "")


def test_analyze_missing_target_text_field_uses_empty_and_400(client: TestClient) -> None:
    files = {"file": ("t.png", _tiny_png_bytes(), "image/png")}
    res = client.post("/analyze", files=files)
    assert res.status_code == 400


def test_analyze_rejects_non_image(client: TestClient) -> None:
    files = {"file": ("x.txt", b"hello", "text/plain")}
    res = client.post("/analyze", files=files, data={"target_text": "a"})
    assert res.status_code == 400
    assert "画像" in res.json().get("detail", "")


def test_analyze_rejects_empty_file(client: TestClient) -> None:
    files = {"file": ("e.jpg", b"", "image/jpeg")}
    res = client.post("/analyze", files=files, data={"target_text": "ab"})
    assert res.status_code == 400


def test_analyze_rejects_corrupt_image(client: TestClient) -> None:
    files = {"file": ("bad.jpg", b"\xff\xd8\xff garbage not a jpeg", "image/jpeg")}
    res = client.post("/analyze", files=files, data={"target_text": "ab"})
    assert res.status_code == 400
    detail = res.json().get("detail", "")
    assert isinstance(detail, str)


def test_analyze_accepts_minimal_png(client: TestClient) -> None:
    res = _post_analyze(client, _tiny_png_bytes(), "ab")
    assert res.status_code == 200
    body = res.json()
    assert body.get("pipeline_stage") == "full"
    assert body.get("reference_comparison") is not None
    for k, v in body["scores"].items():
        assert 0.0 <= v <= 1.0
    rc = body["reference_comparison"]
    for k in ("font_similarity", "iou", "dice_coefficient", "pixel_agreement", "contour_distance_score"):
        assert 0.0 <= rc[k] <= 1.0
    ov = body["overlay"]
    assert ov["image_width"] > 0 and ov["image_height"] > 0


def test_analyze_synthetic_mismatch_lower_than_match(client: TestClient) -> None:
    """同一画像に対し、お手本テキストが合う場合の方が、大きく異なるテキストより一致度が高い。"""
    text_match = "AB"
    w, h = 320, 240
    rr = render_reference_mask(text_match, w, h)
    bgr = cv2.cvtColor(rr.mask, cv2.COLOR_GRAY2BGR)
    png = _encode_png_bgr(bgr)

    good = _post_analyze(client, png, text_match).json()["reference_comparison"]["font_similarity"]
    bad = _post_analyze(client, png, "ZZZZZZ").json()["reference_comparison"]["font_similarity"]
    assert good > bad + 0.02, f"good={good} bad={bad}"


def test_analyze_synthetic_dense_vs_sparse_scores_differ(client: TestClient) -> None:
    """密と疎で、レイアウト関連スコアに差が出る。"""
    dense = _encode_png_bgr(_synthetic_dense_board())
    sparse = _encode_png_bgr(_synthetic_sparse_board())
    rd = _post_analyze(client, dense, "abcdefghijklmnopqr").json()
    rs = _post_analyze(client, sparse, "abcdefghijklmnopqr").json()
    assert rd.get("pipeline_stage") == "full" and rs.get("pipeline_stage") == "full"
    score_keys = ["horizontalness", "spacing_uniformity", "size_consistency"]
    diffs = [abs(rd["scores"][k] - rs["scores"][k]) for k in score_keys]
    assert max(diffs) >= 0.02
    assert rd["scores"]["spacing_uniformity"] > rs["scores"]["spacing_uniformity"]


def test_analyze_synthetic_neat_vs_irregular_size_consistency(client: TestClient) -> None:
    """不揃いの文字サイズ・行ゆれがある画像ではサイズ一貫性が下がる。"""
    neat = _encode_png_bgr(_synthetic_dense_board())
    irregular = _encode_png_bgr(_synthetic_irregular_board())
    rn = _post_analyze(client, neat, "abcdefghijklmnopqr").json()
    ri = _post_analyze(client, irregular, "abcdefghijklmnopqr").json()
    assert rn.get("pipeline_stage") == "full" and ri.get("pipeline_stage") == "full"
    assert rn["scores"]["size_consistency"] > ri["scores"]["size_consistency"] + 0.05


def _synthetic_dense_board() -> np.ndarray:
    h, w = 384, 560
    img = np.ones((h, w, 3), dtype=np.uint8) * 255
    for row in range(4):
        y0 = 72 + row * 70
        for col in range(18):
            x0 = 36 + col * 28
            cv2.rectangle(img, (x0, y0), (x0 + 14, y0 + 46), (28, 28, 28), thickness=-1)
    return img


def _synthetic_sparse_board() -> np.ndarray:
    img = np.ones((384, 560, 3), dtype=np.uint8) * 250
    cv2.rectangle(img, (200, 180), (216, 226), (55, 55, 55), thickness=-1)
    return img


def _synthetic_irregular_board() -> np.ndarray:
    h, w = 384, 560
    img = np.ones((h, w, 3), dtype=np.uint8) * 252
    for row in range(4):
        y_base = 64 + row * 72
        for col in range(12):
            x0 = 34 + col * 40 + (col % 3) * 3
            rect_h = 24 + ((row + col) % 4) * 9
            rect_w = 10 + ((2 * row + col) % 5) * 5
            jitter_y = (col % 2) * 5
            cv2.rectangle(
                img,
                (x0, y_base + jitter_y),
                (x0 + rect_w, y_base + jitter_y + rect_h),
                (35, 35, 35),
                thickness=-1,
            )
    return img
