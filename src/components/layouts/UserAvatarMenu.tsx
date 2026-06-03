"use client";

import { useAppDispatch, useAppSelector } from "@/redux/hooks";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { openSettingsDialog } from "@/redux/slices/settingsSlice";
import { logoutWithSso } from "@/redux/slices/authSlice";
import { resetConversationState } from "@/redux/slices/conversationSlice";
import { resetFileUploadState } from "@/redux/slices/fileUploadSlice";
import { endStream } from "@/redux/slices/streamSlice";
import { Settings, LogOut, LogIn } from "lucide-react";
import { useState } from "react";
import { LoginDialog } from "@/components/auth/LoginDialog";
import { proxiedAvatar } from "@/lib/auth/avatar";
import { useHasMounted } from "@/hooks/useHasMounted";

export function UserAvatarMenu() {
  const dispatch = useAppDispatch();
  const { isAuthenticated, user, sessionResolved } = useAppSelector((state) => state.auth);
  const [isLoginDialogOpen, setIsLoginDialogOpen] = useState(false);
  // 登录态来自 localStorage，SSR 与首个 hydration 帧都无从得知 → getInitialAuthState 返回未登录，
  // 会先画死「登录」按钮再翻成头像（闪一帧）。hydration 完成前不渲染任何终态，只占同尺寸中性位。
  const hasMounted = useHasMounted();

  const getUserDisplayName = () => {
    if (isAuthenticated && user) {
      return user.nickname || user.username || '用户';
    }
    return '用户';
  };

  const getAvatarFallbackText = () => {
    if (isAuthenticated && user) {
      const displayName = getUserDisplayName().trim();
      if (displayName) {
        return displayName.slice(0, 1).toUpperCase();
      }
    }
    return '👤';
  };

  // 获取用户状态描述
  const getUserStatusText = () => {
    if (isAuthenticated && user) {
      return '已登录';
    }
    return '未登录';
  };

  // 是否有用户真实头像 - 更严格的检查
  const hasUserAvatar = Boolean(isAuthenticated && user?.avatar);
  
  // 确保总是有一个emoji作为备用
  const fallbackText = getAvatarFallbackText();

  const handleOpenSettings = () => {
    dispatch(openSettingsDialog({}));
  };

  const handleLogout = () => {
    void dispatch(logoutWithSso());
    dispatch(resetConversationState());
    dispatch(endStream());
    dispatch(resetFileUploadState());
  };

  const handleOpenLogin = () => {
    setIsLoginDialogOpen(true);
  };

  // 中性占位（同尺寸）出现在两种「尚不能下登出终态」的情形，避免闪出「登录」按钮：
  //  1) hydration 未完成：SSR/首帧读不到 localStorage 登录态（终态留给客户端定夺）。
  //  2) 已挂载但会话未定论且未登录：加载时本地无 token，正由静默 SSO / 刷新恢复会话——
  //     此窗口本质不是「登出」，若此刻画「登录」按钮，恢复完成翻成头像就成了「登录成功还闪一下登录按钮」。
  if (!hasMounted || (!isAuthenticated && !sessionResolved)) {
    return (
      <div
        data-testid="avatar-menu-placeholder"
        aria-hidden="true"
        className="h-9 w-9 rounded-full bg-muted/40"
      />
    );
  }

  return (
    <>
      {isAuthenticated ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="relative h-9 w-9 rounded-full hover:scale-110 transition-all duration-300 shadow-sm hover:shadow-md">
              <Avatar 
                key={`avatar-${isAuthenticated}-${user?.avatar}`}
                className="h-8 w-8"
              >
                {hasUserAvatar && user?.avatar ? (
                  <>
                    <AvatarImage src={proxiedAvatar(user.avatar)} alt={getUserDisplayName()} />
                    <AvatarFallback className="text-sm bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-blue-900/20 dark:to-indigo-900/20 text-foreground border">
                      <div className="w-full h-full flex items-center justify-center">
                        <span className="block text-center leading-none">{fallbackText}</span>
                      </div>
                    </AvatarFallback>
                  </>
                ) : (
                  <AvatarFallback className="text-sm bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-blue-900/20 dark:to-indigo-900/20 text-foreground border">
                    <div className="w-full h-full flex items-center justify-center">
                      <span className="block text-center leading-none">{fallbackText}</span>
                    </div>
                  </AvatarFallback>
                )}
              </Avatar>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-56" align="end" forceMount>
          {/* 用户信息 */}
          <DropdownMenuItem>
            <div className="flex items-center space-x-3">
              <div className="flex-shrink-0">
                {hasUserAvatar && user?.avatar ? (
                  <Avatar 
                    key={`menu-avatar-${isAuthenticated}-${user?.avatar}`}
                    className="h-8 w-8"
                  >
                    <AvatarImage src={proxiedAvatar(user.avatar)} alt={getUserDisplayName()} />
                    <AvatarFallback className="text-sm">
                      <div className="w-full h-full flex items-center justify-center">
                        <span className="block text-center leading-none">{fallbackText}</span>
                      </div>
                    </AvatarFallback>
                  </Avatar>
                ) : (
                  <div className="w-8 h-8 flex items-center justify-center">
                    <span className="text-lg block text-center leading-none">{fallbackText}</span>
                  </div>
                )}
              </div>
              <div className="flex flex-col space-y-1">
                <p className="text-sm font-medium leading-none">{getUserDisplayName()}</p>
                <p className="text-xs leading-none text-muted-foreground">
                  {getUserStatusText()}
                </p>
              </div>
            </div>
          </DropdownMenuItem>
          
          <DropdownMenuSeparator />
          
          {/* 设置 */}
          <DropdownMenuItem onClick={handleOpenSettings} className="flex items-center cursor-pointer">
            <Settings className="mr-2 h-4 w-4" />
            <span>设置</span>
          </DropdownMenuItem>
          
          <DropdownMenuSeparator />
          
          {/* 登录状态相关功能 */}
          {isAuthenticated ? (
            <DropdownMenuItem onClick={handleLogout} className="flex items-center cursor-pointer text-red-600 dark:text-red-400">
              <LogOut className="mr-2 h-4 w-4" />
              <span>退出登录</span>
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem onClick={handleOpenLogin} className="flex items-center cursor-pointer text-blue-600 dark:text-blue-400">
              <LogIn className="mr-2 h-4 w-4" />
              <span>立即登录</span>
            </DropdownMenuItem>
          )}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : (
        <Button
          variant="outline"
          onClick={handleOpenLogin}
          className="h-9 rounded-full px-3 text-sm shadow-sm"
        >
          <LogIn className="mr-2 h-4 w-4" />
          登录
        </Button>
      )}
      
      {/* 登录弹窗 */}
      <LoginDialog 
        open={isLoginDialogOpen} 
        onOpenChange={setIsLoginDialogOpen} 
      />
    </>
  );
} 
