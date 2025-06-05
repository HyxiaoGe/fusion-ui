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
import { addMessage, createChat, endStreaming, endStreamingReasoning, setError, startStreaming, startStreamingReasoning, updateChatTitle, updateServerChatTitle, updateMessageReasoning, updateStreamingContent, updateStreamingReasoningContent, setActiveChat } from "@/redux/slices/chatSlice";
import { store } from "@/redux/store";
import { FileText, Image, Lightbulb, MessageSquare, Plus, RefreshCw } from "lucide-react";
import { useEffect, useState, useCallback, memo } from "react";
import { cn } from "@/lib/utils";
import { HotTopic, getCachedHotTopics } from "@/lib/api/hotTopics";
import { useChatListRefresh } from "@/hooks/useChatListRefresh";

// 添加接口定义
interface HomePageProps {
  onNewChat: () => void;
  onChatSelected?: () => void;
}

// 主页组件
const HomePage: React.FC<HomePageProps> = ({ onNewChat, onChatSelected }) => {
  const { selectedModelId, models } = useAppSelector((state) => state.models);
  const dispatch = useAppDispatch();
  const { triggerRefresh: refreshChatList } = useChatListRefresh();
  const [allHotTopics, setAllHotTopics] = useState<HotTopic[]>([]);  // 存储所有缓存的热点话题
  const [displayTopics, setDisplayTopics] = useState<HotTopic[]>([]); // 当前显示的热点话题
  const [isRefreshing, setIsRefreshing] = useState(false);
  
  // 加载热点话题数据
  const loadHotTopics = async () => {
    try {      
      // 直接请求API数据
      const topics = await getCachedHotTopics(30);  // 获取30条数据
      
      // 更新状态
      setAllHotTopics(topics);
      
      // 首次加载时，随机选择6条显示
      if (topics.length > 0 && displayTopics.length === 0) {
        const initialTopics = [...topics].sort(() => 0.5 - Math.random()).slice(0, 6);
        setDisplayTopics(initialTopics);
      }
    } catch (error) {
      console.error('加载热点话题失败:', error);
    }
  };
  
  // 初始加载热点话题
  useEffect(() => {
    // 立即执行一次加载
    loadHotTopics();
    
    // 只在确实没有数据时才重试
    const retryTimer = setTimeout(() => {
      if (displayTopics.length === 0) {
        
        // 如果有数据但未显示，则选择数据显示
        if (allHotTopics.length > 0) {
          const initialTopics = [...allHotTopics].sort(() => 0.5 - Math.random()).slice(0, 6);
          setDisplayTopics(initialTopics);
        } 
      }
    }, 3000);
    
    // 设置定期检查缓存是否更新（降低频率）
    const interval = setInterval(() => {
      loadHotTopics();
    }, 60 * 1000); // 改为60秒检查一次
    
    return () => {
      clearTimeout(retryTimer);
      clearInterval(interval);
    };
  }, []); // 移除依赖，避免无限重新渲染

  // 从缓存中随机选择6条数据显示
  const refreshDisplayTopics = useCallback(() => {
    if (allHotTopics.length === 0) return;
    
    setIsRefreshing(true);
    
    // 从所有话题中随机选择6条
    const shuffled = [...allHotTopics].sort(() => 0.5 - Math.random());
    const selected = shuffled.slice(0, 6);
    setDisplayTopics(selected);
    
    setTimeout(() => setIsRefreshing(false), 300);  // 添加一点延迟让动画效果更明显
  }, [allHotTopics]);

  // 添加处理话题点击的函数
  const handleTopicClick = useCallback((topic: HotTopic) => {
    if (!selectedModelId) return;

    // 获取当前状态
    const state = store.getState();
    
    // 检查是否存在空白会话（新创建的没有消息的会话）
    const existingEmptyChat = state.chat.chats.find(chat => 
      chat.messages.length === 0 && chat.title === '新对话'
    );
    
    let chatId;
    
    // 如果存在空白会话，使用它；否则创建新会话
    if (existingEmptyChat) {
      chatId = existingEmptyChat.id;
      
      // 更新空白会话的标题为话题标题
      const initialTitle = topic.title.length > 20 ? topic.title.substring(0, 20) + "..." : topic.title;
      dispatch(updateChatTitle({
        chatId: chatId,
        title: initialTitle
      }));
      
      // 同时更新服务端列表中的标题
      dispatch(updateServerChatTitle({
        chatId: chatId,
        title: initialTitle
      }));
    } else {
      // 创建对话
      dispatch(
        createChat({
          modelId: selectedModelId,
          title: topic.title.length > 20 ? topic.title.substring(0, 20) + "..." : topic.title,
        })
      );

      // 获取最新创建的对话ID
      const updatedState = store.getState();
      const newChat = updatedState.chat.chats[updatedState.chat.chats.length - 1];
      if (!newChat) {
        dispatch(setError('创建对话失败'));
        return;
      }
      chatId = newChat.id;
      
      // 刷新对话列表，确保新对话显示在左侧面板
      setTimeout(() => {
        refreshChatList();
      }, 100);
    }

    // 添加用户消息
    dispatch(
      addMessage({
        chatId: chatId,
        message: {
          role: "user",
          content: `请帮我分析以下热点话题：\n\n${topic.title}`,
          status: "pending",
        }
      })
    );

    // 如果有回调函数，通知外部组件已选择聊天
    if (onChatSelected) {
      onChatSelected();
    }

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

    // 添加网络搜索功能检查
    const { webSearchEnabled } = store.getState().chat;
    const supportsWebSearch = selectedModel.capabilities?.webSearch || false;
    const useWebSearch = webSearchEnabled && supportsWebSearch;

    // 添加函数调用功能检查
    const supportsFunctionCall = selectedModel.capabilities?.functionCalling || false;
    const useFunctionCall = supportsFunctionCall; // 默认启用，如果模型支持

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
        use_web_search: useWebSearch,
        use_function_call: useFunctionCall
      }
    },
    (content, done, conversationId, reasoning) => {
      if (!done) {
        dispatch(updateStreamingContent({
          chatId: chatId,
          content
        }));

        if (useReasoning && reasoning) {
          dispatch(updateStreamingReasoningContent(reasoning));
        }
      } else {
        dispatch(updateStreamingContent({
          chatId: chatId,
          content
        }));

        setTimeout(() => {
          if (reasoning && reasoning.trim()) {
            const streamingMessageId = store.getState().chat.streamingMessageId;
            if (streamingMessageId) {
              dispatch(updateMessageReasoning({
                chatId: chatId,
                messageId: streamingMessageId,
                reasoning: reasoning,
                isVisible: true
              }));
            }
            // 此时不再调用endStreamingReasoning，因为推理阶段已在接收到[REASONING_COMPLETE]标记时结束
            // 如果推理还没结束（可能没有收到完整标记），则在这里结束
            if (!store.getState().chat.isThinkingPhaseComplete) {
              dispatch(endStreamingReasoning());
            }
          }
          dispatch(endStreaming());
          
          // 如果返回了新的conversationId，更新Redux状态
          if (conversationId && conversationId !== chatId) {
            console.log(`话题对话收到新ID: ${conversationId}，当前ID: ${chatId}`);
            dispatch(setActiveChat(conversationId));
          }
          
          // 在消息流结束后自动生成对话标题并刷新对话列表
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
              
              // 同时更新服务端列表中的标题
              dispatch(updateServerChatTitle({
                chatId: chatId || conversationId || '',
                title: generatedTitle
              }));
              
              // 标题生成后刷新对话列表
              refreshChatList();
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
  }, [selectedModelId, dispatch, models, onChatSelected, refreshChatList]);

  // 添加处理示例点击的函数
  const handleExampleClick = useCallback((example: string) => {
    if (!selectedModelId) return;

    // 获取当前状态
    const state = store.getState();
    
    // 检查是否存在空白会话（新创建的没有消息的会话）
    const existingEmptyChat = state.chat.chats.find(chat => 
      chat.messages.length === 0 && chat.title === '新对话'
    );
    
    let chatId;
    
    // 如果存在空白会话，使用它；否则创建新会话
    if (existingEmptyChat) {
      chatId = existingEmptyChat.id;
      
      // 更新空白会话的标题为示例标题
      const initialTitle = example.length > 20 ? example.substring(0, 20) + "..." : example;
      dispatch(updateChatTitle({
        chatId: chatId,
        title: initialTitle
      }));
      
      // 同时更新服务端列表中的标题
      dispatch(updateServerChatTitle({
        chatId: chatId,
        title: initialTitle
      }));
    } else {
      // 创建对话
      dispatch(
        createChat({
          modelId: selectedModelId,
          title: example.length > 20 ? example.substring(0, 20) + "..." : example,
        })
      );

      // 获取最新创建的对话ID
      const updatedState = store.getState();
      const newChat = updatedState.chat.chats[updatedState.chat.chats.length - 1];
      if (!newChat) {
        dispatch(setError('创建对话失败'));
        return;
      }
      chatId = newChat.id;
    }

    // 添加用户消息
    dispatch(
      addMessage({
        chatId: chatId,
        message: {
          role: "user",
          content: example,
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

    const { reasoningEnabled } = store.getState().chat;
    const supportsReasoning = selectedModel.capabilities?.deepThinking || false;
    const useReasoning = reasoningEnabled && supportsReasoning;

    // 添加网络搜索功能检查
    const { webSearchEnabled } = store.getState().chat;
    const supportsWebSearch = selectedModel.capabilities?.webSearch || false;
    const useWebSearch = webSearchEnabled && supportsWebSearch;

    // 添加函数调用功能检查
    const supportsFunctionCall = selectedModel.capabilities?.functionCalling || false;
    const useFunctionCall = supportsFunctionCall; // 默认启用，如果模型支持

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
        use_web_search: useWebSearch,
        use_function_call: useFunctionCall
      }
    },
    (content, done, conversationId, reasoning) => {
      if (!done) {
        dispatch(updateStreamingContent({
          chatId: chatId,
          content
        }));

        if (useReasoning && reasoning) {
          dispatch(updateStreamingReasoningContent(reasoning));
        }
      } else {
        dispatch(updateStreamingContent({
          chatId: chatId,
          content
        }));

        setTimeout(() => {
          if (reasoning && reasoning.trim()) {
            const streamingMessageId = store.getState().chat.streamingMessageId;
            if (streamingMessageId) {
              dispatch(updateMessageReasoning({
                chatId: chatId,
                messageId: streamingMessageId,
                reasoning: reasoning,
                isVisible: true
              }));
            }
            // 此时不再调用endStreamingReasoning，因为推理阶段已在接收到[REASONING_COMPLETE]标记时结束
            // 如果推理还没结束（可能没有收到完整标记），则在这里结束
            if (!store.getState().chat.isThinkingPhaseComplete) {
              dispatch(endStreamingReasoning());
            }
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
              
              // 同时更新服务端列表中的标题
              dispatch(updateServerChatTitle({
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
  }, [selectedModelId, dispatch, models, refreshChatList]);

  return (
    <div className="flex flex-col space-y-8 pb-8 px-4 max-w-5xl mx-auto w-full h-full overflow-y-auto">
      <div className="pt-8 text-center">
        <h1 className="text-3xl font-bold mb-2">开始一个新对话</h1>
        <p className="text-muted-foreground">选择下方话题开始，或直接输入您的问题</p>
      </div>

      {/* 热门话题区域 */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold">热门话题</h2>
          <Button 
            variant="ghost" 
            size="sm" 
            className="gap-1" 
            onClick={refreshDisplayTopics}
          >
            <RefreshCw className={cn(
              "h-4 w-4",
              isRefreshing && "animate-spin"
            )} />
            <span>刷新</span>
          </Button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {displayTopics.length > 0 ? (
            displayTopics.map((topic) => (
              <Card 
                key={topic.id}
                className="cursor-pointer hover:bg-muted/50 transition-colors relative h-[120px]" 
                onClick={() => handleTopicClick(topic)}
              >
                <CardHeader className="pb-3">
                  <CardTitle className="text-base mb-6 line-clamp-2">{topic.title}</CardTitle>
                </CardHeader>
                <CardFooter className="pt-1 text-xs text-muted-foreground absolute bottom-0 left-0 pb-3 pl-5">
                  {topic.source} {topic.source && '•'} {topic.category || '热门话题'}
                </CardFooter>
              </Card>
            ))
          ) : (
            // 如果没有数据，显示加载状态或占位卡片
            Array(6).fill(0).map((_, index) => (
              <Card key={index} className="cursor-pointer hover:bg-muted/50 transition-colors opacity-50 relative h-[120px]">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base h-5 bg-muted/50 rounded animate-pulse mb-6 line-clamp-2"></CardTitle>
                </CardHeader>
                <CardFooter className="pt-1 text-xs text-muted-foreground absolute bottom-0 left-0 pb-3 pl-5">
                  <div className="h-4 w-24 bg-muted/50 rounded animate-pulse"></div>
                </CardFooter>
              </Card>
            ))
          )}
        </div>
      </div>

      {/* 对话示例区域 */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold">对话示例</h2>
          <Button variant="ghost" size="sm" className="gap-1" onClick={() => {}}>
            <RefreshCw className="h-4 w-4" />
            <span>刷新</span>
          </Button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {/* 智能写作 */}
          <Card className="border shadow-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <FileText className="h-5 w-5" />
                智能写作
              </CardTitle>
              <p className="text-sm text-muted-foreground">生成文章、报告、内容创作</p>
            </CardHeader>
            <CardContent className="space-y-2">
              <Button 
                variant="ghost" 
                className="w-full justify-start text-muted-foreground hover:text-foreground"
                onClick={() => handleExampleClick("写一篇科技新闻")}
              >
                写一篇科技新闻
              </Button>
              <Button 
                variant="ghost" 
                className="w-full justify-start text-muted-foreground hover:text-foreground"
                onClick={() => handleExampleClick("生成产品说明书")}
              >
                生成产品说明书
              </Button>
            </CardContent>
          </Card>
          
          {/* 代码助手 */}
          <Card className="border shadow-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <span className="text-base">⌨️</span>
                代码助手
              </CardTitle>
              <p className="text-sm text-muted-foreground">编程问题、调试、代码生成</p>
            </CardHeader>
            <CardContent className="space-y-2">
              <Button 
                variant="ghost" 
                className="w-full justify-start text-muted-foreground hover:text-foreground"
                onClick={() => handleExampleClick("React性能优化技巧")}
              >
                React性能优化技巧
              </Button>
              <Button 
                variant="ghost" 
                className="w-full justify-start text-muted-foreground hover:text-foreground"
                onClick={() => handleExampleClick("Python数据分析示例")}
              >
                Python数据分析示例
              </Button>
            </CardContent>
          </Card>

          {/* 数据分析 */}
          <Card className="border shadow-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Lightbulb className="h-5 w-5" />
                数据分析
              </CardTitle>
              <p className="text-sm text-muted-foreground">数据处理、统计分析、可视化</p>
            </CardHeader>
            <CardContent className="space-y-2">
              <Button 
                variant="ghost" 
                className="w-full justify-start text-muted-foreground hover:text-foreground"
                onClick={() => handleExampleClick("分析销售数据趋势")}
              >
                分析销售数据趋势
              </Button>
              <Button 
                variant="ghost" 
                className="w-full justify-start text-muted-foreground hover:text-foreground"
                onClick={() => handleExampleClick("创建数据可视化图表")}
              >
                创建数据可视化图表
              </Button>
            </CardContent>
          </Card>
          
          {/* 知识问答 */}
          <Card className="border shadow-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <MessageSquare className="h-5 w-5" />
                知识问答
              </CardTitle>
              <p className="text-sm text-muted-foreground">概念解释、学术知识、百科</p>
            </CardHeader>
            <CardContent className="space-y-2">
              <Button 
                variant="ghost" 
                className="w-full justify-start text-muted-foreground hover:text-foreground"
                onClick={() => handleExampleClick("量子计算的基本原理")}
              >
                量子计算的基本原理
              </Button>
              <Button 
                variant="ghost" 
                className="w-full justify-start text-muted-foreground hover:text-foreground"
                onClick={() => handleExampleClick("人工智能的发展历程")}
              >
                人工智能的发展历程
              </Button>
            </CardContent>
          </Card>

          {/* 创意写作 */}
          <Card className="border shadow-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Image className="h-5 w-5" />
                创意写作
              </CardTitle>
              <p className="text-sm text-muted-foreground">故事创作、剧本、创意构思</p>
            </CardHeader>
            <CardContent className="space-y-2">
              <Button 
                variant="ghost" 
                className="w-full justify-start text-muted-foreground hover:text-foreground"
                onClick={() => handleExampleClick("写一个科幻短篇故事")}
              >
                写一个科幻短篇故事
              </Button>
              <Button 
                variant="ghost" 
                className="w-full justify-start text-muted-foreground hover:text-foreground"
                onClick={() => handleExampleClick("构思一个电影情节")}
              >
                构思一个电影情节
              </Button>
            </CardContent>
          </Card>

          {/* 工作助手 */}
          <Card className="border shadow-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Plus className="h-5 w-5" />
                工作助手
              </CardTitle>
              <p className="text-sm text-muted-foreground">计划制定、模板生成、总结</p>
            </CardHeader>
            <CardContent className="space-y-2">
              <Button 
                variant="ghost" 
                className="w-full justify-start text-muted-foreground hover:text-foreground"
                onClick={() => handleExampleClick("创建项目计划书")}
              >
                创建项目计划书
              </Button>
              <Button 
                variant="ghost" 
                className="w-full justify-start text-muted-foreground hover:text-foreground"
                onClick={() => handleExampleClick("生成工作周报模板")}
              >
                生成工作周报模板
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default memo(HomePage);
