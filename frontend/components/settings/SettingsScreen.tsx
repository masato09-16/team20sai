"use client";

import { useState } from "react";
import { AlertTriangle, Trash2 } from "lucide-react";

import { clearAllData } from "@/lib/storage/repository";

export function SettingsScreen() {
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const onClearAll = async () => {
    const ok = window.confirm("保存した画像と評価結果をすべて削除します。よろしいですか？");
    if (!ok) return;
    setWorking(true);
    setMessage(null);
    try {
      await clearAllData();
      setMessage("保存データをすべて削除しました。");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "削除に失敗しました。";
      setMessage(msg);
    } finally {
      setWorking(false);
    }
  };

  return (
    <section className="space-y-4">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold text-stone-800">設定・データ管理</h1>
      </header>

      <div className="space-y-3 rounded-xl border border-stone-200 bg-white p-4 shadow-sm">
        <p className="text-sm text-stone-700">
          保存した画像と評価結果は、このブラウザ内に保存されます。解析時には選択した画像が解析APIへ送信されます。
        </p>
        <p className="text-sm text-stone-700">個人情報を含む黒板写真は保存しないよう注意してください。</p>
      </div>

      <div className="space-y-3 rounded-xl border border-orange-200 bg-orange-50 p-4">
        <p className="text-sm font-medium text-orange-900">データ削除</p>
        <button
          type="button"
          onClick={onClearAll}
          disabled={working}
          className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-orange-300 bg-white px-4 py-2 text-sm font-medium text-orange-700 hover:bg-orange-100 disabled:opacity-50"
        >
          {working ? <AlertTriangle className="h-4 w-4 animate-pulse" /> : <Trash2 className="h-4 w-4" />}
          すべての保存データを削除する
        </button>
        {message ? <p className="text-sm text-orange-800">{message}</p> : null}
      </div>
    </section>
  );
}
