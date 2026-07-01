import { openDB, type DBSchema, type IDBPDatabase } from "idb";

import type { PracticeAttempt, PracticeSession } from "@/lib/storage/types";

type PracticeStoreSchema = {
  sessions: {
    key: string;
    value: PracticeSession;
    indexes: {
      by_updatedAt: string;
      by_createdAt: string;
    };
  };
  attempts: {
    key: string;
    value: PracticeAttempt;
    indexes: {
      by_sessionId: string;
      by_createdAt: string;
      by_sessionId_createdAt: [string, string];
    };
  };
};

interface PracticeDb extends DBSchema, PracticeStoreSchema {}

const DB_NAME = "bansho-practice-db";
const DB_VERSION = 1;

let dbPromise: Promise<IDBPDatabase<PracticeDb>> | null = null;

export function openPracticeDb(): Promise<IDBPDatabase<PracticeDb>> {
  if (!dbPromise) {
    dbPromise = openDB<PracticeDb>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains("sessions")) {
          const sessions = db.createObjectStore("sessions", { keyPath: "id" });
          sessions.createIndex("by_updatedAt", "updatedAt");
          sessions.createIndex("by_createdAt", "createdAt");
        }
        if (!db.objectStoreNames.contains("attempts")) {
          const attempts = db.createObjectStore("attempts", { keyPath: "id" });
          attempts.createIndex("by_sessionId", "sessionId");
          attempts.createIndex("by_createdAt", "createdAt");
          attempts.createIndex("by_sessionId_createdAt", ["sessionId", "createdAt"]);
        }
      },
    });
  }
  return dbPromise;
}
