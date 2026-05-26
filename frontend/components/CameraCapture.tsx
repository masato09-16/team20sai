"use client";

import { analyzeBoardImage } from "@/lib/api/analyze";
import { fetchReferencePreviewPng } from "@/lib/api/referencePreview";
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
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const MAIN_SCORE_WEIGHTS = {
  readability: 0.35,
  line_alignment: 0.25,
  size_consistency: 0.2,
  spacing_balance: 0.1,
  stroke_quality: 0.1,
} as const;

function scoreLabel(key: keyof BanshoAnalysisResult["scores"]): string {
  const map: Record<keyof BanshoAnalysisResult["scores"], string> = {
    readability: "可読性",
    line_alignment: "行の整い",
    spacing_balance: "字間・行間",
    stroke_quality: "線の安定感",
    horizontalness: "水平度（互換）",
    spacing_uniformity: "等間隔性（互換）",
    size_consistency: "文字サイズ一貫性",
    visibility: "撮影品質",
  };
  return map[key];
}

function improvementHints(result: BanshoAnalysisResult): string[] {
  const scores = result.scores;
  const hints: string[] = [];
  const t = 0.72;
  if (scores.readability < t) {
    hints.push("全体として読み取りやすい字形を意識し、潰れた文字や詰まりすぎを減らすと可読性が上がります。");
  }
  if (scores.line_alignment < t) {
    hints.push("行の傾きと上下ぶれを抑え、ベースラインを揃えると行の整いが改善します。");
  }
  if (scores.size_consistency < t) {
    hints.push("文字の高さや太さを揃えると、サイズ一貫性のスコアが上がります。");
  }
  if (scores.spacing_balance < t) {
    hints.push("字間・行間の詰まりや空きすぎを抑えると、読みやすさが安定します。");
  }
  if (scores.stroke_quality < t) {
    hints.push("線が薄い・かすれる場合は、チョーク圧や撮影距離を調整すると線の安定感が上がります。");
  }
  if (hints.length === 0) {
    hints.push("バランスが良いです。この調子で書き続けましょう。");
  }
  return hints;
}

function positiveHighlights(result: BanshoAnalysisResult): string[] {
  const s = result.scores;
  const picked: string[] = [];
  if (s.line_alignment >= 0.78) picked.push("行が揃っていて、読み進めやすい板書です。");
  if (s.size_consistency >= 0.78) picked.push("文字サイズが安定しており、見た目にまとまりがあります。");
  if (s.spacing_balance >= 0.78) picked.push("字間・行間のバランスがよく、窮屈さが少ないです。");
  if (s.stroke_quality >= 0.78) picked.push("線が安定していて、文字の形がはっきり伝わります。");
  if (s.readability >= 0.78) picked.push("全体として読みやすく、授業で伝わりやすい板書です。");
  if (picked.length === 0) picked.push("読み取りやすい要素が出始めています。このまま続けて整えていきましょう。");
  return picked.slice(0, 2);
}

function captureAndRecognitionHints(result: BanshoAnalysisResult): string[] {
  const hints: string[] = [];
  if (result.scores.visibility < 0.72) {
    hints.push("撮影品質が低めです。暗さ・ピント・斜め撮影を整えると、評価の信頼性が上がります。");
  }
  if (result.ocr_needs_review) {
    hints.push("OCR 文字列は未確定です。必要なら文字列を修正して再解析してください。");
  } else if (result.mode === "ocr" && typeof result.ocr_confidence === "number" && result.ocr_confidence < 0.6) {
    hints.push("OCR 信頼度が低めです。文字列が違う場合は修正して再解析してください。");
  }
  return hints;
}

function overallScore(scores: BanshoAnalysisResult["scores"]): number {
  return (
    scores.readability * MAIN_SCORE_WEIGHTS.readability +
    scores.line_alignment * MAIN_SCORE_WEIGHTS.line_alignment +
    scores.size_consistency * MAIN_SCORE_WEIGHTS.size_consistency +
    scores.spacing_balance * MAIN_SCORE_WEIGHTS.spacing_balance +
    scores.stroke_quality * MAIN_SCORE_WEIGHTS.stroke_quality
  );
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
  if (e instanceof Error && /NEXT_PUBLIC_API_URL/.test(e.message)) {
    return "本番環境の API 設定が未完了です。`NEXT_PUBLIC_API_URL` を設定して再デプロイしてください。";
  }
  if (e instanceof TypeError && /fetch|network|load failed/i.test(String(e.message))) {
    return "バックエンドに接続できません。`NEXT_PUBLIC_API_URL` と API の起動状態を確認してください。";
  }
  if (e instanceof Error && /OCR エンジンが未設定/.test(e.message)) {
    return "OCR エンジンが未設定です。管理者に OCR 依存関係の設定を確認してください。";
  }
  if (e instanceof Error && /文字を認識できませんでした/.test(e.message)) {
    return "文字を認識できませんでした。黒板全体を明るく、正面から撮影してください。";
  }
  if (e instanceof Error) return e.message;
  return "予期しないエラーが発生しました。";
}

function canRecoverWithManualText(e: unknown): boolean {
  if (!(e instanceof Error)) return false;
  return /OCR|文字を認識できませんでした/.test(e.message);
}

type LastAnalysisImage = {
  blob: Blob;
  filename: string;
};

export function CameraCapture() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const objectUrlRef = useRef<string | null>(null);
  const referencePreviewObjectUrlRef = useRef<string | null>(null);

  const [permissionDenied, setPermissionDenied] = useState(false);
  const [streamActive, setStreamActive] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<BanshoAnalysisResult | null>(null);
  const [recognizedTextDraft, setRecognizedTextDraft] = useState("");
  const [lastAnalysisImage, setLastAnalysisImage] = useState<LastAnalysisImage | null>(null);
  const [manualRetryAfterError, setManualRetryAfterError] = useState(false);

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [targetText, setTargetText] = useState("");
  const [referencePreviewUrl, setReferencePreviewUrl] = useState<string | null>(null);
  const [isReferencePreviewLoading, setIsReferencePreviewLoading] = useState(false);
  const [referencePreviewError, setReferencePreviewError] = useState(false);
  const apiBase = useMemo(() => {
    try {
      return { value: getPublicApiBaseUrl(), configError: null as string | null };
    } catch (e) {
      const message = e instanceof Error ? e.message : "NEXT_PUBLIC_API_URL の設定を確認してください。";
      return { value: "(未設定)", configError: message };
    }
  }, []);

  const revokePreview = useCallback(() => {
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }
    setPreviewUrl(null);
    setSelectedFile(null);
  }, []);

  const revokeReferencePreview = useCallback(() => {
    if (referencePreviewObjectUrlRef.current) {
      URL.revokeObjectURL(referencePreviewObjectUrlRef.current);
      referencePreviewObjectUrlRef.current = null;
    }
    setReferencePreviewUrl(null);
  }, []);

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setStreamActive(false);
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }, []);

  const resetForRetry = useCallback(() => {
    setResult(null);
    setError(null);
    setRecognizedTextDraft("");
    setLastAnalysisImage(null);
    setManualRetryAfterError(false);
    revokePreview();
    stopCamera();
  }, [revokePreview, stopCamera]);

  const resetForNewPractice = useCallback(() => {
    setTargetText("");
    revokeReferencePreview();
    setReferencePreviewError(false);
    setIsReferencePreviewLoading(false);
    resetForRetry();
  }, [resetForRetry, revokeReferencePreview]);

  const startCamera = useCallback(async () => {
    setError(null);
    setPermissionDenied(false);
    setIsStarting(true);
    setResult(null);
    setRecognizedTextDraft("");
    setLastAnalysisImage(null);
    setManualRetryAfterError(false);
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
      setRecognizedTextDraft("");
      setLastAnalysisImage(null);
      setManualRetryAfterError(false);
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
      if (referencePreviewObjectUrlRef.current) {
        URL.revokeObjectURL(referencePreviewObjectUrlRef.current);
      }
    };
  }, [stopCamera]);

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      const trimmed = targetText.trim();
      if (!trimmed) {
        revokeReferencePreview();
        setReferencePreviewError(false);
        setIsReferencePreviewLoading(false);
        return;
      }
      if (apiBase.configError) {
        revokeReferencePreview();
        setIsReferencePreviewLoading(false);
        setReferencePreviewError(true);
        return;
      }
      setIsReferencePreviewLoading(true);
      setReferencePreviewError(false);
      try {
        const blob = await fetchReferencePreviewPng({
          targetText: trimmed,
          width: 960,
          height: 540,
          signal: controller.signal,
        });
        if (controller.signal.aborted) return;
        const url = URL.createObjectURL(blob);
        if (referencePreviewObjectUrlRef.current) {
          URL.revokeObjectURL(referencePreviewObjectUrlRef.current);
        }
        referencePreviewObjectUrlRef.current = url;
        setReferencePreviewUrl(url);
      } catch {
        if (controller.signal.aborted) return;
        revokeReferencePreview();
        setReferencePreviewError(true);
      } finally {
        if (!controller.signal.aborted) {
          setIsReferencePreviewLoading(false);
        }
      }
    }, 300);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [apiBase.configError, revokeReferencePreview, targetText]);

  const applyAnalysisResult = useCallback((data: BanshoAnalysisResult) => {
    setResult(data);
    setRecognizedTextDraft(data.recognized_text?.trim() ?? "");
    setManualRetryAfterError(false);
  }, []);

  const runAnalysis = useCallback(async () => {
    setError(null);
    setManualRetryAfterError(false);
    if (apiBase.configError) {
      setError(formatUserError(new Error(apiBase.configError)));
      return;
    }
    try {
      if (selectedFile) {
        setIsAnalyzing(true);
        setLastAnalysisImage({ blob: selectedFile, filename: selectedFile.name });
        const data = await analyzeBoardImage(selectedFile, selectedFile.name);
        applyAnalysisResult(data);
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
      const filename = "capture.jpg";
      setLastAnalysisImage({ blob, filename });
      const data = await analyzeBoardImage(blob, filename);
      applyAnalysisResult(data);
    } catch (e) {
      const recoverable = canRecoverWithManualText(e);
      setManualRetryAfterError(recoverable);
      if (recoverable && !recognizedTextDraft.trim() && targetText.trim()) {
        setRecognizedTextDraft(targetText.trim());
      }
      setError(formatUserError(e));
    } finally {
      setIsAnalyzing(false);
    }
  }, [apiBase.configError, applyAnalysisResult, recognizedTextDraft, selectedFile, streamActive, targetText]);

  const rerunWithCorrection = useCallback(async () => {
    setError(null);
    setManualRetryAfterError(false);
    if (apiBase.configError) {
      setError(formatUserError(new Error(apiBase.configError)));
      return;
    }
    if (!lastAnalysisImage) {
      setError("再解析する画像がありません。もう一度画像を選ぶか撮影してください。");
      return;
    }
    const corrected = recognizedTextDraft.trim();
    if (!corrected) {
      setError("修正後の文字列を入力してください。");
      return;
    }

    try {
      setIsAnalyzing(true);
      const data = await analyzeBoardImage(lastAnalysisImage.blob, lastAnalysisImage.filename, corrected);
      applyAnalysisResult(data);
    } catch (e) {
      setManualRetryAfterError(canRecoverWithManualText(e));
      setError(formatUserError(e));
    } finally {
      setIsAnalyzing(false);
    }
  }, [apiBase.configError, applyAnalysisResult, lastAnalysisImage, recognizedTextDraft]);

  const { overlay } = result ?? {};
  const w = overlay?.image_width ?? 1;
  const h = overlay?.image_height ?? 1;
  const guide = overlay?.guide ?? null;

  const hasPracticeText = targetText.trim().length > 0;
  const canAnalyze = !!(selectedFile || streamActive);
  const positives = result ? positiveHighlights(result) : [];
  const hints = result ? improvementHints(result) : [];
  const captureHints = result ? captureAndRecognitionHints(result) : [];
  const summaryPct = result ? Math.round(overallScore(result.scores) * 100) : null;
  const resultText = result?.recognized_text?.trim() ?? "";
  const canRerunWithCorrection =
    !!lastAnalysisImage &&
    recognizedTextDraft.trim().length > 0 &&
    (!result || recognizedTextDraft.trim() !== resultText);

  return (
    <section className="space-y-6">
      <div className="rounded-xl border border-stone-200 bg-white px-4 py-3 shadow-sm">
        <p className="text-sm leading-relaxed text-stone-700">
          練習した板書を撮影して、今回の読みやすさを確認できます。
        </p>
      </div>

      <div className="space-y-2 rounded-xl border border-stone-200 bg-white p-4 shadow-sm">
        <label htmlFor="target-text" className="block text-sm font-medium text-stone-800">
          練習する文章（任意）
        </label>
        <p className="text-xs text-stone-500">お手本プレビュー表示のみで使います。採点には使いません。</p>
        <textarea
          id="target-text"
          value={targetText}
          onChange={(e) => setTargetText(e.target.value)}
          rows={3}
          placeholder={"例：二次方程式の解の公式"}
          className="w-full resize-y rounded-lg border border-stone-300 bg-stone-50 px-3 py-2.5 text-sm text-stone-800 placeholder:text-stone-400 focus:border-teal-600 focus:outline-none focus:ring-1 focus:ring-teal-600"
          disabled={isAnalyzing}
          autoComplete="off"
        />
        {!hasPracticeText ? <p className="text-xs text-stone-500">入力しなくても読みやすさを確認できます。</p> : null}
      </div>

      {hasPracticeText ? (
        <div className="space-y-2 rounded-xl border border-stone-200 bg-white p-4 shadow-sm">
        <p className="text-sm font-medium text-stone-800">お手本プレビュー</p>
        <div className="relative aspect-video w-full overflow-hidden rounded-lg border border-stone-300 bg-[rgb(44,82,48)]">
          {referencePreviewUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={referencePreviewUrl} alt="お手本プレビュー" className="h-full w-full object-contain" />
          ) : (
            <div className="absolute inset-0 bg-[rgb(44,82,48)]" />
          )}
          {isReferencePreviewLoading ? (
            <div className="absolute inset-0 flex items-center justify-center bg-black/20">
              <span className="inline-flex items-center gap-2 rounded-full bg-stone-900/65 px-3 py-1 text-xs text-stone-100">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                生成中…
              </span>
            </div>
          ) : null}
        </div>
        {referencePreviewError ? (
          <p className="text-xs text-orange-700">お手本プレビューを作成できませんでした。</p>
        ) : null}
        </div>
      ) : null}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/heic,image/*"
        className="hidden"
        onChange={onFileChange}
      />

      <div className="space-y-3 rounded-xl border border-stone-200 bg-white p-3 shadow-sm sm:p-4">
        <div className="relative min-h-[200px] overflow-hidden rounded-lg border border-stone-300 bg-black sm:min-h-[240px]">
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
              <Camera className="h-12 w-12 text-stone-500" aria-hidden />
              <p className="max-w-sm text-sm text-stone-300">
                まず写真ライブラリから選ぶか、下のボタンでカメラを開始してください。
              </p>
            </div>
          ) : null}

          {overlay && (previewUrl || streamActive) && !result?.perspective_corrected && (
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
          {result?.perspective_corrected && (
            <div className="pointer-events-none absolute bottom-2 left-2 right-2 rounded-md bg-stone-900/70 px-2 py-1 text-[11px] text-stone-100">
              台形補正後の座標で解析したため、元画像上のオーバーレイ表示は省略しています。
            </div>
          )}

          {isAnalyzing && (
            <div
              className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/70 backdrop-blur-[2px]"
              role="status"
              aria-live="polite"
            >
              <Loader2 className="h-10 w-10 animate-spin text-teal-300" aria-hidden />
              <span className="text-sm font-medium text-stone-100">読みやすさを確認しています…</span>
              <span className="max-w-xs px-4 text-center text-xs text-stone-300">
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
            className="inline-flex min-h-12 items-center justify-center gap-2 rounded-lg border border-stone-300 bg-stone-100 px-4 py-3 text-sm font-medium text-stone-800 transition hover:bg-stone-200 disabled:opacity-50 sm:flex-1"
          >
            <ImagePlus className="h-4 w-4 shrink-0" />
            画像を選ぶ
          </button>
          <button
            type="button"
            onClick={startCamera}
            disabled={isStarting || isAnalyzing}
            className="inline-flex min-h-12 items-center justify-center gap-2 rounded-lg bg-teal-700 px-4 py-3 text-sm font-medium text-white transition hover:bg-teal-600 disabled:opacity-50 sm:flex-1"
          >
            {isStarting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Video className="h-4 w-4 shrink-0" />}
            カメラで撮影
          </button>
          <button
            type="button"
            onClick={stopCamera}
            disabled={!streamActive || isAnalyzing}
            className="min-h-12 rounded-lg border border-stone-300 bg-white px-4 py-3 text-sm text-stone-700 hover:bg-stone-100 disabled:opacity-40"
          >
            カメラ停止
          </button>
        </div>

        <button
          type="button"
          onClick={runAnalysis}
          disabled={isAnalyzing || !canAnalyze}
          className="flex min-h-[3.2rem] w-full items-center justify-center gap-2 rounded-lg bg-teal-700 px-4 py-3.5 text-base font-semibold text-white shadow-sm transition hover:bg-teal-600 disabled:opacity-50"
        >
          {isAnalyzing ? <Loader2 className="h-5 w-5 animate-spin" /> : <Scan className="h-5 w-5" />}
          読みやすさを確認する
        </button>

        {!result ? (
          <button
            type="button"
            onClick={resetForRetry}
            disabled={isAnalyzing}
            className="flex w-full items-center justify-center gap-2 rounded-lg border border-stone-300 py-3 text-sm text-stone-700 hover:bg-stone-100 disabled:opacity-40"
          >
            <RefreshCw className="h-4 w-4" />
            もう一度書いてみる
          </button>
        ) : null}
      </div>

      {permissionDenied && (
        <p className="flex items-start gap-2 rounded-lg border border-orange-200 bg-orange-50 px-3 py-2 text-sm text-orange-800">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          カメラへのアクセスがブロックされています。ブラウザの設定からこのサイトのアクセスを許可してください。
        </p>
      )}

      {error && (
        <p className="flex items-start gap-2 rounded-lg border border-orange-200 bg-orange-50 px-3 py-2 text-sm text-orange-800">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          {error}
        </p>
      )}

      {error && manualRetryAfterError && lastAnalysisImage && !result ? (
        <div className="space-y-3 rounded-lg border border-orange-200 bg-orange-50 p-3 text-sm text-stone-800">
          <label htmlFor="manual-retry-text" className="block text-xs font-medium text-stone-700">
            書かれている内容の確認（手入力）
          </label>
          <textarea
            id="manual-retry-text"
            value={recognizedTextDraft}
            onChange={(e) => setRecognizedTextDraft(e.target.value)}
            rows={3}
            className="w-full resize-y rounded-lg border border-orange-300 bg-white px-3 py-2 text-sm text-stone-800 placeholder:text-stone-400 focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
            placeholder="板書に書かれている文字列を入力"
            disabled={isAnalyzing}
          />
          <button
            type="button"
            onClick={rerunWithCorrection}
            disabled={isAnalyzing || !canRerunWithCorrection}
            className="inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-lg bg-orange-500 px-3 py-2 text-sm font-medium text-white transition hover:bg-orange-400 disabled:opacity-45"
          >
            {isAnalyzing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            入力文字で解析
          </button>
        </div>
      ) : null}

      {result && summaryPct !== null && (
        <div className="space-y-4 rounded-xl border border-stone-200 bg-white p-4 shadow-sm">
          <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
            <h2 className="text-lg font-semibold tracking-tight text-stone-800">今回の読みやすさ</h2>
            <p className="text-3xl font-bold tabular-nums text-teal-700">{summaryPct}点</p>
          </div>
          <p className="text-xs text-stone-600">
            主評価は可読性・行の整い・文字サイズ・字間行間・線の安定感です。
            撮影品質と OCR 文字列は補助情報として扱います。
          </p>

          <div className="space-y-2 rounded-lg border border-emerald-200 bg-emerald-50 p-4">
            <h3 className="text-sm font-semibold text-emerald-900">よかったところ</h3>
            <ul className="list-inside list-disc space-y-2 text-sm leading-relaxed text-stone-700">
              {positives.map((line, i) => (
                <li key={i}>{line}</li>
              ))}
            </ul>
          </div>

          {result.mode === "ocr" || result.mode === "manual" ? (
            <div className="space-y-3 rounded-lg border border-stone-200 bg-stone-50 p-3 text-sm text-stone-700">
              <div className="space-y-1">
                <p>
                  内容確認モード:{" "}
                  {result.mode === "manual" ? "手動修正" : `自動認識（${result.ocr_engine ?? "unknown"}）`}
                </p>
                {result.mode === "ocr" ? (
                  <p>
                    OCR 信頼度:{" "}
                    {typeof result.ocr_confidence === "number" ? `${(result.ocr_confidence * 100).toFixed(0)}%` : "不明"}
                  </p>
                ) : (
                  <p>修正した文字列で再解析済みです。</p>
                )}
                {result.mode === "ocr" && result.ocr_needs_review ? (
                  <p className="text-orange-700">OCR 文字列は未確定です。内容を確認して必要なら修正してください。</p>
                ) : null}
              </div>
              <div className="space-y-2">
                <label htmlFor="recognized-text" className="block text-xs font-medium text-stone-600">
                  書かれている内容（必要なら修正）
                </label>
                <textarea
                  id="recognized-text"
                  value={recognizedTextDraft}
                  onChange={(e) => setRecognizedTextDraft(e.target.value)}
                  rows={3}
                  className="w-full resize-y rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm text-stone-800 placeholder:text-stone-400 focus:border-teal-600 focus:outline-none focus:ring-1 focus:ring-teal-600"
                  placeholder="認識結果が違う場合はここで修正"
                  disabled={isAnalyzing}
                />
                <button
                  type="button"
                  onClick={rerunWithCorrection}
                  disabled={isAnalyzing || !canRerunWithCorrection}
                  className="inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-lg bg-teal-700 px-3 py-2 text-sm font-medium text-white transition hover:bg-teal-600 disabled:opacity-45"
                >
                  {isAnalyzing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                  修正して再解析
                </button>
              </div>
            </div>
          ) : null}

          {result.reference_comparison && (
            <div className="rounded-lg border border-stone-200 bg-stone-50 p-4">
              <p className="mb-2 text-xs font-medium text-stone-600">参考: 認識文字とチョーク体参照の一致</p>
              <p className="font-mono text-xl tabular-nums text-stone-700">
                {(result.reference_comparison.font_similarity * 100).toFixed(0)}%
              </p>
              <p className="mt-2 text-[11px] text-stone-500">
                手書きとフォントの差で低めに出る場合があります（総合評価には使いません）。{" "}
                IoU {(result.reference_comparison.iou * 100).toFixed(0)}% / Dice{" "}
                {(result.reference_comparison.dice_coefficient * 100).toFixed(0)}% / 画素一致{" "}
                {(result.reference_comparison.pixel_agreement * 100).toFixed(0)}%
              </p>
            </div>
          )}
          <dl className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {(
              ["readability", "line_alignment", "size_consistency", "spacing_balance", "stroke_quality", "visibility"] as const
            ).map((key) => (
              <div
                key={key}
                className="rounded-lg border border-stone-200 bg-stone-50 px-3 py-3 text-left"
              >
                <dt className="text-[11px] font-medium uppercase tracking-wide text-stone-500">
                  {scoreLabel(key)}
                </dt>
                <dd className="mt-1 font-mono text-2xl tabular-nums text-stone-800">
                  {(result.scores[key] * 100).toFixed(0)}%
                </dd>
              </div>
            ))}
          </dl>

          <div className="space-y-2 rounded-lg border border-amber-200 bg-amber-50 p-4">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-amber-900">
              <Lightbulb className="h-4 w-4 text-amber-600" aria-hidden />
              次に意識すること
            </h3>
            <ul className="list-inside list-disc space-y-2 text-sm leading-relaxed text-stone-700">
              {hints.map((line, i) => (
                <li key={i}>{line}</li>
              ))}
            </ul>
          </div>

          <button
            type="button"
            onClick={resetForRetry}
            disabled={isAnalyzing}
            className="flex w-full items-center justify-center gap-2 rounded-lg border border-teal-700 bg-teal-700 py-3 text-sm font-semibold text-white hover:bg-teal-600 disabled:opacity-40"
          >
            <RefreshCw className="h-4 w-4" />
            もう一度書いてみる
          </button>
          <button
            type="button"
            onClick={resetForNewPractice}
            disabled={isAnalyzing}
            className="flex w-full items-center justify-center gap-2 rounded-lg border border-stone-300 bg-white py-3 text-sm text-stone-700 hover:bg-stone-100 disabled:opacity-40"
          >
            新しい文章で練習する
          </button>

          {captureHints.length > 0 ? (
            <div className="space-y-2 rounded-lg border border-orange-200 bg-orange-50 p-4">
              <h3 className="text-sm font-semibold text-orange-900">撮影・認識の確認（補助情報）</h3>
              <ul className="list-inside list-disc space-y-2 text-sm leading-relaxed text-stone-700">
                {captureHints.map((line, i) => (
                  <li key={i}>{line}</li>
                ))}
              </ul>
            </div>
          ) : null}

          {result.notes.length > 0 && (
            <div className="rounded-lg border border-stone-200 bg-stone-50 p-4">
              <p className="mb-2 text-xs font-medium text-stone-500">補足メモ</p>
              <ul className="space-y-1.5 text-sm text-stone-600">
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
