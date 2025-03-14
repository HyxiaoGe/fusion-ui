'use client';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAppDispatch, useAppSelector } from '@/redux/hooks';
import {
  initializeTemplates,
  setSelectedTemplate
} from '@/redux/slices/promptTemplatesSlice';
import { PlusIcon, Search } from 'lucide-react';
import React, { useEffect, useState } from 'react';
import PromptTemplateItem from './PromptTemplateItem';

interface PromptTemplateListProps {
  onSelectTemplate?: (content: string) => void;
  onCreateNew?: () => void;
}

const PromptTemplateList: React.FC<PromptTemplateListProps> = ({
  onSelectTemplate,
  onCreateNew,
}) => {
  const dispatch = useAppDispatch();
  const { templates, categories, isLoading, error } = useAppSelector(
    (state) => state.promptTemplates
  );
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');

  useEffect(() => {
    dispatch(initializeTemplates());
  }, [dispatch]);

  const handleCategoryChange = (value: string) => {
    setSelectedCategory(value);
  };

  const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchTerm(e.target.value);
  };

  const handleTemplateClick = (templateId: number) => {
    dispatch(setSelectedTemplate(templateId));
    const template = templates.find((t) => t.id === templateId);
    if (template && onSelectTemplate) {
      onSelectTemplate(template.content);
    }
  };

  const handleCreateClick = () => {
    if (onCreateNew) {
      onCreateNew();
    }
  };

  // 过滤模板
  const filteredTemplates = templates.filter(
    (template) =>
      (selectedCategory === 'all' || template.category === selectedCategory) &&
      (searchTerm === '' ||
        template.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
        template.content.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-bold">提示词模板</h2>
        <Button onClick={handleCreateClick} size="sm">
          <PlusIcon className="h-4 w-4 mr-2" />
          新建模板
        </Button>
      </div>

      <div className="relative mb-4">
        <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="搜索模板..."
          value={searchTerm}
          onChange={handleSearch}
          className="pl-8"
        />
      </div>

      <Tabs
        defaultValue="all"
        value={selectedCategory}
        onValueChange={handleCategoryChange}
        className="flex-1 flex flex-col"
      >
        <TabsList className="w-full justify-start overflow-x-auto">
          <TabsTrigger value="all">全部</TabsTrigger>
          {categories.map((category) => (
            <TabsTrigger key={category} value={category}>
              {category}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value={selectedCategory} className="flex-1 overflow-y-auto mt-4">
          {isLoading ? (
            <div className="flex items-center justify-center h-full">
              <p>加载中...</p>
            </div>
          ) : filteredTemplates.length > 0 ? (
            <div className="grid gap-3">
              {filteredTemplates.map((template) => (
                <PromptTemplateItem
                  key={template.id}
                  template={template}
                  onClick={() => handleTemplateClick(template.id!)}
                />
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-center">
              <p className="text-muted-foreground mb-4">
                {searchTerm
                  ? '没有找到匹配的模板'
                  : selectedCategory === 'all'
                  ? '还没有创建模板'
                  : `${selectedCategory} 分类中还没有模板`}
              </p>
              <Button variant="outline" onClick={handleCreateClick}>
                创建新模板
              </Button>
            </div>
          )}
        </TabsContent>
      </Tabs>

      {error && <p className="text-destructive mt-2">{error}</p>}
    </div>
  );
};

export default PromptTemplateList;