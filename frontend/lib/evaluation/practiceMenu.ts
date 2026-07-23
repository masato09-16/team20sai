import type { AnalysisScores, BanshoAnalysisResult } from "@/lib/api/schemas";
import { resultOverallScore } from "@/lib/evaluation/viewModel";

type MainScoreKey = "readability" | "line_alignment" | "size_consistency" | "spacing_balance" | "stroke_quality";

type Diagnosis = {
  name: string;
  summary: string;
  focus: string;
};

export type PracticeMenu = {
  title: string;
  duration: string;
  goal: string;
  steps: string[];
  tip: string;
};

const SCORE_LABELS: Record<MainScoreKey, string> = {
  readability: "読みやすさ",
  line_alignment: "行の揃い方",
  size_consistency: "文字サイズ",
  spacing_balance: "字間・行間",
  stroke_quality: "線の安定感",
};

function mainScoreRows(scores: AnalysisScores): Array<{ key: MainScoreKey; label: string; value: number }> {
  return (Object.keys(SCORE_LABELS) as MainScoreKey[]).map((key) => ({
    key,
    label: SCORE_LABELS[key],
    value: scores[key],
  }));
}

export function weakestMainScore(scores: AnalysisScores): { key: MainScoreKey; label: string; value: number } {
  return mainScoreRows(scores).sort((a, b) => a.value - b.value)[0];
}

export function diagnosisForResult(result: BanshoAnalysisResult): Diagnosis {
  const score = resultOverallScore(result);
  if (score >= 0.84) {
    return {
      name: "黒板の建築家タイプ",
      summary: "行・大きさ・余白のバランスがよく、板書全体を組み立てる力があります。",
      focus: "今の安定感を、授業中のスピードでも再現できるか試してみましょう。",
    };
  }

  const weakest = weakestMainScore(result.scores);
  const byWeakness: Record<MainScoreKey, Diagnosis> = {
    readability: {
      name: "伝わり方みがきタイプ",
      summary: "内容は見えてきています。字のつぶれや詰まりを減らすと、さらに伝わりやすくなります。",
      focus: "1文字ずつ読める輪郭を意識する練習が合っています。",
    },
    line_alignment: {
      name: "情熱の右肩上がりタイプ",
      summary: "勢いのある板書です。行の土台をそろえると、読み進めやすさがぐっと上がります。",
      focus: "行の始点と終点をそろえる練習が合っています。",
    },
    size_consistency: {
      name: "巨大文字パワータイプ",
      summary: "見せたい気持ちがしっかり出ています。文字サイズをそろえると、板書全体が整います。",
      focus: "高さと幅をそろえるマス目練習が合っています。",
    },
    spacing_balance: {
      name: "省スペース職人タイプ",
      summary: "情報をぎゅっとまとめる力があります。余白を少し増やすと読み返しやすくなります。",
      focus: "半文字分の余白を作る練習が合っています。",
    },
    stroke_quality: {
      name: "高速板書レーサータイプ",
      summary: "書くリズムがあります。線の濃さと途切れを整えると、文字の輪郭が安定します。",
      focus: "チョーク圧と書く速度を整える練習が合っています。",
    },
  };

  return byWeakness[weakest.key];
}

export function practiceMenuForResult(result: BanshoAnalysisResult): PracticeMenu {
  const weakest = weakestMainScore(result.scores);
  const menus: Record<MainScoreKey, PracticeMenu> = {
    readability: {
      title: "今日の3文字練習",
      duration: "3分",
      goal: "つぶれやすい文字を、1文字ずつ読める形に整える",
      steps: [
        "板書でよく使う漢字を3文字だけ選びます。",
        "1文字をいつもより少し大きく、ゆっくり3回書きます。",
        "2歩下がって、輪郭が読めるか確認します。",
      ],
      tip: "細部よりも、離れて見たときの読みやすさを優先しましょう。",
    },
    line_alignment: {
      title: "水平ライン練習",
      duration: "3分",
      goal: "行の始まりと終わりの高さをそろえる",
      steps: [
        "黒板の端から端へ、薄く1本の基準線を想像します。",
        "短い文を1行だけ書き、最初と最後の高さを比べます。",
        "右上がり・右下がりなら、次の1行で半分だけ戻します。",
      ],
      tip: "完璧な直線より、読み手が追いやすい行の流れを作ることが大事です。",
    },
    size_consistency: {
      title: "マス目サイズ練習",
      duration: "3分",
      goal: "文字の高さと幅をそろえる",
      steps: [
        "見えないマス目を横に5つ並べるつもりで書きます。",
        "5文字だけ同じ高さで書きます。",
        "一番大きい文字と小さい文字を見つけ、次の5文字で差を縮めます。",
      ],
      tip: "文字の上端と下端をそろえるだけで、板書の印象はかなり整います。",
    },
    spacing_balance: {
      title: "半文字スペース練習",
      duration: "3分",
      goal: "字間と行間に読みやすい余白を作る",
      steps: [
        "5文字の短い言葉を選びます。",
        "文字と文字の間に、半文字分の空気を入れるつもりで書きます。",
        "同じ言葉を2回書き、詰まりが減った方を残します。",
      ],
      tip: "余白は空白ではなく、読み手が理解するためのスペースです。",
    },
    stroke_quality: {
      title: "チョーク圧練習",
      duration: "3分",
      goal: "線の濃さと途切れを安定させる",
      steps: [
        "縦線を5本、同じ濃さで書きます。",
        "横線を5本、途中で薄くならないように書きます。",
        "最後に短い言葉を書き、線のかすれが減ったか確認します。",
      ],
      tip: "強く押すより、一定の圧で最後まで書き切ることを意識しましょう。",
    },
  };

  return menus[weakest.key];
}
