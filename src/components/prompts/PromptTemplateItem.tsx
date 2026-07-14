'use client';

import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import React from 'react';

export interface PromptTemplateListItem {
  id?: number | string;
  title: string;
  content: string;
  category: string;
  isSystem?: boolean;
  updatedAt?: Date | string;
}

interface PromptTemplateItemProps {
  template: PromptTemplateListItem;
  onClick: () => void;
  isSelected?: boolean;
}

const PromptTemplateItem: React.FC<PromptTemplateItemProps> = ({
  template,
  onClick,
  isSelected = false,
}) => {
  // 截取内容预览（最多100个字符）
  const contentPreview =
    template.content.length > 100
      ? `${template.content.substring(0, 100)}...`
      : template.content;

  return (
    <Card
      className={cn(
        'cursor-pointer transition-colors hover:bg-accent',
        isSelected && 'border-primary'
      )}
      onClick={onClick}
    >
      <CardContent className="p-4">
        <div className="flex justify-between items-start mb-2">
          <h3 className="font-medium">{template.title}</h3>
          <span className="text-xs px-2 py-1 rounded-full bg-secondary text-secondary-foreground">
            {template.category}
          </span>
        </div>
        <p className="text-sm text-muted-foreground line-clamp-2">{contentPreview}</p>
        <div className="flex justify-between items-center mt-2">
          <span className="text-xs text-muted-foreground">
            {template.isSystem ? '系统模板' : '自定义模板'}
          </span>
          {template.updatedAt ? (
            <span className="text-xs text-muted-foreground">
              {new Date(template.updatedAt).toLocaleDateString()}
            </span>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
};

export default PromptTemplateItem;
