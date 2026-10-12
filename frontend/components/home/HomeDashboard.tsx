"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { 
  Camera, 
  BarChart3, 
  Sparkles, 
  ChevronRight, 
  Sprout 
} from "lucide-react";

interface PracticeStats {
  hasData: boolean;
  totalCount: number;
  overallScore: number;
  title: string;
  subtitle: string;
}

export function HomeDashboard() {
  const [stats, setStats] = useState<PracticeStats>({
    hasData: false,
    totalCount: 0,
    overallScore: 0,
    title: "まずは1枚写真を撮って、",
    subtitle: "診断してみましょう！",
  });

  useEffect(() => {
    try {
      const rawData = localStorage.getItem("bansho_history");
      if (!rawData) return;

      const records = JSON.parse(rawData);
      if (!Array.isArray(records) || records.length === 0) return;

      const count = records.length;
      let sumOverall = 0;

      records.forEach((r: any) => {
        sumOverall += Number(r.display_score ?? r.overall_score ?? r.score ?? 0);
      });

      const avgOverall = Math.round(sumOverall / count);

      let title = "少しずつで、\n確実に上達しています！";
      let subtitle = "このまま、自分のペースでがんばりましょう。";

      if (avgOverall >= 80) {
        title = "素晴らしい安定感！\n高い完成度を維持しています";
        subtitle = "教室の隅からでもよく伝わる見事な板書です。";
      } else if (avgOverall < 60) {
        title = "文字と行のバランスを\n意識してみましょう！";
        subtitle = "診断のアドバイスを参考に書き直してみましょう。";
      }

      setStats({
        hasData: true,
        totalCount: count,
        overallScore: avgOverall,
        title,
        subtitle,
      });
    } catch (error) {
      console.error("Failed to load bansho history:", error);
    }
  }, []);

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
            <div className="flex h-full w-full flex-col items-center justify-center rounded-lg border border-emerald-500/30 bg-[#1b432a]">
              <span className="font-serif text-3xl sm:text-4xl font-extrabold tracking-widest text-emerald-50 drop-shadow-[0_2px_4px_rgba(0,0,0,0.6)]">
                板書
              </span>
              <div className="mt-1.5 h-0.5 w-20 bg-amber-200/70 rounded-full" />
            </div>

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

      {/* 3. あなたの練習状況（バーグラフを廃止し、2カラム構成に最適化） */}
      <div className="space-y-3">
        <div className="flex items-center gap-2 text-sm font-bold text-emerald-200">
          <BarChart3 className="h-4 w-4 text-emerald-300" />
          <h2>
            あなたの練習状況
            {stats.hasData && (
              <span className="ml-2 text-xs font-normal text-emerald-200/80">
                （計 {stats.totalCount} 回の平均）
              </span>
            )}
          </h2>
        </div>

        <div className="grid grid-cols-1 gap-6 rounded-2xl border border-stone-200 bg-white p-6 text-stone-800 shadow-md md:grid-cols-12 md:items-center">
          
          {/* 左：全体の総合スコア */}
          <div className="flex items-center gap-6 border-b border-stone-100 pb-5 md:col-span-6 md:border-b-0 md:border-r md:pb-0 md:pr-6">
            <div className="relative flex h-24 w-24 shrink-0 items-center justify-center rounded-full border-4 border-emerald-500 bg-emerald-50/50 shadow-inner">
              <span className="text-2xl font-black text-stone-800">
                {stats.hasData ? `${stats.overallScore}%` : "-"}
              </span>
            </div>
            <div className="space-y-1">
              <p className="text-xs font-bold tracking-wider text-stone-400 uppercase">総合スコア平均</p>
              <p className="text-3xl font-black text-stone-800">
                {stats.hasData ? stats.overallScore : "--"} 
                <span className="text-base font-normal text-stone-500"> / 100</span>
              </p>
              {stats.hasData && (
                <p className="text-xs text-emerald-700 font-medium">
                  累計 {stats.totalCount} 回の練習データを反映中
                </p>
              )}
            </div>
          </div>

          {/* 右：メッセージ */}
          <div className="flex items-center gap-4 md:col-span-6 md:pl-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
              <Sprout className="h-7 w-7" />
            </div>
            <div>
              <p className="text-sm font-bold whitespace-pre-line text-stone-800 leading-snug">
                {stats.title}
              </p>
              <p className="mt-1 text-xs text-stone-500 leading-relaxed">
                {stats.subtitle}
              </p>
            </div>
          </div>

        </div>
      </div>

      {/* 4. 練習の流れ */}
      <div className="space-y-3">
        <div className="flex items-center gap-2 text-sm font-bold text-emerald-200">
          <Sparkles className="h-4 w-4 text-emerald-300" />
          <h2>初回でも迷わない練習の流れ</h2>
        </div>

        <div className="rounded-2xl border border-stone-200 bg-white p-4 shadow-md sm:p-5">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            
            <Link
              href="/practice/new"
              className="flex items-center gap-3 rounded-xl border border-stone-100 bg-stone-50/80 px-4 py-3.5 transition-colors hover:border-emerald-200 hover:bg-emerald-50/60"
            >
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-xs font-bold text-white shadow-sm">
                1
              </div>
              <span className="text-sm font-bold text-stone-700">写真を撮る</span>
            </Link>

            <Link
              href="/album"
              className="flex items-center gap-3 rounded-xl border border-stone-100 bg-stone-50/80 px-4 py-3.5 transition-colors hover:border-emerald-200 hover:bg-emerald-50/60"
            >
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-xs font-bold text-white shadow-sm">
                2
              </div>
              <span className="text-sm font-bold text-stone-700">診断を見る</span>
            </Link>

            <Link
              href="/album"
              className="flex items-center gap-3 rounded-xl border border-stone-100 bg-stone-50/80 px-4 py-3.5 transition-colors hover:border-emerald-200 hover:bg-emerald-50/60"
            >
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-xs font-bold text-white shadow-sm">
                3
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