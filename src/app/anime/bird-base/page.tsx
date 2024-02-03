'use client';

import dynamic from 'next/dynamic';

const BirdBase = dynamic(() => import('./BirdBase'), { ssr: false });
export default function BirdBasePage() {
  return (
    <div>
      <BirdBase />
      <div>123+456</div>
    </div>
  );
}
