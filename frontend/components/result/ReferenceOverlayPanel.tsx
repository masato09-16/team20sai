"use client";

import { Eye, EyeOff } from "lucide-react";
import { useMemo, useState, type CSSProperties } from "react";

import type { AnalysisOverlay, WritingDirection } from "@/lib/api/schemas";

type ReferenceToneId = (typeof REFERENCE_TONES)[number]["id"];

type ReferenceOverlayPanelProps = {
  imageUrl: string;
  referenceText: string;
  overlay: AnalysisOverlay;
  writingDirection: WritingDirection;
};

type GuideBox = {
  left: number;
  top: number;
  width: number;
  height: number;
};

const REFERENCE_TONES = [
  { id: "chalk", label: "白チョーク", color: "#fff7d6", glow: "rgba(255, 247, 214, 0.28)" },
  { id: "mint", label: "ミント", color: "#85f0c2", glow: "rgba(133, 240, 194, 0.28)" },
  { id: "sky", label: "水色", color: "#7dd3fc", glow: "rgba(125, 211, 252, 0.28)" },
  { id: "rose", label: "ピンク", color: "#f6a6c8", glow: "rgba(246, 166, 200, 0.28)" },
] as const;

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function guideBoxFromOverlay(overlay: AnalysisOverlay, direction: WritingDirection): GuideBox {
  const imageWidth = overlay.image_width;
  const imageHeight = overlay.image_height;
  const boxes = overlay.char_boxes.filter((box) => box.width > 0 && box.height > 0);

  if (boxes.length === 0) {
    return direction === "vertical"
      ? { left: 58, top: 9, width: 28, height: 80 }
      : { left: 8, top: 22, width: 84, height: 42 };
  }

  const minX = Math.min(...boxes.map((box) => box.x));
  const minY = Math.min(...boxes.map((box) => box.y));
  const maxX = Math.max(...boxes.map((box) => box.x + box.width));
  const maxY = Math.max(...boxes.map((box) => box.y + box.height));
  const padX = imageWidth * 0.035;
  const padY = imageHeight * 0.055;

  const minWidth = direction === "vertical" ? 18 : 34;
  const minHeight = direction === "vertical" ? 58 : 28;
  const width = clamp(((maxX - minX + padX * 2) / imageWidth) * 100, minWidth, 92);
  const height = clamp(((maxY - minY + padY * 2) / imageHeight) * 100, minHeight, 84);
  const left = clamp(((minX - padX) / imageWidth) * 100, 3, 97 - width);
  const top = clamp(((minY - padY) / imageHeight) * 100, 4, 96 - height);

  return { left, top, width, height };
}

function normalizedReferenceText(text: string): string {
  return text
    .trim()
    .replace(/\n{3,}/g, "\n\n")
    .slice(0, 420);
}

export function ReferenceOverlayPanel({
  imageUrl,
  referenceText,
  overlay,
  writingDirection,
}: ReferenceOverlayPanelProps) {
  const [showReference, setShowReference] = useState(true);
  const [opacity, setOpacity] = useState(62);
  const [toneId, setToneId] = useState<ReferenceToneId>("chalk");

  const displayText = useMemo(() => normalizedReferenceText(referenceText), [referenceText]);
  const tone = REFERENCE_TONES.find((item) => item.id === toneId) ?? REFERENCE_TONES[0];
  const guideBox = useMemo(() => guideBoxFromOverlay(overlay, writingDirection), [overlay, writingDirection]);
  const baselines = useMemo(
    () =>
      overlay.baseline_y_positions
        .filter((y) => y >= 0 && y <= overlay.image_height)
        .slice(0, 14)
        .map((y) => (y / overlay.image_height) * 100),
    [overlay],
  );
  const hasReference = displayText.length > 0;
  const guideVisible = showReference && hasReference;
  const isVertical = writingDirection === "vertical";
  const guideStyle: CSSProperties = {
    left: `${guideBox.left}%`,
    top: `${guideBox.top}%`,
    width: `${guideBox.width}%`,
    height: `${guideBox.height}%`,
    color: tone.color,
    opacity: guideVisible ? opacity / 100 : 0,
    writingMode: isVertical ? "vertical-rl" : "horizontal-tb",
    textOrientation: isVertical ? "upright" : undefined,
    fontSize: isVertical ? "clamp(1.45rem, 4.4vh, 4.4rem)" : "clamp(1.35rem, 3.6vw, 4.2rem)",
    textShadow: `0 1px 0 rgba(0, 0, 0, 0.5), 0 0 16px ${tone.glow}`,
  };

  return (
    <section className="space-y-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-sm font-semibold text-stone-800">板書とお手本</h2>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <button
            type="button"
            onClick={() => setShowReference((value) => !value)}
            disabled={!hasReference}
            className="ui-button-quiet min-h-9 px-3 py-1.5 text-xs"
            aria-pressed={showReference}
          >
            {showReference ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
            お手本
          </button>
          <div className="flex min-h-9 items-center gap-1 rounded-lg border border-canvas-line bg-paper px-2">
            {REFERENCE_TONES.map((item) => {
              const active = item.id === toneId;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setToneId(item.id)}
                  disabled={!hasReference}
                  title={item.label}
                  aria-label={item.label}
                  aria-pressed={active}
                  className={`ui-color-swatch ${active ? "is-active" : ""}`}
                  style={{ backgroundColor: item.color }}
                />
              );
            })}
          </div>
          <label className="flex min-h-9 items-center gap-2 rounded-lg border border-canvas-line bg-paper px-3 text-stone-700">
            濃さ
            <input
              type="range"
              min={30}
              max={90}
              step={5}
              value={opacity}
              disabled={!hasReference}
              onChange={(event) => setOpacity(Number(event.target.value))}
              className="w-20 accent-brand"
              aria-label="お手本の濃さ"
            />
          </label>
        </div>
      </div>

      <div className="overflow-hidden rounded-lg border border-[#24453f] bg-[#173733]">
        <div className="relative mx-auto w-fit max-w-full">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={imageUrl} alt="保存した板書画像" className="block max-h-[56vh] max-w-full object-contain" />
          {showReference ? (
            <div className="pointer-events-none absolute inset-0 overflow-hidden">
              {baselines.map((top, index) => (
                <span
                  key={`${top}-${index}`}
                  className="absolute left-[4%] right-[4%] border-t border-dashed"
                  style={{
                    top: `${top}%`,
                    borderColor: tone.color,
                    opacity: hasReference ? (opacity / 100) * 0.32 : 0,
                  }}
                />
              ))}
              <div
                className="ui-reference-text absolute flex items-center justify-center whitespace-pre-wrap px-2 py-1 text-center"
                style={guideStyle}
              >
                {displayText}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
