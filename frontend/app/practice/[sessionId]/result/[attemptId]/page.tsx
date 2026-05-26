import { ResultScreen } from "@/components/result/ResultScreen";

type Props = {
  params: Promise<{ sessionId: string; attemptId: string }>;
};

export default async function PracticeResultPage({ params }: Props) {
  const { sessionId, attemptId } = await params;
  return <ResultScreen sessionId={sessionId} attemptId={attemptId} />;
}
