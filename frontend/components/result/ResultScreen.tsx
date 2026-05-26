"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, Loader2, RefreshCw, Trash2 } from "lucide-react";

import { analyzeBoardImage } from "@/lib/api/analyze";
import {
  captureAndRecognitionHints,
  compareMessages,
  displayScoreItems,
  improvementHints,
  overallScore,
  positiveHighlights,
} from "@/lib/evaluation/viewModel";
import {
  deleteAttempt,
  getAttempt,
  getSession,
  listAttemptsBySession,
  setAttemptAnalyzing,
  setAttemptCompleted,
  setAttemptError,
} from "@/lib/storage/repository";
import type { PracticeAttempt, PracticeSession } from "@/lib/storage/types";
import { formatDateTime } from "@/lib/ui/format";

function toMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  return "処理中にエラーが発生しました。";
}

export function ResultScreen({ sessionId, attemptId }: { sessionId: string; attemptId: string }) {
  const router = useRouter();
  const imageUrlRef = useRef<string | null>(null);

  const [session, setSession] = useState<PracticeSession | null>(null);
  const [attempt, setAttempt] = useState<PracticeAttempt | null>(null);
  const [allAttempts, setAllAttempts] = useState<PracticeAttempt[]>([]);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [correctedText, setCorrectedText] = useState("");
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [s, loadedAttempt, list] = await Promise.all([
        getSession(sessionId),
        getAttempt(attemptId),
        listAttemptsBySession(sessionId),
      ]);
      const a = loadedAttempt?.sessionId === sessionId ? loadedAttempt : null;
      setSession(s);
      setAttempt(a);
      setAllAttempts(list);
      setCorrectedText(a?.correctedText || a?.analysisResult?.recognized_text || "");
      if (imageUrlRef.current) URL.revokeObjectURL(imageUrlRef.current);
      if (a?.imageBlob) {
        const url = URL.createObjectURL(a.imageBlob);
        imageUrlRef.current = url;
        setImageUrl(url);
      } else {
        imageUrlRef.current = null;
        setImageUrl(null);
      }
    } catch {
      setLoadError("保存した練習を読み込めませんでした。ブラウザの保存設定を確認して、もう一度お試しください。");
    } finally {
      setLoading(false);
    }
  }, [attemptId, sessionId]);

  useEffect(() => {
    void load();
    return () => {
      if (imageUrlRef.current) URL.revokeObjectURL(imageUrlRef.current);
    };
  }, [load]);

  const result = attempt?.analysisStatus === "completed" ? attempt.analysisResult : null;
  const score = result ? Math.round(overallScore(result.scores) * 100) : null;
  const positives = result ? positiveHighlights(result) : [];
  const hints = result ? improvementHints(result) : [];
  const captureHints = result ? captureAndRecognitionHints(result) : [];
  const beforeAttempt = useMemo(() => {
    const idx = allAttempts.findIndex((a) => a.id === attempt?.id);
    return idx > 0 ? allAttempts[idx - 1] : null;
  }, [allAttempts, attempt?.id]);
  const compareHint =
    beforeAttempt?.analysisStatus === "completed" && beforeAttempt.analysisResult && result
      ? compareMessages(beforeAttempt.analysisResult.scores, result.scores).slice(0, 1)
      : [];

  const rerunAnalysis = useCallback(
    async (withCorrection: boolean) => {
      if (!attempt) return;
      setError(null);
      setWorking(true);
      try {
        await setAttemptAnalyzing(attempt.id);
        const corrected = withCorrection ? correctedText.trim() : undefined;
        const data = await analyzeBoardImage(attempt.imageBlob, attempt.originalFilename ?? "saved.jpg", corrected);
        await setAttemptCompleted({
          attemptId: attempt.id,
          result: data,
          correctedText: corrected || null,
        });
        await load();
      } catch (e) {
        const msg = toMessage(e);
        await setAttemptError(attempt.id, msg);
        setError(msg);
        await load();
      } finally {
        setWorking(false);
      }
    },
    [attempt, correctedText, load],
  );

  const onDeleteAttempt = useCallback(async () => {
    if (!attempt) return;
    const ok = window.confirm("この写真を削除します。よろしいですか？");
    if (!ok) return;
    try {
      const res = await deleteAttempt(attempt.id);
      if (res.sessionDeleted) {
        router.push("/album");
        return;
      }
      router.push(`/album/${sessionId}`);
    } catch (e) {
      setError(toMessage(e));
    }
  }, [attempt, router, sessionId]);

  if (loading) {
    return (
      <section className="rounded-xl border border-stone-200 bg-white p-6 text-center text-stone-600">
        <Loader2 className="mx-auto h-6 w-6 animate-spin" />
        <p className="mt-2 text-sm">読み込み中…</p>
      </section>
    );
  }

  if (loadError) {
    return (
      <section className="space-y-3 rounded-xl border border-orange-200 bg-orange-50 p-4 text-orange-800">
        <p>{loadError}</p>
        <Link href="/album" className="inline-flex rounded-lg bg-teal-700 px-4 py-2 text-sm font-semibold text-white">
          アルバムへ戻る
        </Link>
      </section>
    );
  }

  if (!session || !attempt) {
    return (
      <section className="space-y-3 rounded-xl border border-orange-200 bg-orange-50 p-4 text-orange-800">
        <p>指定した練習記録が見つかりませんでした。</p>
        <Link href="/album" className="inline-flex rounded-lg bg-teal-700 px-4 py-2 text-sm font-semibold text-white">
          アルバムへ戻る
        </Link>
      </section>
    );
  }

  return (
    <section className="space-y-5">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold text-stone-800">今回の振り返り</h1>
        <p className="text-sm text-stone-600">{formatDateTime(attempt.createdAt)}</p>
      </header>

      {imageUrl ? (
        <div className="overflow-hidden rounded-lg border border-stone-300 bg-black">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={imageUrl} alt="保存した板書画像" className="mx-auto block max-h-[56vh] w-full object-contain" />
        </div>
      ) : null}

      {attempt.analysisStatus === "error" ? (
        <div className="space-y-3 rounded-lg border border-orange-200 bg-orange-50 p-4 text-sm text-orange-900">
          <p>解析に失敗しました。画像は保存されています。</p>
          <p>{attempt.analysisError || "時間をおいて再解析してください。"}</p>
          <button
            type="button"
            onClick={() => void rerunAnalysis(false)}
            disabled={working}
            className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-teal-700 px-4 py-2 font-semibold text-white hover:bg-teal-600 disabled:opacity-50"
          >
            {working ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            再解析する
          </button>
        </div>
      ) : null}

      {result ? (
        <div className="space-y-4 rounded-xl border border-stone-200 bg-white p-4 shadow-sm">
          <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
            <p className="text-sm text-stone-600">黒板での伝わりやすさ（今回の読みやすさ）</p>
            <p className="text-3xl font-bold text-teal-700">{score}点</p>
          </div>

          <div className="space-y-2 rounded-lg border border-emerald-200 bg-emerald-50 p-4">
            <h2 className="text-sm font-semibold text-emerald-900">よかったところ</h2>
            <ul className="list-inside list-disc space-y-1 text-sm text-stone-700">
              {positives.map((line, i) => (
                <li key={i}>{line}</li>
              ))}
              {compareHint.map((line, i) => (
                <li key={`cmp-${i}`}>{line}</li>
              ))}
            </ul>
          </div>

          <div className="space-y-2 rounded-lg border border-amber-200 bg-amber-50 p-4">
            <h2 className="text-sm font-semibold text-amber-900">次に意識すること</h2>
            <ul className="list-inside list-disc space-y-1 text-sm text-stone-700">
              {hints.map((line, i) => (
                <li key={i}>{line}</li>
              ))}
            </ul>
          </div>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {displayScoreItems(result.scores).map((item) => (
              <div key={item.key} className="rounded-lg border border-stone-200 bg-stone-50 px-3 py-2">
                <p className="text-[11px] font-medium text-stone-500">{item.label}</p>
                <p className="font-mono text-xl text-stone-800">{Math.round(item.value * 100)}%</p>
              </div>
            ))}
            <div className="rounded-lg border border-stone-200 bg-stone-50 px-3 py-2">
              <p className="text-[11px] font-medium text-stone-500">撮影品質</p>
              <p className="font-mono text-xl text-stone-800">{Math.round(result.scores.visibility * 100)}%</p>
            </div>
          </div>

          <div className="space-y-3 rounded-lg border border-stone-200 bg-stone-50 p-3">
            <h3 className="text-sm font-semibold text-stone-700">書かれている内容の確認（補助）</h3>
            <p className="text-xs text-stone-500">
              OCR 結果が違う場合は修正して再解析できます。主評価は文字の見やすさです。
            </p>
            <textarea
              value={correctedText}
              onChange={(e) => setCorrectedText(e.target.value)}
              rows={3}
              className="w-full resize-y rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm text-stone-800"
              placeholder="認識結果が違う場合はここで修正"
              disabled={working}
            />
            <button
              type="button"
              onClick={() => void rerunAnalysis(true)}
              disabled={working || !correctedText.trim()}
              className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-teal-700 px-3 py-2 text-sm font-medium text-white hover:bg-teal-600 disabled:opacity-50"
            >
              {working ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              修正して再解析
            </button>
          </div>

          {captureHints.length > 0 ? (
            <div className="rounded-lg border border-orange-200 bg-orange-50 p-3">
              <h3 className="text-sm font-semibold text-orange-900">撮影・認識の確認</h3>
              <ul className="mt-1 list-inside list-disc space-y-1 text-sm text-stone-700">
                {captureHints.map((line, i) => (
                  <li key={i}>{line}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}

      {error ? (
        <p className="flex items-start gap-2 rounded-lg border border-orange-200 bg-orange-50 px-3 py-2 text-sm text-orange-800">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          {error}
        </p>
      ) : null}

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <Link
          href={`/practice/new?sessionId=${session.id}`}
          className="inline-flex min-h-11 items-center justify-center rounded-lg bg-teal-700 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-600"
        >
          同じ内容でもう一度書く
        </Link>
        <Link
          href={`/album/${session.id}`}
          className="inline-flex min-h-11 items-center justify-center rounded-lg border border-stone-300 bg-white px-4 py-2 text-sm text-stone-700 hover:bg-stone-100"
        >
          記録を見る
        </Link>
        <button
          type="button"
          onClick={onDeleteAttempt}
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-orange-300 bg-white px-4 py-2 text-sm text-orange-700 hover:bg-orange-50"
        >
          <Trash2 className="h-4 w-4" />
          この写真を削除する
        </button>
      </div>
    </section>
  );
}
