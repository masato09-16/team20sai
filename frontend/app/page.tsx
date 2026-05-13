import { CameraCapture } from "@/components/CameraCapture";

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-[100dvh] max-w-xl flex-col gap-6 px-4 pb-10 pt-6 sm:max-w-lg sm:pt-10 md:max-w-2xl">
      <header className="space-y-1 text-center sm:text-left">
        <h1 className="text-xl font-semibold tracking-tight text-zinc-50 sm:text-2xl">板書チェック</h1>
        <p className="text-sm text-zinc-400">黒板・ホワイトボードの写真を解析し、書き方の改善ヒントを表示します。</p>
      </header>
      <CameraCapture />
    </main>
  );
}
