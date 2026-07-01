import { PracticeNewScreen } from "@/components/practice/PracticeNewScreen";

type Props = {
  searchParams: Promise<{ sessionId?: string }>;
};

export default async function PracticeNewPage({ searchParams }: Props) {
  const params = await searchParams;
  return <PracticeNewScreen initialSessionId={params.sessionId} />;
}
