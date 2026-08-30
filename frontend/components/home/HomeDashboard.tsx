"use client";

import Link from "next/link";
import { 
  Camera, 
  BarChart3, 
  Sparkles, 
  ChevronRight, 
  Sprout 
} from "lucide-react";

export function HomeDashboard() {
  const stats = {
    overallScore: 82,
    readability: 82,
    lineAlignment: 68,
    spacing: 74,
  };

  return (
    <div className="mx-auto max-w-5xl space-y-8 px-4 py-6 text-white">
      
      {/* 1. ヒーローセクション */}
      <div className="flex flex-col justify-between gap-6 md:flex-row md:items-center">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-white drop-shadow-sm sm:text-4xl">
            書く力を、<br />
            確かなチカラに。
          </h1>
          <p className="mt-2 text-sm text-emerald-100/90 leading-relaxed sm:text-base">
            板書練習ノートは、写真で手書き文字を読み取り、<br />
            5軸で診断してあなたの練習をサポートします。
          </p>
        </div>

        {/* 黒板イラスト */}
        <div className="flex items-center justify-center self-center md:mr-6 md:self-auto">
          <div className="relative h-28 w-56 sm:h-32 sm:w-64 rounded-xl border-4 border-amber-950 bg-[#143520] p-1.5 shadow-2xl">
            {/* 黒板の内枠ライン */}
            <div className="flex h-full w-full flex-col items-center justify-center rounded-lg border border-emerald-500/30 bg-[#1b432a]">
              <span className="font-serif text-3xl sm:text-4xl font-extrabold tracking-widest text-emerald-50 drop-shadow-[0_2px_4px_rgba(0,0,0,0.6)]">
                板書
              </span>
              <div className="mt-1.5 h-0.5 w-20 bg-amber-200/70 rounded-full" />
            </div>

            {/* チョーク受け */}
            <div className="absolute -bottom-2.5 left-1/2 flex -translate-x-1/2 items-center gap-2 rounded bg-amber-950 px-4 py-0.5 shadow-md">
              <div className="h-1.5 w-5 rounded-full bg-white shadow-sm" />
              <div className="h-1.5 w-3.5 rounded-full bg-amber-300 shadow-sm" />
              <div className="h-1.5 w-3.5 rounded-full bg-red-400 shadow-sm" />
            </div>
          </div>
        </div>
      </div>

      {/* 2. メインCTAボタン */}
      <div>
        <Link
          href="/practice/new"
          className="group relative flex min-h-[120px] items-center justify-between overflow-hidden rounded-2xl border border-emerald-400/30 bg-gradient-to-r from-emerald-600 via-teal-600 to-teal-700 p-6 text-white shadow-lg transition-transform hover:-translate-y-1 hover:shadow-xl sm:p-8"
        >
          <div className="flex items-center gap-6">
            <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-white text-teal-700 shadow-md sm:h-20 sm:w-20">
              <Camera className="h-8 w-8 sm:h-10 sm:w-10" />
            </div>
            <div className="space-y-1">
              <h2 className="text-xl font-bold tracking-wide sm:text-2xl">今すぐ写真で診断する</h2>
              <p className="text-xs font-medium text-emerald-100 sm:text-sm">板書を撮るだけで、すぐに診断・フィードバック</p>
            </div>
          </div>
          <ChevronRight className="h-8 w-8 text-emerald-200 transition-transform group-hover:translate-x-1.5" />
        </Link>
      </div>

      {/* 3. あなたの練習状況 */}
      <div className="space-y-3">
        <div className="flex items-center gap-2 text-sm font-bold text-emerald-200">
          <BarChart3 className="h-4 w-4 text-emerald-300" />
          <h2>あなたの練習状況</h2>
        </div>

        <div className="grid grid-cols-1 gap-4 rounded-2xl border border-stone-200 bg-white p-6 text-stone-800 shadow-md md:grid-cols-12 md:items-center">
          
          {/* 左：全体の総合スコア */}
          <div className="flex items-center gap-5 border-b border-stone-100 pb-4 md:col-span-4 md:border-b-0 md:border-r md:pb-0 md:pr-4">
            <div className="relative flex h-20 w-20 shrink-0 items-center justify-center rounded-full border-4 border-emerald-500 bg-emerald-50/50">
              <span className="text-xl font-black text-stone-800">{stats.overallScore}%</span>
            </div>
            <div>
              <p className="text-xs font-semibold text-stone-500">全体の総合スコア</p>
              <p className="text-2xl font-black text-stone-800">{stats.overallScore} <span className="text-sm font-normal text-stone-500">/ 100</span></p>
            </div>
          </div>

          {/* 中央：バーグラフ */}
          <div className="space-y-3 border-b border-stone-100 pb-4 md:col-span-5 md:border-b-0 md:border-r md:pb-0 md:px-4">
            <div className="flex items-center gap-2 text-xs">
              <span className="w-16 shrink-0 font-medium text-stone-600">読みやすさ</span>
              <div className="h-2.5 w-full overflow-hidden rounded-full bg-stone-100">
                <div className="h-full rounded-full bg-emerald-500" style={{ width: `${stats.readability}%` }} />
              </div>
              <span className="w-8 shrink-0 text-right font-bold text-stone-700">{stats.readability}%</span>
            </div>

            <div className="flex items-center gap-2 text-xs">
              <span className="w-16 shrink-0 font-medium text-stone-600">行の揃い方</span>
              <div className="h-2.5 w-full overflow-hidden rounded-full bg-stone-100">
                <div className="h-full rounded-full bg-purple-500" style={{ width: `${stats.lineAlignment}%` }} />
              </div>
              <span className="w-8 shrink-0 text-right font-bold text-stone-700">{stats.lineAlignment}%</span>
            </div>

            <div className="flex items-center gap-2 text-xs">
              <span className="w-16 shrink-0 font-medium text-stone-600">間隔</span>
              <div className="h-2.5 w-full overflow-hidden rounded-full bg-stone-100">
                <div className="h-full rounded-full bg-amber-400" style={{ width: `${stats.spacing}%` }} />
              </div>
              <span className="w-8 shrink-0 text-right font-bold text-stone-700">{stats.spacing}%</span>
            </div>
          </div>

          {/* 右：メッセージ */}
          <div className="flex items-start gap-3 md:col-span-3 md:pl-2">
            <Sprout className="h-7 w-7 shrink-0 text-emerald-600" />
            <div>
              <p className="text-xs font-bold text-stone-800">少しずつで、<br />確実に上達しています！</p>
              <p className="mt-1 text-[11px] leading-snug text-stone-500">このまま、自分のペースでがんばりましょう。</p>
            </div>
          </div>

        </div>
      </div>

      {/* 4. 練習の流れ（ステップ形式） */}
      <div className="space-y-3">
        <div className="flex items-center gap-2 text-sm font-bold text-emerald-200">
          <Sparkles className="h-4 w-4 text-emerald-300" />
          <h2>初回でも迷わない練習の流れ</h2>
        </div>

        <div className="rounded-2xl border border-stone-200 bg-white p-4 shadow-md sm:p-5">
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
            
            {/* ① 写真を撮る */}
            <Link
              href="/practice/new"
              className="flex items-center gap-3 rounded-xl border border-stone-100 bg-stone-50/80 px-4 py-3 transition-colors hover:border-emerald-200 hover:bg-emerald-50/60"
            >
              <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-xs font-bold text-white shadow-sm">
                1
              </div>
              <span className="text-sm font-bold text-stone-700">写真を撮る</span>
            </Link>

            {/* ② 診断を見る */}
            <Link
              href="/album"
              className="flex items-center gap-3 rounded-xl border border-stone-100 bg-stone-50/80 px-4 py-3 transition-colors hover:border-emerald-200 hover:bg-emerald-50/60"
            >
              <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-xs font-bold text-white shadow-sm">
                2
              </div>
              <span className="text-sm font-bold text-stone-700">診断を見る</span>
            </Link>

            {/* ③ お手本を重ねる */}
            <Link
              href="/album"
              className="flex items-center gap-3 rounded-xl border border-stone-100 bg-stone-50/80 px-4 py-3 transition-colors hover:border-emerald-200 hover:bg-emerald-50/60"
            >
              <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-xs font-bold text-white shadow-sm">
                3
              </div>
              <span className="text-sm font-bold text-stone-700">お手本を重ねる</span>
            </Link>

            {/* ④ 書き直して比べる */}
            <Link
              href="/album"
              className="flex items-center gap-3 rounded-xl border border-stone-100 bg-stone-50/80 px-4 py-3 transition-colors hover:border-emerald-200 hover:bg-emerald-50/60"
            >
              <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-xs font-bold text-white shadow-sm">
                4
              </div>
              <span className="text-sm font-bold text-stone-700">書き直して比べる</span>
            </Link>

          </div>
        </div>
      </div>

    </div>
  );
}

export default HomeDashboard;