'use client';

import { useAppDispatch, useAppSelector } from "@/redux/hooks";
import { openSettingsDialog } from "@/redux/slices/settingsSlice";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { ChevronRightIcon, SettingsIcon } from "lucide-react";
import { useCallback } from "react";

interface HeaderProps {
  title?: string;
}

const Header: React.FC<HeaderProps> = ({ title }) => {
  const dispatch = useAppDispatch();
  const pathname = usePathname();
  
  const { activeChatId, chats } = useAppSelector((state) => ({
    activeChatId: state.chat.activeChatId,
    chats: state.chat.chats,
  }));

  const { models, selectedModelId } = useAppSelector((state) => state.models);

  // 获取选择的模型名称
  const getSelectedModelName = useCallback(() => {
    if (!selectedModelId) return 'AI';
    const selectedModel = models.find(model => model.id === selectedModelId);
    return selectedModel ? selectedModel.name : 'AI';
  }, [selectedModelId, models]);

  // 打开设置弹窗
  const handleOpenSettings = useCallback(() => {
    dispatch(openSettingsDialog({}));
  }, [dispatch]);

  // 获取当前页面显示的标题
  const getCurrentPageTitle = useCallback(() => {
    if (pathname === '/') return '首页';
    
    // 优先使用传入的标题，如果存在
    if (title) return title;
    
    // 否则根据当前选择的聊天生成标题
    if (activeChatId) {
      const activeChat = chats.find(chat => chat.id === activeChatId);
      if (activeChat && activeChat.title) {
        return activeChat.title;
      }
      return `与 ${getSelectedModelName()} 的对话`;
    }
    
    return '';
  }, [pathname, title, activeChatId, chats, getSelectedModelName]);
  
  return (
    <header className="h-14 border-b flex items-center justify-between px-5 sticky top-0 z-10 shadow-sm bg-background">
      <div className="flex items-center">
        <Link href="/" className="text-xl font-bold flex items-center mr-6">
          <span className="bg-gradient-to-r from-blue-600 via-purple-500 to-pink-500 text-transparent bg-clip-text">Fusion AI</span>
        </Link>
        
        {/* 面包屑导航 */}
        <div className="hidden sm:flex items-center text-sm">
          <Link href="/" className="text-muted-foreground hover:text-foreground transition-colors">首页</Link>
          {activeChatId && (
            <>
              <ChevronRightIcon className="h-4 w-4 mx-1.5 text-muted-foreground" />
              <span className="text-primary font-medium transition-colors">
                AI 聊天
              </span>
            </>
          )}
        </div>
      </div>

      {/* 中间部分：页面标题 */}
      <div className="absolute left-1/2 transform -translate-x-1/2 font-medium text-base">
        {getCurrentPageTitle()}
      </div>

      {/* 右侧操作按钮 */}
      <div className="flex items-center gap-3">
        <Button 
          variant="ghost"
          size="icon" 
          onClick={handleOpenSettings}
          className={cn(
            "h-9 w-9 rounded-full shadow-sm transition-all duration-300",
            "hover:scale-110 hover:shadow-md",
            "text-foreground"
          )}
          aria-label="设置"
        >
          <SettingsIcon className="h-4 w-4 transition-transform" />
        </Button>
      </div>
    </header>
  );
};

export default Header;