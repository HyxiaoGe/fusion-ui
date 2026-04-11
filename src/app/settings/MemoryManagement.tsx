"use client";

import { useEffect, useState } from "react";
import { Brain, Plus, Pencil, Trash2, Check, X, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { useAppDispatch, useAppSelector } from "@/redux/hooks";
import {
  fetchMemories,
  addMemory,
  editMemory,
  toggleMemoryActive,
  removeMemory,
} from "@/redux/slices/memorySlice";

export default function MemoryManagement() {
  const dispatch = useAppDispatch();
  const { items: memories, loading } = useAppSelector((state) => state.memory);

  const [isAdding, setIsAdding] = useState(false);
  const [newContent, setNewContent] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState("");

  useEffect(() => {
    dispatch(fetchMemories());
  }, [dispatch]);

  const handleAdd = async () => {
    if (!newContent.trim()) return;
    await dispatch(addMemory(newContent.trim()));
    setNewContent("");
    setIsAdding(false);
  };

  const handleEdit = async (id: string) => {
    if (!editContent.trim()) return;
    await dispatch(editMemory({ id, content: editContent.trim() }));
    setEditingId(null);
    setEditContent("");
  };

  const handleToggle = (id: string, currentActive: boolean) => {
    dispatch(toggleMemoryActive({ id, is_active: !currentActive }));
  };

  const handleDelete = (id: string) => {
    dispatch(removeMemory(id));
  };

  const startEdit = (id: string, content: string) => {
    setEditingId(id);
    setEditContent(content);
  };

  return (
    <Card className="overflow-hidden border-muted shadow-md transition-all hover:shadow-lg">
      <CardHeader className="bg-muted/10 border-b pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Brain className="h-5 w-5 text-primary" />
            记忆管理
          </CardTitle>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsAdding(true)}
            disabled={isAdding}
          >
            <Plus className="h-4 w-4 mr-1" />
            添加记忆
          </Button>
        </div>
        <p className="text-sm text-muted-foreground mt-1">
          AI 会在对话中自然地参考这些信息，帮助提供更个性化的回答。
        </p>
      </CardHeader>
      <CardContent className="pt-4">
        {/* 添加新记忆 */}
        {isAdding && (
          <div className="mb-4 flex gap-2">
            <input
              type="text"
              value={newContent}
              onChange={(e) => setNewContent(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAdd()}
              placeholder="输入要记住的信息，如：我是一名前端开发者"
              className="flex-1 px-3 py-2 rounded-md border border-input bg-transparent text-sm"
              autoFocus
            />
            <Button size="sm" onClick={handleAdd} disabled={!newContent.trim()}>
              <Check className="h-4 w-4" />
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setIsAdding(false);
                setNewContent("");
              }}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        )}

        {/* 记忆列表 */}
        {loading ? (
          <p className="text-sm text-muted-foreground py-4 text-center">加载中...</p>
        ) : memories.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">
            暂无记忆。AI 会在对话中自动学习，你也可以手动添加。
          </p>
        ) : (
          <div className="space-y-2">
            {memories.map((memory) => (
              <div
                key={memory.id}
                className={`flex items-start gap-3 p-3 rounded-lg border transition-colors ${
                  memory.is_active
                    ? "bg-background border-border"
                    : "bg-muted/30 border-muted opacity-60"
                }`}
              >
                {/* 内容区 */}
                <div className="flex-1 min-w-0">
                  {editingId === memory.id ? (
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={editContent}
                        onChange={(e) => setEditContent(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") handleEdit(memory.id);
                          if (e.key === "Escape") setEditingId(null);
                        }}
                        className="flex-1 px-2 py-1 rounded border border-input bg-transparent text-sm"
                        autoFocus
                      />
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleEdit(memory.id)}
                      >
                        <Check className="h-3 w-3" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setEditingId(null)}
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                  ) : (
                    <>
                      <p className="text-sm">{memory.content}</p>
                      <div className="flex items-center gap-2 mt-1">
                        {memory.source === "auto" && (
                          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                            <Sparkles className="h-3 w-3" />
                            自动提取
                          </span>
                        )}
                        {memory.source === "manual" && (
                          <span className="text-xs text-muted-foreground">手动添加</span>
                        )}
                        {memory.created_at && (
                          <span className="text-xs text-muted-foreground">
                            {new Date(memory.created_at).toLocaleDateString("zh-CN")}
                          </span>
                        )}
                      </div>
                    </>
                  )}
                </div>

                {/* 操作区 */}
                {editingId !== memory.id && (
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <Switch
                      checked={memory.is_active}
                      onCheckedChange={() => handleToggle(memory.id, memory.is_active)}
                    />
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => startEdit(memory.id, memory.content)}
                    >
                      <Pencil className="h-3 w-3" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-destructive hover:text-destructive"
                      onClick={() => handleDelete(memory.id)}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
