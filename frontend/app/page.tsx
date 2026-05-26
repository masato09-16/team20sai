import { CameraCapture } from "@/components/CameraCapture";

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-[100dvh] w-full max-w-3xl flex-col gap-6 px-4 pb-12 pt-6 sm:px-6 sm:pt-8">
      <header className="space-y-1 text-center sm:text-left">
        <h1 className="text-2xl font-semibold tracking-tight text-stone-800 sm:text-3xl">板書練習ノート</h1>
        <p className="text-sm text-stone-600">撮影して、今回の読みやすさと次に意識することを確認しましょう。</p>
      </header>
      <CameraCapture />
    </main>
  );
}
