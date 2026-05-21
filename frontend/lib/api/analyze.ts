import { parseApiErrorResponse } from "@/lib/api/errors";
import { banshoAnalysisResultSchema, type BanshoAnalysisResult } from "@/lib/api/schemas";
import { getPublicApiBaseUrl } from "@/lib/env";

export async function analyzeBoardImage(
  imageBlob: Blob,
  filename = "board.jpg",
  correctedText?: string,
): Promise<BanshoAnalysisResult> {
  const form = new FormData();
  form.append("file", imageBlob, filename);
  const trimmedCorrection = correctedText?.trim();
  if (trimmedCorrection) {
    form.append("corrected_text", trimmedCorrection);
  }

  const res = await fetch(`${getPublicApiBaseUrl()}/analyze`, {
    method: "POST",
    body: form,
  });

  if (!res.ok) {
    const message = await parseApiErrorResponse(res);
    throw new Error(message);
  }

  const json: unknown = await res.json();
  try {
    return banshoAnalysisResultSchema.parse(json);
  } catch {
    throw new Error("サーバーからのデータ形式が想定と異なります。API のバージョンを確認してください。");
  }
}
