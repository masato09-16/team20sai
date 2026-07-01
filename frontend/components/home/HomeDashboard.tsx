"use client";

import Link from "next/link";
import { Camera, ChevronRight, Folder, FolderPlus } from "lucide-react";
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

  // アルバム管理用ステート
  const [albumOptions, setAlbumOptions] = useState<string[]>(["新規作成"]);
  const [newAlbumName, setNewAlbumName] = useState("");

  // 初期データ読み込み
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
        if (mounted) setLoadError("保存した練習を読み込めませんでした。");
      } finally {
        if (mounted) setLoading(false);
      }
    };
    
    // アルバムの読み込み
    const savedAlbums = localStorage.getItem("bansho_albums");
    if (savedAlbums) setAlbumOptions(JSON.parse(savedAlbums));
    
    void run();
    return () => { mounted = false; };
  }, []);

  // アルバム作成処理
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
    <section className="space-y-6">
      <header className="space-y-3">
        <p className="text-sm font-semibold tracking-wide text-teal-800">板書練習ノート</p>
        <h1 className="text-2xl font-semibold text-stone-800 sm:text-3xl">
          授業で伝わる板書を、<br />
          書いて、撮って、振り返る。
        </h1>
      </header>

      {/* アルバム作成UI */}
      <div className="rounded-xl border border-stone-200 bg-stone-50 p-4 space-y-3">
        <h2 className="text-sm font-semibold text-stone-800 flex items-center gap-2">
          <FolderPlus className="h-4 w-4 text-teal-700" />
          アルバムを新規作成
        </h2>
        <form onSubmit={handleCreateAlbum} className="flex gap-2">
          <input
            type="text"
            value={newAlbumName}
            onChange={(e) => setNewAlbumName(e.target.value)}
            placeholder="アルバム名を入力"
            className="flex-1 rounded-lg border border-stone-300 px-3 py-2 text-sm focus:border-teal-600 focus:outline-none"
          />
          <button type="submit" className="rounded-lg bg-teal-700 px-4 py-2 text-sm text-white hover:bg-teal-600">作成</button>
        </form>
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <Link
          href={latest ? `/practice/new?sessionId=${latest.session.id}` : "/practice/new"}
          className="flex min-h-14 items-center justify-center gap-2 rounded-lg bg-teal-700 px-4 py-3 text-base font-semibold text-white shadow-sm transition hover:bg-teal-600"
        >
          <Camera className="h-5 w-5" />
          {latest ? "前回の続きを練習する" : "板書を撮影して振り返る"}
        </Link>
        <Link
          href="/album"
          className="flex min-h-14 items-center justify-center rounded-lg border border-stone-300 bg-white px-4 py-3 text-base font-semibold text-stone-700 transition hover:bg-stone-100"
        >
          保存した練習を見る
        </Link>
      </div>

      <section className="rounded-xl border border-stone-200 bg-white p-4 shadow-sm">
        <h2 className="text-sm font-semibold text-stone-800">最近の練習</h2>
        {loading ? <p className="mt-3 text-sm text-stone-500">読み込み中…</p> : null}
        {!loading && !hasRows ? <p className="mt-3 text-sm text-stone-500">記録はありません。</p> : null}
        {!loading && hasRows ? (
          <ul className="mt-3 space-y-2">
            {rows.map(({ session, latestAttempt }) => {
              const summary = latestAttempt?.analysisResult && latestAttempt.analysisStatus === "completed"
                  ? `${Math.round(overallScore(latestAttempt.analysisResult.scores) * 100)}点`
                  : "解析待ち";
              return (
                <li key={session.id}>
                  <Link
                    href={`/album/${session.id}`}
                    className="flex items-center justify-between rounded-lg border border-stone-200 bg-stone-50 px-3 py-2 hover:bg-stone-100"
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
    </section>
  );
}