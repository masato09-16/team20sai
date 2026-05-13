/**
 * ブラウザから呼び出す API のベース URL。
 * 本番では必ず環境変数 `NEXT_PUBLIC_API_URL` を設定してください（ビルド時に埋め込まれます）。
 */
export const FALLBACK_LOCAL_API_URL = "http://127.0.0.1:8000";

export function getPublicApiBaseUrl(): string {
  const base = process.env.NEXT_PUBLIC_API_URL;
  if (!base?.trim()) {
    return FALLBACK_LOCAL_API_URL;
  }
  return base.trim().replace(/\/$/, "");
}
