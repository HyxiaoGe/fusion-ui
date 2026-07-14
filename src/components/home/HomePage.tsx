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
const STARTER_ROTATE_INTERVAL = 12_000;
const INSPIRATION_FETCH_LIMIT = 50;
const INSPIRATION_ROTATE_INTERVAL = 15_000;
const CAROUSEL_FLIP_STAGGER = 80;
const CAROUSEL_REPLACE_PADDING = 300;
const CAROUSEL_FLIP_BACK_DELAY = 50;
const INSPIRATION_ROW_COUNT = 2;
const INSPIRATION_GAP = 8;
const DEFAULT_INSPIRATION_WIDTH = 768;

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

function estimateInspirationWidth(question: string): number {
  const textWidth = Array.from(question).reduce((width, character) => (
    width + (/[^\u0000-\u00ff]/.test(character) ? 12 : 7)
  ), 0);
  return textWidth + 30;
}

function fitInspirationRows(
  pool: string[],
  startIndex: number,
  containerWidth: number,
  measuredWidths: Record<string, number>,
): string[] {
  if (pool.length === 0) return [];

  const visible: string[] = [];
  let row = 0;
  let rowWidth = 0;
  const availableWidth = Math.max(containerWidth, 1);

  for (let offset = 0; offset < pool.length; offset += 1) {
    const question = pool[(startIndex + offset) % pool.length];
    const chipWidth = Math.min(
      measuredWidths[question] ?? estimateInspirationWidth(question),
      availableWidth,
    );
    const nextWidth = rowWidth === 0
      ? chipWidth
      : rowWidth + INSPIRATION_GAP + chipWidth;

    if (rowWidth > 0 && nextWidth > availableWidth) {
      row += 1;
      if (row >= INSPIRATION_ROW_COUNT) break;
      rowWidth = chipWidth;
    } else {
      rowWidth = nextWidth;
    }
    visible.push(question);
  }

  return visible;
}

interface HomePageProps {
  onSelectPrompt: (content: string) => void;
}

const HomePage: React.FC<HomePageProps> = ({ onSelectPrompt }) => {
  useRenderProbe('HomePage');
  const [pageIndex, setPageIndex] = useState(0);
  const [starterPrompts, setStarterPrompts] = useState(FALLBACK_STARTER_PROMPTS);
  const [flippedStarters, setFlippedStarters] = useState<boolean[]>([]);
  const [isStarterPaused, setIsStarterPaused] = useState(false);
  const [libraryTemplates, setLibraryTemplates] = useState(FALLBACK_LIBRARY_TEMPLATES);
  const [inspirationPool, setInspirationPool] = useState<string[]>([]);
  const [inspirationStartIndex, setInspirationStartIndex] = useState(0);
  const [inspirationLayout, setInspirationLayout] = useState<{
    containerWidth: number;
    measuredWidths: Record<string, number>;
  }>({
    containerWidth: DEFAULT_INSPIRATION_WIDTH,
    measuredWidths: {},
  });
  const [flippedInspirations, setFlippedInspirations] = useState<boolean[]>([]);
  const [isInspirationPaused, setIsInspirationPaused] = useState(false);
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const inspirationContainerRef = useRef<HTMLDivElement>(null);
  const inspirationMeasureRef = useRef<HTMLDivElement>(null);
  const starterFlipTimeoutsRef = useRef<Array<ReturnType<typeof setTimeout>>>([]);
  const flipTimeoutsRef = useRef<Array<ReturnType<typeof setTimeout>>>([]);
  const pageCount = Math.max(1, Math.ceil(starterPrompts.length / STARTER_PAGE_SIZE));
  const visibleStarters = useMemo(() => {
    const start = pageIndex * STARTER_PAGE_SIZE;
    return starterPrompts.slice(start, start + STARTER_PAGE_SIZE);
  }, [pageIndex, starterPrompts]);
  const inspirations = useMemo(() => fitInspirationRows(
    inspirationPool,
    inspirationStartIndex,
    inspirationLayout.containerWidth,
    inspirationLayout.measuredWidths,
  ), [inspirationLayout, inspirationPool, inspirationStartIndex]);
  const inspirationCount = inspirations.length;

  useEffect(() => {
    let cancelled = false;
    void preloadChatMessageList();

    void fetchPromptExamples(INSPIRATION_FETCH_LIMIT)
      .then((data) => {
        if (cancelled) return;
        const uniqueQuestions = Array.from(
          new Set(data.examples.map((item) => item.question.trim()).filter(Boolean)),
        );
        setInspirationPool(uniqueQuestions);
        setInspirationStartIndex(0);
      })
      .catch(() => {
        if (!cancelled) setInspirationPool([]);
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
      starterFlipTimeoutsRef.current.forEach(clearTimeout);
      starterFlipTimeoutsRef.current = [];
      flipTimeoutsRef.current.forEach(clearTimeout);
      flipTimeoutsRef.current = [];
    };
  }, []);

  useEffect(() => {
    if (inspirationPool.length === 0) return undefined;

    const measure = () => {
      const containerWidth = inspirationContainerRef.current?.getBoundingClientRect().width
        || DEFAULT_INSPIRATION_WIDTH;
      const measureItems = Array.from(inspirationMeasureRef.current?.children ?? []);
      const measuredWidths = Object.fromEntries(inspirationPool.map((question, index) => {
        const measuredWidth = measureItems[index]?.getBoundingClientRect().width ?? 0;
        return [question, measuredWidth > 0 ? measuredWidth : estimateInspirationWidth(question)];
      }));
      setInspirationLayout((current) => {
        const sameWidth = Math.abs(current.containerWidth - containerWidth) < 1;
        const sameMeasurements = inspirationPool.every(
          (question) => current.measuredWidths[question] === measuredWidths[question],
        );
        return sameWidth && sameMeasurements
          ? current
          : { containerWidth, measuredWidths };
      });
    };

    measure();
    if (typeof ResizeObserver === 'undefined' || !inspirationContainerRef.current) {
      return undefined;
    }
    const observer = new ResizeObserver(measure);
    observer.observe(inspirationContainerRef.current);
    return () => observer.disconnect();
  }, [inspirationPool]);

  useEffect(() => {
    setFlippedInspirations((current) => Array.from(
      { length: inspirationCount },
      (_, index) => current[index] ?? false,
    ));
  }, [inspirationCount]);

  useEffect(() => {
    if (
      isInspirationPaused
      || inspirations.length === 0
      || inspirationPool.length <= inspirations.length
    ) {
      return undefined;
    }

    const intervalId = window.setInterval(() => {
      const nextStartIndex = (inspirationStartIndex + inspirations.length) % inspirationPool.length;
      const nextInspirations = fitInspirationRows(
        inspirationPool,
        nextStartIndex,
        inspirationLayout.containerWidth,
        inspirationLayout.measuredWidths,
      );
      if (nextInspirations.length === 0) return;

      flipTimeoutsRef.current.forEach(clearTimeout);
      flipTimeoutsRef.current = [];
      inspirations.forEach((_, index) => {
        flipTimeoutsRef.current.push(setTimeout(() => {
          setFlippedInspirations((current) => current.map((value, itemIndex) => (
            itemIndex === index ? true : value
          )));
        }, index * CAROUSEL_FLIP_STAGGER));
      });

      const replaceDelay = inspirations.length * CAROUSEL_FLIP_STAGGER
        + CAROUSEL_REPLACE_PADDING;
      flipTimeoutsRef.current.push(setTimeout(() => {
        setInspirationStartIndex(nextStartIndex);
        setFlippedInspirations(nextInspirations.map(() => true));
        nextInspirations.forEach((_, index) => {
          flipTimeoutsRef.current.push(setTimeout(() => {
            setFlippedInspirations((current) => current.map((value, itemIndex) => (
              itemIndex === index ? false : value
            )));
          }, CAROUSEL_FLIP_BACK_DELAY + index * CAROUSEL_FLIP_STAGGER));
        });
      }, replaceDelay));
    }, INSPIRATION_ROTATE_INTERVAL);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [
    inspirationLayout,
    inspirationPool,
    inspirationStartIndex,
    inspirations,
    isInspirationPaused,
  ]);

  useEffect(() => {
    setFlippedStarters((current) => Array.from(
      { length: visibleStarters.length },
      (_, index) => current[index] ?? false,
    ));
  }, [visibleStarters.length]);

  const showNextPage = useCallback(() => {
    if (pageCount <= 1 || visibleStarters.length === 0) return;

    starterFlipTimeoutsRef.current.forEach(clearTimeout);
    starterFlipTimeoutsRef.current = [];
    setFlippedStarters(visibleStarters.map(() => false));
    visibleStarters.forEach((_, index) => {
      starterFlipTimeoutsRef.current.push(setTimeout(() => {
        setFlippedStarters((current) => current.map((value, itemIndex) => (
          itemIndex === index ? true : value
        )));
      }, index * CAROUSEL_FLIP_STAGGER));
    });

    const replaceDelay = visibleStarters.length * CAROUSEL_FLIP_STAGGER
      + CAROUSEL_REPLACE_PADDING;
    starterFlipTimeoutsRef.current.push(setTimeout(() => {
      setPageIndex((current) => (current + 1) % pageCount);
      setFlippedStarters(visibleStarters.map(() => true));
      visibleStarters.forEach((_, index) => {
        starterFlipTimeoutsRef.current.push(setTimeout(() => {
          setFlippedStarters((current) => current.map((value, itemIndex) => (
            itemIndex === index ? false : value
          )));
        }, CAROUSEL_FLIP_BACK_DELAY + index * CAROUSEL_FLIP_STAGGER));
      });
    }, replaceDelay));
  }, [pageCount, visibleStarters]);

  useEffect(() => {
    if (isStarterPaused || pageCount <= 1) return undefined;
    const intervalId = window.setInterval(showNextPage, STARTER_ROTATE_INTERVAL);
    return () => window.clearInterval(intervalId);
  }, [isStarterPaused, pageCount, showNextPage]);

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

        <div
          data-testid="starter-prompts"
          className="grid grid-cols-1 gap-3 sm:grid-cols-2"
          onMouseEnter={() => setIsStarterPaused(true)}
          onMouseLeave={() => setIsStarterPaused(false)}
          onFocusCapture={() => setIsStarterPaused(true)}
          onBlurCapture={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget)) {
              setIsStarterPaused(false);
            }
          }}
        >
          {visibleStarters.map((starter, index) => {
            const Icon = starter.icon;
            return (
              <div
                key={starter.id}
                data-testid="starter-card"
                style={{
                  opacity: flippedStarters[index] ? 0 : 1,
                  transform: flippedStarters[index] ? 'rotateX(90deg)' : 'rotateX(0deg)',
                  transition: 'opacity 300ms ease, transform 300ms ease',
                }}
              >
                <button
                  type="button"
                  onClick={() => onSelectPrompt(starter.prompt)}
                  className="group flex min-h-24 w-full items-center gap-4 rounded-2xl border border-border/80 bg-background/90 p-4 text-left shadow-fdv2-xs transition-[border-color,box-shadow,transform] duration-200 hover:-translate-y-0.5 hover:border-border-strong hover:shadow-fdv2-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transform-none motion-reduce:transition-none"
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
              </div>
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
            className="relative mt-6 border-t border-border/60 pt-4"
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
            <div
              ref={inspirationMeasureRef}
              aria-hidden="true"
              className="pointer-events-none absolute left-0 top-0 flex h-0 w-0 gap-2 overflow-hidden invisible"
            >
              {inspirationPool.map((question) => (
                <span
                  key={question}
                  className="shrink-0 whitespace-nowrap rounded-full border px-3.5 py-2 text-xs"
                >
                  {question}
                </span>
              ))}
            </div>
            <div
              ref={inspirationContainerRef}
              data-testid="inspiration-cloud"
              data-row-count={INSPIRATION_ROW_COUNT}
              className="flex min-h-[4.75rem] flex-wrap content-center justify-center gap-2 overflow-hidden"
            >
              {inspirations.map((question, index) => (
                <button
                  key={question}
                  type="button"
                  onClick={() => onSelectPrompt(question)}
                  className="max-w-full truncate whitespace-nowrap rounded-full border border-border/70 bg-bg-subtle px-3.5 py-2 text-xs text-fg-secondary transition-colors hover:border-border-strong hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
