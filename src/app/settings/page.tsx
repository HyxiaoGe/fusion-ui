"use client";

import MainLayout from "@/components/layouts/MainLayout";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { motion } from "framer-motion";
import { Database, Settings } from "lucide-react";
import DataManagement from "./DataManagement";
import MemoryManagement from "./MemoryManagement";
import { useState } from "react";

// 定义动画变体
const variants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.3 } },
};

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState("general");

  return (
    <MainLayout>
      <div className="w-full h-full px-6 pt-0 flex flex-col">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4 w-full flex-grow flex flex-col">
          <div className="bg-card/50 backdrop-blur-sm border rounded-lg shadow-sm p-1 sticky top-0 z-10 flex-shrink-0 dark:bg-slate-800/70 dark:border-slate-700 mt-0">
            <TabsList className="w-full grid grid-cols-2 gap-1 bg-transparent dark:bg-transparent">
              <TabsTrigger value="general" className="flex gap-2 items-center justify-center">
                <Settings className="h-4 w-4" />
                <span className="hidden md:inline">常规设置</span>
                <span className="md:hidden">常规</span>
              </TabsTrigger>
              <TabsTrigger value="data" className="flex gap-2 items-center justify-center">
                <Database className="h-4 w-4" />
                <span className="hidden md:inline">数据管理</span>
                <span className="md:hidden">数据</span>
              </TabsTrigger>
            </TabsList>
          </div>

          {/* 常规设置标签页 */}
          <TabsContent value="general" className="space-y-6 w-full flex-grow overflow-auto">
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
            >
              <MemoryManagement />
            </motion.div>
          </TabsContent>

          {/* 数据管理标签页 */}
          <TabsContent value="data" className="space-y-6 w-full flex-grow overflow-auto">
            <DataManagement />
          </TabsContent>
        </Tabs>
      </div>
    </MainLayout>
  );
}
