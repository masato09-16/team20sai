"use client";

import Link from "next/link";
import { Camera, ChartNoAxesColumn, Clock3, ClipboardCheck, FolderPlus, ShieldCheck, Target } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { EmptyState } from "@/components/ui/EmptyState";
import { CardListSkeleton } from "@/components/ui/PageSkeletons";
import { resultDisplayScore } from "@/lib/evaluation/viewModel";
import { listAttemptsBySession, listSessions } from "@/lib/storage/repository";
import type { PracticeAttempt, PracticeSession } from "@/lib/storage/types";
import { formatDateTime } from "@/lib/ui/format";

type RecentRow = {
  session: PracticeSession;
  latestAttempt: PracticeAttempt | null;
};

function parseAlbumOptions(): string[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem("bansho_albums") || "[]");
    const saved = Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === "string" && v.trim().length > 0) : [];
    return Array.from(new Set(["未分類", ...saved]));
  } catch {
    return ["未分類"];
  }
}

export function HomeDashboard() {
  const [rows, setRows] = useState<RecentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [albumOptions, setAlbumOptions] = useState<string[]>(["未分類"]);
  const [newAlbumName, setNewAlbumName] = useState("");

  useEffect(() => {
    let mounted = true;
    const run = async () => {
      try {
        setAlbumOptions(parseAlbumOptions());
        const sessions = await listSessions(5);
        const pairs = await Promise.all(
          sessions.map(async (s) => {
            const attempts = await listAttemptsBySession(s.id);
            return { session: s, latestAttempt: attempts[attempts.length - 1] ?? null };
          }),
        );
        if (mounted) setRows(pairs);
      } catch {
        if (mounted) setLoadError("保存した練習を読み込めませんでした。");
      } finally {
        if (mounted) setLoading(false);
      }
    };

    void run();
    return () => {
      mounted = false;
    };
  }, []);

  const handleCreateAlbum = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newAlbumName.trim();
    if (!trimmed || albumOptions.includes(trimmed)) return;

    const updatedAlbums = [...albumOptions, trimmed];
    setAlbumOptions(updatedAlbums);
    localStorage.setItem("bansho_albums", JSON.stringify(updatedAlbums));
    setNewAlbumName("");
  };

  const hasRows = rows.length > 0;
  const latest = useMemo(() => rows[0] ?? null, [rows]);

  return (
    <section className="space-y-5">
      <header className="ui-card-hero space-y-5 p-5 sm:p-6">
        <div className="max-w-2xl space-y-2">
          <p className="text-sm font-semibold tracking-wide text-teal-800">板書練習ノート</p>
          <h1 className="text-2xl font-semibold leading-tight text-stone-900 sm:text-3xl">
            黒板文字を撮って、読みやすさをすぐ診断。
          </h1>
          <p className="text-sm leading-6 text-stone-600">
            登録なしで始められます。写真を1枚選ぶだけで、良い点・直す点・次の3分練習まで確認できます。
          </p>
        </div>

        <Link
          href="/practice/new"
          className="ui-button-primary min-h-14 w-full text-base"
        >
          <Camera className="h-5 w-5" />
          登録なしで診断する
        </Link>

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <div className="ui-card-compact px-3 py-3">
            <ClipboardCheck className="h-4 w-4 text-teal-700" />
            <p className="mt-2 text-sm font-medium text-stone-800">5軸で採点</p>
            <p className="mt-1 text-xs leading-5 text-stone-600">読みやすさ、行、サイズ、間隔、線を見ます。</p>
          </div>
          <div className="ui-card-compact px-3 py-3">
            <Target className="h-4 w-4 text-teal-700" />
            <p className="mt-2 text-sm font-medium text-stone-800">次の練習が分かる</p>
            <p className="mt-1 text-xs leading-5 text-stone-600">弱い項目に合わせた3分メニューを出します。</p>
          </div>
          <div className="ui-card-compact px-3 py-3">
            <ChartNoAxesColumn className="h-4 w-4 text-teal-700" />
            <p className="mt-2 text-sm font-medium text-stone-800">書き直しを比較</p>
            <p className="mt-1 text-xs leading-5 text-stone-600">前回より良くなった点を数字で確認できます。</p>
          </div>
        </div>
      </header>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <Link
          href={latest ? `/practice/new?sessionId=${latest.session.id}` : "/practice/new"}
          className="ui-button-secondary"
        >
          <Clock3 className="h-4 w-4" />
          {latest ? "前回の続きを練習する" : "短い練習から始める"}
        </Link>
        <Link
          href="/album"
          className="ui-button-quiet"
        >
          保存した練習を見る
        </Link>
      </div>

      <section className="ui-card p-4">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-stone-800">
          <ShieldCheck className="h-4 w-4 text-teal-700" />
          初回でも迷わない流れ
        </h2>
        <ol className="mt-3 grid grid-cols-1 gap-2 text-sm text-stone-700 sm:grid-cols-4">
          {["写真を撮る", "診断を見る", "3分練習する", "書き直して比べる"].map((label, index) => (
            <li key={label} className="ui-card-compact px-3 py-2">
              <span className="text-xs font-semibold text-teal-700">{index + 1}</span>
              <p className="mt-1 font-medium">{label}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="ui-card p-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-stone-800">最近の練習</h2>
          {hasRows ? <span className="text-xs text-stone-500">最新5件</span> : null}
        </div>
        {loadError ? <p className="mt-3 text-sm text-orange-700">{loadError}</p> : null}
        {loading ? <div className="mt-3"><CardListSkeleton count={3} /></div> : null}
        {!loading && !hasRows ? (
          <div className="mt-3">
            <EmptyState
              icon={Camera}
              title="まだ練習記録はありません"
              description="最初の1枚を診断すると、ここに書き直しの記録が積み上がります。"
              action={
                <Link href="/practice/new" className="ui-button-secondary">
                  写真を診断する
                </Link>
              }
            />
          </div>
        ) : null}
        {!loading && hasRows ? (
          <ul className="mt-3 space-y-2">
            {rows.map(({ session, latestAttempt }) => {
              const summary =
                latestAttempt?.analysisResult && latestAttempt.analysisStatus === "completed"
                  ? `${resultDisplayScore(latestAttempt.analysisResult)}点`
                  : latestAttempt?.analysisStatus === "error"
                    ? "解析エラー"
                    : "解析待ち";
              return (
                <li key={session.id}>
                  <Link
                    href={`/album/${session.id}`}
                    className="ui-link-card flex items-center justify-between px-3 py-2"
                  >
                    <div>
                      <p className="text-sm font-medium text-stone-800">{session.memo?.trim() || "メモ未入力の練習"}</p>
                      <p className="text-xs text-stone-500">{formatDateTime(session.updatedAt)}</p>
                    </div>
                    <span className="text-sm font-semibold text-teal-700">{summary}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        ) : null}
      </section>

      <details className="ui-card p-4">
        <summary className="flex cursor-pointer items-center gap-2 text-sm font-semibold text-stone-800">
          <FolderPlus className="h-4 w-4 text-teal-700" />
          記録整理用のアルバムを作る
        </summary>
        <form onSubmit={handleCreateAlbum} className="mt-3 flex gap-2">
          <input
            type="text"
            value={newAlbumName}
            onChange={(e) => setNewAlbumName(e.target.value)}
            placeholder="例：教育実習、数学板書など"
            className="ui-input min-w-0 flex-1 px-3 py-2 text-sm"
          />
          <button type="submit" className="ui-button-primary min-h-10 px-4 py-2">
            作成
          </button>
        </form>
      </details>
    </section>
  );
}
