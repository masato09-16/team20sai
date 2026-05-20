import { parseApiErrorResponse } from "@/lib/api/errors";
import { getPublicApiBaseUrl } from "@/lib/env";

export type ReferencePreviewParams = {
  targetText: string;
  width?: number;
  height?: number;
  signal?: AbortSignal;
};

export async function fetchReferencePreviewPng(params: ReferencePreviewParams): Promise<Blob> {
  const res = await fetch(`${getPublicApiBaseUrl()}/reference-preview`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal: params.signal,
    body: JSON.stringify({
      target_text: params.targetText,
      width: params.width ?? 960,
      height: params.height ?? 540,
    }),
  });

  if (!res.ok) {
    const message = await parseApiErrorResponse(res);
    throw new Error(message);
  }
  const blob = await res.blob();
  if (!blob.type.includes("png")) {
    throw new Error("お手本プレビュー画像の取得に失敗しました。");
  }
  return blob;
}
