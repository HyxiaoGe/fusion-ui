"use client";

import { useEffect, useMemo, useState } from "react";
import { Sparkles, Save, RotateCcw, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAppDispatch, useAppSelector } from "@/redux/hooks";
import { updateUserSystemPrompt } from "@/redux/slices/authSlice";

const MAX_LENGTH = 1000;

const TEMPLATES: Array<{ key: string; label: string; content: string }> = [
  {
    key: "engineer",
    label: "工程师",
    content:
      "我是一名工程师，请用代码示例和工程化思维回答；解释概念时优先给可运行示例，避免空泛描述。除非我明确要求展开，回答控制在 300 字以内。",
  },
  {
    key: "writing",
    label: "写作助手",
    content:
      "请用简洁直接的中文回答，避免过度恭维和 emoji；先给结论再展开论证；同义反复和套话直接删掉。",
  },
  {
    key: "learner",
    label: "学习者",
    content:
      "我对相关领域不熟悉，请用通俗类比解释概念，遇到术语先给定义。回答末尾可以提示下一步学习方向。",
  },
];

export default function SystemPrompt() {
  const dispatch = useAppDispatch();
  const savedPrompt = useAppSelector((state) => state.auth.user?.system_prompt ?? "");

  const [draft, setDraft] = useState(savedPrompt);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(
    null,
  );

  useEffect(() => {
    setDraft(savedPrompt);
  }, [savedPrompt]);

  useEffect(() => {
    if (!feedback) return;
    const timer = setTimeout(() => setFeedback(null), 3000);
    return () => clearTimeout(timer);
  }, [feedback]);

  const dirty = useMemo(() => draft !== savedPrompt, [draft, savedPrompt]);
  const overLimit = draft.length > MAX_LENGTH;

  const handleSave = async () => {
    if (!dirty || overLimit || saving) return;
    setSaving(true);
    setFeedback(null);
    try {
      await dispatch(updateUserSystemPrompt(draft)).unwrap();
      setFeedback({ type: "success", message: "已保存" });
    } catch (err: any) {
      setFeedback({ type: "error", message: err?.message || "保存失败" });
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    setDraft(savedPrompt);
    setFeedback(null);
  };

  const handleTemplate = (content: string) => {
    setDraft(content);
    setFeedback(null);
  };

  return (
    <Card className="overflow-hidden border-muted shadow-md transition-all hover:shadow-lg">
      <CardHeader className="bg-muted/10 border-b pb-3">
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-primary" />
          AI 个性化
        </CardTitle>
        <p className="text-sm text-muted-foreground mt-1">
          这里设置的内容会作为系统提示词加入每次对话，AI 会自然遵守，但不会主动提及。
          建议聚焦角色、回答风格、长度偏好等稳定的偏好。
        </p>
      </CardHeader>
      <CardContent className="pt-4 space-y-4">
        <div>
          <p className="text-sm font-medium mb-2">快速套用模板</p>
          <div className="flex flex-wrap gap-2">
            {TEMPLATES.map((tpl) => (
              <Button
                key={tpl.key}
                size="sm"
                variant="outline"
                onClick={() => handleTemplate(tpl.content)}
              >
                {tpl.label}
              </Button>
            ))}
          </div>
        </div>

        <div>
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={8}
            placeholder="例：我是一名前端工程师，回答时请用 React + TypeScript 示例，避免过度铺垫。"
            className="w-full px-3 py-2 rounded-md border border-input bg-transparent text-sm font-normal leading-relaxed resize-y focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
          <div className="flex items-center justify-between mt-1 text-xs">
            <span
              className={
                overLimit
                  ? "text-destructive"
                  : "text-muted-foreground"
              }
            >
              {draft.length} / {MAX_LENGTH}
            </span>
            {feedback && (
              <span
                className={
                  feedback.type === "success" ? "text-emerald-600" : "text-destructive"
                }
              >
                {feedback.message}
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center justify-end gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleReset}
            disabled={!dirty || saving}
          >
            <RotateCcw className="h-4 w-4 mr-1" />
            还原
          </Button>
          <Button
            size="sm"
            onClick={handleSave}
            disabled={!dirty || overLimit || saving}
          >
            {saving ? (
              <Loader2 className="h-4 w-4 mr-1 animate-spin" />
            ) : (
              <Save className="h-4 w-4 mr-1" />
            )}
            保存
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
