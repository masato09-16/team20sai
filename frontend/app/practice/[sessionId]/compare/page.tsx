import { CompareScreen } from "@/components/compare/CompareScreen";

type Props = {
  params: Promise<{ sessionId: string }>;
};

export default async function ComparePage({ params }: Props) {
  const { sessionId } = await params;
  return <CompareScreen sessionId={sessionId} />;
}
