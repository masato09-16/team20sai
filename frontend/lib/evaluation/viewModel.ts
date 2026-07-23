import type {
  AnalysisScores,
  BanshoAnalysisResult,
  BoardType,
  FixedRuleScoring,
  WritingDirection,
} from "@/lib/api/schemas";

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

export const BOARD_TYPE_LABELS: Record<BoardType, string> = {
  lecture: "講義型",
  exercise: "演習型",
  idea: "アイデア型",
  summary: "まとめ型",
  display: "掲示型",
};

export const WRITING_DIRECTION_LABELS: Record<WritingDirection, string> = {
  horizontal: "横書き",
  vertical: "縦書き",
  mixed: "混在",
};

export function resultDisplayScore(result: BanshoAnalysisResult): number {
  return result.scoring?.display_score ?? Math.round(overallScore(result.scores) * 100);
}

export function resultOverallScore(result: BanshoAnalysisResult): number {
  return result.scoring?.overall ?? overallScore(result.scores);
}

export function fixedRuleScoreItems(
  scoring: FixedRuleScoring,
): Array<{ key: keyof FixedRuleScoring["axes"]; label: string; value: number }> {
  return [
    { key: "visibility", label: "見やすさ", value: scoring.axes.visibility },
    { key: "stability", label: "文字と行の安定", value: scoring.axes.stability },
    { key: "block_organization", label: "まとまり", value: scoring.axes.block_organization },
    { key: "margin_interference", label: "余白と干渉", value: scoring.axes.margin_interference },
  ];
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
    hints.push("まず3文字だけ選び、1文字ずつ輪郭が読める大きさで書いてみましょう。");
  }
  if (s.line_alignment < threshold) {
    hints.push("1行書く前に始点と終点の高さを決め、書き終えたら2歩下がって傾きを確認しましょう。");
  }
  if (s.size_consistency < threshold) {
    hints.push("5文字ごとに文字の上端と下端を見直し、高さの差を小さくしてみましょう。");
  }
  if (s.spacing_balance < threshold) {
    hints.push("文字と文字の間を、今より半文字分だけ広げるつもりで書いてみましょう。");
  }
  if (s.stroke_quality < threshold) {
    hints.push("線が薄い・かすれる部分は、チョークを少し寝かせて一定の速さで書いてみましょう。");
  }
  if (hints.length === 0) {
    hints.push("今の書き方を維持しつつ、60秒で同じ読みやすさを再現できるか試してみましょう。");
  }
  return hints;
}

export function captureAndRecognitionHints(result: BanshoAnalysisResult): string[] {
  const hints: string[] = [];
  if (result.scores.visibility < 0.72) {
    hints.push("撮影品質が低めです。暗さ・ピント・斜め撮影を整えると評価の信頼性が上がります。");
  }
  if (result.ocr_needs_review) {
    hints.push("OCR 文字列は未確定です。必要なら内容を修正して確認し直してください。");
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
    return ["今回は大きな変化は見られませんでした。次は「行を揃えること」に絞って書いてみましょう。"];
  }
  return improved.slice(0, 2).map((r) => `前回より${r.label}が良くなっています。`);
}
