"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Camera, ChevronRight, Folder } from "lucide-react"; // Folderを追加

import { overallScore } from "@/lib/evaluation/viewModel";
import { listAttemptsBySession, listSessions } from "@/lib/storage/repository";
import type { PracticeAttempt, PracticeSession } from "@/lib/storage/types";
import { formatDateTime } from "@/lib/ui/format";

type Row = {
  session: PracticeSession;
  attempts: PracticeAttempt[];
  albumName?: string; // データを保存する際に付与したアルバム名
};

// ...SessionCard コンポーネントはそのまま...
function SessionCard({ row }: { row: Row }) {
  const latest = row.attempts[row.attempts.length - 1] ?? null;
  const score =
    latest?.analysisResult && latest.analysisStatus === "completed"
      ? `${Math.round(overallScore(latest.analysisResult.scores) * 100)}点`
      : latest?.analysisStatus === "error" ? "解析エラー" : "解析待ち";

  return (
    <Link href={`/album/${row.session.id}`} className="block rounded-lg border border-stone-200 bg-white p-3 shadow-sm hover:bg-stone-50">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-stone-800">{row.session.memo?.trim() || "メモ未入力の練習"}</p>
          <p className="text-xs text-stone-500">{formatDateTime(row.session.updatedAt)}</p>
          {row.albumName && <span className="inline-block mt-1 px-2 py-0.5 rounded-full bg-teal-50 text-[10px] text-teal-800">{row.albumName}</span>}
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
  const [albums, setAlbums] = useState<string[]>([]); // アルバムリスト
  const [selectedAlbum, setSelectedAlbum] = useState("すべて"); // フィルタ用
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // データの読み込み
    const savedAlbums = JSON.parse(localStorage.getItem("bansho_albums") || "[]");
    setAlbums(["すべて", ...savedAlbums]);

    const run = async () => {
      const sessions = await listSessions();
      // ここで本来は各セッションがどのアルバムに属するかを判定する必要があります
      // ※現在はまだ紐付け保存が未実装なため、動作確認用にアルバム名をダミーで付与しています
      const next = await Promise.all(
        sessions.map(async (session) => ({ 
          session, 
          attempts: await listAttemptsBySession(session.id),
          albumName: "未分類" // 今後保存処理と連携させる箇所
        })),
      );
      setRows(next);
      setLoading(false);
    };
    void run();
  }, []);

  // フィルタリング
  const filteredRows = useMemo(() => {
    if (selectedAlbum === "すべて") return rows;
    return rows.filter(r => r.albumName === selectedAlbum);
  }, [rows, selectedAlbum]);

  return (
    <section className="space-y-4">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold text-stone-800">練習アルバム</h1>
      </header>

      {/* アルバム選択UI */}
      <div className="flex items-center gap-2 p-2 border rounded-lg bg-stone-50">
        <Folder className="h-4 w-4 text-stone-500" />
        <select 
          value={selectedAlbum} 
          onChange={(e) => setSelectedAlbum(e.target.value)}
          className="bg-transparent text-sm focus:outline-none"
        >
          {albums.map(a => <option key={a} value={a}>{a}</option>)}
        </select>
      </div>

      {!loading && filteredRows.map((row) => (
        <SessionCard key={row.session.id} row={row} />
      ))}
    </section>
  );
}