"use client";

import React, { useState } from "react";

export default function PracticePreview() {
  const [opacity, setOpacity] = useState(0.5);
  const [userImage, setUserImage] = useState<string | null>(null);
  const [aiImage, setAiImage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
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
      console.error("アップロードエラー:", error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 p-8 text-white font-sans">
      <div className="max-w-4xl mx-auto space-y-6 text-center">
        <h1 className="text-3xl font-extrabold text-emerald-400">
          AI 添削ヒートマップ（実演デモ版）
        </h1>
        <p className="text-slate-400">
          自分の文字の写真をアップロードして、お手本を重ねる実演ができます
        </p>

        <div className="relative aspect-video w-full bg-black rounded-2xl overflow-hidden border-4 border-slate-800 shadow-2xl">
          
          {userImage ? (
            <img
              src={userImage}
              alt="自分の文字"
              className="absolute inset-0 w-full h-full object-contain"
            />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center text-slate-500">
              下のボタンから文字の写真をアップロードしてください
            </div>
          )}

          {loading && (
            <div className="absolute inset-0 bg-black/80 flex items-center justify-center text-emerald-400 animate-pulse text-xl">
              AIが画像から文字を解析中...
            </div>
          )}

          {aiImage && !loading && (
            <img
              src={aiImage}
              alt="AIのお手本"
              className="absolute inset-0 w-full h-full object-contain transition-opacity duration-300"
              style={{ opacity: opacity }}
            />
          )}
        </div>

        <div className="bg-slate-900 p-6 rounded-2xl border border-slate-800 space-y-6">
          
          <div className="flex justify-center">
            <input
              type="file"
              accept="image/*"
              onChange={handleImageChange}
              className="block text-sm text-slate-400
                file:mr-4 file:py-2 file:px-4
                file:rounded-full file:border-0
                file:text-sm file:font-semibold
                file:bg-emerald-500 file:text-white
                hover:file:bg-emerald-600 cursor-pointer"
            />
          </div>

          <div className="space-y-2">
            <input
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={opacity}
              onChange={(e) => setOpacity(parseFloat(e.target.value))}
              disabled={!aiImage}
              className="w-full h-3 bg-slate-800 rounded-lg cursor-pointer accent-emerald-500 disabled:opacity-30"
            />
            <p className="text-emerald-400 font-mono text-xl">
              お手本の透過率: {Math.round(opacity * 100)}%
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}