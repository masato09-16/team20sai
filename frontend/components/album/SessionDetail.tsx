"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRightLeft, Camera, Trash2 } from "lucide-react";

import { overallScore } from "@/lib/evaluation/viewModel";
import {
  deleteAttempt,
  deleteSession,
  getSession,
  listAttemptsBySession,
  updateSessionMemo,
} from "@/lib/storage/repository";
import type { PracticeAttempt, PracticeSession } from "@/lib/storage/types";
import { formatDateTime } from "@/lib/ui/format";

function AttemptRow({
  attempt,
  orderLabel,
  onDelete,
}: {
  attempt: PracticeAttempt;
  orderLabel: string;
  onDelete: (attemptId: string) => void;
}) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    const next = URL.createObjectURL(attempt.imageBlob);
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [attempt.imageBlob]);

  const score =
    attempt.analysisResult && attempt.analysisStatus === "completed"
      ? `${Math.round(overallScore(attempt.analysisResult.scores) * 100)}点`
      : attempt.analysisStatus === "error"
        ? "解析エラー"
        : "解析待ち";

  return (
    <div className="rounded-lg border border-stone-200 bg-white p-3 shadow-sm">
      <div className="flex items-center gap-3">
        <div className="h-16 w-24 shrink-0 overflow-hidden rounded-md border border-stone-200 bg-black">
          {url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={url} alt="板書サムネイル" className="h-full w-full object-cover" />
          ) : null}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-stone-800">
            {orderLabel}・{formatDateTime(attempt.createdAt)}
          </p>
          <p className="text-xs text-stone-500">{score}</p>
        </div>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <Link
          href={`/practice/${attempt.sessionId}/result/${attempt.id}`}
          className="inline-flex min-h-10 items-center justify-center rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm text-stone-700 hover:bg-stone-100"
        >
          結果を見る
        </Link>
        <button
          type="button"
          onClick={() => onDelete(attempt.id)}
          className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-orange-300 bg-white px-3 py-2 text-sm text-orange-700 hover:bg-orange-50"
        >
          <Trash2 className="h-4 w-4" />
          削除
        </button>
      </div>
    </div>
  );
}

export function SessionDetail({ sessionId }: { sessionId: string }) {
  const router = useRouter();
  const [session, setSession] = useState<PracticeSession | null>(null);
  const [attempts, setAttempts] = useState<PracticeAttempt[]>([]);
  const [memo, setMemo] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [s, list] = await Promise.all([getSession(sessionId), listAttemptsBySession(sessionId)]);
      setSession(s);
      setAttempts(list);
      setMemo(s?.memo || "");
    } catch {
      setError("保存した練習を読み込めませんでした。ブラウザの保存設定を確認してください。");
    } finally {
      setLoading(false);
    }
  }, [sessionId]);

  useEffect(() => {
    void load();
  }, [load]);

  const onDeleteAttempt = useCallback(
    async (attemptId: string) => {
      if (!window.confirm("この写真を削除します。よろしいですか？")) return;
      try {
        const res = await deleteAttempt(attemptId);
        if (res.sessionDeleted) {
          router.push("/album");
          return;
        }
        await load();
      } catch {
        setError("写真を削除できませんでした。もう一度お試しください。");
      }
    },
    [load, router],
  );

  const onDeleteSession = useCallback(async () => {
    if (!window.confirm("この練習を削除します。よろしいですか？")) return;
    try {
      await deleteSession(sessionId);
      router.push("/album");
    } catch {
      setError("練習記録を削除できませんでした。もう一度お試しください。");
    }
  }, [router, sessionId]);

  const onMemoBlur = useCallback(async () => {
    try {
      await updateSessionMemo(sessionId, memo || null);
    } catch {
      setError("メモを保存できませんでした。もう一度お試しください。");
    }
  }, [memo, sessionId]);

  if (loading) return <p className="text-sm text-stone-500">読み込み中…</p>;
  if (error && !session) {
    return (
      <section className="space-y-3 rounded-xl border border-orange-200 bg-orange-50 p-4">
        <p className="text-sm text-orange-800">{error}</p>
        <Link href="/album" className="inline-flex rounded-lg bg-teal-700 px-4 py-2 text-sm font-semibold text-white">
          アルバムへ戻る
        </Link>
      </section>
    );
  }
  if (!session) {
    return (
      <section className="space-y-3 rounded-xl border border-orange-200 bg-orange-50 p-4">
        <p className="text-sm text-orange-800">対象のセッションが見つかりませんでした。</p>
        <Link href="/album" className="inline-flex rounded-lg bg-teal-700 px-4 py-2 text-sm font-semibold text-white">
          アルバムへ戻る
        </Link>
      </section>
    );
  }

  return (
    <section className="space-y-4">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold text-stone-800">練習の記録</h1>
        <p className="text-sm text-stone-600">{formatDateTime(session.updatedAt)}</p>
      </header>
      {error ? (
        <p className="rounded-lg border border-orange-200 bg-orange-50 p-3 text-sm text-orange-800">{error}</p>
      ) : null}

      <div className="rounded-xl border border-stone-200 bg-white p-4 shadow-sm">
        <label htmlFor="memo" className="block text-sm font-medium text-stone-800">
          板書の内容メモ
        </label>
        <textarea
          id="memo"
          value={memo}
          onChange={(e) => setMemo(e.target.value)}
          onBlur={() => void onMemoBlur()}
          rows={2}
          className="mt-2 w-full resize-y rounded-lg border border-stone-300 bg-stone-50 px-3 py-2 text-sm text-stone-800"
          placeholder="例：二次方程式の解の公式"
        />
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <Link
          href={`/practice/new?sessionId=${session.id}`}
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-teal-700 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-600"
        >
          <Camera className="h-4 w-4" />
          同じ内容でもう一度練習する
        </Link>
        {attempts.length >= 2 ? (
          <Link
            href={`/practice/${session.id}/compare`}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-stone-300 bg-white px-4 py-2 text-sm text-stone-700 hover:bg-stone-100"
          >
            <ArrowRightLeft className="h-4 w-4" />
            書き直しを比較する
          </Link>
        ) : (
          <div className="inline-flex min-h-11 items-center justify-center rounded-lg border border-stone-200 bg-stone-50 px-4 py-2 text-sm text-stone-500">
            比較には2枚以上必要です
          </div>
        )}
        <button
          type="button"
          onClick={() => void onDeleteSession()}
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-orange-300 bg-white px-4 py-2 text-sm text-orange-700 hover:bg-orange-50"
        >
          <Trash2 className="h-4 w-4" />
          練習を削除
        </button>
      </div>

      <ul className="space-y-2">
        {attempts.map((attempt, index) => (
          <li key={attempt.id}>
            <AttemptRow
              attempt={attempt}
              orderLabel={index === 0 ? "1回目" : `${index + 1}回目（書き直し後）`}
              onDelete={onDeleteAttempt}
            />
          </li>
        ))}
      </ul>
    </section>
  );
}
