"""API の最低限の振る舞いテスト。"""

import cv2
import numpy as np
import pytest
from fastapi.testclient import TestClient

from app.analysis.board_gate import assess_chalkboard_image
from app.analysis.ocr import OCRLine, OCRResult
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


def _post_analyze(
    client: TestClient,
    png_bytes: bytes,
    target_text: str | None = None,
    corrected_text: str | None = None,
) -> object:
    files = {"file": ("t.png", png_bytes, "image/png")}
    data: dict[str, str] = {}
    if target_text is not None:
        data["target_text"] = target_text
    if corrected_text is not None:
        data["corrected_text"] = corrected_text
    if not data:
        return client.post("/analyze", files=files)
    return client.post("/analyze", files=files, data=data)


def _stub_ocr(monkeypatch: pytest.MonkeyPatch, text: str = "板書テキスト", confidence: float = 0.82) -> None:
    def _fake_ocr(_image: np.ndarray) -> OCRResult:
        return OCRResult(
            text=text,
            lines=[OCRLine(text=text, confidence=confidence, bbox=[(0.0, 0.0), (120.0, 0.0), (120.0, 24.0), (0.0, 24.0)])],
            confidence=confidence,
            engine="stub-ocr",
            available=True,
            notes=[],
            error_code=None,
            error_message=None,
        )

    monkeypatch.setattr("app.analysis.pipeline.recognize_board_text", _fake_ocr)


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


def test_analyze_returns_result_when_ocr_unavailable(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    def _unavailable(_image: np.ndarray) -> OCRResult:
        return OCRResult(
            text="",
            lines=[],
            confidence=0.0,
            engine="easyocr",
            available=False,
            notes=["OCR エンジン（EasyOCR）が未導入です。"],
            error_code="ocr_unavailable",
            error_message="OCR エンジン（EasyOCR）が未導入です。",
        )

    monkeypatch.setattr("app.analysis.pipeline.recognize_board_text", _unavailable)
    res = _post_analyze(client, _tiny_png_bytes())
    assert res.status_code == 200
    body = res.json()
    assert body.get("ocr_needs_review") is True
    assert body.get("ocr_issue") == "ocr_unavailable"
    assert body.get("reference_comparison") is None
    assert body.get("recognized_text") in {None, ""}


def test_analyze_returns_result_when_ocr_init_failed(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    def _init_failed(_image: np.ndarray) -> OCRResult:
        return OCRResult(
            text="",
            lines=[],
            confidence=0.0,
            engine="easyocr",
            available=False,
            notes=["OCR エンジンの初期化に失敗しました。"],
            error_code="ocr_init_failed",
            error_message="OCR エンジンの初期化に失敗しました。",
        )

    monkeypatch.setattr("app.analysis.pipeline.recognize_board_text", _init_failed)
    res = _post_analyze(client, _tiny_png_bytes())
    assert res.status_code == 200
    body = res.json()
    assert body.get("ocr_needs_review") is True
    assert body.get("ocr_issue") == "ocr_init_failed"


def test_analyze_returns_result_when_ocr_runtime_failed(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    def _runtime_failed(_image: np.ndarray) -> OCRResult:
        return OCRResult(
            text="",
            lines=[],
            confidence=0.0,
            engine="easyocr",
            available=True,
            notes=["OCR 実行中にエラーが発生しました。"],
            error_code="ocr_runtime_failed",
            error_message="OCR 実行中にエラーが発生しました。",
        )

    monkeypatch.setattr("app.analysis.pipeline.recognize_board_text", _runtime_failed)
    res = _post_analyze(client, _tiny_png_bytes())
    assert res.status_code == 200
    body = res.json()
    assert body.get("ocr_needs_review") is True
    assert body.get("ocr_issue") == "ocr_runtime_failed"


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
    res = _post_analyze(client, _encode_png_bgr(img))
    assert res.status_code == 422
    assert "黒板" in res.json().get("detail", "")


def test_analyze_rejects_solid_dark_without_text(client: TestClient) -> None:
    img = np.zeros((360, 560, 3), dtype=np.uint8)
    img[:, :] = (36, 82, 44)
    res = _post_analyze(client, _encode_png_bgr(img))
    assert res.status_code == 422


def test_analyze_rejects_random_noise_image(client: TestClient) -> None:
    rng = np.random.default_rng(1234)
    img = rng.integers(0, 256, (360, 560, 3), dtype=np.uint8)
    res = _post_analyze(client, _encode_png_bgr(img))
    assert res.status_code == 422


def test_analyze_accepts_minimal_png_with_stubbed_ocr(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    def _fake_ocr(_image: np.ndarray) -> OCRResult:
        return OCRResult(
            text="AB",
            lines=[OCRLine(text="AB", confidence=0.81, bbox=[(0.0, 0.0), (40.0, 0.0), (40.0, 20.0), (0.0, 20.0)])],
            confidence=0.81,
            engine="stub-ocr",
            available=True,
            notes=[],
        )

    monkeypatch.setattr("app.analysis.pipeline.recognize_board_text", _fake_ocr)
    res = _post_analyze(client, _tiny_png_bytes())
    assert res.status_code == 200
    body = res.json()
    assert body.get("pipeline_stage") == "full"
    assert body.get("mode") == "ocr"
    assert isinstance(body.get("perspective_corrected"), bool)
    assert body.get("recognized_text") == "AB"
    assert body.get("reference_comparison") is not None
    for k, v in body["scores"].items():
        assert 0.0 <= v <= 1.0
    rc = body["reference_comparison"]
    for k in ("font_similarity", "iou", "dice_coefficient", "pixel_agreement", "contour_distance_score"):
        assert 0.0 <= rc[k] <= 1.0
    ov = body["overlay"]
    assert ov["image_width"] > 0 and ov["image_height"] > 0


def test_analyze_ocr_mode_with_stubbed_recognizer(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    def _fake_ocr(_image: np.ndarray) -> OCRResult:
        return OCRResult(
            text="二次方程式の解の公式",
            lines=[OCRLine(text="二次方程式の解の公式", confidence=0.82, bbox=[(0.0, 0.0), (100.0, 0.0), (100.0, 20.0), (0.0, 20.0)])],
            confidence=0.82,
            engine="stub-ocr",
            available=True,
            notes=[],
        )

    monkeypatch.setattr("app.analysis.pipeline.recognize_board_text", _fake_ocr)
    payload = _encode_png_bgr(_synthetic_dense_board())
    res = client.post("/analyze", files={"file": ("ocr.png", payload, "image/png")})
    assert res.status_code == 200
    body = res.json()
    assert body.get("mode") == "ocr"
    assert body.get("recognized_text") == "二次方程式の解の公式"
    assert body.get("ocr_engine") == "stub-ocr"
    assert body.get("ocr_confidence", 0.0) > 0.7
    assert isinstance(body.get("perspective_corrected"), bool)
    assert body.get("pipeline_stage") == "full"


def test_analyze_ocr_mode_ignores_target_text_when_stubbed(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    def _fake_ocr(_image: np.ndarray) -> OCRResult:
        return OCRResult(
            text="OCR文字列",
            lines=[OCRLine(text="OCR文字列", confidence=0.8, bbox=[(0.0, 0.0), (80.0, 0.0), (80.0, 20.0), (0.0, 20.0)])],
            confidence=0.8,
            engine="stub-ocr",
            available=True,
            notes=[],
        )

    monkeypatch.setattr("app.analysis.pipeline.recognize_board_text", _fake_ocr)
    payload = _encode_png_bgr(_synthetic_dense_board())
    res_with_text = _post_analyze(client, payload, "このテキストは解析に使わない")
    res_without_text = _post_analyze(client, payload)
    assert res_with_text.status_code == 200 and res_without_text.status_code == 200
    j1 = res_with_text.json()
    j2 = res_without_text.json()
    assert j1["mode"] == "ocr" and j2["mode"] == "ocr"
    assert j1["recognized_text"] == "OCR文字列" and j2["recognized_text"] == "OCR文字列"


def test_analyze_manual_corrected_text_bypasses_ocr(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    def _should_not_run(_image: np.ndarray) -> OCRResult:
        raise AssertionError("OCR should be skipped when corrected_text is provided")

    monkeypatch.setattr("app.analysis.pipeline.recognize_board_text", _should_not_run)
    payload = _encode_png_bgr(_synthetic_dense_board())
    res = _post_analyze(client, payload, corrected_text="手動で修正した文字列")
    assert res.status_code == 200
    body = res.json()
    assert body.get("mode") == "manual"
    assert body.get("recognized_text") == "手動で修正した文字列"
    assert body.get("ocr_engine") == "manual"
    assert body.get("ocr_confidence") is None
    assert body.get("reference_comparison") is not None


def test_analyze_ocr_mode_returns_result_on_ocr_exception(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    def _boom(_image: np.ndarray) -> OCRResult:
        raise RuntimeError("ocr internal error")

    monkeypatch.setattr("app.analysis.pipeline.recognize_board_text", _boom)
    payload = _encode_png_bgr(_synthetic_dense_board())
    res = _post_analyze(client, payload)
    assert res.status_code == 200
    body = res.json()
    assert body.get("ocr_needs_review") is True
    assert body.get("ocr_issue") == "runtime_error"
    assert body.get("scores", {}).get("readability", 0.0) > 0.1


def test_analyze_ocr_mode_returns_result_on_empty_recognition(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    def _empty(_image: np.ndarray) -> OCRResult:
        return OCRResult(text="", lines=[], confidence=0.0, engine="stub-ocr", available=True, notes=[])

    monkeypatch.setattr("app.analysis.pipeline.recognize_board_text", _empty)
    payload = _encode_png_bgr(_synthetic_dense_board())
    res = _post_analyze(client, payload)
    assert res.status_code == 200
    body = res.json()
    assert body.get("ocr_needs_review") is True
    assert body.get("ocr_issue") == "empty_recognition"
    assert body.get("recognized_text") in {None, ""}


def test_analyze_ocr_mode_returns_result_on_low_confidence(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    def _low_conf(_image: np.ndarray) -> OCRResult:
        return OCRResult(
            text="低信頼度テキスト",
            lines=[OCRLine(text="低信頼度テキスト", confidence=0.1, bbox=[(0.0, 0.0), (80.0, 0.0), (80.0, 20.0), (0.0, 20.0)])],
            confidence=0.1,
            engine="stub-ocr",
            available=True,
            notes=["OCR の信頼度が低めです。認識結果に誤りが含まれる可能性があります。"],
        )

    monkeypatch.setattr("app.analysis.pipeline.recognize_board_text", _low_conf)
    payload = _encode_png_bgr(_synthetic_dense_board())
    res = _post_analyze(client, payload)
    assert res.status_code == 200
    body = res.json()
    assert body.get("recognized_text") == "低信頼度テキスト"
    assert body.get("ocr_needs_review") is True
    assert body.get("ocr_issue") == "low_confidence"
    assert body.get("scores", {}).get("readability", 0.0) > 0.1


def test_analyze_synthetic_dense_vs_sparse_scores_differ(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    """密と疎で、レイアウト関連スコアに差が出る。"""
    _stub_ocr(monkeypatch)
    dense = _encode_png_bgr(_synthetic_dense_board())
    sparse = _encode_png_bgr(_synthetic_sparse_board())
    rd = _post_analyze(client, dense).json()
    rs = _post_analyze(client, sparse).json()
    assert rd.get("pipeline_stage") == "full" and rs.get("pipeline_stage") == "full"
    score_keys = ["horizontalness", "spacing_uniformity", "size_consistency", "visibility"]
    diffs = [abs(rd["scores"][k] - rs["scores"][k]) for k in score_keys]
    assert max(diffs) >= 0.02


def test_analyze_synthetic_neat_vs_irregular_size_consistency(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    """不揃いの文字サイズ・行ゆれがある画像ではサイズ一貫性が下がる。"""
    _stub_ocr(monkeypatch)
    neat = _encode_png_bgr(_synthetic_dense_board())
    irregular = _encode_png_bgr(_synthetic_irregular_board())
    rn = _post_analyze(client, neat).json()
    ri = _post_analyze(client, irregular).json()
    assert rn.get("pipeline_stage") == "full" and ri.get("pipeline_stage") == "full"
    assert rn["scores"]["size_consistency"] > ri["scores"]["size_consistency"] + 0.05


def test_analyze_three_clean_lines_with_white_frame_scores_high(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    _stub_ocr(monkeypatch)
    payload = _encode_png_bgr(_synthetic_framed_neat_three_lines_board())
    res = _post_analyze(client, payload)
    assert res.status_code == 200
    body = res.json()
    assert body["scores"]["readability"] >= 0.7
    assert body["scores"]["line_alignment"] >= 0.68


def test_analyze_tilted_lines_lower_line_alignment(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    _stub_ocr(monkeypatch)
    neat = _post_analyze(client, _encode_png_bgr(_synthetic_dense_board())).json()
    tilted = _post_analyze(client, _encode_png_bgr(_synthetic_tilted_board())).json()
    assert neat["scores"]["line_alignment"] > tilted["scores"]["line_alignment"] + 0.08


def test_analyze_faint_strokes_lower_stroke_quality(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    _stub_ocr(monkeypatch)
    crisp = _post_analyze(client, _encode_png_bgr(_synthetic_dense_board())).json()
    faint = _post_analyze(client, _encode_png_bgr(_synthetic_faint_board())).json()
    assert (
        crisp["scores"]["stroke_quality"] > faint["scores"]["stroke_quality"] + 0.05
        or crisp["scores"]["readability"] > faint["scores"]["readability"] + 0.05
    )


def test_analyze_low_visibility_keeps_main_handwriting_scores(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    _stub_ocr(monkeypatch)
    res = _post_analyze(client, _encode_png_bgr(_synthetic_low_visibility_neat_board()))
    assert res.status_code == 200
    body = res.json()
    assert body["scores"]["visibility"] < 0.7
    assert body["scores"]["readability"] > body["scores"]["visibility"]
    assert isinstance(body.get("notes"), list)


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


def _synthetic_framed_neat_three_lines_board() -> np.ndarray:
    h, w = 384, 560
    img = _chalkboard_base(h, w)
    for row in range(3):
        y0 = 72 + row * 84
        for col in range(16):
            x0 = 44 + col * 30
            cv2.rectangle(img, (x0, y0), (x0 + 14, y0 + 44), (228, 228, 228), thickness=-1)
    cv2.rectangle(img, (3, 3), (w - 4, h - 4), (208, 208, 208), thickness=2)
    return img


def _synthetic_tilted_board() -> np.ndarray:
    h, w = 384, 560
    img = _chalkboard_base(h, w)
    for row in range(4):
        y0 = 64 + row * 68
        slope = 0.16
        for col in range(14):
            x0 = 38 + col * 34
            y_shift = int(round((x0 - 38) * slope))
            cv2.rectangle(img, (x0, y0 + y_shift), (x0 + 13, y0 + y_shift + 42), (228, 228, 228), thickness=-1)
    return img


def _synthetic_faint_board() -> np.ndarray:
    h, w = 384, 560
    img = _chalkboard_base(h, w)
    for row in range(4):
        y0 = 72 + row * 70
        for col in range(18):
            x0 = 36 + col * 28
            color = 138 if (col + row) % 2 else 152
            cv2.rectangle(img, (x0, y0), (x0 + 10, y0 + 38), (color, color, color), thickness=1)
    rng = np.random.default_rng(42)
    drop = rng.random((h, w))
    faded_mask = np.all(img > np.array([120, 120, 120], dtype=np.uint8), axis=2)
    img[np.logical_and(faded_mask, drop < 0.25)] = np.array([52, 93, 56], dtype=np.uint8)
    img = cv2.GaussianBlur(img, (5, 5), 1.3)
    speckle = rng.normal(0.0, 15.0, size=img.shape).astype(np.int16)
    return np.clip(img.astype(np.int16) + speckle, 0, 255).astype(np.uint8)


def _synthetic_low_visibility_neat_board() -> np.ndarray:
    img = _synthetic_dense_board().astype(np.float32)
    img = img * 0.48 + 18.0
    img = cv2.GaussianBlur(img, (7, 7), 2.0)
    return np.clip(img, 0, 255).astype(np.uint8)


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
