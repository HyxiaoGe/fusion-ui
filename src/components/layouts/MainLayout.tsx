"use client";

import { useAppSelector } from "@/redux/hooks";
import React from "react";
import ErrorToastContainer from "../ui/error-toast";
import Header from "./Header";
import ResizableSidebar from "./ResizableSidebar";

interface MainLayoutProps {
  children: React.ReactNode;
  sidebar?: React.ReactNode;
  title?: string;
  header?: React.ReactNode;
}

const MainLayout: React.FC<MainLayoutProps> = ({ children, sidebar, title, header }) => {
  const themeMode = useAppSelector((state) => state.theme.mode);

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

  return (
    <div className="h-screen flex flex-col">
      {header ? (
        header
      ) : (
        <Header title={title} />
      )}
      <div className="flex flex-1 overflow-hidden">
        {sidebar && (
          <ResizableSidebar defaultWidth={320} minWidth={280} maxWidth={400}>
            {sidebar}
          </ResizableSidebar>
        )}
        <main className="flex-1 overflow-y-auto">{children}</main>
      </div>
      <ErrorToastContainer />
    </div>
  );
};

export default MainLayout;
