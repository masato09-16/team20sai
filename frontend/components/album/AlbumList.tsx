"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Camera, ChevronRight, Folder } from "lucide-react";

import { EmptyState } from "@/components/ui/EmptyState";
import { CardListSkeleton } from "@/components/ui/PageSkeletons";
import { resultDisplayScore } from "@/lib/evaluation/viewModel";
import { listAttemptsBySession, listSessions } from "@/lib/storage/repository";
import type { PracticeAttempt, PracticeSession } from "@/lib/storage/types";
import { formatDateTime } from "@/lib/ui/format";

type Row = {
  session: PracticeSession;
  attempts: PracticeAttempt[];
  albumName: string;
};

function normalizeAlbumName(value?: string | null): string {
  return value?.trim() || "未分類";
}

function parseSavedAlbums(): string[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem("bansho_albums") || "[]");
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === "string" && v.trim().length > 0) : [];
  } catch {
    return [];
  }
}

function SessionCard({ row }: { row: Row }) {
  const latest = row.attempts[row.attempts.length - 1] ?? null;
  const score =
    latest?.analysisResult && latest.analysisStatus === "completed"
      ? `${resultDisplayScore(latest.analysisResult)}点`
      : latest?.analysisStatus === "error" ? "解析エラー" : "解析待ち";

  const hasMemo = Boolean(row.session.memo?.trim());

  return (
    <Link href={`/album/${row.session.id}`} className="ui-link-card block p-3.5">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 flex-1 space-y-1">
          {/* 1行目: 日時 と アルバム名 */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium text-stone-500">
              {formatDateTime(row.session.updatedAt)}
            </span>
            <span className="rounded-full bg-teal-50 px-2 py-0.5 text-[11px] font-medium text-teal-800 border border-teal-200/70">
              {row.albumName}
            </span>
          </div>

          {/* 2行目: メモ（入力されている場合のみ表示） */}
          {hasMemo ? (
            <p className="truncate text-sm font-semibold text-stone-800">
              {row.session.memo}
            </p>
          ) : null}
        </div>

        {/* 右側: スコアと矢印 */}
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-sm font-bold text-teal-700">{score}</span>
          <ChevronRight className="h-4 w-4 text-stone-400" />
        </div>
      </div>
    </Link>
  );
}

export function AlbumList() {
  const [rows, setRows] = useState<Row[]>([]);
  const [albums, setAlbums] = useState<string[]>([]);
  const [selectedAlbum, setSelectedAlbum] = useState("すべて");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const savedAlbums = parseSavedAlbums();

    const run = async () => {
      const sessions = await listSessions();
      const next = await Promise.all(
        sessions.map(async (session) => ({
          session,
          attempts: await listAttemptsBySession(session.id),
          albumName: normalizeAlbumName(session.albumName),
        })),
      );
      const actualAlbums = next.map((row) => row.albumName);
      setAlbums(["すべて", ...Array.from(new Set(["未分類", ...savedAlbums, ...actualAlbums]))]);
      setRows(next);
      setLoading(false);
    };
    void run();
  }, []);

  // フィルタリング
  const filteredRows = useMemo(() => {
    if (selectedAlbum === "すべて") return rows;
    return rows.filter((r) => r.albumName === selectedAlbum);
  }, [rows, selectedAlbum]);

  return (
    <section className="space-y-4">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold text-white drop-shadow-sm">練習アルバム</h1>
      </header>

      <div className="ui-card-compact flex items-center gap-2 p-2">
        <Folder className="h-4 w-4 text-stone-500" />
        <select
          value={selectedAlbum}
          onChange={(e) => setSelectedAlbum(e.target.value)}
          className="min-w-0 bg-transparent text-sm focus:outline-none"
        >
          {albums.map((a) => (
            <option key={a} value={a}>{a}</option>
          ))}
        </select>
      </div>

      {loading ? <CardListSkeleton count={4} /> : null}
      {!loading && filteredRows.length === 0 ? (
        <EmptyState
          icon={Camera}
          title={rows.length === 0 ? "練習記録はまだありません" : "このアルバムにはまだ記録がありません"}
          description="黒板写真を1枚診断すると、ここから振り返りや書き直し比較を始められます。"
          action={
            <Link href="/practice/new" className="ui-button-primary">
              最初の写真を診断する
            </Link>
          }
        />
      ) : null}
      {!loading && filteredRows.map((row) => (
        <SessionCard key={row.session.id} row={row} />
      ))}
    </section>
  );
}