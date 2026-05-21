"""OCR エンジンの差し込み口（lazy import）。"""

from __future__ import annotations

from dataclasses import dataclass, field

import cv2
import numpy as np

_EASYOCR_READER: object | None = None


@dataclass(frozen=True)
class OCRLine:
    text: str
    confidence: float
    bbox: list[tuple[float, float]]


@dataclass(frozen=True)
class OCRResult:
    text: str
    lines: list[OCRLine]
    confidence: float
    engine: str
    available: bool
    notes: list[str] = field(default_factory=list)
    error_code: str | None = None
    error_message: str | None = None


def _get_easyocr_reader() -> object:
    global _EASYOCR_READER
    if _EASYOCR_READER is not None:
        return _EASYOCR_READER
    import easyocr  # type: ignore

    _EASYOCR_READER = easyocr.Reader(["ja", "en"], gpu=False, verbose=False)
    return _EASYOCR_READER


def _sort_lines(lines: list[OCRLine]) -> list[OCRLine]:
    def sort_key(line: OCRLine) -> tuple[float, float]:
        ys = [p[1] for p in line.bbox] or [0.0]
        xs = [p[0] for p in line.bbox] or [0.0]
        return (float(np.mean(ys)), float(np.mean(xs)))

    return sorted(lines, key=sort_key)


def _parse_easyocr_raw(raw: object, engine: str) -> OCRResult:
    lines: list[OCRLine] = []
    conf_weighted_sum = 0.0
    char_weight_sum = 0.0
    if not isinstance(raw, list):
        raw = []

    for item in raw:
        if not isinstance(item, (list, tuple)) or len(item) != 3:
            continue
        box, txt, conf = item
        text = str(txt).strip()
        confidence = float(np.clip(float(conf), 0.0, 1.0))
        if not text:
            continue
        bbox: list[tuple[float, float]] = []
        for p in box:
            if isinstance(p, (list, tuple)) and len(p) >= 2:
                bbox.append((float(p[0]), float(p[1])))
        lines.append(OCRLine(text=text, confidence=confidence, bbox=bbox))
        weight = max(1.0, float(len(text.strip())))
        conf_weighted_sum += confidence * weight
        char_weight_sum += weight

    lines = _sort_lines(lines)
    merged = "\n".join([ln.text for ln in lines]).strip()
    avg_conf = float(conf_weighted_sum / char_weight_sum) if char_weight_sum > 0 else 0.0
    return OCRResult(
        text=merged,
        lines=lines,
        confidence=avg_conf,
        engine=engine,
        available=True,
    )


def _candidate_score(result: OCRResult) -> float:
    if not result.text.strip():
        return 0.0
    char_count = sum(len(line.text.strip()) for line in result.lines)
    confidence_part = result.confidence * 0.85
    text_part = min(char_count / 24.0, 1.0) * 0.10
    line_part = min(len(result.lines) / 4.0, 1.0) * 0.05
    return float(confidence_part + text_part + line_part)


def _preprocess_variants(image_bgr: np.ndarray) -> list[tuple[str, np.ndarray]]:
    gray = cv2.cvtColor(image_bgr, cv2.COLOR_BGR2GRAY)
    rgb = cv2.cvtColor(image_bgr, cv2.COLOR_BGR2RGB)

    clahe = cv2.createCLAHE(clipLimit=2.2, tileGridSize=(8, 8)).apply(gray)
    blur = cv2.GaussianBlur(clahe, (0, 0), 1.0)
    enhanced = cv2.addWeighted(clahe, 1.45, blur, -0.45, 0)

    # 黒板の白チョーク線は二値化・反転のどちらかが OCR に効くことがある。
    binary = cv2.adaptiveThreshold(
        enhanced,
        255,
        cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
        cv2.THRESH_BINARY,
        31,
        -4,
    )
    denoised_binary = cv2.medianBlur(binary, 3)
    inverted_binary = cv2.bitwise_not(denoised_binary)

    return [
        ("enhanced", enhanced),
        ("rgb", rgb),
        ("binary", denoised_binary),
        ("inverted_binary", inverted_binary),
    ]


def recognize_board_text(image_bgr: np.ndarray) -> OCRResult:
    """OCR 実行。デフォルトでは optional 実装（未導入でも API 起動可能）。"""
    try:
        reader = _get_easyocr_reader()
    except ImportError:
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
    except Exception:
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

    try:
        candidates: list[OCRResult] = []
        for name, candidate_image in _preprocess_variants(image_bgr):
            raw = reader.readtext(  # type: ignore[attr-defined]
                candidate_image,
                detail=1,
                paragraph=False,
                decoder="beamsearch",
                beamWidth=5,
                contrast_ths=0.05,
                adjust_contrast=0.7,
                text_threshold=0.45,
                low_text=0.25,
                link_threshold=0.35,
                canvas_size=2560,
                mag_ratio=1.5,
                add_margin=0.08,
            )
            candidates.append(_parse_easyocr_raw(raw, engine=f"easyocr:{name}"))
    except Exception:
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

    best = max(candidates, key=_candidate_score) if candidates else _parse_easyocr_raw([], engine="easyocr")
    notes: list[str] = []
    if not best.text.strip():
        notes.append("OCR で文字を認識できませんでした。")
    elif best.confidence < 0.45:
        notes.append("OCR の信頼度が低めです。認識結果に誤りが含まれる可能性があります。")
    notes.append(f"OCR は複数の前処理候補から {best.engine.split(':', 1)[-1]} を選択しました。")

    return OCRResult(
        text=best.text,
        lines=best.lines,
        confidence=best.confidence,
        engine=best.engine,
        available=True,
        notes=notes,
        error_code=None,
        error_message=None,
    )
