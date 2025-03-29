'use client';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { HomeIcon, SettingsIcon } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import React from 'react';

const Header: React.FC = () => {
  const pathname = usePathname();
  
  return (
    <header className="h-14 border-b flex items-center justify-between px-5 sticky top-0 z-10 shadow-sm">
      <Link href="/" className="text-xl font-bold flex items-center">
        <span className="bg-gradient-to-r from-blue-600 via-purple-500 to-pink-500 text-transparent bg-clip-text">Fusion AI</span>
      </Link>
      
      {/* <div className="flex-1 max-w-lg mx-4">
        <GlobalSearch />
      </div> */}

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