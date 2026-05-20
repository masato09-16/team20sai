"""お手本プレビュー画像（黒板 + チョーク文字）生成。"""

from __future__ import annotations

import zlib

import cv2
import numpy as np

from app.analysis.reference import render_reference_mask


def render_reference_preview_bgr(target_text: str, width: int, height: int) -> np.ndarray:
    """解析と同じ参照マスクを使って黒板プレビューを生成する。"""
    ref = render_reference_mask(target_text, width, height)
    mask = ref.mask

    # 同じ入力に対して見た目が安定するよう、シードを固定
    seed = zlib.crc32(f"{target_text}|{width}|{height}".encode("utf-8")) & 0xFFFFFFFF
    rng = np.random.default_rng(seed)

    # 深い緑の黒板（BGR）
    board = np.full((height, width, 3), (44, 82, 48), dtype=np.float32)
    board_noise = rng.normal(0.0, 4.2, (height, width, 1)).astype(np.float32)
    board = np.clip(board + board_noise, 0.0, 255.0)

    # 参照マスク形状を最優先しつつ、わずかなチョーク感を付与
    alpha = cv2.GaussianBlur(mask.astype(np.float32) / 255.0, (0, 0), sigmaX=0.8)
    edge = cv2.GaussianBlur(mask.astype(np.float32) / 255.0, (0, 0), sigmaX=1.6)
    chalk_grain = rng.normal(0.0, 9.0, (height, width)).astype(np.float32)
    chalk = np.clip(225.0 + chalk_grain, 185.0, 245.0)
    chalk_rgb = np.repeat(chalk[:, :, None], 3, axis=2)

    composed = board * (1.0 - alpha[:, :, None]) + chalk_rgb * alpha[:, :, None]
    # 文字外周にごく弱い粉感
    halo = np.clip(edge - alpha, 0.0, 1.0) * 0.10
    composed = composed * (1.0 - halo[:, :, None]) + 235.0 * halo[:, :, None]
    return np.clip(composed, 0.0, 255.0).astype(np.uint8)


def render_reference_preview_png(target_text: str, width: int, height: int) -> bytes:
    bgr = render_reference_preview_bgr(target_text, width, height)
    ok, buf = cv2.imencode(".png", bgr)
    if not ok or buf is None:
        raise ValueError("プレビュー PNG の生成に失敗しました")
    return buf.tobytes()
