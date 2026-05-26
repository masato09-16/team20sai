import type { AnalysisScores, BanshoAnalysisResult } from "@/lib/api/schemas";

export const MAIN_SCORE_WEIGHTS = {
  readability: 0.35,
  line_alignment: 0.25,
  size_consistency: 0.2,
  spacing_balance: 0.1,
  stroke_quality: 0.1,
} as const;

export function overallScore(scores: AnalysisScores): number {
  return (
    scores.readability * MAIN_SCORE_WEIGHTS.readability +
    scores.line_alignment * MAIN_SCORE_WEIGHTS.line_alignment +
    scores.size_consistency * MAIN_SCORE_WEIGHTS.size_consistency +
    scores.spacing_balance * MAIN_SCORE_WEIGHTS.spacing_balance +
    scores.stroke_quality * MAIN_SCORE_WEIGHTS.stroke_quality
  );
}

export function displayScoreItems(scores: AnalysisScores): Array<{ key: string; label: string; value: number }> {
  return [
    { key: "readability", label: "読みやすさ", value: scores.readability },
    { key: "size_consistency", label: "文字の整い", value: scores.size_consistency },
    { key: "line_alignment", label: "行の揃い方", value: scores.line_alignment },
    { key: "spacing_balance", label: "間隔の見やすさ", value: scores.spacing_balance },
    { key: "stroke_quality", label: "線の安定感", value: scores.stroke_quality },
  ];
}

export function positiveHighlights(result: BanshoAnalysisResult): string[] {
  const s = result.scores;
  const ovr = overallScore(s);
  const picked: string[] = [];
  if (s.line_alignment >= 0.78) picked.push("行が揃っていて、読み進めやすいです。");
  if (s.size_consistency >= 0.78) picked.push("文字の大きさが揃っていて、見た目にまとまりがあります。");
  if (s.spacing_balance >= 0.78) picked.push("字間・行間に余裕があり、板書全体が見やすいです。");
  if (s.stroke_quality >= 0.78) picked.push("線が安定していて、文字の輪郭がはっきり伝わります。");
  if (s.readability >= 0.78) picked.push("全体として読みやすく、黒板で内容が伝わりやすいです。");

  if (picked.length === 0 && ovr < 0.6) {
    return ["今回は改善点を中心に確認すると、次の書き直しにつながりやすいです。"];
  }
  if (picked.length === 0) {
    return ["読み取りやすい要素が出始めています。この調子で整えていきましょう。"];
  }
  return picked.slice(0, 2);
}

export function improvementHints(result: BanshoAnalysisResult): string[] {
  const s = result.scores;
  const hints: string[] = [];
  const threshold = 0.72;
  if (s.readability < threshold) {
    hints.push("潰れた字や詰まりすぎを減らし、1文字ずつ読める形を意識してみましょう。");
  }
  if (s.line_alignment < threshold) {
    hints.push("行の傾きと上下ぶれを抑えて、行の土台をそろえることを意識しましょう。");
  }
  if (s.size_consistency < threshold) {
    hints.push("文字の高さと幅をそろえると、板書全体の安定感が上がります。");
  }
  if (s.spacing_balance < threshold) {
    hints.push("字間と行間に一定の余白を作ると、読み返しやすくなります。");
  }
  if (s.stroke_quality < threshold) {
    hints.push("線が薄い・かすれる場合は、チョーク圧と書く速度を少し整えてみてください。");
  }
  if (hints.length === 0) {
    hints.push("今の書き方を維持しつつ、授業を想定して同じ品質を再現してみましょう。");
  }
  return hints;
}

export function captureAndRecognitionHints(result: BanshoAnalysisResult): string[] {
  const hints: string[] = [];
  if (result.scores.visibility < 0.72) {
    hints.push("撮影品質が低めです。暗さ・ピント・斜め撮影を整えると評価の信頼性が上がります。");
  }
  if (result.ocr_needs_review) {
    hints.push("OCR 文字列は未確定です。必要なら内容を修正して再解析してください。");
  }
  return hints;
}

export function compareMessages(before: AnalysisScores, after: AnalysisScores): string[] {
  const rows: Array<{ key: keyof AnalysisScores; label: string }> = [
    { key: "line_alignment", label: "行の揃い方" },
    { key: "spacing_balance", label: "間隔の見やすさ" },
    { key: "size_consistency", label: "文字の整い" },
    { key: "readability", label: "読みやすさ" },
    { key: "stroke_quality", label: "線の安定感" },
  ];
  const improved = rows
    .map((r) => ({ ...r, delta: after[r.key] - before[r.key] }))
    .filter((r) => r.delta >= 0.04)
    .sort((a, b) => b.delta - a.delta);

  if (improved.length === 0) {
    return ["大きな差はまだ見えません。次は1つの項目に絞って書き直してみましょう。"];
  }
  return improved.slice(0, 2).map((r) => `前回より${r.label}が良くなっています。`);
}
