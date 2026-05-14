"use client";

import { analyzeBoardImage } from "@/lib/api/analyze";
import type { BanshoAnalysisResult } from "@/lib/api/schemas";
import { getPublicApiBaseUrl } from "@/lib/env";
import {
  AlertCircle,
  Camera,
  ImagePlus,
  Lightbulb,
  Loader2,
  RefreshCw,
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

function improvementHints(result: BanshoAnalysisResult): string[] {
  const scores = result.scores;
  const ref = result.reference_comparison;
  const hints: string[] = [];
  const t = 0.72;
  if (scores.horizontalness < t) {
    hints.push("行のラインを意識し、文字の足元（ベースライン）が揃うように書くと、お手本との一致が上がりやすくなります。");
  }
  if (scores.spacing_uniformity < t) {
    hints.push("文字同士の間隔をお手本に近づけると、等間隔性の評価が改善します。");
  }
  if (scores.size_consistency < t) {
    hints.push("文字の高さや太さをお手本に揃えると、サイズ一貫性のスコアが上がります。");
  }
  if (scores.visibility < t) {
    hints.push("コントラスト（背景との差）をはっきりさせ、細すぎる線を避けると視認性が上がります。");
  }
  if (ref && ref.font_similarity < 0.55) {
    hints.push("お手本テキストの形に近づけるようゆっくり書くと、お手本との一致度が上がりやすいです。");
  }
  if (hints.length === 0) {
    hints.push("バランスが良いです。この調子で書き続けましょう。");
  }
  return hints;
}

function averageScore(scores: BanshoAnalysisResult["scores"]): number {
  const v = Object.values(scores);
  return v.reduce((a, b) => a + b, 0) / v.length;
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

function formatUserError(e: unknown): string {
  if (e instanceof TypeError && /fetch|network|load failed/i.test(String(e.message))) {
    return "バックエンドに接続できません。`NEXT_PUBLIC_API_URL` と API の起動状態を確認してください。";
  }
  if (e instanceof Error) return e.message;
  return "予期しないエラーが発生しました。";
}

export function CameraCapture() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const objectUrlRef = useRef<string | null>(null);

  const [permissionDenied, setPermissionDenied] = useState(false);
  const [streamActive, setStreamActive] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<BanshoAnalysisResult | null>(null);

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [targetText, setTargetText] = useState("");

  const revokePreview = useCallback(() => {
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }
    setPreviewUrl(null);
    setSelectedFile(null);
  }, []);

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setStreamActive(false);
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }, []);

  const resetSession = useCallback(() => {
    setResult(null);
    setError(null);
    setTargetText("");
    revokePreview();
    stopCamera();
  }, [revokePreview, stopCamera]);

  const startCamera = useCallback(async () => {
    setError(null);
    setPermissionDenied(false);
    setIsStarting(true);
    revokePreview();
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
  }, [revokePreview]);

  const onPickFile = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const onFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      e.target.value = "";
      if (!file || !file.type.startsWith("image/")) {
        setError("画像ファイル（JPEG・PNG など）を選択してください。");
        return;
      }
      setError(null);
      setResult(null);
      stopCamera();
      revokePreview();
      const url = URL.createObjectURL(file);
      objectUrlRef.current = url;
      setPreviewUrl(url);
      setSelectedFile(file);
    },
    [revokePreview, stopCamera],
  );

  useEffect(() => {
    return () => {
      stopCamera();
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
      }
    };
  }, [stopCamera]);

  const runAnalysis = useCallback(async () => {
    setError(null);
    const text = targetText.trim();
    if (!text) {
      setError("お手本テキストを入力してください。板書に書いた内容と同じ文字列を指定します。");
      return;
    }

    try {
      if (selectedFile) {
        setIsAnalyzing(true);
        const data = await analyzeBoardImage(selectedFile, text, selectedFile.name);
        setResult(data);
        return;
      }

      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (!video || !canvas || !streamActive) {
        setError("先に写真を選ぶか、カメラを開始してください。");
        return;
      }
      if (!video.videoWidth) {
        setError("映像の準備ができていません。数秒待ってから再度お試しください。");
        return;
      }

      setIsAnalyzing(true);
      drawVideoToCanvas(video, canvas, 1600);
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob((b) => resolve(b), "image/jpeg", 0.92),
      );
      if (!blob) {
        throw new Error("画像の変換に失敗しました");
      }
      const data = await analyzeBoardImage(blob, text, "capture.jpg");
      setResult(data);
    } catch (e) {
      setError(formatUserError(e));
    } finally {
      setIsAnalyzing(false);
    }
  }, [selectedFile, streamActive, targetText]);

  const { overlay } = result ?? {};
  const w = overlay?.image_width ?? 1;
  const h = overlay?.image_height ?? 1;
  const guide = overlay?.guide ?? null;

  const hasInput = !!(selectedFile || streamActive) && targetText.trim().length > 0;
  const hints = result ? improvementHints(result) : [];
  const summaryPct = result ? Math.round(averageScore(result.scores) * 100) : null;

  return (
    <section className="space-y-6">
      <div className="space-y-2 text-center sm:text-left">
        <p className="text-sm leading-relaxed text-zinc-400">
          <span className="sr-only">手順：</span>
          お手本テキストを入力し、画像を選ぶかカメラで撮影してから「解析する」。
          サーバーがお手本形状と写真の線を比較してスコアを出します（OCR は使いません）。
        </p>
      </div>

      <div className="space-y-2">
        <label htmlFor="target-text" className="block text-sm font-medium text-zinc-200">
          お手本テキスト
        </label>
        <p className="text-xs text-zinc-500">
          この文字列をチョーク体のお手本として比較します。板書に書いた内容と同じテキストを入力してください。
        </p>
        <textarea
          id="target-text"
          value={targetText}
          onChange={(e) => setTargetText(e.target.value)}
          rows={3}
          placeholder={"例：二次方程式の解の公式"}
          className="w-full resize-y rounded-xl border border-zinc-700 bg-zinc-950/80 px-3 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-sky-600 focus:outline-none focus:ring-1 focus:ring-sky-600"
          disabled={isAnalyzing}
          autoComplete="off"
        />
        {!hasInput && (selectedFile || streamActive) ? (
          <p className="text-xs text-amber-200/90">画像とお手本テキストの両方を入力してください。</p>
        ) : null}
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/heic,image/*"
        className="hidden"
        onChange={onFileChange}
      />

      <div className="space-y-3 rounded-2xl border border-zinc-800 bg-zinc-900/40 p-3 shadow-lg sm:p-4">
        <div className="relative min-h-[200px] overflow-hidden rounded-xl border border-zinc-800 bg-black sm:min-h-[240px]">
          {/* プレビュー（ファイル / カメラ） */}
          {previewUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={previewUrl}
              alt="選択した板書のプレビュー"
              className="mx-auto block max-h-[56vh] w-full object-contain"
            />
          ) : (
            <video
              ref={videoRef}
              className={`mx-auto block max-h-[56vh] w-full object-contain ${streamActive ? "block" : "hidden"}`}
              playsInline
              muted
              autoPlay
            />
          )}

          {!previewUrl && !streamActive ? (
            <div className="flex min-h-[200px] flex-col items-center justify-center gap-3 px-6 py-12 text-center sm:min-h-[240px]">
              <Camera className="h-12 w-12 text-zinc-600" aria-hidden />
              <p className="max-w-sm text-sm text-zinc-400">
                まず写真ライブラリから選ぶか、下のボタンでカメラを開始してください。
              </p>
            </div>
          ) : null}

          {overlay && (previewUrl || streamActive) && (
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

          {isAnalyzing && (
            <div
              className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/70 backdrop-blur-[2px]"
              role="status"
              aria-live="polite"
            >
              <Loader2 className="h-10 w-10 animate-spin text-sky-400" aria-hidden />
              <span className="text-sm font-medium text-zinc-100">解析しています…</span>
              <span className="max-w-xs px-4 text-center text-xs text-zinc-400">
                画像処理はサーバー側で実行しています。少々お待ちください。
              </span>
            </div>
          )}
        </div>

        <canvas ref={canvasRef} className="hidden" />

        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          <button
            type="button"
            onClick={onPickFile}
            disabled={isAnalyzing}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-zinc-800 px-4 py-3 text-sm font-medium text-white transition hover:bg-zinc-700 disabled:opacity-50 sm:flex-1"
          >
            <ImagePlus className="h-4 w-4 shrink-0" />
            画像を選ぶ
          </button>
          <button
            type="button"
            onClick={startCamera}
            disabled={isStarting || isAnalyzing}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-3 text-sm font-medium text-white transition hover:bg-emerald-500 disabled:opacity-50 sm:flex-1"
          >
            {isStarting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Video className="h-4 w-4 shrink-0" />}
            カメラで撮影
          </button>
          <button
            type="button"
            onClick={stopCamera}
            disabled={!streamActive || isAnalyzing}
            className="min-h-11 rounded-xl border border-zinc-600 px-4 py-3 text-sm text-zinc-200 hover:bg-zinc-800 disabled:opacity-40"
          >
            カメラ停止
          </button>
        </div>

        <button
          type="button"
          onClick={runAnalysis}
          disabled={isAnalyzing || !hasInput}
          className="flex min-h-[3rem] w-full items-center justify-center gap-2 rounded-xl bg-sky-600 px-4 py-3.5 text-base font-semibold text-white shadow-lg transition hover:bg-sky-500 disabled:opacity-50"
        >
          {isAnalyzing ? <Loader2 className="h-5 w-5 animate-spin" /> : <Scan className="h-5 w-5" />}
          解析する
        </button>

        <button
          type="button"
          onClick={resetSession}
          disabled={isAnalyzing}
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-zinc-700 py-3 text-sm text-zinc-300 hover:bg-zinc-800/80 disabled:opacity-40"
        >
          <RefreshCw className="h-4 w-4" />
          別の写真でもう一度試す
        </button>
      </div>

      <p className="text-center text-[11px] text-zinc-600 sm:text-left">
        接続先 API: <span className="font-mono text-zinc-500">{getPublicApiBaseUrl()}</span>
      </p>

      {permissionDenied && (
        <p className="flex items-start gap-2 rounded-lg border border-amber-900/50 bg-amber-950/30 px-3 py-2 text-sm text-amber-200">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          カメラへのアクセスがブロックされています。ブラウザの設定からこのサイトのアクセスを許可してください。
        </p>
      )}

      {error && (
        <p className="flex items-start gap-2 rounded-lg border border-red-900/40 bg-red-950/25 px-3 py-2 text-sm text-red-200">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          {error}
        </p>
      )}

      {result && summaryPct !== null && (
        <div className="space-y-4 rounded-2xl border border-zinc-800 bg-zinc-900/30 p-4">
          <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
            <h2 className="text-lg font-semibold tracking-tight text-zinc-100">総合評価</h2>
            <p className="text-3xl font-bold tabular-nums text-sky-400">{summaryPct}点</p>
          </div>
          <p className="text-xs text-zinc-500">
            水平度・間隔・サイズはお手本テキストから生成した参照形状との比較、視認性は写真のコントラスト等から算出しています（0〜100%）。
          </p>

          {result.reference_comparison && (
            <div className="rounded-xl border border-sky-900/40 bg-sky-950/20 p-4">
              <p className="mb-2 text-xs font-medium text-sky-200/90">お手本テキストとの形状一致</p>
              <p className="font-mono text-2xl tabular-nums text-sky-300">
                {(result.reference_comparison.font_similarity * 100).toFixed(0)}%
              </p>
              <p className="mt-2 text-[11px] text-zinc-500">
                IoU {(result.reference_comparison.iou * 100).toFixed(0)}% / Dice{" "}
                {(result.reference_comparison.dice_coefficient * 100).toFixed(0)}% / 画素一致{" "}
                {(result.reference_comparison.pixel_agreement * 100).toFixed(0)}%
              </p>
            </div>
          )}
          <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {(Object.keys(result.scores) as (keyof BanshoAnalysisResult["scores"])[]).map((key) => (
              <div
                key={key}
                className="rounded-xl border border-zinc-800 bg-zinc-950/50 px-3 py-3 text-left"
              >
                <dt className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">
                  {scoreLabel(key)}
                </dt>
                <dd className="mt-1 font-mono text-2xl tabular-nums text-zinc-50">
                  {(result.scores[key] * 100).toFixed(0)}%
                </dd>
              </div>
            ))}
          </dl>

          <div className="space-y-2 rounded-xl border border-emerald-900/30 bg-emerald-950/20 p-4">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-emerald-100">
              <Lightbulb className="h-4 w-4 text-emerald-400" aria-hidden />
              改善ポイント
            </h3>
            <ul className="list-inside list-disc space-y-2 text-sm leading-relaxed text-zinc-300">
              {hints.map((line, i) => (
                <li key={i}>{line}</li>
              ))}
            </ul>
          </div>

          {result.notes.length > 0 && (
            <div className="rounded-xl border border-zinc-800/80 bg-zinc-950/40 p-4">
              <p className="mb-2 text-xs font-medium text-zinc-500">システムメッセージ</p>
              <ul className="space-y-1.5 text-sm text-zinc-400">
                {result.notes.map((n, i) => (
                  <li key={i}>{n}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
