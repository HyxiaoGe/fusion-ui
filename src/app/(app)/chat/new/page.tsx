'use client';

import { Suspense } from 'react';
import HomeChatSurface from '@/components/home/HomeChatSurface';

export default function NewChatPage() {
  return (
    <Suspense fallback={null}>
      <HomeChatSurface />
    </Suspense>
  );
}
