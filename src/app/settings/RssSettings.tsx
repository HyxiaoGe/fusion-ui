"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";
import { Edit, PlusCircle, Trash2, Loader2, ExternalLink, Clock } from "lucide-react";
import { useEffect, useState, useMemo } from "react";
import { motion } from "framer-motion";
import ConfirmDialog from "@/components/ui/confirm-dialog";
import { Badge } from "@/components/ui/badge";
import Image from "next/image";

// 根据API文档定义RSS源类型
type RssSource = {
  id: string;
  name: string;
  url: string;
  description?: string;
  category?: string;
  is_enabled: boolean;
  filter_apply?: "title" | "description" | "both" | null;
  filter_type?: "include" | "exclude" | null;
  filter_rule?: string | null;
  created_at?: string;
  updated_at?: string;
};

const LIMIT = 10;

const hardcodedCategoryOptions = [
  { name: 'AI', icon: '/assets/icons/ai.svg' },
  { name: '热榜', icon: '/assets/icons/hot.svg' },
  { name: '科技', icon: '/assets/icons/technology.svg' },
  { name: '社会', icon: '/assets/icons/society.svg' },
  { name: '闲聊', icon: '/assets/icons/smalltalk.svg' },
  { name: '微信公众号', icon: '/assets/icons/weixin.svg' },
];

// 主组件
export default function RssSettings() {
  const [sources, setSources] = useState<RssSource[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingSource, setEditingSource] = useState<RssSource | null>(null);
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [deletingSourceId, setDeletingSourceId] = useState<string | null>(null);
  const { toast } = useToast();

  const fetchSources = async (isInitialLoad = true) => {
    const currentSkip = isInitialLoad ? 0 : sources.length;
    if (isInitialLoad) {
      setIsLoading(true);
    } else {
      if (!hasMore || isLoadingMore) return;
      setIsLoadingMore(true);
    }

    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_BASE_URL || ''}/api/rss?skip=${currentSkip}&limit=${LIMIT}`);
      if (!response.ok) throw new Error("获取订阅源失败");
      const newSources = await response.json();
      
      if (isInitialLoad) {
        setSources(newSources);
      } else {
        setSources(prev => [...prev, ...newSources]);
      }

      if (newSources.length < LIMIT) {
        setHasMore(false);
      }
    } catch (error) {
      toast({
        message: error instanceof Error ? error.message : "获取订阅源失败",
        type: "error",
      });
    } finally {
      setIsLoading(false);
      setIsLoadingMore(false);
    }
  };

  useEffect(() => {
    fetchSources(true);
  }, []);
  
  const handleLoadMore = () => {
    fetchSources(false);
  };

  const handleAddClick = () => {
    setEditingSource(null);
    setIsDialogOpen(true);
  };

  const handleEditClick = (source: RssSource) => {
    setEditingSource(source);
    setIsDialogOpen(true);
  };

  const handleDeleteClick = (sourceId: string) => {
    setDeletingSourceId(sourceId);
    setIsConfirmOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!deletingSourceId) return;
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_BASE_URL || ''}/api/rss/${deletingSourceId}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        if (response.status !== 204) {
         throw new Error("删除失败");
        }
      }
      setSources(sources.filter(s => s.id !== deletingSourceId));
      toast({
        message: "订阅源已删除",
        type: "success",
      });
    } catch (error) {
      toast({
        message: error instanceof Error ? error.message : "删除失败",
        type: "error",
      });
    } finally {
      setIsConfirmOpen(false);
      setDeletingSourceId(null);
    }
  };
  
  const handleToggleEnabled = async (source: RssSource, is_enabled: boolean) => {
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_BASE_URL || ''}/api/rss/${source.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_enabled }),
      });
      if (!response.ok) throw new Error("更新状态失败");
      const updatedSource = await response.json();
      setSources(sources.map(s => s.id === source.id ? updatedSource : s));
       toast({
        message: `订阅源'${source.name}'已${is_enabled ? '启用' : '禁用'}`,
        type: "success",
      });
    } catch (error) {
       toast({
        message: error instanceof Error ? error.message : "更新状态失败",
        type: "error",
      });
    }
  }

  const handleSave = async (sourceData: Partial<RssSource>) => {
    const isEditing = !!editingSource;
    const url = isEditing 
      ? `${process.env.NEXT_PUBLIC_API_BASE_URL || ''}/api/rss/${editingSource.id}` 
      : `${process.env.NEXT_PUBLIC_API_BASE_URL || ''}/api/rss`;
    const method = isEditing ? "PUT" : "POST";

    try {
      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(sourceData),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || (isEditing ? '更新失败' : '创建失败'));
      }
      
      const savedSource = await response.json();

      if (isEditing) {
        setSources(sources.map(s => s.id === savedSource.id ? savedSource : s));
      } else {
        setSources(prev => [savedSource, ...prev]);
      }
      
      toast({
        message: `订阅源'${savedSource.name}'已成功${isEditing ? '更新' : '创建'}`,
        type: "success"
      });
      setIsDialogOpen(false);
    } catch (error) {
      toast({
        message: error instanceof Error ? error.message : "操作失败",
        type: "error",
      });
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>RSS 订阅源管理</CardTitle>
          <Button onClick={handleAddClick}>
            <PlusCircle className="mr-2 h-4 w-4" />
            添加订阅源
          </Button>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center items-center h-40">
              <p>加载中...</p>
            </div>
          ) : (
            <div className="space-y-4">
              {sources.map(source => (
                <RssSourceItem
                  key={source.id}
                  source={source}
                  onEdit={handleEditClick}
                  onDelete={handleDeleteClick}
                  onToggleEnabled={handleToggleEnabled}
                />
              ))}
            </div>
          )}
          {hasMore && !isLoading && (
            <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3 }}
                className="w-full mt-6"
            >
                <Button 
                    onClick={handleLoadMore} 
                    disabled={isLoadingMore} 
                    variant="ghost"
                    className="w-full h-12 text-muted-foreground hover:bg-muted hover:text-primary transition-colors"
                >
                    {isLoadingMore ? (
                        <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            正在加载...
                        </>
                    ) : (
                        '加载更多'
                    )}
                </Button>
            </motion.div>
          )}
        </CardContent>
      </Card>
      <RssFormDialog
        isOpen={isDialogOpen}
        onClose={() => setIsDialogOpen(false)}
        onSave={handleSave}
        source={editingSource}
        categoryOptions={hardcodedCategoryOptions}
      />
      <ConfirmDialog
        isOpen={isConfirmOpen}
        onClose={() => setIsConfirmOpen(false)}
        onConfirm={handleConfirmDelete}
        title="确认删除"
        description="你确定要删除这个订阅源吗？此操作无法撤销。"
        variant="destructive"
      />
    </motion.div>
  );
}

// 单个RSS源显示组件
function RssSourceItem({ source, onEdit, onDelete, onToggleEnabled }: { 
    source: RssSource, 
    onEdit: (source: RssSource) => void, 
    onDelete: (id: string) => void,
    onToggleEnabled: (source: RssSource, checked: boolean) => void 
}) {
  const formattedDate = source.updated_at 
    ? new Date(source.updated_at).toLocaleString('zh-CN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      })
    : 'N/A';

  return (
    <div className="border p-4 rounded-lg flex items-center justify-between transition-all hover:shadow-md">
      <div className="space-y-1 overflow-hidden">
        <h3 className="font-bold truncate">{source.name} <span className="text-xs font-normal bg-secondary text-secondary-foreground p-1 rounded-md">{source.category}</span></h3>
        <div className="flex items-center gap-2">
            <p className="text-sm text-muted-foreground truncate">{source.url}</p>
            <a href={source.url} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="h-4 w-4 text-muted-foreground hover:text-primary transition-colors flex-shrink-0" />
            </a>
        </div>
        <p className="text-sm truncate">{source.description}</p>
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground pt-1">
            <Clock className="h-3 w-3" />
            <span>最后更新于: {formattedDate}</span>
        </div>
      </div>
      <div className="flex items-center gap-3 pl-4">
        <Switch 
            checked={source.is_enabled} 
            onCheckedChange={(checked) => onToggleEnabled(source, checked)}
            className="data-[state=checked]:bg-primary"
        />
        <Button variant="ghost" size="icon" onClick={() => onEdit(source)} className="h-9 w-9">
          <Edit className="h-5 w-5" />
        </Button>
        <Button variant="ghost" size="icon" onClick={() => onDelete(source.id)} className="h-9 w-9">
          <Trash2 className="h-5 w-5 text-destructive" />
        </Button>
      </div>
    </div>
  );
}


// RSS源表单对话框组件
function RssFormDialog({ isOpen, onClose, onSave, source, categoryOptions }: { 
  isOpen: boolean, 
  onClose: () => void, 
  onSave: (source: Partial<RssSource>) => void, 
  source: RssSource | null,
  categoryOptions: {name: string, icon: string}[]
}) {
  const [formData, setFormData] = useState<Partial<RssSource>>({});

  useEffect(() => {
    if (source) {
      setFormData(source);
    } else {
      setFormData({
        name: "",
        url: "",
        description: "",
        category: "",
        is_enabled: true,
        filter_apply: null,
        filter_type: null,
        filter_rule: "",
      });
    }
  }, [source, isOpen]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSelectChange = (name: string, value: string) => {
    setFormData(prev => ({ ...prev, [name]: value }));
  }

  const handleSwitchChange = (name: string, checked: boolean) => {
    setFormData(prev => ({...prev, [name]: checked}));
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(formData);
  };
  
  if (!isOpen) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[625px]">
        <DialogHeader>
          <DialogTitle>{source ? '编辑订阅源' : '添加新订阅源'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="name" className="text-right">名称</Label>
              <Input id="name" name="name" value={formData.name ?? ''} onChange={handleChange} className="col-span-3" required />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="url" className="text-right">URL</Label>
              <div className="col-span-3 flex items-center gap-2">
                <Input id="url" name="url" value={formData.url ?? ''} onChange={handleChange} className="flex-grow" required />
                <Button 
                    type="button" 
                    variant="ghost" 
                    size="icon" 
                    asChild
                    disabled={!formData.url}
                    className="flex-shrink-0"
                >
                  <a href={formData.url} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="h-4 w-4" />
                  </a>
                </Button>
              </div>
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="description" className="text-right">描述</Label>
              <Textarea 
                id="description" 
                name="description" 
                value={formData.description ?? ''} 
                onChange={handleChange} 
                className="col-span-3" 
                rows={4}
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="category" className="text-right">分类</Label>
              <Select
                value={formData.category ?? ''}
                onValueChange={(value) => handleSelectChange("category", value)}
              >
                <SelectTrigger className="col-span-3">
                  <SelectValue placeholder="选择一个分类" />
                </SelectTrigger>
                <SelectContent>
                  {categoryOptions.map((option) => (
                    <SelectItem key={option.name} value={option.name}>
                      <div className="flex items-center">
                        <Image src={option.icon} alt={option.name} width={16} height={16} className="mr-2" />
                        {option.name}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="is_enabled" className="text-right">启用</Label>
               <Switch id="is_enabled" name="is_enabled" checked={formData.is_enabled} onCheckedChange={(checked) => handleSwitchChange("is_enabled", checked)} />
            </div>
            <h4 className="font-semibold mt-4 border-t pt-4">过滤器设置</h4>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="filter_apply" className="text-right">应用范围</Label>
              <Select name="filter_apply" value={formData.filter_apply || ""} onValueChange={(value) => handleSelectChange("filter_apply", value)}>
                <SelectTrigger className="col-span-3">
                  <SelectValue placeholder="选择应用范围" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="title">标题</SelectItem>
                  <SelectItem value="description">描述</SelectItem>
                  <SelectItem value="both">标题和描述</SelectItem>
                </SelectContent>
              </Select>
            </div>
             <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="filter_type" className="text-right">过滤类型</Label>
              <Select name="filter_type" value={formData.filter_type || ""} onValueChange={(value) => handleSelectChange("filter_type", value)}>
                <SelectTrigger className="col-span-3">
                  <SelectValue placeholder="选择过滤类型" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="include">包含</SelectItem>
                  <SelectItem value="exclude">排除</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="filter_rule" className="text-right">规则 (用 | 分隔)</Label>
              <Input id="filter_rule" name="filter_rule" value={formData.filter_rule ?? ''} onChange={handleChange} className="col-span-3" />
            </div>
            {formData.filter_rule && (
              <div className="grid grid-cols-4 items-start gap-4">
                <Label className="text-right pt-2">预览</Label>
                <div className="col-span-3 flex flex-wrap gap-2">
                  {formData.filter_rule.split('|').filter(Boolean).map((rule, index) => (
                    <Badge key={index} variant="secondary">{rule}</Badge>
                  ))}
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>取消</Button>
            <Button type="submit">保存</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
} 