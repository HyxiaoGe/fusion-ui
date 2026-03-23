"use client";

import { useAppSelector } from "@/redux/hooks";
import { MenuIcon, XIcon } from "lucide-react";
import { usePathname } from "next/navigation";
import React from "react";
import ErrorToastContainer from "../ui/error-toast";
import ResizableSidebar from "./ResizableSidebar";
import { Button } from "../ui/button";

interface MainLayoutProps {
  children: React.ReactNode;
  sidebar?: React.ReactNode;
  title?: string;
  header?: React.ReactNode;
  rightPanel?: React.ReactNode;
}

const MainLayout: React.FC<MainLayoutProps> = ({ children, sidebar, title, header, rightPanel }) => {
  const themeMode = useAppSelector((state) => state.theme.mode);
  const pathname = usePathname();
  const [isMobileViewport, setIsMobileViewport] = React.useState(() => (
    typeof window !== "undefined" ? window.innerWidth < 1024 : false
  ));
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = React.useState(false);

  // 根据系统和用户设置应用主题
  React.useEffect(() => {
    const root = window.document.documentElement;

    if (themeMode === "system") {
      const systemTheme = window.matchMedia("(prefers-color-scheme: dark)")
        .matches
        ? "dark"
        : "light";

      root.classList.remove("light", "dark");
      root.classList.add(systemTheme);
    } else {
      root.classList.remove("light", "dark");
      root.classList.add(themeMode);
    }
  }, [themeMode]);

  React.useEffect(() => {
    const updateViewport = () => {
      const isMobile = window.innerWidth < 1024;
      setIsMobileViewport(isMobile);

      if (!isMobile) {
        setIsMobileSidebarOpen(false);
      }
    };

    updateViewport();
    window.addEventListener("resize", updateViewport);
    return () => window.removeEventListener("resize", updateViewport);
  }, []);

  React.useEffect(() => {
    setIsMobileSidebarOpen(false);
  }, [pathname]);

  return (
    <div className="h-screen flex flex-col">
      {/* 移动端简化 Header */}
      {isMobileViewport && (
        <header className="h-14 border-b flex items-center justify-between px-4 sticky top-0 z-10 bg-background">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-9 w-9"
            onClick={() => setIsMobileSidebarOpen(true)}
            aria-label="打开对话侧栏"
          >
            <MenuIcon className="h-5 w-5" />
          </Button>
          <span className="text-sm font-semibold text-foreground">Fusion AI</span>
          <div className="flex items-center">
            {/* UserAvatarMenu is rendered in sidebar bottom for desktop; here for mobile */}
          </div>
        </header>
      )}

      <div className="flex flex-1 overflow-hidden">
        {/* 桌面端 Sidebar */}
        {sidebar && !isMobileViewport ? (
          <ResizableSidebar defaultWidth={320} minWidth={280} maxWidth={400}>
            {sidebar}
          </ResizableSidebar>
        ) : null}

        {/* 移动端 Sidebar drawer */}
        {sidebar && isMobileViewport && isMobileSidebarOpen ? (
          <div className="fixed inset-0 z-40 lg:hidden" aria-label="对话侧栏遮罩">
            <button
              type="button"
              className="absolute inset-0 bg-black/45"
              aria-label="关闭对话侧栏"
              onClick={() => setIsMobileSidebarOpen(false)}
            />
            <aside className="absolute inset-y-0 left-0 w-[min(85vw,320px)] border-r bg-slate-50 shadow-xl dark:bg-slate-900">
              <div className="absolute right-3 top-3 z-10">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-9 w-9 rounded-full"
                  onClick={() => setIsMobileSidebarOpen(false)}
                  aria-label="收起对话侧栏"
                >
                  <XIcon className="h-5 w-5" />
                </Button>
              </div>
              <div className="h-full overflow-y-auto pr-2">
                {sidebar}
              </div>
            </aside>
          </div>
        ) : null}

        <div className="flex flex-1 overflow-hidden">
          <main className="flex-1 overflow-y-auto">{children}</main>
          {rightPanel && (
            <aside className="w-[400px] border-l overflow-y-auto bg-background shadow-sm flex-shrink-0">
              {rightPanel}
            </aside>
          )}
        </div>
      </div>
      <ErrorToastContainer />
    </div>
  );
};

export default MainLayout;
