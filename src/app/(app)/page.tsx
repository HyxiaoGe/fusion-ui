'use client';

import { Suspense } from 'react';
import HomeChatSurface from '@/components/home/HomeChatSurface';

export default function Home() {
  return (
    <Suspense fallback={null}>
      <HomeChatSurface />
    </Suspense>
  );
}
