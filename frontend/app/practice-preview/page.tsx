"use client";

import { ImageUp } from "lucide-react";
import { type ChangeEvent, useState } from "react";

export default function PracticePreview() {
  const [opacity, setOpacity] = useState(0.5);
  const [userImage, setUserImage] = useState<string | null>(null);
  const [aiImage, setAiImage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleImageChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const localUrl = URL.createObjectURL(file);
    setUserImage(localUrl);
    setAiImage(null);
    setLoading(true);

    const formData = new FormData();
    formData.append("userImage", file);

    try {
      const response = await fetch("/api/heat-map", {
        method: "POST",
        body: formData,
      });
      const data = await response.json();

      if (data.success) {
        setAiImage(data.imageUrl);
      }
    } catch (error) {
      console.error("画像プレビューの生成に失敗しました:", error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen px-4 py-8 text-ink-900">
      <div className="mx-auto max-w-4xl space-y-5">
        <header className="ui-card-hero space-y-3 p-5 text-center sm:p-6">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-700">Practice preview</p>
          <h1 className="text-2xl font-semibold tracking-tight text-ink-900 sm:text-3xl">お手本との重なりを確認する</h1>
          <p className="mx-auto max-w-2xl text-sm leading-7 text-stone-600">
            黒板写真を読み込み、生成されたお手本ガイドとのずれを半透明で確認します。
          </p>
        </header>

        <section className="ui-card space-y-4 p-4">
          <div className="relative aspect-video w-full overflow-hidden rounded-lg border border-canvas-line bg-ink-900 shadow-soft">
            {userImage ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={userImage} alt="アップロードした黒板写真" className="absolute inset-0 h-full w-full object-contain" />
            ) : (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-ink-900 text-center text-stone-300">
                <span className="ui-empty-illustration border-stone-700 bg-ink-800 text-stone-200">
                  <ImageUp className="h-5 w-5" />
                </span>
                <p className="max-w-xs text-sm leading-6">下のボタンから黒板写真を選ぶと、ここにプレビューが表示されます。</p>
              </div>
            )}

            {loading ? (
              <div className="absolute inset-0 flex items-center justify-center bg-paper/88 p-6 backdrop-blur-sm">
                <div className="w-full max-w-sm space-y-3 rounded-lg border border-canvas-line bg-paper p-4 shadow-soft">
                  <div className="ui-skeleton h-4 w-40" />
                  <div className="ui-skeleton h-20 w-full" />
                  <p className="text-xs text-stone-600">お手本ガイドを生成しています...</p>
                </div>
              </div>
            ) : null}

            {aiImage && !loading ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={aiImage}
                alt="生成されたお手本ガイド"
                className="absolute inset-0 h-full w-full object-contain transition-opacity duration-300"
                style={{ opacity }}
              />
            ) : null}
          </div>

          <div className="ui-card-compact space-y-4 p-4">
            <div className="flex justify-center">
              <input
                type="file"
                accept="image/*"
                onChange={handleImageChange}
                className="block cursor-pointer text-sm text-stone-600 file:mr-4 file:rounded-full file:border-0 file:bg-brand file:px-4 file:py-2 file:text-sm file:font-semibold file:text-white hover:file:bg-brand-600"
              />
            </div>

            <div className="space-y-2">
              <input
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={opacity}
                onChange={(event) => setOpacity(parseFloat(event.target.value))}
                disabled={!aiImage}
                className="h-3 w-full cursor-pointer rounded-lg bg-stone-200 accent-brand disabled:cursor-not-allowed disabled:opacity-35"
              />
              <p className="text-center font-mono text-lg font-semibold text-brand-700">お手本の透明度 {Math.round(opacity * 100)}%</p>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
