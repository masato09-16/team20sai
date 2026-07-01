"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, Camera, CheckCircle2, ImagePlus, Loader2, Save, Video, VideoOff } from "lucide-react";

import { analyzeBoardImage } from "@/lib/api/analyze";
import { prepareImageForStorageAndAnalysis } from "@/lib/image/prepareImage";
import { PracticeSteps } from "@/components/practice/PracticeSteps";
import {
  createAttempt,
  createSessionWithAttempt,
  getSession,
  setAttemptCompleted,
  setAttemptError,
  setAttemptAnalyzing,
  updateSessionMemo,
} from "@/lib/storage/repository";
import type { PracticeAttempt } from "@/lib/storage/types";

type PendingImage = {
  blob: Blob;
  filename: string;
  mimeType: string;
};

function toUserMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  return "処理中にエラーが発生しました。";
}

export function PracticeNewScreen({ initialSessionId }: { initialSessionId?: string }) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const previewUrlRef = useRef<string | null>(null);
  const mountedRef = useRef(true);

  const [memo, setMemo] = useState("");
  const [pendingImage, setPendingImage] = useState<PendingImage | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [cameraActive, setCameraActive] = useState(false);
  const [isStartingCamera, setIsStartingCamera] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [permissionDenied, setPermissionDenied] = useState(false);

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setCameraActive(false);
  }, []);

  const setPreview = useCallback((url: string | null) => {
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    previewUrlRef.current = url;
    setPreviewUrl(url);
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    let mounted = true;
    const loadMemo = async () => {
      if (!initialSessionId) return;
      const session = await getSession(initialSessionId);
      if (!mounted) return;
      if (session?.memo) setMemo(session.memo);
    };
    void loadMemo();
    return () => {
      mounted = false;
      mountedRef.current = false;
      stopCamera();
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    };
  }, [initialSessionId, stopCamera]);

  const onPickFile = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const onFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !file.type.startsWith("image/")) {
      setError("画像ファイル（JPEG・PNG など）を選択してください。");
      return;
    }
    setError(null);
    stopCamera();
    const next: PendingImage = { blob: file, filename: file.name, mimeType: file.type || "image/jpeg" };
    setPendingImage(next);
    setPreview(URL.createObjectURL(file));
  }, [setPreview, stopCamera]);

  const startCamera = useCallback(async () => {
    setError(null);
    setPermissionDenied(false);
    setIsStartingCamera(true);
    setPendingImage(null);
    setPreview(null);
    stopCamera();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      if (!mountedRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setCameraActive(true);
    } catch (e) {
      if (!mountedRef.current) return;
      stopCamera();
      const msg = e instanceof Error ? e.message : String(e);
      if (/denied|notallowed/i.test(msg)) setPermissionDenied(true);
      setError(`カメラを開始できませんでした: ${msg}`);
    } finally {
      if (mountedRef.current) setIsStartingCamera(false);
    }
  }, [setPreview, stopCamera]);

  const captureFromCamera = useCallback(async () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || !video.videoWidth) {
      setError("カメラ映像の準備ができていません。");
      return;
    }
    const vw = video.videoWidth;
    const vh = video.videoHeight;
    const scale = Math.min(1, 1600 / Math.max(vw, vh));
    const tw = Math.max(1, Math.round(vw * scale));
    const th = Math.max(1, Math.round(vh * scale));
    canvas.width = tw;
    canvas.height = th;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      setError("画像の変換に失敗しました。");
      return;
    }
    ctx.drawImage(video, 0, 0, tw, th);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob((b) => resolve(b), "image/jpeg", 0.92));
    if (!blob) {
      setError("画像の変換に失敗しました。");
      return;
    }
    setError(null);
    stopCamera();
    setPendingImage({ blob, filename: "capture.jpg", mimeType: "image/jpeg" });
    setPreview(URL.createObjectURL(blob));
  }, [setPreview, stopCamera]);

  const saveAndAnalyze = useCallback(async () => {
    if (!pendingImage) {
      setError("先に画像を選ぶか撮影してください。");
      return;
    }
    setError(null);
    setIsBusy(true);
    try {
      const prepared = await prepareImageForStorageAndAnalysis(pendingImage.blob, { maxEdge: 1600, mimeType: "image/jpeg" });

      const existingSession = initialSessionId ? await getSession(initialSessionId) : null;
      let sessionId: string;
      let attempt: PracticeAttempt;
      if (existingSession) {
        await updateSessionMemo(existingSession.id, memo || null);
        sessionId = existingSession.id;
        attempt = await createAttempt({
          sessionId: existingSession.id,
          imageBlob: prepared.blob,
          imageMimeType: prepared.mimeType,
          originalFilename: pendingImage.filename,
        });
      } else {
        const created = await createSessionWithAttempt({
          memo: memo || null,
          imageBlob: prepared.blob,
          imageMimeType: prepared.mimeType,
          originalFilename: pendingImage.filename,
        });
        sessionId = created.session.id;
        attempt = created.attempt;
      }

      await setAttemptAnalyzing(attempt.id);
      try {
        const result = await analyzeBoardImage(prepared.blob, pendingImage.filename || "board.jpg");
        await setAttemptCompleted({ attemptId: attempt.id, result, correctedText: null });
      } catch (analysisErr) {
        await setAttemptError(attempt.id, toUserMessage(analysisErr));
      }
      router.push(`/practice/${sessionId}/result/${attempt.id}`);
    } catch (e) {
      setError(toUserMessage(e));
    } finally {
      setIsBusy(false);
    }
  }, [initialSessionId, memo, pendingImage, router]);

  const resetPendingOnly = useCallback(() => {
    setPendingImage(null);
    setPreview(null);
    setError(null);
  }, [setPreview]);

  const hasSelectedImage = Boolean(pendingImage);

  return (
    <section className="space-y-5">
      <PracticeSteps current={1} />
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold text-stone-800">{hasSelectedImage ? "この写真で振り返りますか？" : "板書を撮影する"}</h1>
        <p className="text-sm text-stone-600">
          {hasSelectedImage ? "写真を確認して、今回の振り返りへ進みましょう。" : "書いた黒板文字の写真を選んでください。"}
        </p>
      </header>

      <div className="space-y-3 rounded-xl border border-stone-200 bg-white p-4 shadow-sm">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/heic,image/*"
          className="hidden"
          onChange={onFileChange}
        />
        <canvas ref={canvasRef} className="hidden" />

        <div className="relative min-h-[220px] overflow-hidden rounded-lg border border-stone-300 bg-black">
          <video
            ref={videoRef}
            className={`mx-auto max-h-[58vh] w-full object-contain ${cameraActive && !previewUrl ? "block" : "hidden"}`}
            playsInline
            muted
            autoPlay
          />
          {previewUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={previewUrl} alt="保存前確認プレビュー" className="mx-auto block max-h-[58vh] w-full object-contain" />
          ) : !cameraActive ? (
            <div className="flex min-h-[220px] flex-col items-center justify-center gap-3 px-6 py-10 text-center">
              <Camera className="h-10 w-10 text-stone-500" />
              <p className="text-sm text-stone-300">画像を選ぶかカメラで撮影して、保存前に確認します。</p>
            </div>
          ) : null}
        </div>

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <button
            type="button"
            onClick={onPickFile}
            disabled={isBusy || isStartingCamera}
            className="inline-flex min-h-12 items-center justify-center gap-2 rounded-lg border border-stone-300 bg-stone-100 px-4 py-3 text-sm font-medium text-stone-800 hover:bg-stone-200 disabled:opacity-50"
          >
            <ImagePlus className="h-4 w-4" />
            端末の写真から選ぶ
          </button>
          <button
            type="button"
            onClick={cameraActive ? stopCamera : startCamera}
            disabled={isBusy || isStartingCamera}
            className="inline-flex min-h-12 items-center justify-center gap-2 rounded-lg bg-teal-700 px-4 py-3 text-sm font-medium text-white hover:bg-teal-600 disabled:opacity-50"
          >
            {isStartingCamera ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : cameraActive ? (
              <VideoOff className="h-4 w-4" />
            ) : (
              <Video className="h-4 w-4" />
            )}
            {isStartingCamera ? "カメラ準備中…" : cameraActive ? "カメラ停止" : "カメラで撮影する"}
          </button>
          <button
            type="button"
            onClick={captureFromCamera}
            disabled={!cameraActive || isBusy || isStartingCamera}
            className="inline-flex min-h-12 items-center justify-center gap-2 rounded-lg border border-stone-300 bg-white px-4 py-3 text-sm text-stone-700 hover:bg-stone-100 disabled:opacity-50"
          >
            <CheckCircle2 className="h-4 w-4" />
            この写真を使う
          </button>
        </div>

        {pendingImage ? (
          <div className="space-y-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-stone-700">
            <p className="font-medium text-amber-900">保存前の確認</p>
            <p>児童生徒の氏名、顔、学校名など保存したくない情報が写っていないか確認してください。</p>
          </div>
        ) : null}

        {pendingImage ? (
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={resetPendingOnly}
              disabled={isBusy || isStartingCamera}
              className="inline-flex min-h-10 items-center justify-center rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm text-stone-700 hover:bg-stone-100 disabled:opacity-50"
            >
              撮り直す
            </button>
            <button
              type="button"
              onClick={onPickFile}
              disabled={isBusy || isStartingCamera}
              className="inline-flex min-h-10 items-center justify-center rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm text-stone-700 hover:bg-stone-100 disabled:opacity-50"
            >
              別の写真を選ぶ
            </button>
          </div>
        ) : null}

        <button
          type="button"
          onClick={saveAndAnalyze}
          disabled={isBusy || isStartingCamera || !pendingImage}
          className="inline-flex min-h-[3.2rem] w-full items-center justify-center gap-2 rounded-lg bg-teal-700 px-4 py-3 text-base font-semibold text-white shadow-sm hover:bg-teal-600 disabled:opacity-50"
        >
          {isBusy ? <Loader2 className="h-5 w-5 animate-spin" /> : <Save className="h-5 w-5" />}
          この写真で振り返る
        </button>
        {pendingImage ? <p className="text-xs text-stone-500">写真と振り返り結果は練習記録に保存されます。</p> : null}
      </div>

      <div className="space-y-2">
        <label htmlFor="memo" className="block text-sm font-medium text-stone-700">
          板書の内容メモ（任意）
        </label>
        <textarea
          id="memo"
          value={memo}
          onChange={(e) => setMemo(e.target.value)}
          rows={2}
          className="w-full resize-y rounded-lg border border-stone-300 bg-stone-50 px-3 py-2 text-sm text-stone-800 placeholder:text-stone-400 focus:border-teal-600 focus:outline-none focus:ring-1 focus:ring-teal-600"
          placeholder="例：二次方程式の解の公式"
          disabled={isBusy || isStartingCamera}
        />
      </div>

      {permissionDenied ? (
        <p className="flex items-start gap-2 rounded-lg border border-orange-200 bg-orange-50 px-3 py-2 text-sm text-orange-800">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          カメラの利用が許可されていません。ブラウザの設定を確認してください。
        </p>
      ) : null}
      {error ? (
        <p className="flex items-start gap-2 rounded-lg border border-orange-200 bg-orange-50 px-3 py-2 text-sm text-orange-800">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          {error}
        </p>
      ) : null}
    </section>
  );
}
