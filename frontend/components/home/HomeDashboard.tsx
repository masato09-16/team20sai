"use client";

import Link from "next/link";
import { Camera, ChevronRight } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { overallScore } from "@/lib/evaluation/viewModel";
import { listAttemptsBySession, listSessions } from "@/lib/storage/repository";
import type { PracticeAttempt, PracticeSession } from "@/lib/storage/types";
import { formatDateTime } from "@/lib/ui/format";

type RecentRow = {
  session: PracticeSession;
  latestAttempt: PracticeAttempt | null;
};

export function HomeDashboard() {
  const [rows, setRows] = useState<RecentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    const run = async () => {
      try {
        const sessions = await listSessions(5);
        const pairs = await Promise.all(
          sessions.map(async (s) => {
            const attempts = await listAttemptsBySession(s.id);
            return { session: s, latestAttempt: attempts[attempts.length - 1] ?? null };
          }),
        );
        if (mounted) setRows(pairs);
      } catch {
        if (mounted) setLoadError("保存した練習を読み込めませんでした。ブラウザの保存設定を確認してください。");
      } finally {
        if (mounted) setLoading(false);
      }
    };
    void run();
    return () => {
      mounted = false;
    };
  }, []);

  const hasRows = rows.length > 0;
  const titleText = useMemo(
    () => (hasRows ? "前回の続きから練習できます" : "まずは1回、板書を撮影して振り返りましょう"),
    [hasRows],
  );

  return (
    <section className="space-y-5">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold text-stone-800 sm:text-3xl">板書練習ノート</h1>
        <p className="text-sm text-stone-600">{titleText}</p>
      </header>

      <Link
        href="/practice/new"
        className="flex min-h-14 items-center justify-center gap-2 rounded-lg bg-teal-700 px-4 py-3 text-base font-semibold text-white shadow-sm transition hover:bg-teal-600"
      >
        <Camera className="h-5 w-5" />
        板書を撮影する
      </Link>

      <section className="rounded-xl border border-stone-200 bg-white p-4 shadow-sm">
        <h2 className="text-sm font-semibold text-stone-800">最近の練習</h2>
        {loading ? <p className="mt-3 text-sm text-stone-500">読み込み中…</p> : null}
        {!loading && loadError ? <p className="mt-3 text-sm text-orange-700">{loadError}</p> : null}
        {!loading && !loadError && !hasRows ? (
          <p className="mt-3 text-sm text-stone-500">まだ保存された練習はありません。</p>
        ) : null}
        {!loading && !loadError && hasRows ? (
          <ul className="mt-3 space-y-2">
            {rows.map(({ session, latestAttempt }) => {
              const summary =
                latestAttempt?.analysisResult && latestAttempt.analysisStatus === "completed"
                  ? `${Math.round(overallScore(latestAttempt.analysisResult.scores) * 100)}点`
                  : latestAttempt?.analysisStatus === "error"
                    ? "解析エラー"
                    : "解析待ち";
              return (
                <li key={session.id}>
                  <Link
                    href={`/album/${session.id}`}
                    className="flex items-center justify-between rounded-lg border border-stone-200 bg-stone-50 px-3 py-2 hover:bg-stone-100"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-stone-800">
                        {session.memo?.trim() || "メモ未入力の練習"}
                      </p>
                      <p className="text-xs text-stone-500">{formatDateTime(session.updatedAt)}</p>
                    </div>
                    <div className="ml-2 flex items-center gap-2">
                      <span className="text-sm font-semibold text-teal-700">{summary}</span>
                      <ChevronRight className="h-4 w-4 text-stone-400" />
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        ) : null}
      </section>
    </section>
  );
}
