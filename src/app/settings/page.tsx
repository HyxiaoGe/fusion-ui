"use client";

import MainLayout from "@/components/layouts/MainLayout";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAppSelector } from "@/redux/hooks";
import { motion } from "framer-motion";
import { Activity, Database, Network, SlidersHorizontal, Sparkles } from "lucide-react";
import DataManagement from "./DataManagement";
import McpServerManager from "./McpServerManager";
import RuntimeConfigManager from "./RuntimeConfigManager";
import SearchUsageMonitor from "./SearchUsageMonitor";
import SystemPrompt from "./SystemPrompt";
import { useEffect, useState } from "react";

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState("general");
  const [isMounted, setIsMounted] = useState(false);
  const isAdmin = useAppSelector((state) => Boolean(state.auth.user?.is_superuser));
  const showAdminTabs = isMounted && isAdmin;

  useEffect(() => {
    setIsMounted(true);
  }, []);

  return (
    <MainLayout>
      <div className="w-full h-full px-6 pt-0 flex flex-col">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4 w-full flex-grow flex flex-col">
          <div data-testid="settings-tabs-scroller" className="bg-card/50 backdrop-blur-sm border rounded-lg shadow-sm p-1 sticky top-0 z-10 flex-shrink-0 overflow-x-auto dark:bg-slate-800/70 dark:border-slate-700 mt-0">
            <TabsList className={`grid w-full gap-1 bg-transparent dark:bg-transparent ${showAdminTabs ? "min-w-[36rem] grid-cols-5 md:min-w-0" : "grid-cols-2"}`}>
              <TabsTrigger value="general" className="flex gap-2 items-center justify-center">
                <Sparkles className="h-4 w-4" />
                <span className="hidden md:inline">AI 个性化</span>
                <span className="md:hidden">AI</span>
              </TabsTrigger>
              <TabsTrigger value="data" className="flex gap-2 items-center justify-center">
                <Database className="h-4 w-4" />
                <span className="hidden md:inline">数据管理</span>
                <span className="md:hidden">数据</span>
              </TabsTrigger>
              {showAdminTabs && (
                <>
                  <TabsTrigger value="usage" className="flex gap-2 items-center justify-center">
                    <Activity className="h-4 w-4" />
                    <span className="hidden md:inline">联网用量</span>
                    <span className="md:hidden">用量</span>
                  </TabsTrigger>
                  <TabsTrigger value="runtime-config" className="flex gap-2 items-center justify-center">
                    <SlidersHorizontal className="h-4 w-4" />
                    <span className="hidden md:inline">运行时配置</span>
                    <span className="md:hidden">配置</span>
                  </TabsTrigger>
                  <TabsTrigger value="mcp-servers" className="flex gap-2 items-center justify-center">
                    <Network className="h-4 w-4" />
                    <span className="hidden md:inline">MCP 服务</span>
                    <span className="md:hidden">MCP</span>
                  </TabsTrigger>
                </>
              )}
            </TabsList>
          </div>

          <TabsContent value="general" className="space-y-6 w-full flex-grow overflow-auto">
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
            >
              <SystemPrompt />
            </motion.div>
          </TabsContent>

          <TabsContent value="data" className="space-y-6 w-full flex-grow overflow-auto">
            <DataManagement />
          </TabsContent>

          {showAdminTabs && (
            <>
              <TabsContent value="usage" className="space-y-6 w-full flex-grow overflow-auto">
                <SearchUsageMonitor />
              </TabsContent>

              <TabsContent value="runtime-config" className="space-y-6 w-full flex-grow overflow-auto">
                <RuntimeConfigManager />
              </TabsContent>

              <TabsContent value="mcp-servers" className="space-y-6 w-full flex-grow overflow-auto">
                <McpServerManager />
              </TabsContent>
            </>
          )}
        </Tabs>
      </div>
    </MainLayout>
  );
}
