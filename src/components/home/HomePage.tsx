import ModelSelector from "@/components/models/ModelSelector";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
    Card,
    CardContent,
    CardFooter,
    CardHeader,
    CardTitle,
} from "@/components/ui/card";
import { sendMessageStream } from "@/lib/api/chat";
import { generateChatTitle } from "@/lib/api/title";
import { useAppDispatch, useAppSelector } from "@/redux/hooks";
import { addMessage, createChat, endStreaming, endStreamingReasoning, setError, startStreaming, startStreamingReasoning, updateChatTitle, updateMessageReasoning, updateStreamingContent, updateStreamingReasoningContent } from "@/redux/slices/chatSlice";
import { store } from "@/redux/store";
import { FileText, Image, Lightbulb, MessageSquare, Plus, RefreshCw } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { fetchHotTopics, HotTopic, refreshHotTopics } from "@/lib/api/hotTopics";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";

// 热门问题示例数据 - 后期可以通过API获取
const hotTopics = [
  "如何使用深度学习构建图像识别系统？",
  "请帮我分析最近的经济趋势和投资机会",
  "如何优化React应用的性能？",
  "解释量子计算的基本原理",
  "请帮我写一个Python爬虫程序",
  "如何使用GPT模型进行文本摘要？",
  "帮我写一封商务邮件模板",
  "解释什么是向量数据库及其应用场景",
  "帮我创建一个简单的网页设计",
  "如何使用TensorFlow构建神经网络？",
  "请分析莎士比亚《哈姆雷特》的主题",
  "简述人工智能在医疗领域的应用",
  "如何用JavaScript实现数据可视化？",
  "解释区块链技术的工作原理",
  "如何提高英语写作能力？",
  "帮我制定一个健身计划",
  "分析当前人工智能的伦理问题",
  "如何使用大语言模型改进产品体验？",
  "请帮我解释复杂系统理论",
  "如何在Next.js中实现服务端渲染？",
];

interface BulletTopic {
  text: string;
  style: React.CSSProperties;
  id: number;
  track: number;
  width?: number;
  topic: HotTopic;
}

interface BulletScreenProps {
  hotTopics: HotTopic[];
}

const BulletScreen: React.FC<BulletScreenProps> = ({ hotTopics }) => {
  const [visibleTopics, setVisibleTopics] = useState<BulletTopic[]>([]);
  const [currentTopicIndex, setCurrentTopicIndex] = useState(0);
  const dispatch = useAppDispatch();
  const { selectedModelId, models } = useAppSelector((state) => state.models);
  const refreshIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // 轨道数量
  const TRACK_COUNT = 8;
  const TOP_MARGIN = 15; // 顶部边距百分比
  const BOTTOM_MARGIN = 15; // 底部边距百分比
  const MIN_TRACK_SPACING = 40; // 最小轨道间距（像素）
  const MIN_BULLET_SPACING = 300; // 最小弹幕水平间距（像素）
  const MIN_VERTICAL_SPACING = 60; // 最小垂直间距（像素）

  // 记录每个轨道上最后一个弹幕的信息
  const tracksInfo = useRef(
    Array(TRACK_COUNT)
      .fill(0)
      .map(() => ({
        lastUsedTime: 0, // 最后使用时间
        lastBulletWidth: 0, // 最后一个弹幕的宽度
        bulletInProgress: false, // 是否有弹幕正在通过起点
        lastBulletPosition: 0, // 最后一个弹幕的当前位置
      }))
  );

  // DOM引用，用于测量弹幕元素宽度
  const containerRef = useRef<HTMLDivElement>(null);
  const tempMeasureRef = useRef<HTMLDivElement>(null);

  // 测量文本宽度的函数
  const measureTextWidth = (text: string): number => {
    if (!tempMeasureRef.current) return 0;
    tempMeasureRef.current.textContent = text;
    return tempMeasureRef.current.offsetWidth + 24; // 加上padding
  };

  // 获取可用轨道，优化轨道选择逻辑
  const getAvailableTrack = (bulletWidth: number) => {
    const now = Date.now();
    const containerWidth = containerRef.current?.offsetWidth || 1000;

    // 找出所有当前可用的轨道
    const availableTracks = [];
    for (let i = 0; i < TRACK_COUNT; i++) {
      const trackInfo = tracksInfo.current[i];
      const timeSinceLastUse = now - trackInfo.lastUsedTime;

      // 检查轨道是否可用
      if (!trackInfo.bulletInProgress && timeSinceLastUse > 2000) {
        // 检查与其他弹幕的垂直和水平间距
        const hasEnoughSpacing = visibleTopics.every(topic => {
          const bulletElement = document.getElementById(`bullet-${topic.id}`);
          if (!bulletElement) return true;

          const rect = bulletElement.getBoundingClientRect();
          const horizontalSpacing = rect.left - containerWidth;
          
          // 检查水平间距
          if (topic.track === i) {
            if (horizontalSpacing > -MIN_BULLET_SPACING) {
              return false;
            }
          }

          // 检查相邻轨道的垂直间距
          if (Math.abs(topic.track - i) === 1) {
            if (horizontalSpacing > -MIN_BULLET_SPACING * 1.5) {
              return false;
            }
          }

          return true;
        });

        if (hasEnoughSpacing) {
          availableTracks.push(i);
        }
      }
    }

    // 优先选择间隔较大的轨道
    if (availableTracks.length > 0) {
      // 计算每个轨道的适合度分数
      const trackScores = availableTracks.map(track => {
        let score = 0;
        
        // 检查与其他弹幕的间距
        visibleTopics.forEach(topic => {
          const distance = Math.abs(track - topic.track);
          if (distance <= 1) {
            score -= (2 - distance) * 10; // 相邻轨道减分更多
          }
        });

        // 优先选择中间的轨道
        const distanceFromCenter = Math.abs(track - TRACK_COUNT / 2);
        score -= distanceFromCenter * 5;

        return { track, score };
      });

      // 选择得分最高的轨道
      trackScores.sort((a, b) => b.score - a.score);
      const bestTrack = trackScores[0].track;

      tracksInfo.current[bestTrack] = {
        lastUsedTime: now,
        lastBulletWidth: bulletWidth,
        bulletInProgress: true,
        lastBulletPosition: containerWidth,
      };

      return bestTrack;
    }

    return null; // 如果没有合适的轨道，返回null
  };

  // 随机生成弹幕样式，基于轨道
  const generateBulletStyle = (track: number): React.CSSProperties => {
    // 计算可用区域的高度百分比
    const availableHeight = 100 - TOP_MARGIN - BOTTOM_MARGIN;
    
    // 计算轨道位置，使用更均匀的分布
    const trackSpacing = availableHeight / (TRACK_COUNT - 1);
    const topPosition = TOP_MARGIN + (track * trackSpacing);

    // 动态计算时间，让较长的文本有更长的动画时间
    const duration = 15 + Math.random() * 5; // 增加动画时间，使弹幕移动更慢

    return {
      position: "absolute" as const,
      top: `${topPosition}%`,
      left: "100%",
      fontSize: "16px",
      opacity: 0.9,
      whiteSpace: "nowrap",
      cursor: "pointer",
      padding: "6px 12px",
      borderRadius: "20px",
      background: "rgba(100, 100, 255, 0.08)",
      backdropFilter: "blur(8px)",
      boxShadow: "0 2px 10px rgba(0, 0, 0, 0.05)",
      transform: "translateY(-50%)",
      zIndex: 10,
      border: "1px solid rgba(255, 255, 255, 0.08)",
      animation: `bullet-fly ${duration}s linear forwards`,
      height: "fit-content",
      minHeight: "32px", // 确保最小高度
      marginTop: "15px", // 增加垂直间距
      marginBottom: "15px" // 增加垂直间距
    };
  };

  // 处理点击弹幕创建对话
  const handleTopicClick = (topic: HotTopic) => {
    if (!selectedModelId) return;

    // 先创建对话
    dispatch(
      createChat({
        modelId: selectedModelId,
        title: topic.title.length > 20 ? topic.title.substring(0, 20) + "..." : topic.title,
      })
    );

    // 获取最新创建的对话ID
    const state = store.getState();
    const newChat = state.chat.chats[state.chat.chats.length - 1];
    if (!newChat) {
      dispatch(setError('创建对话失败'));
      return;
    }

    const chatId = newChat.id;

    // 添加用户消息
    dispatch(
      addMessage({
        chatId,
        message: {
          role: "user",
          content: topic.title,
          status: "pending",
        }
      })
    );

    // 开始流式输出
    dispatch(startStreaming(chatId));

    // 获取选中的模型信息
    const selectedModel = models.find(m => m.id === selectedModelId);
    if (!selectedModel) {
      dispatch(setError('找不到选中的模型信息'));
      return;
    }

    // 检查推理功能
    const { reasoningEnabled } = store.getState().chat;
    const supportsReasoning = selectedModel.capabilities?.deepThinking || false;
    const useReasoning = reasoningEnabled && supportsReasoning;

    if (useReasoning) {
      dispatch(startStreamingReasoning());
    }

    // 发送消息到服务器
    sendMessageStream({
      provider: selectedModel.provider,
      model: selectedModel.id,
      message: topic.title,
      conversation_id: chatId,
      topic_id: topic.id || null,
      stream: true,
      options: {
        use_reasoning: useReasoning,
        use_enhancement: store.getState().search.contextEnhancementEnabled
      }
    },
    (content, done, conversationId, reasoning) => {
      if (!done) {
        dispatch(updateStreamingContent({
          chatId,
          content
        }));

        if (useReasoning && reasoning) {
          dispatch(updateStreamingReasoningContent(reasoning));
        }
      } else {
        dispatch(updateStreamingContent({
          chatId,
          content
        }));

        setTimeout(() => {
          if (reasoning && reasoning.trim()) {
            const streamingMessageId = store.getState().chat.streamingMessageId;
            if (streamingMessageId) {
              dispatch(updateMessageReasoning({
                chatId,
                messageId: streamingMessageId,
                reasoning: reasoning,
                isVisible: true
              }));
            }
            dispatch(endStreamingReasoning());
          }
          dispatch(endStreaming());
          
          // 在消息流结束后自动生成对话标题
          setTimeout(async () => {
            try {
              const generatedTitle = await generateChatTitle(
                chatId || conversationId || '',
                undefined,
                { max_length: 20 }
              );

              dispatch(updateChatTitle({
                chatId: chatId || conversationId || '',
                title: generatedTitle
              }));
            } catch (error) {
              console.error('生成标题失败:', error);
            }
          }, 1000);
        }, 100);
      }
    }).catch(error => {
      console.error('发送消息失败:', error);
      dispatch(setError('发送消息失败，请重试'));
      dispatch(endStreamingReasoning());
      dispatch(endStreaming());
    });
  };

  // 弹幕元素测量并更新信息
  const measureBullet = (element: HTMLDivElement | null, track: number, id: number) => {
    if (element && containerRef.current) {
      const width = element.offsetWidth;
      const container = containerRef.current as HTMLDivElement;

      // 更新弹幕宽度信息
      tracksInfo.current[track].lastBulletWidth = width;

      // 计算弹幕通过起点所需时间（毫秒）
      // 假设水平动画为20秒，整个屏幕宽度为容器宽度
      const containerWidth = container.offsetWidth;
      const passingTime = (width / containerWidth) * 20000; // 20秒动画

      // 设置一个定时器，在弹幕完全进入后标记轨道为可用
      setTimeout(() => {
        tracksInfo.current[track].bulletInProgress = false;
      }, passingTime + 100); // 额外100ms作为缓冲
    }
  };

  // 添加弹幕的逻辑
  useEffect(() => {
    // 限制同屏弹幕数量
    const MAX_BULLETS = 8; // 减少最大同屏弹幕数量

    const addBullet = () => {
      // 动态控制生成频率，弹幕多时放慢生成
      if (visibleTopics.length >= MAX_BULLETS || hotTopics.length === 0) return;

      // 获取当前要展示的话题
      const topic = hotTopics[currentTopicIndex];
      
      // 预先测量文本宽度
      const width = measureTextWidth(topic.title);
      const track = getAvailableTrack(width);

      if (track !== null) {
        const id = Date.now();
        const newBullet: BulletTopic = {
          text: topic.title,
          style: generateBulletStyle(track),
          id,
          track,
          width,
          topic
        };
        setVisibleTopics((prev) => [...prev, newBullet]);
        
        // 更新下一个要展示的话题索引
        setCurrentTopicIndex((prev) => (prev + 1) % hotTopics.length);
      }
    };

    // 弹幕生成间隔时间随机化，但与屏幕上当前弹幕数量相关
    const dynamicInterval = 2000 + visibleTopics.length * 300 + Math.random() * 1000;
    const interval = setInterval(addBullet, dynamicInterval);

    // 清理过期弹幕
    const cleanupInterval = setInterval(() => {
      const now = Date.now();
      setVisibleTopics((prev) =>
        prev.filter((topic) => {
          const keep = now - topic.id < 20000;
          if (!keep) {
            tracksInfo.current[topic.track].bulletInProgress = false;
          }
          return keep;
        })
      );
    }, 1000);

    return () => {
      clearInterval(interval);
      clearInterval(cleanupInterval);
    };
  }, [visibleTopics.length, hotTopics, currentTopicIndex]);

  // 当hotTopics变化时，重置currentTopicIndex
  useEffect(() => {
    setCurrentTopicIndex(0);
  }, [hotTopics]);

  return (
    <div
      ref={containerRef}
      className="w-full h-full relative overflow-hidden"
      style={{ minHeight: "200px" }}
    >
      <style jsx global>{`
        @keyframes bullet-fly {
          from {
            transform: translateX(0) translateY(-50%);
          }
          to {
            transform: translateX(-120vw) translateY(-50%);
          }
        }
        .bullet {
          animation-play-state: running;
        }
        .bullet[data-hovered="true"] {
          animation-play-state: paused !important;
          background: rgba(100, 100, 255, 0.2) !important;
          border-color: rgba(255, 255, 255, 0.2) !important;
        }
      `}</style>

      {visibleTopics.map((topic) => (
        <HoverCard key={topic.id} openDelay={0}>
          <HoverCardTrigger asChild>
            <div
              id={`bullet-${topic.id}`}
              ref={(el) => measureBullet(el, topic.track, topic.id)}
              style={topic.style}
              onClick={() => handleTopicClick(topic.topic)}
              className="bullet transition-colors duration-300"
              data-hovered="false"
              onMouseEnter={(e) => {
                e.currentTarget.setAttribute('data-hovered', 'true');
              }}
              onMouseLeave={(e) => {
                e.currentTarget.setAttribute('data-hovered', 'false');
              }}
            >
              {topic.text}
            </div>
          </HoverCardTrigger>
          <HoverCardContent 
            className="w-80 p-3 bg-popover/95 backdrop-blur-sm border-border/50"
            side="top"
            align="start"
            sideOffset={5}
            onMouseEnter={(e) => {
              const bullet = document.getElementById(`bullet-${topic.id}`);
              if (bullet) {
                bullet.setAttribute('data-hovered', 'true');
              }
            }}
            onMouseLeave={(e) => {
              const bullet = document.getElementById(`bullet-${topic.id}`);
              if (bullet) {
                bullet.setAttribute('data-hovered', 'false');
              }
            }}
          >
            <div className="space-y-2">
              <div className="text-sm font-medium">{topic.topic.title}</div>
              {topic.topic.description && (
                <p className="text-sm text-muted-foreground line-clamp-3">
                  {topic.topic.description}
                </p>
              )}
              <div className="flex items-center justify-between text-xs text-muted-foreground pt-2 border-t border-border/50">
                <span>{topic.topic.source}</span>
                <a
                  href={topic.topic.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline hover:text-primary/80 transition-colors"
                  onClick={(e) => {
                    e.stopPropagation();
                    window.open(topic.topic.url, '_blank');
                  }}
                >
                  查看原文
                </a>
              </div>
            </div>
          </HoverCardContent>
        </HoverCard>
      ))}
    </div>
  );
};

// 欢迎卡片组件
const WelcomeCard = () => {
  return (
    <Card className="bg-gradient-to-br from-primary/5 via-secondary/10 to-primary/5 border-none shadow-md h-full">
      <CardContent className="flex items-center h-full">
        <div className="flex flex-col items-center text-center space-y-4 w-full">
          <div className="relative">
            <h1 className="text-4xl font-bold tracking-tight">
              欢迎使用 <span className="bg-gradient-to-r from-blue-600 via-purple-500 to-pink-500 text-transparent bg-clip-text">Fusion AI</span> 助手
            </h1>
            <div className="gradient-line"></div>
          </div>
          <style jsx global>{`
            .gradient-text {
              background: linear-gradient(
                90deg,
                hsl(var(--primary)) 0%,
                hsl(var(--secondary)) 50%,
                hsl(var(--primary)) 100%
              );
              background-size: 200% auto;
              color: transparent;
              -webkit-background-clip: text;
              background-clip: text;
              animation: shine 3s linear infinite;
            }

            .gradient-line {
              position: absolute;
              bottom: -4px;
              left: 50%;
              width: 100px;
              height: 2px;
              background: linear-gradient(
                90deg,
                transparent 0%,
                hsl(var(--primary)) 50%,
                transparent 100%
              );
              transform: translateX(-50%);
              opacity: 0.5;
              animation: pulse 2s ease-in-out infinite;
            }

            @keyframes shine {
              to {
                background-position: 200% center;
              }
            }

            @keyframes pulse {
              0%, 100% {
                opacity: 0.2;
                width: 60px;
              }
              50% {
                opacity: 0.5;
                width: 100px;
              }
            }
          `}</style>
          <p className="text-muted-foreground max-w-[600px]">
            强大的AI助手，支持多种大型语言模型，为您提供智能对话、文件处理、代码编写、文档分析等多种功能。
          </p>

          <div className="flex flex-wrap justify-center gap-3 mt-2">
            <Badge variant="secondary" className="px-3 py-1">
              多模型支持
            </Badge>
            <Badge variant="secondary" className="px-3 py-1">
              深度思考
            </Badge>
            <Badge variant="secondary" className="px-3 py-1">
              文件处理
            </Badge>
            <Badge variant="secondary" className="px-3 py-1">
              数据导入导出
            </Badge>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

// 快捷开始卡片 - 科技感样式版本
const QuickStartCard = () => {
  const dispatch = useAppDispatch();
  const { models, selectedModelId } = useAppSelector((state) => state.models);

  const handleNewChat = () => {
    const modelToUse =
      selectedModelId || (models.length > 0 ? models[0].id : null);

    if (!modelToUse) {
      console.error("没有可用的模型，无法创建对话");
      return;
    }

    dispatch(createChat({ modelId: modelToUse }));
  };

  return (
    <Card className="border border-primary/20 bg-gradient-to-br from-background to-background/80 shadow-lg backdrop-blur overflow-hidden relative h-full">
      {/* 背景装饰 */}
      <div className="absolute -bottom-12 -right-12 w-40 h-40 bg-primary/5 rounded-full blur-xl"></div>
      <div className="absolute top-10 -left-10 w-20 h-20 bg-secondary/5 rounded-full blur-xl"></div>

      <div className="flex flex-col h-full">
        <CardHeader>
          <CardTitle className="text-xl">开始新对话</CardTitle>
        </CardHeader>
        <CardContent className="relative z-10 space-y-4 flex-1">
          <div className="bg-muted/30 p-4 rounded-lg backdrop-blur-sm border border-border/50">
            <p className="text-sm font-medium mb-2">选择AI模型</p>
            <div className="relative">
              <ModelSelector />
            </div>
          </div>

          <Button
            onClick={handleNewChat}
            className="w-full h-10 text-sm gap-2 relative overflow-hidden group bg-gradient-to-r from-blue-600 via-purple-500 to-pink-500 hover:opacity-90 transition-opacity"
          >
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000"></div>
            <Plus className="h-4 w-4 group-hover:rotate-90 transition-transform duration-300" />
            <span className="z-10">开始新对话</span>
          </Button>
        </CardContent>
        <CardFooter className="text-xs text-muted-foreground border-t border-border/50 pt-4 relative z-10">
          选择合适的模型开始智能对话，探索AI的无限可能
        </CardFooter>
      </div>
    </Card>
  );
};

// 对话示例数据
const dialogueExamples = [
  [
    {
      title: "智能写作",
      desc: "生成文章、报告",
      examples: ["写一篇科技新闻", "生成产品说明书", "编写商业计划书"]
    },
    {
      title: "代码助手",
      desc: "编程帮助、Debug",
      examples: ["React性能优化", "Python爬虫示例", "Vue组件开发"]
    },
    {
      title: "数据分析",
      desc: "数据处理分析",
      examples: ["分析销售数据", "生成数据报表", "市场趋势分析"]
    },
    {
      title: "知识问答",
      desc: "解答问题讲解",
      examples: ["量子计算原理", "机器学习基础", "区块链技术"]
    }
  ],
  [
    {
      title: "文案创作",
      desc: "营销内容生成",
      examples: ["产品推广文案", "社交媒体文案", "品牌故事"]
    },
    {
      title: "翻译助手",
      desc: "多语言翻译",
      examples: ["中英互译", "技术文档翻译", "本地化建议"]
    },
    {
      title: "教育辅导",
      desc: "学习解惑",
      examples: ["数学题解析", "物理概念讲解", "历史事件分析"]
    },
    {
      title: "创意激发",
      desc: "创意头脑风暴",
      examples: ["产品创新点子", "设计灵感启发", "剧情构思"]
    }
  ],
  [
    {
      title: "项目管理",
      desc: "项目规划建议",
      examples: ["项目进度规划", "风险评估", "团队协作建议"]
    },
    {
      title: "技术咨询",
      desc: "技术方案建议",
      examples: ["架构设计建议", "技术选型分析", "性能优化方案"]
    },
    {
      title: "研究助手",
      desc: "研究方法指导",
      examples: ["文献综述建议", "研究方法选择", "数据分析方法"]
    },
    {
      title: "生活助手",
      desc: "日常生活建议",
      examples: ["健康饮食建议", "运动计划制定", "时间管理技巧"]
    }
  ]
];

// 右侧：热门问题和对话示例
const DialogueExamplesCard = () => {
  const [currentSetIndex, setCurrentSetIndex] = useState(0);
  const [isRotating, setIsRotating] = useState(false);
  const [isChanging, setIsChanging] = useState(false);
  const dispatch = useAppDispatch();
  const { selectedModelId, models } = useAppSelector((state) => state.models);

  const handleExampleClick = (example: string) => {
    if (!selectedModelId) return;

    dispatch(
      createChat({
        modelId: selectedModelId,
        title: example.length > 20 ? example.substring(0, 20) + "..." : example,
      })
    );

    const state = store.getState();
    const newChat = state.chat.chats[state.chat.chats.length - 1];
    if (!newChat) {
      dispatch(setError('创建对话失败'));
      return;
    }

    const chatId = newChat.id;

    dispatch(
      addMessage({
        chatId,
        message: {
          role: "user",
          content: example,
          status: "pending",
        }
      })
    );

    dispatch(startStreaming(chatId));

    const selectedModel = models.find(m => m.id === selectedModelId);
    if (!selectedModel) {
      dispatch(setError('找不到选中的模型信息'));
      return;
    }

    const { reasoningEnabled } = store.getState().chat;
    const supportsReasoning = selectedModel.capabilities?.deepThinking || false;
    const useReasoning = reasoningEnabled && supportsReasoning;

    if (useReasoning) {
      dispatch(startStreamingReasoning());
    }

    sendMessageStream({
      provider: selectedModel.provider,
      model: selectedModel.id,
      message: example.trim(),
      conversation_id: chatId,
      stream: true,
      options: {
        use_reasoning: useReasoning,
        use_enhancement: store.getState().search.contextEnhancementEnabled
      }
    },
    (content, done, conversationId, reasoning) => {
      if (!done) {
        dispatch(updateStreamingContent({
          chatId,
          content
        }));

        if (useReasoning && reasoning) {
          dispatch(updateStreamingReasoningContent(reasoning));
        }
      } else {
        dispatch(updateStreamingContent({
          chatId,
          content
        }));

        setTimeout(() => {
          if (reasoning && reasoning.trim()) {
            const streamingMessageId = store.getState().chat.streamingMessageId;
            if (streamingMessageId) {
              dispatch(updateMessageReasoning({
                chatId,
                messageId: streamingMessageId,
                reasoning: reasoning,
                isVisible: true
              }));
            }
            dispatch(endStreamingReasoning());
          }
          dispatch(endStreaming());
          
          setTimeout(async () => {
            try {
              const generatedTitle = await generateChatTitle(
                chatId || conversationId || '',
                undefined,
                { max_length: 20 }
              );

              dispatch(updateChatTitle({
                chatId: chatId || conversationId || '',
                title: generatedTitle
              }));
            } catch (error) {
              console.error('生成标题失败:', error);
            }
          }, 1000);
        }, 100);
      }
    }).catch(error => {
      console.error('发送消息失败:', error);
      dispatch(setError('发送消息失败，请重试'));
      dispatch(endStreamingReasoning());
      dispatch(endStreaming());
    });
  };

  const handleNextSet = () => {
    setIsRotating(true);
    setIsChanging(true);
    
    // 先淡出当前内容
    setTimeout(() => {
      setCurrentSetIndex((prev) => (prev + 1) % dialogueExamples.length);
      // 淡入新内容
      setTimeout(() => {
        setIsChanging(false);
      }, 150);
    }, 150);

    // 重置旋转动画
    setTimeout(() => {
      setIsRotating(false);
    }, 500);
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <MessageSquare className="h-5 w-5 text-primary" />
            对话示例
          </CardTitle>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleNextSet}
            className="h-8 px-2 hover:bg-muted/50 group"
            disabled={isRotating}
          >
            <span className="text-xs mr-1">换一批</span>
            <RefreshCw className={cn(
              "h-4 w-4 transition-transform duration-500",
              isRotating && "rotate-180"
            )} />
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className={cn(
          "grid grid-cols-2 gap-4 transition-opacity duration-150",
          isChanging ? "opacity-0" : "opacity-100"
        )}>
          {dialogueExamples[currentSetIndex].map((item, index) => (
            <div 
              key={index} 
              className="p-4 rounded-lg border bg-card hover:bg-accent/5 transition-colors cursor-pointer min-h-[180px] flex flex-col"
              onClick={() => handleExampleClick(item.examples[0])}
            >
              <h3 className="font-medium text-base mb-2">{item.title}</h3>
              <p className="text-sm text-muted-foreground mb-3">{item.desc}</p>
              <div className="space-y-2.5 flex-1">
                {item.examples.slice(0, 2).map((example, i) => (
                  <div key={i} className="text-sm px-3 py-2 bg-muted/50 rounded-md hover:bg-muted">
                    {example}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
};

// 热点弹幕卡片
const HotTopicsCard = () => {
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastRefreshTime, setLastRefreshTime] = useState<number>(0);
  const [hotTopics, setHotTopics] = useState<HotTopic[]>([]);
  const [refreshResult, setRefreshResult] = useState<{ newCount: number; timestamp: string } | null>(null);
  const refreshIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // 加载热点话题
  const loadHotTopics = async () => {
    try {
      const topics = await fetchHotTopics();
      setHotTopics(topics);
    } catch (error) {
      console.error('加载热点话题失败:', error);
    }
  };

  // 处理手动刷新
  const handleRefresh = async () => {
    const now = Date.now();
    // 如果距离上次刷新时间小于5分钟，不允许刷新
    if (now - lastRefreshTime < 5 * 60 * 1000) {
      return;
    }

    setIsRefreshing(true);
    try {
      const result = await refreshHotTopics();
      if (result.status === 'success') {
        setLastRefreshTime(now);
        setRefreshResult({
          newCount: result.new_count,
          timestamp: result.timestamp
        });
        // 等待5分钟后自动刷新数据
        setTimeout(loadHotTopics, 5 * 60 * 1000);
      }
    } finally {
      setIsRefreshing(false);
    }
  };

  // 初始化加载和设置定时刷新
  useEffect(() => {
    loadHotTopics();

    // 设置每小时自动刷新
    refreshIntervalRef.current = setInterval(loadHotTopics, 60 * 60 * 1000);

    return () => {
      if (refreshIntervalRef.current) {
        clearInterval(refreshIntervalRef.current);
      }
    };
  }, []);

  // 计算距离下次可刷新的时间
  const getNextRefreshTime = () => {
    const now = Date.now();
    const timeSinceLastRefresh = now - lastRefreshTime;
    const timeUntilNextRefresh = Math.max(0, 5 * 60 * 1000 - timeSinceLastRefresh);
    return Math.ceil(timeUntilNextRefresh / 1000);
  };

  const [nextRefreshTime, setNextRefreshTime] = useState(getNextRefreshTime());

  // 更新倒计时
  useEffect(() => {
    const timer = setInterval(() => {
      setNextRefreshTime(getNextRefreshTime());
    }, 1000);

    return () => clearInterval(timer);
  }, [lastRefreshTime]);

  // 清除刷新结果提示
  useEffect(() => {
    if (refreshResult) {
      const timer = setTimeout(() => {
        setRefreshResult(null);
      }, 5000); // 5秒后清除提示
      return () => clearTimeout(timer);
    }
  }, [refreshResult]);

  return (
    <Card className="h-full flex flex-col">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-xl flex items-center">
            <span className="relative mr-2">
              <span className="absolute -left-1 -top-1 w-2 h-2 bg-red-500 rounded-full animate-ping"></span>
              <span className="absolute -left-1 -top-1 w-2 h-2 bg-red-500 rounded-full"></span>
            </span>
            热门话题
          </CardTitle>
          <div className="flex items-center gap-2">
            {nextRefreshTime > 0 && (
              <span className="text-sm text-muted-foreground">
                {Math.floor(nextRefreshTime / 60)}:{(nextRefreshTime % 60).toString().padStart(2, '0')}
              </span>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={handleRefresh}
              disabled={isRefreshing || nextRefreshTime > 0}
              className="h-8 px-2"
              title={nextRefreshTime > 0 ? `请等待${nextRefreshTime}秒后刷新` : '刷新热点话题'}
            >
              <RefreshCw className={cn(
                "h-4 w-4",
                isRefreshing && "animate-spin"
              )} />
            </Button>
          </div>
        </div>
        {refreshResult && (
          <div className="mt-2 text-sm text-muted-foreground">
            已更新 {refreshResult.newCount} 条新话题
          </div>
        )}
      </CardHeader>
      <CardContent className="flex-1 overflow-hidden pb-4">
        <div className="text-sm text-muted-foreground mb-2">
          点击任意热门话题，开始一个新的对话
        </div>
        <div className="mt-2 h-[200px]">
          <BulletScreen hotTopics={hotTopics} />
        </div>
      </CardContent>
    </Card>
  );
};

// 模型能力展示
const ModelCapabilitiesSection = () => {
  const modelCapabilities = [
    {
      id: "reasoning",
      title: "深度思考",
      description: "先思考、逐步分析再回答问题",
      icon: <Lightbulb className="h-8 w-8 text-amber-500" />,
    },
    {
      id: "vision",
      title: "视觉识别",
      description: "理解和分析图像内容",
      icon: <Image className="h-8 w-8 text-blue-500" />,
    },
    {
      id: "files",
      title: "文件处理",
      description: "处理各种类型的文件和数据",
      icon: <FileText className="h-8 w-8 text-green-500" />,
    },
    {
      id: "chatting",
      title: "智能对话",
      description: "自然流畅的多轮对话",
      icon: <MessageSquare className="h-8 w-8 text-purple-500" />,
    },
  ];

  return (
    <Card className="h-full flex flex-col">
      <CardHeader>
        <CardTitle className="text-xl">AI 能力展示</CardTitle>
      </CardHeader>
      <CardContent className="flex-1">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {modelCapabilities.map((capability) => (
            <div
              key={capability.id}
              className="flex flex-col items-center text-center p-3 bg-muted/20 rounded-lg 
                        hover:bg-accent/20 transition-all duration-300 transform hover:-translate-y-1 
                        border border-border/50 hover:border-primary/30"
            >
              <div className="p-2 rounded-full bg-background/50 backdrop-blur-sm">
                {capability.icon}
              </div>
              <h3 className="font-medium mt-2 text-sm">{capability.title}</h3>
              <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                {capability.description}
              </p>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
};

// 添加接口定义
interface HomePageProps {
  onNewChat: () => void;
  onChatSelected?: () => void;
}

// 主页组件
const HomePage: React.FC<HomePageProps> = ({ onNewChat }) => {
  // 获取dispatch函数以便可以调用Redux操作
  const dispatch = useAppDispatch();
  const { models, selectedModelId } = useAppSelector((state) => state.models);

  // 创建新对话处理函数
  const handleNewChat = () => {
    // 确保有选中的模型ID
    const modelToUse = selectedModelId || (models.length > 0 ? models[0].id : null);

    if (!modelToUse) {
      console.error("没有可用的模型，无法创建对话");
      dispatch(setError('没有可用的模型，无法创建对话'));
      return;
    }

    // 不再自己创建对话，而是调用传入的回调函数
    if (onNewChat) {
      onNewChat();
    }
  };

  return (
    <div className="h-[calc(100vh-4rem)] flex flex-col overflow-auto">
      <div className="flex-1 p-4 md:p-6 space-y-6">
        {/* 欢迎标题和说明 */}
        <div className="text-center space-y-2 mb-6">
          <h1 className="text-3xl font-bold">欢迎使用 <span className="bg-gradient-to-r from-blue-600 via-purple-500 to-pink-500 text-transparent bg-clip-text">Fusion AI</span> 助手</h1>
          <p className="text-muted-foreground max-w-2xl mx-auto">
            强大的AI助手，支持多种大型语言模型，为您提供智能对话、文档分析、代码生成等多种功能。
          </p>
        </div>

        {/* AI 能力中心标题 */}
        <div>
          <h2 className="text-2xl font-semibold mb-4">AI 能力中心</h2>
          
          <style jsx global>{`
            @keyframes iconBounce {
              0%, 100% { transform: translateY(0) scale(1); }
              40% { transform: translateY(-8px) scale(1.05); }
              60% { transform: translateY(-8px) scale(1.05); }
              80% { transform: translateY(2px) scale(0.95); }
            }
            
            @keyframes shineEffect {
              0% {
                background-position: -100% 0;
                opacity: 0.2;
              }
              100% {
                background-position: 300% 0;
                opacity: 1;
              }
            }
            
            @keyframes borderGlow {
              0%, 100% { border-color: rgba(99, 102, 241, 0.2); }
              50% { border-color: rgba(99, 102, 241, 0.5); }
            }
            
            .card-border-effect {
              position: relative;
              border: 1px solid transparent;
              background-clip: padding-box;
              transition: all 0.3s ease;
            }
            
            .card-border-effect::before {
              content: '';
              position: absolute;
              top: -1px;
              left: -1px;
              right: -1px;
              bottom: -1px;
              z-index: -1;
              margin: -1px;
              border-radius: inherit;
              background: linear-gradient(
                60deg, 
                rgba(99, 102, 241, 0), 
                rgba(99, 102, 241, 0)
              );
              transition: opacity 0.2s ease;
              opacity: 0;
            }
            
            .card-border-effect-blue:hover::before {
              background: linear-gradient(
                90deg, 
                rgba(59, 130, 246, 0.1), 
                rgba(99, 102, 241, 0.2), 
                rgba(59, 130, 246, 0.1)
              );
              opacity: 1;
            }
            
            .card-border-effect-amber:hover::before {
              background: linear-gradient(
                90deg, 
                rgba(245, 158, 11, 0.1), 
                rgba(252, 211, 77, 0.2), 
                rgba(245, 158, 11, 0.1)
              );
              opacity: 1;
            }
            
            .card-border-effect-emerald:hover::before {
              background: linear-gradient(
                90deg, 
                rgba(16, 185, 129, 0.1), 
                rgba(5, 150, 105, 0.2), 
                rgba(16, 185, 129, 0.1)
              );
              opacity: 1;
            }
            
            .card-border-effect-purple:hover::before {
              background: linear-gradient(
                90deg, 
                rgba(139, 92, 246, 0.1), 
                rgba(124, 58, 237, 0.2), 
                rgba(139, 92, 246, 0.1)
              );
              opacity: 1;
            }
            
            /* 添加卡片内容闪光效果 */
            .card-shine-effect {
              position: relative;
              overflow: hidden;
            }
            
            .card-shine-effect::after {
              content: '';
              position: absolute;
              top: -50%;
              left: -50%;
              width: 200%;
              height: 200%;
              background: transparent;
              transform: rotate(30deg);
              opacity: 0;
              pointer-events: none;
            }
            
            @keyframes shine-sweep {
              0% {
                opacity: 0;
                transform: rotate(30deg) translate(-100%, -100%);
              }
              20% {
                opacity: 0.2;
              }
              80% {
                opacity: 0.2;
              }
              100% {
                opacity: 0;
                transform: rotate(30deg) translate(100%, 100%);
              }
            }
          `}</style>
          
          {/* 功能卡片网格 */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            
            {/* AI 聊天卡片 - 可用状态 */}
            <Card className="group hover:border-primary/50 hover:shadow-lg hover:scale-[1.02] transition-all duration-300 overflow-hidden relative border-border/30 card-border-effect card-border-effect-blue">
              {/* 背景装饰 */}
              <div className="absolute -right-8 -bottom-10 w-32 h-32 bg-blue-600/10 rounded-full blur-xl opacity-70 group-hover:opacity-100 transition-opacity"></div>
              <div className="absolute right-10 bottom-0 w-12 h-12 bg-blue-600/20 rounded-full blur-xl opacity-70 group-hover:opacity-100 transition-opacity"></div>
              <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-blue-600/40 to-transparent"></div>
              
              <CardHeader className="pb-2 relative z-10">
                <div className="absolute -top-3 right-5">
                  <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 text-xs group-hover:shadow-sm">
                    可用
                  </Badge>
                </div>
                <div className="size-14 flex items-center justify-center">
                  <div className="size-12 rounded-lg bg-gradient-to-br from-blue-500/30 to-blue-600/20 flex items-center justify-center border border-blue-500/40 shadow-[0_0_12px_rgba(59,130,246,0.25)] dark:shadow-[0_0_12px_rgba(59,130,246,0.35)] group-hover:shadow-[0_0_16px_rgba(59,130,246,0.4)] transition-all duration-300">
                    <MessageSquare className="h-6 w-6 text-blue-600 drop-shadow-sm group-hover:scale-110 transition-transform" />
                  </div>
                </div>
                <CardTitle className="text-xl mt-1">AI 聊天</CardTitle>
              </CardHeader>
              <CardContent className="relative z-10">
                <p className="text-sm text-muted-foreground">
                  智能对话，深度思考，支持多种语言模型与上下文记忆功能。
                </p>
              </CardContent>
              <CardFooter>
                <Button 
                  className="w-full relative overflow-hidden group bg-gradient-to-r from-blue-600 to-indigo-600 hover:opacity-90 transition-opacity"
                  onClick={handleNewChat}
                >
                  <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700 ease-out"></div>
                  <span className="z-10">开始对话</span>
                </Button>
              </CardFooter>
            </Card>
            
            {/* AI 图像卡片 - 测试中状态 */}
            <Card className="group hover:border-primary/50 hover:shadow-lg hover:scale-[1.02] transition-all duration-300 overflow-hidden relative border-border/30 card-border-effect card-border-effect-amber">
              {/* 背景装饰 */}
              <div className="absolute -right-8 -bottom-10 w-32 h-32 bg-amber-500/10 rounded-full blur-xl opacity-70 group-hover:opacity-100 transition-opacity"></div>
              <div className="absolute right-10 bottom-0 w-12 h-12 bg-amber-500/20 rounded-full blur-xl opacity-70 group-hover:opacity-100 transition-opacity"></div>
              <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-amber-500/40 to-transparent"></div>
              
              <CardHeader className="pb-2 relative z-10">
                <div className="absolute -top-3 right-5">
                  <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200 text-xs group-hover:shadow-sm">
                    测试中
                  </Badge>
                </div>
                <div className="size-14 flex items-center justify-center">
                  <div className="size-12 rounded-lg bg-gradient-to-br from-amber-500/30 to-orange-500/20 flex items-center justify-center border border-amber-500/40 shadow-[0_0_12px_rgba(245,158,11,0.25)] dark:shadow-[0_0_12px_rgba(245,158,11,0.35)] group-hover:shadow-[0_0_16px_rgba(245,158,11,0.4)] transition-all duration-300">
                    <Image className="h-6 w-6 text-amber-600 drop-shadow-sm group-hover:scale-110 transition-transform" />
                  </div>
                </div>
                <CardTitle className="text-xl mt-1">AI 图像</CardTitle>
              </CardHeader>
              <CardContent className="relative z-10">
                <p className="text-sm text-muted-foreground">
                  文本生成图像，视觉处理，支持多种风格与定制化选项。
                </p>
              </CardContent>
              <CardFooter>
                <Button 
                  className="w-full relative" 
                  variant="outline"
                  disabled
                >
                  即将推出
                </Button>
              </CardFooter>
            </Card>
            
            {/* 文档分析卡片 - 规划中状态 */}
            <Card className="group hover:border-primary/50 hover:shadow-lg hover:scale-[1.02] transition-all duration-300 overflow-hidden relative border-border/30 card-border-effect card-border-effect-emerald">
              {/* 背景装饰 */}
              <div className="absolute -right-8 -bottom-10 w-32 h-32 bg-emerald-500/10 rounded-full blur-xl opacity-70 group-hover:opacity-100 transition-opacity"></div>
              <div className="absolute right-10 bottom-0 w-12 h-12 bg-emerald-500/20 rounded-full blur-xl opacity-70 group-hover:opacity-100 transition-opacity"></div>
              <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-emerald-500/40 to-transparent"></div>
              
              <CardHeader className="pb-2 relative z-10">
                <div className="absolute -top-3 right-5">
                  <Badge variant="outline" className="bg-slate-100 text-slate-700 border-slate-200 text-xs group-hover:shadow-sm">
                    规划中
                  </Badge>
                </div>
                <div className="size-14 flex items-center justify-center">
                  <div className="size-12 rounded-lg bg-gradient-to-br from-emerald-500/30 to-teal-500/20 flex items-center justify-center border border-emerald-500/40 shadow-[0_0_12px_rgba(16,185,129,0.25)] dark:shadow-[0_0_12px_rgba(16,185,129,0.35)] group-hover:shadow-[0_0_16px_rgba(16,185,129,0.4)] transition-all duration-300">
                    <FileText className="h-6 w-6 text-emerald-600 drop-shadow-sm group-hover:scale-110 transition-transform" />
                  </div>
                </div>
                <CardTitle className="text-xl mt-1">文档分析</CardTitle>
              </CardHeader>
              <CardContent className="relative z-10">
                <p className="text-sm text-muted-foreground">
                  智能处理文档，提取信息，支持多种文件格式与精准摘要。
                </p>
              </CardContent>
              <CardFooter>
                <Button 
                  className="w-full" 
                  variant="outline"
                  disabled
                >
                  即将推出
                </Button>
              </CardFooter>
            </Card>
            
            {/* 代码助手卡片 - 规划中状态 */}
            <Card className="group hover:border-primary/50 hover:shadow-lg hover:scale-[1.02] transition-all duration-300 overflow-hidden relative border-border/30 card-border-effect card-border-effect-purple">
              {/* 背景装饰 */}
              <div className="absolute -right-8 -bottom-10 w-32 h-32 bg-purple-500/10 rounded-full blur-xl opacity-70 group-hover:opacity-100 transition-opacity"></div>
              <div className="absolute right-10 bottom-0 w-12 h-12 bg-purple-500/20 rounded-full blur-xl opacity-70 group-hover:opacity-100 transition-opacity"></div>
              <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-purple-500/40 to-transparent"></div>
              
              <CardHeader className="pb-2 relative z-10">
                <div className="absolute -top-3 right-5">
                  <Badge variant="outline" className="bg-slate-100 text-slate-700 border-slate-200 text-xs group-hover:shadow-sm">
                    规划中
                  </Badge>
                </div>
                <div className="size-14 flex items-center justify-center">
                  <div className="size-12 rounded-lg bg-gradient-to-br from-purple-500/30 to-violet-500/20 flex items-center justify-center border border-purple-500/40 shadow-[0_0_12px_rgba(139,92,246,0.25)] dark:shadow-[0_0_12px_rgba(139,92,246,0.35)] group-hover:shadow-[0_0_16px_rgba(139,92,246,0.4)] transition-all duration-300">
                    <div className="h-6 w-6 flex items-center justify-center text-purple-600 font-mono font-bold drop-shadow-sm group-hover:scale-110 transition-transform">
                      { "<>" }
                    </div>
                  </div>
                </div>
                <CardTitle className="text-xl mt-1">代码助手</CardTitle>
              </CardHeader>
              <CardContent className="relative z-10">
                <p className="text-sm text-muted-foreground">
                  编程帮助，代码生成，支持多种编程语言与自动化解决方案。
                </p>
              </CardContent>
              <CardFooter>
                <Button 
                  className="w-full" 
                  variant="outline"
                  disabled
                >
                  即将推出
                </Button>
              </CardFooter>
            </Card>
          </div>
        </div>
        
        {/* 热门话题区域 */}
        <div className="pt-4">
          <h2 className="text-2xl font-semibold mb-4">探索热门话题</h2>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <HotTopicsCard />
            <DialogueExamplesCard />
          </div>
        </div>
        
        {/* 快速开始区域 - 暂时隐藏
        <Card className="mt-6 border-primary/20">
          <CardContent className="flex flex-col md:flex-row items-center justify-between gap-4 py-4">
            <div>
              <h3 className="text-lg font-medium">快速开始:</h3>
              <p className="text-sm text-muted-foreground">创建新对话或查看使用教程</p>
            </div>
            <div className="flex gap-3">
              <Button onClick={handleNewChat}>
                <Plus className="mr-2 h-4 w-4" />
                新建AI对话
              </Button>
              <Button variant="outline">
                查看使用教程
              </Button>
            </div>
          </CardContent>
        </Card>
        */}
      </div>
    </div>
  );
};

export default HomePage;
