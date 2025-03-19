'use client';

import { cn } from '@/lib/utils';
import React, { useEffect, useRef, useState } from 'react';

interface ResizableSidebarProps {
  children: React.ReactNode;
  className?: string;
  defaultWidth?: number;
  minWidth?: number;
  maxWidth?: number;
}

const ResizableSidebar: React.FC<ResizableSidebarProps> = ({
  children,
  className,
  defaultWidth = 240,
  minWidth = 180,
  maxWidth = 400,
}) => {
  const [width, setWidth] = useState(defaultWidth);
  const sidebarRef = useRef<HTMLDivElement>(null);
  const resizeRef = useRef<HTMLDivElement>(null);
  const [isResizing, setIsResizing] = useState(false);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing) return;
      
      const newWidth = e.clientX;
      if (newWidth >= minWidth && newWidth <= maxWidth) {
        setWidth(newWidth);
      }
    };

    const handleMouseUp = () => {
      setIsResizing(false);
      document.body.style.cursor = 'default';
      document.body.style.userSelect = '';
    };

    if (isResizing) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing, minWidth, maxWidth]);

  const startResizing = () => {
    setIsResizing(true);
    document.body.style.cursor = 'ew-resize';
    document.body.style.userSelect = 'none';
  };

  return (
    <div 
      ref={sidebarRef} 
      className={cn("relative border-r bg-slate-50 dark:bg-slate-900 overflow-y-auto", className)}
      style={{ width: `${width}px` }}
    >
      {children}
      
      <div
        ref={resizeRef}
        className="absolute top-0 right-0 h-full w-1 cursor-ew-resize hover:bg-primary/50 group"
        onMouseDown={startResizing}
      >
        <div className="absolute right-0 h-full w-1 opacity-0 group-hover:opacity-100 bg-primary/50"></div>
      </div>
    </div>
  );
};

export default ResizableSidebar;