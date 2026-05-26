export type PreparedImage = {
  blob: Blob;
  mimeType: string;
  width: number;
  height: number;
};

type PrepareOptions = {
  maxEdge?: number;
  quality?: number;
  mimeType?: "image/jpeg" | "image/webp";
};

function loadImageFromBlob(blob: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("画像の読み込みに失敗しました。"));
    };
    img.src = url;
  });
}

function blobFromCanvas(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error("画像の変換に失敗しました。"));
          return;
        }
        resolve(blob);
      },
      type,
      quality,
    );
  });
}

export async function prepareImageForStorageAndAnalysis(
  input: Blob,
  options: PrepareOptions = {},
): Promise<PreparedImage> {
  const maxEdge = options.maxEdge ?? 1600;
  const quality = options.quality ?? 0.9;
  const targetType = options.mimeType ?? "image/jpeg";

  const img = await loadImageFromBlob(input);
  const long = Math.max(img.width, img.height);
  const scale = long > maxEdge ? maxEdge / long : 1;
  const width = Math.max(1, Math.round(img.width * scale));
  const height = Math.max(1, Math.round(img.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("画像処理コンテキストを作成できませんでした。");
  }
  ctx.drawImage(img, 0, 0, width, height);
  const blob = await blobFromCanvas(canvas, targetType, quality);
  return {
    blob,
    mimeType: targetType,
    width,
    height,
  };
}
