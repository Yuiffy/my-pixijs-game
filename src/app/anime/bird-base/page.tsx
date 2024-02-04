'use client';

import dynamic from 'next/dynamic';

const BirdBase = dynamic(() => import('./BirdBase'), { ssr: false });
export default function BirdBasePage() {
  return (
    <BirdBase />
  );
}
