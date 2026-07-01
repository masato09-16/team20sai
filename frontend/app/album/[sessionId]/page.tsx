import { SessionDetail } from "@/components/album/SessionDetail";

type Props = {
  params: Promise<{ sessionId: string }>;
};

export default async function SessionDetailPage({ params }: Props) {
  const { sessionId } = await params;
  return <SessionDetail sessionId={sessionId} />;
}
