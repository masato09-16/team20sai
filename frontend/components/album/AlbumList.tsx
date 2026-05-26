"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Camera, ChevronRight } from "lucide-react";

import { overallScore } from "@/lib/evaluation/viewModel";
import { listAttemptsBySession, listSessions } from "@/lib/storage/repository";
import type { PracticeAttempt, PracticeSession } from "@/lib/storage/types";
import { formatDateTime } from "@/lib/ui/format";

type Row = {
  session: PracticeSession;
  attempts: PracticeAttempt[];
};

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

function SessionCard({ row }: { row: Row }) {
  const latest = row.attempts[row.attempts.length - 1] ?? null;
  const thumbUrl = useBlobUrl(latest?.imageBlob ?? null);
  const score =
    latest?.analysisResult && latest.analysisStatus === "completed"
      ? `${Math.round(overallScore(latest.analysisResult.scores) * 100)}点`
      : latest?.analysisStatus === "error"
        ? "解析エラー"
        : "解析待ち";
  return (
    <Link href={`/album/${row.session.id}`} className="block rounded-lg border border-stone-200 bg-white p-3 shadow-sm hover:bg-stone-50">
      <div className="flex items-center gap-3">
        <div className="h-16 w-24 shrink-0 overflow-hidden rounded-md border border-stone-200 bg-black">
          {thumbUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={thumbUrl} alt="板書サムネイル" className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-[11px] text-stone-400">No image</div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-stone-800">{row.session.memo?.trim() || "メモ未入力の練習"}</p>
          <p className="text-xs text-stone-500">{formatDateTime(row.session.updatedAt)}</p>
          <p className="text-xs text-stone-500">書き直し回数: {Math.max(0, row.attempts.length - 1)}回</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-teal-700">{score}</span>
          <ChevronRight className="h-4 w-4 text-stone-400" />
        </div>
      </div>
    </Link>
  );
}

export function AlbumList() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    const run = async () => {
      try {
        const sessions = await listSessions();
        const next = await Promise.all(
          sessions.map(async (session) => ({ session, attempts: await listAttemptsBySession(session.id) })),
        );
        if (mounted) setRows(next);
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

  const hasData = useMemo(() => rows.length > 0, [rows.length]);

  return (
    <section className="space-y-4">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold text-stone-800">練習アルバム</h1>
        <p className="text-sm text-stone-600">保存した板書を見返し、上達の流れを確認できます。</p>
      </header>

      {loading ? <p className="text-sm text-stone-500">読み込み中…</p> : null}
      {!loading && loadError ? (
        <p className="rounded-lg border border-orange-200 bg-orange-50 p-3 text-sm text-orange-800">{loadError}</p>
      ) : null}

      {!loading && !loadError && !hasData ? (
        <div className="space-y-3 rounded-xl border border-stone-200 bg-white p-5 text-center shadow-sm">
          <p className="text-sm text-stone-600">まだ保存された練習はありません。</p>
          <Link
            href="/practice/new"
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-teal-700 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-600"
          >
            <Camera className="h-4 w-4" />
            板書を撮影する
          </Link>
        </div>
      ) : null}

      {!loading && !loadError && hasData ? (
        <ul className="space-y-2">
          {rows.map((row) => (
            <li key={row.session.id}>
              <SessionCard row={row} />
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
