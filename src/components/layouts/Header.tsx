'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { SettingsIcon, HomeIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

const Header: React.FC = () => {
  const pathname = usePathname();
  
  return (
    <header className="h-14 border-b flex items-center justify-between px-5 sticky top-0 z-10 shadow-sm">
      <Link href="/" className="text-xl font-bold flex items-center">
        <span>AI助手</span>
      </Link>
      
      <div className="flex items-center gap-2">
        <Link href="/" passHref>
          <Button 
            variant={pathname === '/' ? 'default' : 'ghost'} 
            size="icon" 
            className={cn("h-9 w-9 rounded-full shadow-sm")}
          >
            <HomeIcon className="h-4 w-4" />
          </Button>
        </Link>
        <Link href="/settings" passHref>
          <Button 
            variant={pathname === '/settings' ? 'default' : 'ghost'} 
            size="icon" 
            className={cn("h-9 w-9 rounded-full shadow-sm")} 
          >
            <SettingsIcon className="h-4 w-4" />
          </Button>
        </Link>
      </div>
    </header>
  );
};

export default Header;