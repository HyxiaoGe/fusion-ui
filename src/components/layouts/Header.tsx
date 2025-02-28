'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { SettingsIcon, HomeIcon } from 'lucide-react';

const Header: React.FC = () => {
  const pathname = usePathname();
  
  return (
    <header className="h-14 border-b flex items-center justify-between px-4">
      <Link href="/" className="text-xl font-bold">AI助手</Link>
      
      <div className="flex items-center gap-2">
        <Link href="/" passHref>
          <Button variant={pathname === '/' ? 'default' : 'ghost'} size="icon">
            <HomeIcon className="h-5 w-5" />
          </Button>
        </Link>
        <Link href="/settings" passHref>
          <Button variant={pathname === '/settings' ? 'default' : 'ghost'} size="icon">
            <SettingsIcon className="h-5 w-5" />
          </Button>
        </Link>
      </div>
    </header>
  );
};

export default Header;