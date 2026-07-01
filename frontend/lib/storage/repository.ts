import type { BanshoAnalysisResult } from "@/lib/api/schemas";
import { openPracticeDb } from "@/lib/storage/practiceDb";
import type { PracticeAttempt, PracticeSession } from "@/lib/storage/types";

const MAX_RECENT_SESSIONS = 100;

function nowIso(): string {
  return new Date().toISOString();
}

function randomId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

export async function createSession(memo: string | null): Promise<PracticeSession> {
  const db = await openPracticeDb();
  const now = nowIso();
  const session: PracticeSession = {
    id: randomId("sess"),
    createdAt: now,
    updatedAt: now,
    memo: memo?.trim() || null,
  };
  await db.put("sessions", session);
  return session;
}

export async function createSessionWithAttempt(args: {
  memo: string | null;
  imageBlob: Blob;
  imageMimeType: string;
  originalFilename?: string | null;
}): Promise<{ session: PracticeSession; attempt: PracticeAttempt }> {
  const db = await openPracticeDb();
  const now = nowIso();
  const session: PracticeSession = {
    id: randomId("sess"),
    createdAt: now,
    updatedAt: now,
    memo: args.memo?.trim() || null,
  };
  const attempt: PracticeAttempt = {
    id: randomId("att"),
    sessionId: session.id,
    createdAt: now,
    imageBlob: args.imageBlob,
    imageMimeType: args.imageMimeType,
    originalFilename: args.originalFilename ?? null,
    analysisResult: null,
    analysisStatus: "pending",
    analysisError: null,
    originalRecognizedText: null,
    correctedText: null,
    evaluationVersion: "v1",
  };
  const tx = db.transaction(["sessions", "attempts"], "readwrite");
  await tx.objectStore("sessions").put(session);
  await tx.objectStore("attempts").put(attempt);
  await tx.done;
  return { session, attempt };
}

export async function getSession(sessionId: string): Promise<PracticeSession | null> {
  const db = await openPracticeDb();
  return (await db.get("sessions", sessionId)) ?? null;
}

export async function updateSessionMemo(sessionId: string, memo: string | null): Promise<void> {
  const db = await openPracticeDb();
  const current = await db.get("sessions", sessionId);
  if (!current) return;
  current.memo = memo?.trim() || null;
  current.updatedAt = nowIso();
  await db.put("sessions", current);
}

async function touchSession(sessionId: string): Promise<void> {
  const db = await openPracticeDb();
  const current = await db.get("sessions", sessionId);
  if (!current) return;
  current.updatedAt = nowIso();
  await db.put("sessions", current);
}

export async function listSessions(limit = MAX_RECENT_SESSIONS): Promise<PracticeSession[]> {
  const db = await openPracticeDb();
  const all = await db.getAll("sessions");
  all.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return all.slice(0, limit);
}

export async function createAttempt(args: {
  sessionId: string;
  imageBlob: Blob;
  imageMimeType: string;
  originalFilename?: string | null;
}): Promise<PracticeAttempt> {
  const db = await openPracticeDb();
  const attempt: PracticeAttempt = {
    id: randomId("att"),
    sessionId: args.sessionId,
    createdAt: nowIso(),
    imageBlob: args.imageBlob,
    imageMimeType: args.imageMimeType,
    originalFilename: args.originalFilename ?? null,
    analysisResult: null,
    analysisStatus: "pending",
    analysisError: null,
    originalRecognizedText: null,
    correctedText: null,
    evaluationVersion: "v1",
  };
  await db.put("attempts", attempt);
  await touchSession(args.sessionId);
  return attempt;
}

export async function getAttempt(attemptId: string): Promise<PracticeAttempt | null> {
  const db = await openPracticeDb();
  return (await db.get("attempts", attemptId)) ?? null;
}

export async function listAttemptsBySession(sessionId: string): Promise<PracticeAttempt[]> {
  const db = await openPracticeDb();
  const range = IDBKeyRange.bound([sessionId, ""], [sessionId, "\uffff"]);
  const rows = await db.getAllFromIndex("attempts", "by_sessionId_createdAt", range);
  rows.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  return rows;
}

export async function setAttemptAnalyzing(attemptId: string): Promise<void> {
  const db = await openPracticeDb();
  const current = await db.get("attempts", attemptId);
  if (!current) return;
  current.analysisStatus = "analyzing";
  current.analysisError = null;
  await db.put("attempts", current);
  await touchSession(current.sessionId);
}

export async function setAttemptCompleted(args: {
  attemptId: string;
  result: BanshoAnalysisResult;
  correctedText?: string | null;
}): Promise<void> {
  const db = await openPracticeDb();
  const current = await db.get("attempts", args.attemptId);
  if (!current) return;

  const recognized = args.result.recognized_text?.trim() || null;
  current.analysisStatus = "completed";
  current.analysisError = null;
  current.analysisResult = args.result;
  if (!current.originalRecognizedText) {
    current.originalRecognizedText = recognized;
  }
  current.correctedText = args.correctedText?.trim() || null;
  await db.put("attempts", current);
  await touchSession(current.sessionId);
}

export async function setAttemptError(attemptId: string, errorMessage: string): Promise<void> {
  const db = await openPracticeDb();
  const current = await db.get("attempts", attemptId);
  if (!current) return;
  current.analysisStatus = "error";
  current.analysisError = errorMessage;
  await db.put("attempts", current);
  await touchSession(current.sessionId);
}

export async function deleteAttempt(attemptId: string): Promise<{ sessionDeleted: boolean; sessionId: string | null }> {
  const db = await openPracticeDb();
  const current = await db.get("attempts", attemptId);
  if (!current) return { sessionDeleted: false, sessionId: null };

  await db.delete("attempts", attemptId);
  const rest = await listAttemptsBySession(current.sessionId);
  if (rest.length === 0) {
    await db.delete("sessions", current.sessionId);
    return { sessionDeleted: true, sessionId: current.sessionId };
  }
  await touchSession(current.sessionId);
  return { sessionDeleted: false, sessionId: current.sessionId };
}

export async function deleteSession(sessionId: string): Promise<void> {
  const db = await openPracticeDb();
  const tx = db.transaction(["sessions", "attempts"], "readwrite");
  const idx = tx.objectStore("attempts").index("by_sessionId");
  let cursor = await idx.openCursor(sessionId);
  while (cursor) {
    await cursor.delete();
    cursor = await cursor.continue();
  }
  await tx.objectStore("sessions").delete(sessionId);
  await tx.done;
}

export async function clearAllData(): Promise<void> {
  const db = await openPracticeDb();
  const tx = db.transaction(["sessions", "attempts"], "readwrite");
  await tx.objectStore("attempts").clear();
  await tx.objectStore("sessions").clear();
  await tx.done;
}
