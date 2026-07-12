import { cn } from '@/lib/utils';
import Image from 'next/image';
import React, { useState } from 'react';

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
  const [imageFailed, setImageFailed] = useState(false);
  const normalizedProviderId = providerId.trim().toLowerCase();
  const iconKey = PROVIDER_ICON_ALIASES[normalizedProviderId] ?? normalizedProviderId;
  const hasKnownIcon = KNOWN_PROVIDER_ICONS.has(iconKey);
  const iconPath = `/assets/providers/${iconKey}.svg`;
  const fallbackLabel = (normalizedProviderId[0] || '?').toUpperCase();
  
  return (
    <span
      className={cn(
        "relative inline-flex flex-shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted text-muted-foreground",
        className,
      )}
      style={{ width: size, height: size }}
    >
      {hasKnownIcon && !imageFailed ? (
        <Image
          src={iconPath}
          alt={`${providerId} icon`}
          width={size}
          height={size}
          className="object-contain"
          onError={() => {
            console.warn(`Provider icon not found for: ${providerId}`);
            setImageFailed(true);
          }}
        />
      ) : (
        <span
          className="flex h-full w-full items-center justify-center text-[10px] font-semibold leading-none"
          aria-label={`${providerId} icon`}
        >
          {fallbackLabel}
        </span>
      )}
    </span>
  );
};

const KNOWN_PROVIDER_ICONS = new Set([
  'anthropic',
  'deepseek',
  'google',
  'minimax',
  'moonshot',
  'openai',
  'qwen',
  'volcengine',
  'xai',
  'xiaomi',
]);

const PROVIDER_ICON_ALIASES: Record<string, string> = {
  alibaba: 'qwen',
  aliqwen: 'qwen',
  bytedance: 'volcengine',
  dashscope: 'qwen',
  doubao: 'volcengine',
  gemini: 'google',
  'google-ai': 'google',
  grok: 'xai',
  kimi: 'moonshot',
};

export default ProviderIcon;
