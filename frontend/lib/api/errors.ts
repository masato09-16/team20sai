/** FastAPI の HTTPException / バリデーションエラー本文をユーザー向け日本語メッセージに近づける */

function detailToMessage(detail: unknown): string | null {
  if (typeof detail === "string") {
    return detail;
  }
  if (Array.isArray(detail)) {
    const parts = detail
      .map((item) => {
        if (item && typeof item === "object" && "msg" in item && typeof (item as { msg: unknown }).msg === "string") {
          return (item as { msg: string }).msg;
        }
        return null;
      })
      .filter(Boolean) as string[];
    if (parts.length) {
      return parts.join(" / ");
    }
  }
  return null;
}

export async function parseApiErrorResponse(res: Response): Promise<string> {
  const text = await res.text();
  if (!text.trim()) {
    return `サーバーから応答がありません（${res.status}）`;
  }
  try {
    const json: unknown = JSON.parse(text);
    if (json && typeof json === "object" && "detail" in json) {
      const msg = detailToMessage((json as { detail: unknown }).detail);
      if (msg) return msg;
    }
  } catch {
    // テキストのまま返す
  }
  if (res.status === 401 || res.status === 403) {
    return "アクセスが拒否されました。環境設定を確認してください。";
  }
  if (res.status >= 500) {
    return "サーバーでエラーが発生しました。しばらくしてから再度お試しください。";
  }
  return text.length > 200 ? `${text.slice(0, 200)}…` : text;
}
