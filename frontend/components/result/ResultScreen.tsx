"use client";
import EvaluationRadarChart from "./EvaluationRadarChart";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, ArrowRightLeft, Award, Clock3, Lightbulb, Loader2, RefreshCw, Target, Trash2 } from "lucide-react";

import { analyzeBoardImage } from "@/lib/api/analyze";
import { PracticeSteps } from "@/components/practice/PracticeSteps";
import { ReferenceOverlayPanel } from "@/components/result/ReferenceOverlayPanel";
import { DetailPageSkeleton } from "@/components/ui/PageSkeletons";
import {
  captureAndRecognitionHints,
  BOARD_TYPE_LABELS,
  compareMessages,
  displayScoreItems,
  fixedRuleScoreItems,
  improvementHints,
  positiveHighlights,
  resultDisplayScore,
  WRITING_DIRECTION_LABELS,
} from "@/lib/evaluation/viewModel";
import { diagnosisForResult, practiceMenuForResult } from "@/lib/evaluation/practiceMenu";
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
  const score = result ? resultDisplayScore(result) : null;
  const positives = result ? positiveHighlights(result) : [];
  const hints = result ? improvementHints(result) : [];
  const captureHints = result ? captureAndRecognitionHints(result) : [];
  const diagnosis = result ? diagnosisForResult(result) : null;
  const practiceMenu = result ? practiceMenuForResult(result) : null;
  const beforeAttempt = useMemo(() => {
    const idx = allAttempts.findIndex((a) => a.id === attempt?.id);
    return idx > 0 ? allAttempts[idx - 1] : null;
  }, [allAttempts, attempt?.id]);
  const compareHint =
    beforeAttempt?.analysisStatus === "completed" && beforeAttempt.analysisResult && result
      ? compareMessages(beforeAttempt.analysisResult.scores, result.scores).slice(0, 1)
      : [];
  const comparableCount = allAttempts.filter((a) => a.analysisStatus === "completed" && a.analysisResult).length;
  const canCompare = comparableCount >= 2;
  const referenceText = correctedText.trim() || result?.recognized_text?.trim() || "";
  const writingDirection = result?.scoring?.writing_direction ?? "horizontal";

  const rerunAnalysis = useCallback(
    async (withCorrection: boolean) => {
      if (!attempt) return;
      setError(null);
      setWorking(true);
      try {
        await setAttemptAnalyzing(attempt.id);
        const corrected = withCorrection ? correctedText.trim() : undefined;
        const data = await analyzeBoardImage(attempt.imageBlob, attempt.originalFilename ?? "saved.jpg", {
          correctedText: corrected,
          boardType: attempt.analysisResult?.scoring?.board_type ?? "lecture",
          writingDirection: attempt.analysisResult?.scoring?.writing_direction ?? "horizontal",
        });
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
    return <DetailPageSkeleton />;
  }

  if (loadError) {
    return (
      <section className="space-y-3 rounded-xl border border-orange-200 bg-orange-50 p-4 text-orange-800">
        <p>{loadError}</p>
        <Link href="/album" className="ui-button-primary">
          アルバムへ戻る
        </Link>
      </section>
    );
  }

  if (!session || !attempt) {
    return (
      <section className="space-y-3 rounded-xl border border-orange-200 bg-orange-50 p-4 text-orange-800">
        <p>指定した練習記録が見つかりませんでした。</p>
        <Link href="/album" className="ui-button-primary">
          アルバムへ戻る
        </Link>
      </section>
    );
  }

  return (
    <section className="space-y-5">
      <PracticeSteps current={2} canCompare={canCompare} />
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold text-stone-800">今回の振り返り</h1>
        <p className="text-sm text-stone-600">{formatDateTime(attempt.createdAt)}</p>
      </header>

      {imageUrl && result ? (
        <ReferenceOverlayPanel
          imageUrl={imageUrl}
          referenceText={referenceText}
          overlay={result.overlay}
          writingDirection={writingDirection}
        />
      ) : imageUrl ? (
        <div className="overflow-hidden rounded-lg border border-stone-300 bg-black">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={imageUrl} alt="保存した板書画像" className="mx-auto block max-h-[56vh] w-full object-contain" />
        </div>
      ) : null}

      {attempt.analysisStatus === "error" ? (
        <div className="space-y-3 rounded-lg border border-orange-200 bg-orange-50 p-4 text-sm text-orange-900">
          <p>今回は振り返りの作成に失敗しました。写真は保存されています。</p>
          <p>{attempt.analysisError || "時間をおいて、もう一度確認し直してください。"}</p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void rerunAnalysis(false)}
              disabled={working}
              className="ui-button-primary"
            >
              {working ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              もう一度確認し直す
            </button>
            <Link
              href={`/practice/new?sessionId=${session.id}`}
              className="ui-button-quiet"
            >
              別の写真で振り返る
            </Link>
          </div>
        </div>
      ) : null}

      {result ? (
        <div className="ui-card space-y-4 p-4">
          {diagnosis ? (
            <div className="space-y-2 rounded-lg border border-teal-200 bg-teal-50 p-4">
              <h2 className="flex items-center gap-2 text-sm font-semibold text-teal-950">
                <Award className="h-4 w-4" />
                診断タイプ
              </h2>
              <p className="text-2xl font-bold text-teal-800">{diagnosis.name}</p>
              <p className="text-sm leading-6 text-stone-700">{diagnosis.summary}</p>
              <p className="rounded-md bg-white px-3 py-2 text-sm font-medium text-stone-800">{diagnosis.focus}</p>
            </div>
          ) : null}

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
            <h2 className="flex items-center gap-2 text-sm font-semibold text-amber-900">
              <Lightbulb className="h-4 w-4" />
              次に意識すること
            </h2>
            <ul className="list-inside list-disc space-y-1 text-sm text-stone-700">
              {hints.map((line, i) => (
                <li key={i}>{line}</li>
              ))}
            </ul>
          </div>

          {practiceMenu ? (
            <div className="space-y-3 rounded-lg border border-teal-200 bg-white p-4">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h2 className="flex items-center gap-2 text-sm font-semibold text-teal-900">
                    <Target className="h-4 w-4" />
                    おすすめ3分練習
                  </h2>
                  <p className="mt-1 text-xl font-bold text-stone-900">{practiceMenu.title}</p>
                  <p className="mt-1 text-sm leading-6 text-stone-600">{practiceMenu.goal}</p>
                </div>
                <span className="inline-flex w-fit items-center gap-1 rounded-full bg-teal-50 px-3 py-1 text-xs font-semibold text-teal-800">
                  <Clock3 className="h-3.5 w-3.5" />
                  {practiceMenu.duration}
                </span>
              </div>
              <ol className="grid grid-cols-1 gap-2 text-sm text-stone-700 sm:grid-cols-3">
                {practiceMenu.steps.map((step, index) => (
                  <li key={step} className="rounded-md border border-stone-200 bg-stone-50 px-3 py-2">
                    <span className="text-xs font-semibold text-teal-700">{index + 1}</span>
                    <p className="mt-1 leading-5">{step}</p>
                  </li>
                ))}
              </ol>
              <p className="rounded-md border border-stone-200 bg-stone-50 px-3 py-2 text-sm text-stone-700">{practiceMenu.tip}</p>
            </div>
          ) : null}

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <Link
              href={`/practice/new?sessionId=${session.id}`}
              className="ui-button-primary"
            >
              同じ板書をもう一度書く
            </Link>
            {canCompare ? (
              <Link
                href={`/practice/${session.id}/compare`}
                className="ui-button-secondary"
              >
                <ArrowRightLeft className="h-4 w-4" />
                書き直しを比較する
              </Link>
            ) : null}
          </div>

          <h3 className="text-sm font-semibold text-stone-700">詳しい評価</h3>

          {result.scoring ? (
            <div className="space-y-3 rounded-lg border border-teal-200 bg-teal-50 p-4">
              <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <h4 className="text-sm font-semibold text-teal-950">固定ルール採点</h4>
                  <p className="mt-1 text-xs text-stone-600">
                    {BOARD_TYPE_LABELS[result.scoring.board_type]} /{" "}
                    {WRITING_DIRECTION_LABELS[result.scoring.writing_direction]} / 信頼度
                    {Math.round(result.scoring.confidence * 100)}%
                  </p>
                </div>
                <p className="font-mono text-2xl font-bold text-teal-800">{result.scoring.display_score}点</p>
              </div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {fixedRuleScoreItems(result.scoring).map((item) => (
                  <div key={item.key} className="rounded-md border border-teal-100 bg-white px-3 py-2">
                    <p className="text-[11px] font-medium text-stone-500">{item.label}</p>
                    <p className="font-mono text-xl text-stone-800">{Math.round(item.value * 100)}%</p>
                  </div>
                ))}
              </div>
              {result.scoring.caps.length > 0 ? (
                <p className="rounded-md bg-white px-3 py-2 text-xs text-stone-600">
                  低視認性・文字の小ささ・ブロック重なりのいずれかにより、総合点に上限をかけています。
                </p>
              ) : null}
            </div>
          ) : null}
          
          <div className="mt-2 mb-4 flex justify-center bg-stone-50 rounded-xl border border-stone-100 p-2">
            <EvaluationRadarChart 
              scores={{
                readability: Math.round((result.scores.readability || 0) * 100),
                line_alignment: Math.round((result.scores.line_alignment || 0) * 100),
                spacing_balance: Math.round((result.scores.spacing_balance || 0) * 100),
                stroke_quality: Math.round((result.scores.stroke_quality || 0) * 100),
                horizontalness: Math.round((result.scores.horizontalness || 0) * 100),
                visibility: Math.round((result.scores.visibility || 0) * 100),
              }} 
            />
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

          <div className="space-y-3 rounded-lg border border-sky-200 bg-sky-50 p-3">
            <h3 className="text-sm font-semibold text-sky-900">お手本に使う文字</h3>
            <p className="text-xs text-stone-500">
              OCR 結果が違う場合は修正して確認し直せます。主評価は文字の見やすさです。
            </p>
            <textarea
              value={correctedText}
              onChange={(e) => setCorrectedText(e.target.value)}
              rows={3}
              className="ui-input w-full resize-y px-3 py-2 text-sm"
              placeholder="認識結果が違う場合はここで修正"
              disabled={working}
            />
            <button
              type="button"
              onClick={() => void rerunAnalysis(true)}
              disabled={working || !correctedText.trim()}
              className="ui-button-primary min-h-10 px-3 py-2"
            >
              {working ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              修正して確認し直す
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

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <Link
          href={`/album/${session.id}`}
          className="ui-button-quiet"
        >
          記録を見る
        </Link>
        <button
          type="button"
          onClick={onDeleteAttempt}
          className="ui-button-danger"
        >
          <Trash2 className="h-4 w-4" />
          この写真を削除する
        </button>
      </div>
    </section>
  );
}
