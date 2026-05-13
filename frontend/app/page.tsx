import { CameraCapture } from "@/components/CameraCapture";

export default function HomePage() {
  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-10">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">板書上達支援（MVP）</h1>
        <p className="text-sm text-zinc-400">
          カメラで板書を撮影し、バックエンドで解析。水平度・間隔・視認性のフィードバックをオーバーレイ表示します。
        </p>
      </header>
      <CameraCapture />
    </main>
  );
}
