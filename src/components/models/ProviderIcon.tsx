import { cn } from '@/lib/utils';
import Image from 'next/image';
import React from 'react';

interface ProviderIconProps {
  providerId: string;
  className?: string;
  size?: number;
}

const ProviderIcon: React.FC<ProviderIconProps> = ({ 
  providerId, 
  className,
  size = 20 
}) => {
  const iconPath = `/assets/providers/${providerId}.svg`;
  
  return (
    <div className={cn("relative flex-shrink-0", className)} style={{ width: size, height: size }}>
      <Image 
        src={iconPath}
        alt={`${providerId} icon`}
        width={size}
        height={size}
        className="object-contain"
        onError={(e) => {
          // 图标加载失败时的回退处理
          console.warn(`Provider icon not found for: ${providerId}`);
          (e.target as HTMLImageElement).style.display = 'none';
        }}
      />
    </div>
  );
};

export default ProviderIcon;