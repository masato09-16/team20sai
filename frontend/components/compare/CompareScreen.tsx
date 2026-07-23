"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Camera } from "lucide-react";

import { PracticeSteps } from "@/components/practice/PracticeSteps";
import { EmptyState } from "@/components/ui/EmptyState";
import { DetailPageSkeleton } from "@/components/ui/PageSkeletons";
import {
  compareMessages,
  displayScoreItems,
  resultDisplayScore,
  resultOverallScore,
} from "@/lib/evaluation/viewModel";
import { listAttemptsBySession } from "@/lib/storage/repository";
import type { PracticeAttempt } from "@/lib/storage/types";
import { formatDateTime } from "@/lib/ui/format";

function useBlobUrl(blob: Blob | null): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!blob) {
      setUrl(null);
      return;
    }
    const next = URL.createObjectURL(blob);
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [blob]);
  return url;
}

export function CompareScreen({ sessionId }: { sessionId: string }) {
  const [attempts, setAttempts] = useState<PracticeAttempt[]>([]);
  const [leftId, setLeftId] = useState<string>("");
  const [rightId, setRightId] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    const run = async () => {
      try {
        const list = (await listAttemptsBySession(sessionId)).filter(
          (a) => a.analysisStatus === "completed" && a.analysisResult,
        );
        if (!mounted) return;
        setAttempts(list);
        if (list.length >= 2) {
          setLeftId(list[0].id);
          setRightId(list[list.length - 1].id);
        }
      } catch {
        if (mounted) setLoadError("保存した比較記録を読み込めませんでした。ブラウザの保存設定を確認してください。");
      } finally {
        if (mounted) setLoading(false);
      }
    };
    void run();
    return () => {
      mounted = false;
    };
  }, [sessionId]);

  const left = useMemo(() => attempts.find((a) => a.id === leftId) ?? null, [attempts, leftId]);
  const right = useMemo(() => attempts.find((a) => a.id === rightId) ?? null, [attempts, rightId]);
  const leftUrl = useBlobUrl(left?.imageBlob ?? null);
  const rightUrl = useBlobUrl(right?.imageBlob ?? null);
  const isSameSelection = leftId === rightId;

  if (loading) return <DetailPageSkeleton />;

  if (loadError) {
    return (
      <section className="space-y-3 rounded-xl border border-orange-200 bg-orange-50 p-4 text-orange-800">
        <p>{loadError}</p>
        <Link href={`/album/${sessionId}`} className="ui-button-primary">
          練習の記録へ戻る
        </Link>
      </section>
    );
  }

  if (attempts.length < 2) {
    return (
      <section className="space-y-4">
        <PracticeSteps current={4} canCompare={false} />
        <EmptyState
          icon={Camera}
          title="比較できる記録がまだありません"
          description="解析完了した別々の写真が2枚そろうと、書き直し前後の変化を見られます。"
          action={
            <Link href={`/practice/new?sessionId=${sessionId}`} className="ui-button-primary">
              もう一度練習する
            </Link>
          }
        />
      </section>
    );
  }

  const messages =
    !isSameSelection && left?.analysisResult && right?.analysisResult
      ? compareMessages(left.analysisResult.scores, right.analysisResult.scores)
      : [];
  const leftOverall = left?.analysisResult ? resultOverallScore(left.analysisResult) : null;
  const rightOverall = right?.analysisResult ? resultOverallScore(right.analysisResult) : null;
  const leftDisplayScore = left?.analysisResult ? resultDisplayScore(left.analysisResult) : null;
  const rightDisplayScore = right?.analysisResult ? resultDisplayScore(right.analysisResult) : null;
  const overallDelta = !isSameSelection && leftOverall !== null && rightOverall !== null ? rightOverall - leftOverall : null;

  return (
    <section className="space-y-4">
      <PracticeSteps current={4} canCompare />
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold text-stone-800">書き直しで変わったところ</h1>
        <p className="text-sm text-stone-600">前回と比べて、どこが整ってきたかを確認できます。</p>
      </header>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <label className="space-y-1 text-sm text-stone-700">
          比較元
          <select
            value={leftId}
            onChange={(e) => setLeftId(e.target.value)}
            className="ui-input w-full px-3 py-2"
          >
            {attempts.map((a, idx) => (
              <option key={a.id} value={a.id}>
                {idx + 1}回目 ({formatDateTime(a.createdAt)})
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1 text-sm text-stone-700">
          書き直し後
          <select
            value={rightId}
            onChange={(e) => setRightId(e.target.value)}
            className="ui-input w-full px-3 py-2"
          >
            {attempts.map((a, idx) => (
              <option key={a.id} value={a.id}>
                {idx + 1}回目 ({formatDateTime(a.createdAt)})
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <div className="ui-card p-3">
          <p className="mb-2 text-sm font-medium text-stone-700">比較元</p>
          <div className="overflow-hidden rounded-md border border-stone-200 bg-black">
            {leftUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={leftUrl} alt="比較元画像" className="h-56 w-full object-contain" />
            ) : null}
          </div>
        </div>
        <div className="ui-card p-3">
          <p className="mb-2 text-sm font-medium text-stone-700">書き直し後</p>
          <div className="overflow-hidden rounded-md border border-stone-200 bg-black">
            {rightUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={rightUrl} alt="比較先画像" className="h-56 w-full object-contain" />
            ) : null}
          </div>
        </div>
      </div>

      {isSameSelection ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          同じ写真を選択中です。書き直し前後を比較するには、別の回を選んでください。
        </p>
      ) : null}

      {overallDelta !== null && leftDisplayScore !== null && rightDisplayScore !== null ? (
        <div className="ui-card p-4">
          <h2 className="text-sm font-semibold text-stone-700">総合点の変化</h2>
          <div className="mt-2 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
            <p className="text-2xl font-bold text-stone-900">
              {leftDisplayScore}点 → {rightDisplayScore}点
            </p>
            <p className={`text-lg font-bold ${overallDelta >= 0 ? "text-emerald-700" : "text-orange-700"}`}>
              {overallDelta >= 0 ? "+" : ""}
              {Math.round(overallDelta * 100)}点
            </p>
          </div>
          <p className="mt-2 text-sm text-stone-600">
            点数の上下だけでなく、下の項目別変化を見て次の練習ポイントを選びましょう。
          </p>
        </div>
      ) : null}

      {messages.length > 0 ? (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3">
          <h2 className="text-sm font-semibold text-emerald-900">変化のポイント</h2>
          <ul className="mt-1 list-inside list-disc space-y-1 text-sm text-stone-700">
            {messages.map((m, i) => (
              <li key={i}>{m}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {!isSameSelection && left?.analysisResult && right?.analysisResult ? (
        <div className="ui-card p-3">
          <h2 className="text-sm font-semibold text-stone-700">項目別スコア変化</h2>
          <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
            {displayScoreItems(right.analysisResult.scores).map((item) => {
              const base = left.analysisResult?.scores[item.key as keyof typeof left.analysisResult.scores] ?? 0;
              const delta = item.value - Number(base);
              return (
                <div key={item.key} className="ui-card-compact px-3 py-2">
                  <p className="text-xs text-stone-500">{item.label}</p>
                  <p className="text-sm font-semibold text-stone-700">
                    {Math.round(Number(base) * 100)}% → {Math.round(item.value * 100)}%
                  </p>
                  <p className={`text-xs ${delta >= 0 ? "text-emerald-700" : "text-orange-700"}`}>
                    {delta >= 0 ? "+" : ""}
                    {Math.round(delta * 100)}pt
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}

      <Link
        href={`/practice/new?sessionId=${sessionId}`}
        className="ui-button-primary"
      >
        もう一度練習する
      </Link>
    </section>
  );
}
