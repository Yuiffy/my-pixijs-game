import { getAllLiverIds } from '@/data/livers';
import LiverPageClient from './LiverPageClient';

export function generateStaticParams() {
  return getAllLiverIds().map(liverId => ({ liverId }));
}

export default function LiverPage({ params }: { params: { liverId: string } }) {
  return <LiverPageClient liverId={params.liverId} />;
}
