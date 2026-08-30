"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  Camera,
  CheckCircle2,
  ChevronDown,
  ImagePlus,
  Loader2,
  Save,
  ShieldCheck,
  Video,
  VideoOff,
  Folder,
  FolderPlus,
} from "lucide-react";

import { analyzeBoardImage } from "@/lib/api/analyze";
import type { BoardType, WritingDirection } from "@/lib/api/schemas";
import { prepareImageForStorageAndAnalysis } from "@/lib/image/prepareImage";
import { PracticeSteps } from "@/components/practice/PracticeSteps";
import { ImageCropper } from "@/components/practice/ImageCropper";
import {
  createAttempt,
  createSessionWithAttempt,
  getSession,
  setAttemptCompleted,
  setAttemptError,
  setAttemptAnalyzing,
  updateSessionAlbumName,
  updateSessionMemo,
} from "@/lib/storage/repository";
import type { PracticeAttempt } from "@/lib/storage/types";

type PendingImage = {
  blob: Blob;
  filename: string;
  mimeType: string;
};

const BOARD_TYPE_OPTIONS: Array<{ value: BoardType; label: string; description: string }> = [
  { value: "lecture", label: "講義型", description: "説明中心の板書" },
  { value: "exercise", label: "演習型", description: "問題・解説の板書" },
  { value: "idea", label: "アイデア型", description: "意見や案の整理" },
  { value: "summary", label: "まとめ型", description: "要点の整理" },
  { value: "display", label: "掲示型", description: "遠くから見せる板書" },
];

const WRITING_DIRECTION_OPTIONS: Array<{ value: WritingDirection; label: string }> = [
  { value: "horizontal", label: "横書き" },
  { value: "vertical", label: "縦書き" },
  { value: "mixed", label: "混在" },
];

function parseAlbumOptions(): string[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem("bansho_albums") || "[]");
    const saved = Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === "string" && v.trim().length > 0) : [];
    return Array.from(new Set(["未分類", ...saved]));
  } catch {
    return ["未分類"];
  }
}

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
  const [boardType, setBoardType] = useState<BoardType>("lecture");
  const [writingDirection, setWritingDirection] = useState<WritingDirection>("horizontal");

  // トリミング画面用
  const [rawImageSrc, setRawImageSrc] = useState<string | null>(null);
  const [currentFilename, setCurrentFilename] = useState<string>("board.jpg");

  const [albumOptions, setAlbumOptions] = useState<string[]>(["未分類"]);
  const [selectedAlbum, setSelectedAlbum] = useState("未分類");
  const [newAlbumName, setNewAlbumName] = useState("");

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

    setAlbumOptions(parseAlbumOptions());

    const loadMemo = async () => {
      if (!initialSessionId) return;
      const session = await getSession(initialSessionId);
      if (!mounted) return;
      if (session?.memo) setMemo(session.memo);
      if (session?.albumName) {
        setSelectedAlbum(session.albumName);
      }
    };
    void loadMemo();
    return () => {
      mounted = false;
      mountedRef.current = false;
      stopCamera();
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    };
  }, [initialSessionId, stopCamera]);

  const handleCreateAlbum = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newAlbumName.trim();
    if (!trimmed) return;
    if (albumOptions.includes(trimmed)) {
      alert("そのアルバム名は既に存在します。");
      return;
    }
    const updated = [...albumOptions, trimmed];
    setAlbumOptions(updated);
    localStorage.setItem("bansho_albums", JSON.stringify(updated));
    setSelectedAlbum(trimmed);
    setNewAlbumName("");
  };

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
    setCurrentFilename(file.name);
    setRawImageSrc(URL.createObjectURL(file));
  }, [stopCamera]);

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
    setCurrentFilename("capture.jpg");
    setRawImageSrc(URL.createObjectURL(blob));
  }, [stopCamera]);

  const handleCropComplete = useCallback((croppedBlob: Blob) => {
    setPendingImage({
      blob: croppedBlob,
      filename: currentFilename,
      mimeType: "image/jpeg",
    });
    setPreview(URL.createObjectURL(croppedBlob));
    if (rawImageSrc) URL.revokeObjectURL(rawImageSrc);
    setRawImageSrc(null);
  }, [currentFilename, rawImageSrc, setPreview]);

  const handleCropCancel = useCallback(() => {
    if (rawImageSrc) URL.revokeObjectURL(rawImageSrc);
    setRawImageSrc(null);
  }, [rawImageSrc]);

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
        await updateSessionAlbumName(existingSession.id, selectedAlbum);
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
          albumName: selectedAlbum,
          imageBlob: prepared.blob,
          imageMimeType: prepared.mimeType,
          originalFilename: pendingImage.filename,
        });
        sessionId = created.session.id;
        attempt = created.attempt;
      }

      await setAttemptAnalyzing(attempt.id);
      try {
        const result = await analyzeBoardImage(prepared.blob, pendingImage.filename || "board.jpg", {
          boardType,
          writingDirection,
        });
        await setAttemptCompleted({ attemptId: attempt.id, result, correctedText: null });
      } catch (analysisErr) {
        await setAttemptError(attempt.id, toUserMessage(analysisErr));
      }
      router.push(`/practice/${sessionId}/result/${attempt.id}`);
    } catch (e) {
      setError(toUserMessage(e));
    } finally {
      if (mountedRef.current) setIsBusy(false);
    }
  }, [boardType, initialSessionId, memo, pendingImage, router, selectedAlbum, writingDirection]);

  const resetPendingOnly = useCallback(() => {
    setPendingImage(null);
    setPreview(null);
    setError(null);
  }, [setPreview]);

  const hasSelectedImage = Boolean(pendingImage);

  return (
    <section className="space-y-5 text-white">
      <PracticeSteps current={1} />
      
      {/* 見出しと説明文（白文字・明るいエメラルドに変更） */}
      <header className="space-y-1">
        <h1 className="text-2xl font-bold text-white drop-shadow-sm">
          {hasSelectedImage ? "この写真で診断しますか？" : "黒板写真を1枚用意する"}
        </h1>
        <p className="text-sm text-emerald-100/90 leading-relaxed">
          {hasSelectedImage ? "写真を確認して、診断結果へ進みましょう。" : "登録なしで診断できます。まずは黒板全体が入った写真を撮るか選んでください。"}
        </p>
      </header>

      {!pendingImage ? (
        <div className="ui-card p-4 text-stone-800">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-stone-800">
            <ShieldCheck className="h-4 w-4 text-teal-700" />
            きれいに診断するコツ
          </h2>
          <ul className="mt-3 grid grid-cols-1 gap-2 text-sm text-stone-700 sm:grid-cols-2">
            <li className="ui-card-compact px-3 py-2">黒板全体を枠内に入れる</li>
            <li className="ui-card-compact px-3 py-2">できるだけ正面から撮る</li>
            <li className="ui-card-compact px-3 py-2">暗さ・反射・ピンぼけを避ける</li>
            <li className="ui-card-compact px-3 py-2">人名・顔・学校名が写らないか確認</li>
          </ul>
        </div>
      ) : null}

      <div className="ui-card space-y-3 p-4 text-stone-800">
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

        {!pendingImage ? (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <button
              type="button"
              onClick={cameraActive ? captureFromCamera : startCamera}
              disabled={isBusy || isStartingCamera}
              className="ui-button-primary min-h-12 py-3"
            >
              {isStartingCamera ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : cameraActive ? (
                <CheckCircle2 className="h-4 w-4" />
              ) : (
                <Video className="h-4 w-4" />
              )}
              {isStartingCamera ? "カメラ準備中…" : cameraActive ? "この写真を使う" : "カメラで撮る"}
            </button>
            <button
              type="button"
              onClick={cameraActive ? stopCamera : onPickFile}
              disabled={isBusy || isStartingCamera}
              className="ui-button-quiet min-h-12 py-3"
            >
              {cameraActive ? (
                <VideoOff className="h-4 w-4" />
              ) : (
                <ImagePlus className="h-4 w-4" />
              )}
              {cameraActive ? "カメラを止める" : "写真を選ぶ"}
            </button>
          </div>
        ) : null}

        {pendingImage ? (
          <div className="space-y-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-stone-700">
            <p className="font-medium text-amber-900">保存前の確認</p>
            <p>児童生徒の氏名、顔、学校名など保存したくない情報が写っていないか確認してください。</p>
          </div>
        ) : null}

        {pendingImage ? (
          <div className="space-y-3">
            <div className="ui-card-compact space-y-3 p-3">
              <div>
                <p className="text-sm font-semibold text-stone-800">採点条件</p>
                <p className="mt-1 text-xs leading-5 text-stone-500">迷ったらこのままで大丈夫です。用途に合わせると総合点の重みが変わります。</p>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <label className="space-y-1 text-sm font-medium text-stone-700">
                  板書タイプ
                  <select
                    value={boardType}
                    onChange={(e) => setBoardType(e.target.value as BoardType)}
                    disabled={isBusy || isStartingCamera}
                    className="ui-input w-full px-3 py-2 text-sm"
                  >
                    {BOARD_TYPE_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label} - {option.description}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="space-y-1 text-sm font-medium text-stone-700">
                  書き方
                  <select
                    value={writingDirection}
                    onChange={(e) => setWritingDirection(e.target.value as WritingDirection)}
                    disabled={isBusy || isStartingCamera}
                    className="ui-input w-full px-3 py-2 text-sm"
                  >
                    {WRITING_DIRECTION_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </div>
            <button
              type="button"
              onClick={saveAndAnalyze}
              disabled={isBusy || isStartingCamera}
              className="ui-button-primary min-h-[3.2rem] w-full py-3 text-base"
            >
              {isBusy ? <Loader2 className="h-5 w-5 animate-spin" /> : <Save className="h-5 w-5" />}
              この写真で診断する
            </button>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={resetPendingOnly}
                disabled={isBusy || isStartingCamera}
                className="ui-button-quiet min-h-10 px-3 py-2"
              >
                撮り直す
              </button>
              <button
                type="button"
                onClick={onPickFile}
                disabled={isBusy || isStartingCamera}
                className="ui-button-quiet min-h-10 px-3 py-2"
              >
                別の写真を選ぶ
              </button>
            </div>
            <p className="text-xs text-stone-500">写真と診断結果は、このブラウザの練習記録に保存されます。</p>
          </div>
        ) : null}
      </div>

      {/* 板書の内容メモ（ラベルを明るいエメラルド色に変更） */}
      <div className="space-y-2">
        <label htmlFor="memo" className="block text-sm font-bold text-emerald-200">
          板書の内容メモ（任意）
        </label>
        <textarea
          id="memo"
          value={memo}
          onChange={(e) => setMemo(e.target.value)}
          rows={2}
          className="ui-input w-full resize-y px-3 py-2 text-sm placeholder:text-stone-400 text-stone-800"
          placeholder="例：二次方程式の解の公式"
          disabled={isBusy || isStartingCamera}
        />
      </div>

      <details className="ui-card p-4 text-stone-800">
        <summary className="flex cursor-pointer items-center justify-between gap-2 text-sm font-semibold text-stone-800">
          <span className="flex items-center gap-2">
            <Folder className="h-4 w-4 text-teal-700" />
            保存先アルバムを選ぶ
          </span>
          <ChevronDown className="h-4 w-4 text-stone-500" />
        </summary>
        <div className="mt-3 space-y-4">
          <label htmlFor="album-select" className="block text-sm font-medium text-stone-700">
            今回の保存先
          </label>
          <select
            id="album-select"
            value={selectedAlbum}
            onChange={(e) => setSelectedAlbum(e.target.value)}
            className="ui-input w-full px-3 py-2.5 text-sm"
            disabled={isBusy}
          >
            {albumOptions.map((album) => (
              <option key={album} value={album}>{album}</option>
            ))}
          </select>

          <form onSubmit={handleCreateAlbum} className="space-y-2 border-t border-stone-200 pt-3">
            <label htmlFor="new-album-input" className="flex items-center gap-2 text-sm font-medium text-stone-700">
              <FolderPlus className="h-4 w-4 text-teal-700" />
              新しいアルバムを作成
            </label>
            <div className="flex gap-2">
              <input
                id="new-album-input"
                type="text"
                value={newAlbumName}
                onChange={(e) => setNewAlbumName(e.target.value)}
                placeholder="例：教育実習、テスト対策など"
                className="ui-input min-w-0 flex-1 px-3 py-2 text-sm placeholder:text-stone-400"
                disabled={isBusy}
              />
              <button
                type="submit"
                disabled={!newAlbumName.trim() || isBusy}
                className="ui-button-primary min-h-10 px-4 py-2"
              >
                作成
              </button>
            </div>
          </form>
        </div>
      </details>

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

      {rawImageSrc && (
        <ImageCropper
          imageSrc={rawImageSrc}
          onCropComplete={handleCropComplete}
          onCancel={handleCropCancel}
        />
      )}
    </section>
  );
}