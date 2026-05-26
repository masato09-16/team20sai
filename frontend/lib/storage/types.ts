import type { BanshoAnalysisResult } from "@/lib/api/schemas";

export type AnalysisStatus = "pending" | "analyzing" | "completed" | "error";

export type PracticeSession = {
  id: string;
  createdAt: string;
  updatedAt: string;
  memo: string | null;
};

export type PracticeAttempt = {
  id: string;
  sessionId: string;
  createdAt: string;
  imageBlob: Blob;
  imageMimeType: string;
  originalFilename: string | null;
  analysisResult: BanshoAnalysisResult | null;
  analysisStatus: AnalysisStatus;
  analysisError: string | null;
  originalRecognizedText: string | null;
  correctedText: string | null;
  evaluationVersion: "v1";
};

export type SessionWithAttempts = {
  session: PracticeSession;
  attempts: PracticeAttempt[];
};
