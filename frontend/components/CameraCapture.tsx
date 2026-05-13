"use client";

import { analyzeBoardImage } from "@/lib/api/analyze";
import type { BanshoAnalysisResult } from "@/lib/api/schemas";
import {
  AlertCircle,
  Camera,
  Grid3x3,
  Loader2,
  Scan,
  Video,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

function scoreLabel(key: keyof BanshoAnalysisResult["scores"]): string {
  const map: Record<keyof BanshoAnalysisResult["scores"], string> = {
    horizontalness: "水平度",
    spacing_uniformity: "等間隔性",
    size_consistency: "文字サイズ一貫性",
    visibility: "視認性",
  };
  return map[key];
}

function drawVideoToCanvas(
  video: HTMLVideoElement,
  canvas: HTMLCanvasElement,
  maxEdge: number,
): void {
  const vw = video.videoWidth;
  const vh = video.videoHeight;
  if (!vw || !vh) return;

  const scale = Math.min(1, maxEdge / Math.max(vw, vh));
  const tw = Math.max(1, Math.round(vw * scale));
  const th = Math.max(1, Math.round(vh * scale));
  canvas.width = tw;
  canvas.height = th;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.drawImage(video, 0, 0, tw, th);
}

export function CameraCapture() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const [permissionDenied, setPermissionDenied] = useState(false);
  const [streamActive, setStreamActive] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<BanshoAnalysisResult | null>(null);

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setStreamActive(false);
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }, []);

  const startCamera = useCallback(async () => {
    setError(null);
    setPermissionDenied(false);
    setIsStarting(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      streamRef.current = stream;
      const video = videoRef.current;
      if (!video) return;
      video.srcObject = stream;
      await video.play();
      setStreamActive(true);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.toLowerCase().includes("denied") || msg.toLowerCase().includes("notallowed")) {
        setPermissionDenied(true);
      }
      setError(`カメラを開始できませんでした: ${msg}`);
    } finally {
      setIsStarting(false);
    }
  }, []);

  useEffect(() => {
    return () => stopCamera();
  }, [stopCamera]);

  const runAnalysis = useCallback(async () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;
    if (!video.videoWidth) {
      setError("映像の準備ができていません。数秒待ってから再度お試しください。");
      return;
    }

    setIsAnalyzing(true);
    setError(null);
    try {
      drawVideoToCanvas(video, canvas, 1600);
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob((b) => resolve(b), "image/jpeg", 0.92),
      );
      if (!blob) {
        throw new Error("画像のエンコードに失敗しました");
      }
      const data = await analyzeBoardImage(blob);
      setResult(data);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
    } finally {
      setIsAnalyzing(false);
    }
  }, []);

  const { overlay } = result ?? {};
  const w = overlay?.image_width ?? 1;
  const h = overlay?.image_height ?? 1;
  const guide = overlay?.guide ?? null;

  return (
    <section className="space-y-4 rounded-2xl border border-zinc-800 bg-zinc-900/40 p-4 shadow-lg">
      <div className="relative overflow-hidden rounded-xl border border-zinc-800 bg-black">
        <video
          ref={videoRef}
          className="block max-h-[60vh] w-full object-contain"
          playsInline
          muted
          autoPlay
        />
        {overlay && (
          <svg
            className="pointer-events-none absolute inset-0 h-full w-full"
            viewBox={`0 0 ${w} ${h}`}
            preserveAspectRatio="xMidYMid meet"
            aria-hidden
          >
            {guide && (
              <g opacity={0.35} stroke="rgb(52 211 153)" strokeWidth={Math.max(1, w / 400)}>
                {Array.from({ length: guide.columns + 1 }, (_, i) => {
                  const x = guide.origin.x + i * guide.cell_width_px;
                  return (
                    <line
                      key={`v-${i}`}
                      x1={x}
                      y1={guide.origin.y}
                      x2={x}
                      y2={guide.origin.y + guide.rows * guide.cell_height_px}
                    />
                  );
                })}
                {Array.from({ length: guide.rows + 1 }, (_, j) => {
                  const y = guide.origin.y + j * guide.cell_height_px;
                  return (
                    <line
                      key={`h-${j}`}
                      x1={guide.origin.x}
                      y1={y}
                      x2={guide.origin.x + guide.columns * guide.cell_width_px}
                      y2={y}
                    />
                  );
                })}
              </g>
            )}
            <g opacity={0.55} stroke="rgb(34 211 238)" strokeWidth={Math.max(1, w / 500)}>
              {overlay.baseline_y_positions.map((y, idx) => (
                <line key={idx} x1={0} y1={y} x2={w} y2={y} />
              ))}
            </g>
            <g fill="none" stroke="rgb(250 204 21)" strokeWidth={Math.max(1, w / 600)} opacity={0.65}>
              {overlay.char_boxes.map((b, idx) => (
                <rect key={idx} x={b.x} y={b.y} width={b.width} height={b.height} rx={2} />
              ))}
            </g>
          </svg>
        )}
      </div>

      <canvas ref={canvasRef} className="hidden" />

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={startCamera}
          disabled={isStarting}
          className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-500 disabled:opacity-50"
        >
          {isStarting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Video className="h-4 w-4" />}
          カメラ開始
        </button>
        <button
          type="button"
          onClick={stopCamera}
          className="rounded-lg border border-zinc-700 px-4 py-2 text-sm text-zinc-200 hover:bg-zinc-800"
        >
          停止
        </button>
        <button
          type="button"
          onClick={runAnalysis}
          disabled={isAnalyzing || !streamActive}
          className="inline-flex items-center gap-2 rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-sky-500 disabled:opacity-50"
        >
          {isAnalyzing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Scan className="h-4 w-4" />}
          解析
        </button>
      </div>

      {permissionDenied && (
        <p className="flex items-start gap-2 text-sm text-amber-300">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          ブラウザの設定でカメラへのアクセスを許可してください。
        </p>
      )}

      {error && (
        <p className="flex items-start gap-2 text-sm text-red-300">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          {error}
        </p>
      )}

      {result && (
        <div className="space-y-3">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-zinc-200">
            <Grid3x3 className="h-4 w-4 text-emerald-400" />
            解析スコア（バックエンド）
          </h2>
          <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {(Object.keys(result.scores) as (keyof BanshoAnalysisResult["scores"])[]).map((key) => (
              <div
                key={key}
                className="rounded-lg border border-zinc-800 bg-zinc-950/60 px-3 py-2 text-xs text-zinc-300"
              >
                <dt className="text-[11px] text-zinc-500">{scoreLabel(key)}</dt>
                <dd className="font-mono text-lg text-zinc-50">{(result.scores[key] * 100).toFixed(0)}%</dd>
              </div>
            ))}
          </dl>
          {result.notes.length > 0 && (
            <ul className="list-inside list-disc space-y-1 text-xs text-zinc-400">
              {result.notes.map((n, i) => (
                <li key={i}>{n}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      <p className="flex items-center gap-2 text-xs text-zinc-500">
        <Camera className="h-3.5 w-3.5" />
        重い画像処理は API 側で実行し、ここではオーバーレイとスコア表示のみ行います。
      </p>
    </section>
  );
}
