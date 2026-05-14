"""お手本テキストから参照用二値マスクを生成する（Pillow）。

黒背景に白前景（255）で描画し、OpenCV と同じ uint8 マスクとして返す。
フォントは環境変数 ``CHALK_FONT_PATH`` で指定（リポジトリには同梱しない）。
"""

from __future__ import annotations

import os
from dataclasses import dataclass

import numpy as np
from PIL import Image, ImageDraw, ImageFont


@dataclass(frozen=True)
class ReferenceRenderResult:
    """参照マスクとメタ情報。"""

    mask: np.ndarray  # uint8 HxW, 前景 255 / 背景 0
    used_custom_font: bool
    notes: list[str]


def _load_font(size: int) -> tuple[ImageFont.ImageFont, bool]:
    """(font, used_custom_font)"""
    path = os.getenv("CHALK_FONT_PATH", "").strip()
    if path and os.path.isfile(path):
        try:
            return ImageFont.truetype(path, size=size), True
        except OSError:
            pass
    return ImageFont.load_default(), False


def render_reference_mask(target_text: str, canvas_w: int, canvas_h: int) -> ReferenceRenderResult:
    """``target_text`` を黒背景・白文字で描画し、マスクを返す。

    ``canvas_w`` x ``canvas_h`` に収まるようフォントサイズを自動調整する。
    """
    notes: list[str] = []
    text = target_text.replace("\r\n", "\n")
    if not text.strip():
        empty = np.zeros((max(8, canvas_h), max(8, canvas_w)), dtype=np.uint8)
        return ReferenceRenderResult(mask=empty, used_custom_font=False, notes=["お手本テキストが空です。"])

    pad = max(8, min(canvas_w, canvas_h) // 32)
    inner_w = max(32, canvas_w - 2 * pad)
    inner_h = max(32, canvas_h - 2 * pad)

    best_mask: np.ndarray | None = None
    used_custom = False

    max_start = min(220, max(24, inner_h // max(1, text.count("\n") + 1) + 40))
    for size in range(max_start, 9, -2):
        font, custom = _load_font(size)
        used_custom = custom
        img = Image.new("L", (canvas_w, canvas_h), color=0)
        draw = ImageDraw.Draw(img)
        spacing = max(2, size // 8)
        bbox = draw.multiline_textbbox((0, 0), text, font=font, spacing=spacing, align="left")
        tw = bbox[2] - bbox[0]
        th = bbox[3] - bbox[1]
        if tw <= inner_w and th <= inner_h and tw >= 1:
            pos_x = (canvas_w - tw) // 2 - bbox[0]
            pos_y = (canvas_h - th) // 2 - bbox[1]
            draw.multiline_text((pos_x, pos_y), text, fill=255, font=font, spacing=spacing, align="left")
            best_mask = np.array(img, dtype=np.uint8)
            break

    if best_mask is None:
        font, custom = _load_font(10)
        used_custom = custom
        img = Image.new("L", (canvas_w, canvas_h), color=0)
        draw = ImageDraw.Draw(img)
        draw.multiline_text((pad, pad), text[:500], fill=255, font=font, spacing=2, align="left")
        best_mask = np.array(img, dtype=np.uint8)

    if not used_custom:
        notes.append(
            "チョーク体フォント未設定（`CHALK_FONT_PATH`）。開発用の簡易フォントでお手本を描画しています。比較精度を上げるには `backend/assets/fonts/README.md` を参照してフォントを配置してください。"
        )

    if len(text.strip()) < 3:
        notes.append("お手本テキストが短いため、比較の安定性が下がることがあります。")

    if np.count_nonzero(best_mask > 127) < 8:
        notes.append("お手本テキストの描画結果がほぼ空です。文字数やキャンバスサイズを確認してください。")

    return ReferenceRenderResult(mask=best_mask, used_custom_font=used_custom, notes=notes)
