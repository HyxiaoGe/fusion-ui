import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Fusion 管理中心',
  robots: { index: false, follow: false },
};

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return children;
}
