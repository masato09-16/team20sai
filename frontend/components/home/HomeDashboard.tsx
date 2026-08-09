"use client";

import Link from "next/link";
import {
  BarChart3,
  BookOpenCheck,
  Camera,
  Clock3,
  ClipboardCheck,
  FolderPlus,
  Layers3,
  ShieldCheck,
  Sparkles,
  Target,
} from "lucide-react";
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

const FEATURE_TILES = [
  {
    icon: ClipboardCheck,
    title: "5軸で採点",
    description: "読みやすさ、行、サイズ、間隔、線を見ます。",
    tone: "mint",
  },
  {
    icon: Layers3,
    title: "お手本を重ねる",
    description: "自分の文字の上に薄く表示して、形と行のズレを見比べられます。",
    tone: "violet",
  },
  {
    icon: Target,
    title: "次の練習が分かる",
    description: "弱い項目に合わせた3分メニューを出します。",
    tone: "gold",
  },
] as const;

const PREVIEW_BARS = [
  { label: "読みやすさ", value: 82, className: "bg-brand" },
  { label: "行の揃い方", value: 68, className: "bg-violet-500" },
  { label: "間隔", value: 74, className: "bg-amber-400" },
] as const;

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
      <header className="ui-hero-panel overflow-hidden p-5 sm:p-6">
        <div className="grid gap-6 lg:grid-cols-[1.02fr_0.98fr] lg:items-center">
          <div className="space-y-5">
            <div className="space-y-3">
              <p className="ui-kicker">黒板文字のセルフ診断</p>
              <h1 className="text-3xl font-bold leading-tight text-stone-900 sm:text-4xl">
                板書練習ノート
              </h1>
              <p className="max-w-xl text-sm leading-6 text-stone-600 sm:text-base">
                写真を1枚選ぶだけで、読みやすさ・行の揃い方・余白を見える化。結果画面ではお手本を重ねて、書き直す場所まで確認できます。
              </p>
            </div>

            <div className="flex flex-col gap-2 sm:flex-row">
              <Link href="/practice/new" className="ui-button-primary min-h-12 flex-1 text-base">
                <Camera className="h-5 w-5" />
                写真で診断する
              </Link>
              <Link href="/album" className="ui-button-quiet min-h-12 flex-1">
                <BookOpenCheck className="h-4 w-4" />
                練習記録を見る
              </Link>
            </div>

          </div>

          <div className="ui-hero-visual">
            <div className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-3 text-sm text-white">
              <span className="inline-flex items-center gap-2 font-semibold">
                <Sparkles className="h-4 w-4 text-[#f4c95d]" />
                診断プレビュー
              </span>
              <span className="rounded-full bg-white/15 px-2.5 py-1 text-xs">82点</span>
            </div>
            <div className="space-y-4 p-4">
              <div className="ui-preview-board" aria-label="お手本文字: 板書太郎">
                <p className="ui-preview-chalk">板書太郎</p>
                <div className="pointer-events-none absolute inset-x-6 bottom-7 h-1 rounded-full bg-[#f4c95d]/75" />
              </div>
              <div className="space-y-3">
                {PREVIEW_BARS.map((item) => (
                  <div key={item.label} className="grid grid-cols-[5.5rem_1fr_2.5rem] items-center gap-2 text-xs text-white/80">
                    <span>{item.label}</span>
                    <span className="h-2 overflow-hidden rounded-full bg-white/15">
                      <span className={`block h-full rounded-full ${item.className}`} style={{ width: `${item.value}%` }} />
                    </span>
                    <span className="text-right font-semibold text-white">{item.value}%</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3 lg:col-span-2">
            {FEATURE_TILES.map((item) => {
              const Icon = item.icon;
              return (
                <div key={item.title} className={`ui-feature-tile is-${item.tone}`}>
                  <Icon className="h-4 w-4" />
                  <p className="mt-2 text-sm font-semibold text-stone-800">{item.title}</p>
                  <p className="mt-1 text-xs leading-5 text-stone-600">{item.description}</p>
                </div>
              );
            })}
          </div>
        </div>
      </header>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <Link href={latest ? `/practice/new?sessionId=${latest.session.id}` : "/practice/new"} className="ui-button-secondary">
          <Clock3 className="h-4 w-4" />
          {latest ? "前回の続きを練習する" : "短い練習から始める"}
        </Link>
        <Link href="/album" className="ui-button-quiet">
          保存した練習を見る
        </Link>
      </div>

      <section className="ui-card p-4">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-stone-800">
          <ShieldCheck className="h-4 w-4 text-brand" />
          初回でも迷わない流れ
        </h2>
        <ol className="mt-3 grid grid-cols-1 gap-2 text-sm text-stone-700 sm:grid-cols-4">
          {["写真を撮る", "診断を見る", "お手本を重ねる", "書き直して比べる"].map((label, index) => (
            <li key={label} className="ui-process-step">
              <span>{index + 1}</span>
              <p>{label}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="ui-card p-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-stone-800">
            <BarChart3 className="h-4 w-4 text-sky-600" />
            最近の練習
          </h2>
          {hasRows ? <span className="text-xs text-stone-500">最新5件</span> : null}
        </div>
        {loadError ? <p className="mt-3 text-sm text-orange-700">{loadError}</p> : null}
        {loading ? (
          <div className="mt-3">
            <CardListSkeleton count={3} />
          </div>
        ) : null}
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
                  <Link href={`/album/${session.id}`} className="ui-link-card flex items-center justify-between px-3 py-2">
                    <div>
                      <p className="text-sm font-medium text-stone-800">{session.memo?.trim() || "メモ未入力の練習"}</p>
                      <p className="text-xs text-stone-500">{formatDateTime(session.updatedAt)}</p>
                    </div>
                    <span className="text-sm font-semibold text-brand">{summary}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        ) : null}
      </section>

      <details className="ui-card p-4">
        <summary className="flex cursor-pointer items-center gap-2 text-sm font-semibold text-stone-800">
          <FolderPlus className="h-4 w-4 text-violet-600" />
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
