import { banshoAnalysisResultSchema, type BanshoAnalysisResult } from "@/lib/api/schemas";

function getApiBaseUrl(): string {
  const base = process.env.NEXT_PUBLIC_API_URL;
  if (!base) {
    return "http://127.0.0.1:8000";
  }
  return base.replace(/\/$/, "");
}

export async function analyzeBoardImage(imageBlob: Blob): Promise<BanshoAnalysisResult> {
  const form = new FormData();
  form.append("file", imageBlob, "board.jpg");

  const res = await fetch(`${getApiBaseUrl()}/analyze`, {
    method: "POST",
    body: form,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `解析に失敗しました (${res.status})`);
  }

  const json: unknown = await res.json();
  return banshoAnalysisResultSchema.parse(json);
}
