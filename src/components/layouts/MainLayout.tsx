"use client";

import { useAppSelector } from "@/redux/hooks";
import { MenuIcon, XIcon } from "lucide-react";
import { usePathname } from "next/navigation";
import React from "react";
import ErrorToastContainer from "../ui/error-toast";
import Header from "./Header";
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
      {header ? (
        header
      ) : (
        <Header title={title} />
      )}
      <div className="flex flex-1 overflow-hidden">
        {sidebar && !isMobileViewport ? (
          <ResizableSidebar defaultWidth={320} minWidth={280} maxWidth={400}>
            {sidebar}
          </ResizableSidebar>
        ) : null}

        {sidebar && isMobileViewport ? (
          <>
            <div className="pointer-events-none fixed left-3 top-[4.25rem] z-30">
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="pointer-events-auto h-10 w-10 rounded-full border-border/70 bg-background/95 shadow-sm backdrop-blur"
                onClick={() => setIsMobileSidebarOpen(true)}
                aria-label="打开对话侧栏"
              >
                <MenuIcon className="h-5 w-5" />
              </Button>
            </div>

            {isMobileSidebarOpen ? (
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
          </>
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
