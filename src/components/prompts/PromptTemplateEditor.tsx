'use client';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { PromptTemplate } from '@/lib/db/promptTemplates';
import { useAppDispatch } from '@/redux/hooks';
import {
  createTemplate,
  removeTemplate,
  updateTemplate,
} from '@/redux/slices/promptTemplatesSlice';
import { Trash } from 'lucide-react';
import React, { useEffect, useState } from 'react';

interface PromptTemplateEditorProps {
  template?: PromptTemplate;
  categories: string[];
  isOpen: boolean;
  onClose: () => void;
  onAddCategory?: (category: string) => void;
}

const PromptTemplateEditor: React.FC<PromptTemplateEditorProps> = ({
  template,
  categories,
  isOpen,
  onClose,
  onAddCategory,
}) => {
  const dispatch = useAppDispatch();
  const isEditing = !!template?.id;

  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [category, setCategory] = useState('');
  const [newCategory, setNewCategory] = useState('');
  const [showNewCategory, setShowNewCategory] = useState(false);
  const [error, setError] = useState<Record<string, string>>({});

  useEffect(() => {
    if (template) {
      setTitle(template.title);
      setContent(template.content);
      setCategory(template.category);
    } else {
      // 新建模板时的默认值
      setTitle('');
      setContent('');
      setCategory(categories[0] || '');
    }
    setError({});
  }, [template, categories]);

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!title.trim()) {
      newErrors.title = '标题不能为空';
    }

    if (!content.trim()) {
      newErrors.content = '内容不能为空';
    }

    if (!category && !newCategory) {
      newErrors.category = '请选择或创建一个分类';
    }

    setError(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSave = async () => {
    if (!validate()) return;

    const selectedCategory = newCategory || category;

    if (newCategory && onAddCategory) {
      onAddCategory(newCategory);
    }

    try {
      if (isEditing && template) {
        await dispatch(
          updateTemplate({
            id: template.id!,
            template: {
              title,
              content,
              category: selectedCategory,
              updatedAt: new Date(),
            },
          })
        );
      } else {
        await dispatch(
          createTemplate({
            title,
            content,
            category: selectedCategory,
            isSystem: false,
          })
        );
      }

      onClose();
    } catch (err) {
      console.error('保存模板失败:', err);
    }
  };

  const handleDelete = async () => {
    if (isEditing && template && !template.isSystem) {
      if (window.confirm('确定要删除这个模板吗？此操作不可撤销。')) {
        await dispatch(removeTemplate(template.id!));
        onClose();
      }
    }
  };

  const handleCategoryChange = (value: string) => {
    if (value === 'new') {
      setShowNewCategory(true);
      setCategory('');
    } else {
      setShowNewCategory(false);
      setCategory(value);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>
            {isEditing ? '编辑提示词模板' : '创建提示词模板'}
          </DialogTitle>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label htmlFor="title">标题</Label>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="输入模板标题"
            />
            {error.title && <p className="text-destructive text-sm">{error.title}</p>}
          </div>

          <div className="grid gap-2">
            <Label htmlFor="category">分类</Label>
            {showNewCategory ? (
              <div className="flex gap-2">
                <Input
                  id="newCategory"
                  value={newCategory}
                  onChange={(e) => setNewCategory(e.target.value)}
                  placeholder="输入新分类名称"
                  className="flex-1"
                />
                <Button
                  variant="outline"
                  onClick={() => {
                    setShowNewCategory(false);
                    setNewCategory('');
                  }}
                >
                  取消
                </Button>
              </div>
            ) : (
              <Select value={category} onValueChange={handleCategoryChange}>
                <SelectTrigger>
                  <SelectValue placeholder="选择分类" />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((cat) => (
                    <SelectItem key={cat} value={cat}>
                      {cat}
                    </SelectItem>
                  ))}
                  <SelectItem value="new">+ 创建新分类</SelectItem>
                </SelectContent>
              </Select>
            )}
            {error.category && (
              <p className="text-destructive text-sm">{error.category}</p>
            )}
          </div>

          <div className="grid gap-2">
            <Label htmlFor="content">内容</Label>
            <Textarea
              id="content"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="输入提示词模板内容..."
              className="min-h-[200px]"
            />
            {error.content && (
              <p className="text-destructive text-sm">{error.content}</p>
            )}
          </div>
        </div>

        <DialogFooter className="flex justify-between">
          <div>
            {isEditing && !template?.isSystem && (
              <Button variant="destructive" onClick={handleDelete}>
                <Trash className="h-4 w-4 mr-2" />
                删除
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>
              取消
            </Button>
            <Button onClick={handleSave}>保存</Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default PromptTemplateEditor;