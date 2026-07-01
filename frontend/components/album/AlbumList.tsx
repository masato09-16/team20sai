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
    // 1. 作成済みのアルバム一覧を取得
    const savedAlbums = JSON.parse(localStorage.getItem("bansho_albums") || "[]");
    setAlbums(["すべて", ...savedAlbums]);

    // 2. 撮影画面 (CameraCapture) で保存した履歴データを取得してセットする
    const run = async () => {
      try {
        const savedHistory = JSON.parse(localStorage.getItem("bansho_history") || "[]");
        
        // 撮影画面の履歴（SavedHistoryItem）の形を、SessionCard が読める Row の形に変換する
        const next: Row[] = savedHistory.map((item: any) => ({
   session: {
  id: item.id,
  memo: item.targetText || "メモ未入力の練習",
  updatedAt: new Date().toISOString(), 
},
attempts: [
  {
    id: item.id,
    sessionId: item.id,
    imageBlob: null,
    analysisStatus: "completed",
    analysisResult: {
      scores: {
        horizontalness: item.score / 100,
        spacing_uniformity: item.score / 100,
        size_consistency: item.score / 100,
        visibility: item.score / 100,
      },
      mode: "ocr",
      recognized_text: item.recognizedText,
    } as any,
    createdAt: new Date().toISOString(), // ⭕️ 修正
    updatedAt: new Date().toISOString(), // ⭕️ 修正
  }
],
          albumName: item.albumName || "未分類" // ★これで選択したアルバム名が正しく入ります！
        }));

        setRows(next);
      } catch {
        setLoadError("保存した練習を読み込めませんでした。");
      } finally {
        setLoading(false);
      }
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