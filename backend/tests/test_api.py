"""API の最低限の振る舞いテスト。"""

import cv2
import numpy as np
import pytest
from fastapi.testclient import TestClient

from app.main import app


def _tiny_png_bytes() -> bytes:
    img = np.zeros((24, 32, 3), dtype=np.uint8)
    img[:] = (40, 80, 120)
    ok, buf = cv2.imencode(".png", img)
    assert ok
    return buf.tobytes()


@pytest.fixture
def client() -> TestClient:
    return TestClient(app)


def test_health_ok(client: TestClient) -> None:
    res = client.get("/health")
    assert res.status_code == 200
    data = res.json()
    assert data.get("status") == "ok"


def test_analyze_rejects_non_image(client: TestClient) -> None:
    files = {"file": ("x.txt", b"hello", "text/plain")}
    res = client.post("/analyze", files=files)
    assert res.status_code == 400
    assert "画像" in res.json().get("detail", "")


def test_analyze_rejects_empty_file(client: TestClient) -> None:
    files = {"file": ("e.jpg", b"", "image/jpeg")}
    res = client.post("/analyze", files=files)
    assert res.status_code == 400


def test_analyze_rejects_corrupt_image(client: TestClient) -> None:
    files = {"file": ("bad.jpg", b"\xff\xd8\xff garbage not a jpeg", "image/jpeg")}
    res = client.post("/analyze", files=files)
    assert res.status_code == 400
    detail = res.json().get("detail", "")
    assert isinstance(detail, str)


def test_analyze_accepts_minimal_png(client: TestClient) -> None:
    files = {"file": ("tiny.png", _tiny_png_bytes(), "image/png")}
    res = client.post("/analyze", files=files)
    assert res.status_code == 200
    body = res.json()
    assert "scores" in body
    assert "overlay" in body
