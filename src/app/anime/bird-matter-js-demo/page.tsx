'use client';

import dynamic from 'next/dynamic';

const BirdComponent = dynamic(() => import('./BirdMatterJsDemo'), { ssr: false });
export default function Page() {
  return (
    <BirdComponent />
  );
}
