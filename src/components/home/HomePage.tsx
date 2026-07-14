import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowUpRight,
  BarChart3,
  BookOpenCheck,
  Code2,
  FileText,
  Languages,
  Library,
  ListChecks,
  PenLine,
  RefreshCw,
  Search,
  Sparkles,
  type LucideIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import PromptTemplateList from '@/components/prompts/PromptTemplateList';
import type { PromptTemplateListItem } from '@/components/prompts/PromptTemplateItem';
import {
  fetchPromptExamples,
  fetchPromptTemplates,
  type PromptTemplateCatalogItem,
} from '@/lib/api/prompts';
import { preloadChatMessageList } from '@/components/lazy/preloaders';
import { useRenderProbe } from '@/lib/debug/perfProbe';

interface StarterPrompt {
  id: string;
  title: string;
  description: string;
  prompt: string;
  icon: LucideIcon;
  tone: string;
}

const FALLBACK_STARTER_PROMPTS: StarterPrompt[] = [
  {
    id: 'research',
    title: '深度调研',
    description: '梳理结论、争议和可靠来源',
    prompt: '请围绕以下主题进行联网调研，给出关键结论、主要争议和可靠来源：\n\n【在这里填写主题】',
    icon: Search,
    tone: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
  },
  {
    id: 'file',
    title: '解读一份文件',
    description: '提炼重点、数据、风险和行动项',
    prompt: '请阅读我接下来上传的文件，先总结核心内容，再列出关键数据、风险点和建议行动。',
    icon: FileText,
    tone: 'bg-violet-500/10 text-violet-600 dark:text-violet-400',
  },
  {
    id: 'code-review',
    title: '审查代码',
    description: '检查正确性、性能和安全风险',
    prompt: '请审查下面这段代码，重点检查正确性、可维护性、性能和安全风险，并给出可以直接应用的修改建议：\n\n```\n【粘贴代码】\n```',
    icon: Code2,
    tone: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
  },
  {
    id: 'writing',
    title: '起草与润色',
    description: '优化结构、表达和目标语气',
    prompt: '请帮我起草或润色下面的内容。保持原意，优化结构、表达和语气，并说明主要修改点：\n\n【粘贴内容】',
    icon: PenLine,
    tone: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
  },
  {
    id: 'data',
    title: '分析数据',
    description: '发现趋势、异常和可行动洞察',
    prompt: '请分析我提供的数据，说明关键趋势、异常点、可能原因和下一步行动建议。必要时用表格呈现。\n\n【粘贴数据或上传文件】',
    icon: BarChart3,
    tone: 'bg-cyan-500/10 text-cyan-600 dark:text-cyan-400',
  },
  {
    id: 'plan',
    title: '制定计划',
    description: '拆解目标、里程碑和风险',
    prompt: '请把下面的目标拆成一份可执行计划，包含优先级、里程碑、依赖、风险和验收标准：\n\n【描述目标】',
    icon: ListChecks,
    tone: 'bg-rose-500/10 text-rose-600 dark:text-rose-400',
  },
  {
    id: 'learning',
    title: '快速学习',
    description: '从核心概念到练习路径',
    prompt: '我想快速掌握下面这个主题。请先解释核心概念，再给出循序渐进的学习路径、例子和练习：\n\n【填写主题】',
    icon: BookOpenCheck,
    tone: 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400',
  },
  {
    id: 'translation',
    title: '翻译与本地化',
    description: '保留语气并适配目标受众',
    prompt: '请把下面的内容翻译并本地化为【目标语言/地区】。保留原意和语气，同时让表达符合当地习惯：\n\n【粘贴内容】',
    icon: Languages,
    tone: 'bg-fuchsia-500/10 text-fuchsia-600 dark:text-fuchsia-400',
  },
];

const STARTER_PAGE_SIZE = 4;
const INSPIRATION_PAGE_SIZE = 4;
const INSPIRATION_FETCH_LIMIT = 50;
const INSPIRATION_ROTATE_INTERVAL = 15_000;
const INSPIRATION_FLIP_STAGGER = 80;

const ICONS_BY_KEY: Record<string, LucideIcon> = {
  search: Search,
  'file-text': FileText,
  code: Code2,
  'code-2': Code2,
  'pen-line': PenLine,
  'bar-chart': BarChart3,
  'bar-chart-3': BarChart3,
  'list-checks': ListChecks,
  'book-open-check': BookOpenCheck,
  languages: Languages,
};

const TONES_BY_KEY: Record<string, string> = {
  blue: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
  violet: 'bg-violet-500/10 text-violet-600 dark:text-violet-400',
  emerald: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
  amber: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
  cyan: 'bg-cyan-500/10 text-cyan-600 dark:text-cyan-400',
  rose: 'bg-rose-500/10 text-rose-600 dark:text-rose-400',
  indigo: 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400',
  fuchsia: 'bg-fuchsia-500/10 text-fuchsia-600 dark:text-fuchsia-400',
};

const FALLBACK_LIBRARY_TEMPLATES: PromptTemplateListItem[] = [
  {
    id: 'template-code-explanation',
    title: '代码解释',
    content: '请解释以下代码的功能，并分析其时间和空间复杂度：\n\n```\n<在此处放置代码>\n```',
    category: '编程',
    isSystem: true,
  },
  {
    id: 'template-text-summary',
    title: '文本总结',
    content: '请总结以下文本的要点：\n\n<在此处放置文本>',
    category: '写作',
    isSystem: true,
  },
  {
    id: 'template-question-answering',
    title: '问题解答',
    content: '我需要回答以下问题，请提供详细的解释：\n\n<在此处放置问题>',
    category: '学习',
    isSystem: true,
  },
];

function toStarterPrompt(item: PromptTemplateCatalogItem): StarterPrompt {
  return {
    id: item.id,
    title: item.title,
    description: item.description,
    prompt: item.content,
    icon: ICONS_BY_KEY[item.icon_key] ?? Sparkles,
    tone: TONES_BY_KEY[item.tone] ?? TONES_BY_KEY.blue,
  };
}

function toLibraryTemplate(item: PromptTemplateCatalogItem): PromptTemplateListItem {
  return {
    id: item.id,
    title: item.title,
    content: item.content,
    category: item.category,
    isSystem: true,
  };
}

interface HomePageProps {
  onSelectPrompt: (content: string) => void;
}

const HomePage: React.FC<HomePageProps> = ({ onSelectPrompt }) => {
  useRenderProbe('HomePage');
  const [pageIndex, setPageIndex] = useState(0);
  const [starterPrompts, setStarterPrompts] = useState(FALLBACK_STARTER_PROMPTS);
  const [libraryTemplates, setLibraryTemplates] = useState(FALLBACK_LIBRARY_TEMPLATES);
  const [inspirations, setInspirations] = useState<string[]>([]);
  const [flippedInspirations, setFlippedInspirations] = useState<boolean[]>([]);
  const [isInspirationPaused, setIsInspirationPaused] = useState(false);
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const inspirationPoolRef = useRef<string[]>([]);
  const inspirationCursorRef = useRef(0);
  const flipTimeoutsRef = useRef<Array<ReturnType<typeof setTimeout>>>([]);
  const pageCount = Math.max(1, Math.ceil(starterPrompts.length / STARTER_PAGE_SIZE));
  const visibleStarters = useMemo(() => {
    const start = pageIndex * STARTER_PAGE_SIZE;
    return starterPrompts.slice(start, start + STARTER_PAGE_SIZE);
  }, [pageIndex, starterPrompts]);

  useEffect(() => {
    let cancelled = false;
    void preloadChatMessageList();

    void fetchPromptExamples(INSPIRATION_FETCH_LIMIT)
      .then((data) => {
        if (cancelled) return;
        const uniqueQuestions = Array.from(
          new Set(data.examples.map((item) => item.question.trim()).filter(Boolean)),
        );
        inspirationPoolRef.current = uniqueQuestions;
        inspirationCursorRef.current = INSPIRATION_PAGE_SIZE;
        const initialInspirations = uniqueQuestions.slice(0, INSPIRATION_PAGE_SIZE);
        setInspirations(initialInspirations);
        setFlippedInspirations(initialInspirations.map(() => false));
      })
      .catch(() => {
        if (!cancelled) setInspirations([]);
      });

    void fetchPromptTemplates()
      .then((data) => {
        if (cancelled) return;
        const enabledItems = data.items
          .filter((item) => item.enabled)
          .sort((left, right) => left.sort_order - right.sort_order);
        const remoteStarters = enabledItems
          .filter((item) => item.kind === 'starter')
          .map(toStarterPrompt);
        const remoteTemplates = enabledItems
          .filter((item) => item.kind === 'template')
          .map(toLibraryTemplate);

        if (remoteStarters.length > 0) {
          setStarterPrompts(remoteStarters);
          setPageIndex(0);
        }
        if (remoteTemplates.length > 0) {
          setLibraryTemplates(remoteTemplates);
        }
      })
      .catch(() => {
        // 后端目录不可用时保留内置兜底，首页仍可正常启动任务。
      });

    return () => {
      cancelled = true;
      flipTimeoutsRef.current.forEach(clearTimeout);
      flipTimeoutsRef.current = [];
    };
  }, []);

  useEffect(() => {
    if (
      isInspirationPaused
      || inspirations.length < INSPIRATION_PAGE_SIZE
      || inspirationPoolRef.current.length <= INSPIRATION_PAGE_SIZE
    ) {
      return undefined;
    }

    const intervalId = window.setInterval(() => {
      const pool = inspirationPoolRef.current;
      let cursor = inspirationCursorRef.current;
      if (cursor + INSPIRATION_PAGE_SIZE > pool.length) {
        cursor = 0;
      }
      const nextInspirations = pool.slice(cursor, cursor + INSPIRATION_PAGE_SIZE);
      if (nextInspirations.length < INSPIRATION_PAGE_SIZE) return;
      inspirationCursorRef.current = cursor + INSPIRATION_PAGE_SIZE;

      flipTimeoutsRef.current.forEach(clearTimeout);
      flipTimeoutsRef.current = [];
      Array.from({ length: INSPIRATION_PAGE_SIZE }).forEach((_, index) => {
        flipTimeoutsRef.current.push(setTimeout(() => {
          setFlippedInspirations((current) => current.map((value, itemIndex) => (
            itemIndex === index ? true : value
          )));
        }, index * INSPIRATION_FLIP_STAGGER));
      });

      const replaceDelay = INSPIRATION_PAGE_SIZE * INSPIRATION_FLIP_STAGGER + 300;
      flipTimeoutsRef.current.push(setTimeout(() => {
        setInspirations(nextInspirations);
        Array.from({ length: INSPIRATION_PAGE_SIZE }).forEach((_, index) => {
          flipTimeoutsRef.current.push(setTimeout(() => {
            setFlippedInspirations((current) => current.map((value, itemIndex) => (
              itemIndex === index ? false : value
            )));
          }, 50 + index * INSPIRATION_FLIP_STAGGER));
        });
      }, replaceDelay));
    }, INSPIRATION_ROTATE_INTERVAL);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [inspirations.length, isInspirationPaused]);

  const showNextPage = useCallback(() => {
    setPageIndex((current) => (current + 1) % pageCount);
  }, [pageCount]);

  const selectTemplate = useCallback((content: string) => {
    setTemplatesOpen(false);
    onSelectPrompt(content);
  }, [onSelectPrompt]);

  return (
    <div className="flex min-h-full items-center justify-center px-4 pb-20 pt-8 sm:pb-24">
      <div className="mx-auto w-full max-w-3xl">
        <div className="mb-8 text-center">
          <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-border/70 bg-background/80 px-3 py-1 text-xs text-muted-foreground shadow-fdv2-xs">
            <Sparkles className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
            从一个任务开始，随时可以修改
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
            今天想完成什么？
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            选择一个方向填入输入框，再补充你的材料和要求
          </p>
        </div>

        <div data-testid="starter-prompts" className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {visibleStarters.map((starter) => {
            const Icon = starter.icon;
            return (
              <button
                key={starter.id}
                type="button"
                onClick={() => onSelectPrompt(starter.prompt)}
                className="group flex min-h-24 items-center gap-4 rounded-2xl border border-border/80 bg-background/90 p-4 text-left shadow-fdv2-xs transition-[border-color,box-shadow,transform] duration-200 hover:-translate-y-0.5 hover:border-border-strong hover:shadow-fdv2-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transform-none motion-reduce:transition-none"
              >
                <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${starter.tone}`}>
                  <Icon className="h-5 w-5" aria-hidden="true" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium text-foreground">{starter.title}</span>
                  <span className="mt-1 block text-xs leading-5 text-muted-foreground">
                    {starter.description}
                  </span>
                </span>
                <ArrowUpRight
                  className="h-4 w-4 shrink-0 text-muted-foreground/60 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5 motion-reduce:transition-none"
                  aria-hidden="true"
                />
              </button>
            );
          })}
        </div>

        <div className="mt-4 flex items-center justify-center gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={showNextPage} className="gap-1.5 text-muted-foreground">
            <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
            换一批
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setTemplatesOpen(true)}
            className="gap-1.5 text-muted-foreground"
          >
            <Library className="h-3.5 w-3.5" aria-hidden="true" />
            更多模板
          </Button>
        </div>

        {inspirations.length > 0 ? (
          <section
            className="mt-6 border-t border-border/60 pt-4"
            aria-labelledby="daily-inspiration-title"
            onMouseEnter={() => setIsInspirationPaused(true)}
            onMouseLeave={() => setIsInspirationPaused(false)}
            onFocusCapture={() => setIsInspirationPaused(true)}
            onBlurCapture={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget)) {
                setIsInspirationPaused(false);
              }
            }}
          >
            <div className="mb-2 flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
              <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
              <h2 id="daily-inspiration-title" className="font-medium">今日灵感</h2>
            </div>
            <div className="flex flex-wrap justify-center gap-2">
              {inspirations.map((question, index) => (
                <button
                  key={index}
                  type="button"
                  onClick={() => onSelectPrompt(question)}
                  className="rounded-full border border-border/70 bg-bg-subtle px-3.5 py-2 text-xs text-fg-secondary transition-colors hover:border-border-strong hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  style={{
                    opacity: flippedInspirations[index] ? 0 : 1,
                    transform: flippedInspirations[index] ? 'rotateX(90deg)' : 'rotateX(0deg)',
                    transition: 'opacity 300ms ease, transform 300ms ease',
                  }}
                >
                  {question}
                </button>
              ))}
            </div>
          </section>
        ) : null}
      </div>

      <Dialog open={templatesOpen} onOpenChange={setTemplatesOpen}>
        <DialogContent className="h-[min(36rem,80vh)] overflow-hidden sm:max-w-2xl" closeLabel="关闭模板库">
          <DialogHeader className="sr-only">
            <DialogTitle>提示词模板</DialogTitle>
            <DialogDescription>选择一个模板并填入消息输入框</DialogDescription>
          </DialogHeader>
          <div className="min-h-0 overflow-hidden pr-1">
            <PromptTemplateList
              templates={libraryTemplates}
              onSelectTemplate={selectTemplate}
            />
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default memo(HomePage);
