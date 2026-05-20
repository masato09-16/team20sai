"""API の最低限の振る舞いテスト。"""

import cv2
import numpy as np
import pytest
from fastapi.testclient import TestClient

from app.analysis.board_gate import assess_chalkboard_image
from app.analysis.reference import render_reference_mask
from app.main import app


def _tiny_png_bytes() -> bytes:
    img = _synthetic_chalkboard_minimal()
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


def test_analyze_rejects_white_background_black_text(client: TestClient) -> None:
    img = _synthetic_whiteboard_like()
    res = _post_analyze(client, _encode_png_bgr(img), "abc")
    assert res.status_code == 422
    assert "黒板" in res.json().get("detail", "")


def test_analyze_rejects_solid_dark_without_text(client: TestClient) -> None:
    img = np.zeros((360, 560, 3), dtype=np.uint8)
    img[:, :] = (36, 82, 44)
    res = _post_analyze(client, _encode_png_bgr(img), "abc")
    assert res.status_code == 422


def test_analyze_rejects_random_noise_image(client: TestClient) -> None:
    rng = np.random.default_rng(1234)
    img = rng.integers(0, 256, (360, 560, 3), dtype=np.uint8)
    res = _post_analyze(client, _encode_png_bgr(img), "abc")
    assert res.status_code == 422


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


def test_analyze_accepts_render_based_chalkboard_image(client: TestClient) -> None:
    """参照マスクから作った黒板風画像でも /analyze が通る。"""
    text_match = "AB AB AB\nAB AB AB"
    w, h = 420, 280
    rr = render_reference_mask(text_match, w, h)
    bgr = _chalkboard_base(h, w)
    chalk = rr.mask > 127
    bgr[chalk] = (228, 228, 228)
    png = _encode_png_bgr(bgr)
    res = _post_analyze(client, png, text_match)
    assert res.status_code == 200
    body = res.json()
    assert body.get("pipeline_stage") == "full"
    assert body.get("reference_comparison") is not None


def test_analyze_synthetic_dense_vs_sparse_scores_differ(client: TestClient) -> None:
    """密と疎で、レイアウト関連スコアに差が出る。"""
    dense = _encode_png_bgr(_synthetic_dense_board())
    sparse = _encode_png_bgr(_synthetic_sparse_board())
    rd = _post_analyze(client, dense, "abcdefghijklmnopqr").json()
    rs = _post_analyze(client, sparse, "abcdefghijklmnopqr").json()
    assert rd.get("pipeline_stage") == "full" and rs.get("pipeline_stage") == "full"
    score_keys = ["horizontalness", "spacing_uniformity", "size_consistency", "visibility"]
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
    img = _chalkboard_base(h, w)
    for row in range(4):
        y0 = 72 + row * 70
        for col in range(18):
            x0 = 36 + col * 28
            cv2.rectangle(img, (x0, y0), (x0 + 14, y0 + 46), (228, 228, 228), thickness=-1)
    return img


def _synthetic_sparse_board() -> np.ndarray:
    img = _chalkboard_base(384, 560)
    for r in range(2):
        y0 = 150 + r * 78
        for c in range(6):
            x = 120 + c * 48
            cv2.rectangle(img, (x, y0), (x + 15, y0 + 42), (226, 226, 226), thickness=-1)
    return img


def _synthetic_irregular_board() -> np.ndarray:
    h, w = 384, 560
    img = _chalkboard_base(h, w)
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
                (228, 228, 228),
                thickness=-1,
            )
    return img


def _chalkboard_base(h: int, w: int) -> np.ndarray:
    img = np.zeros((h, w, 3), dtype=np.uint8)
    img[:, :] = (44, 86, 48)
    yy, xx = np.indices((h, w))
    vignette = ((xx - w / 2.0) ** 2 + (yy - h / 2.0) ** 2) / ((w * w + h * h) / 4.0)
    shade = (1.0 - 0.1 * np.clip(vignette, 0.0, 1.0))[:, :, None]
    return np.clip(img.astype(np.float32) * shade, 0.0, 255.0).astype(np.uint8)


def _synthetic_chalkboard_minimal() -> np.ndarray:
    img = _chalkboard_base(240, 320)
    for r in range(3):
        y = 40 + r * 60
        for c in range(8):
            x = 20 + c * 34
            cv2.rectangle(img, (x, y), (x + 12, y + 30), (225, 225, 225), thickness=-1)
    return img


def _synthetic_whiteboard_like() -> np.ndarray:
    img = np.ones((360, 560, 3), dtype=np.uint8) * 245
    for r in range(4):
        y = 56 + r * 70
        for c in range(12):
            x = 30 + c * 42
            cv2.rectangle(img, (x, y), (x + 16, y + 40), (30, 30, 30), thickness=-1)
    return img


def test_board_gate_unit_accepts_blackboard_like() -> None:
    img = _synthetic_dense_board()
    out = assess_chalkboard_image(img)
    assert out.accepted
    assert 0.0 <= out.confidence <= 1.0
    assert 0.0 <= out.metrics["background_score"] <= 1.0
    assert 0.0 <= out.metrics["chalk_stroke_score"] <= 1.0
    assert 0.0 <= out.metrics["text_layout_score"] <= 1.0


def test_board_gate_unit_rejects_whiteboard_like() -> None:
    img = _synthetic_whiteboard_like()
    out = assess_chalkboard_image(img)
    assert not out.accepted
    assert out.metrics["bright_area_ratio"] > 0.4
