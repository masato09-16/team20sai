import { parseApiErrorResponse } from "@/lib/api/errors";
import {
  banshoAnalysisResultSchema,
  type BanshoAnalysisResult,
  type BoardType,
  type WritingDirection,
} from "@/lib/api/schemas";
import { getPublicApiBaseUrl } from "@/lib/env";

export type AnalyzeBoardImageOptions = {
  correctedText?: string;
  boardType?: BoardType;
  writingDirection?: WritingDirection;
};

export async function analyzeBoardImage(
  imageBlob: Blob,
  filename = "board.jpg",
  correctedTextOrOptions?: string | AnalyzeBoardImageOptions,
): Promise<BanshoAnalysisResult> {
  const options: AnalyzeBoardImageOptions =
    typeof correctedTextOrOptions === "string"
      ? { correctedText: correctedTextOrOptions }
      : (correctedTextOrOptions ?? {});
  const form = new FormData();
  form.append("file", imageBlob, filename);
  const trimmedCorrection = options.correctedText?.trim();
  if (trimmedCorrection) {
    form.append("corrected_text", trimmedCorrection);
  }
  form.append("board_type", options.boardType ?? "lecture");
  form.append("writing_direction", options.writingDirection ?? "horizontal");

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
