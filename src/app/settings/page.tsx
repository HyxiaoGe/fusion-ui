"use client";

import MainLayout from "@/components/layouts/MainLayout";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { motion } from "framer-motion";
import { Database, Key, Sparkles } from "lucide-react";
import CredentialsManagement from "./CredentialsManagement";
import DataManagement from "./DataManagement";
import SystemPrompt from "./SystemPrompt";
import { useState } from "react";

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState("general");

  return (
    <MainLayout>
      <div className="w-full h-full px-6 pt-0 flex flex-col">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4 w-full flex-grow flex flex-col">
          <div className="bg-card/50 backdrop-blur-sm border rounded-lg shadow-sm p-1 sticky top-0 z-10 flex-shrink-0 dark:bg-slate-800/70 dark:border-slate-700 mt-0">
            <TabsList className="w-full grid grid-cols-3 gap-1 bg-transparent dark:bg-transparent">
              <TabsTrigger value="general" className="flex gap-2 items-center justify-center">
                <Sparkles className="h-4 w-4" />
                <span className="hidden md:inline">AI 个性化</span>
                <span className="md:hidden">AI</span>
              </TabsTrigger>
              <TabsTrigger value="credentials" className="flex gap-2 items-center justify-center">
                <Key className="h-4 w-4" />
                <span className="hidden md:inline">模型与 Key</span>
                <span className="md:hidden">Key</span>
              </TabsTrigger>
              <TabsTrigger value="data" className="flex gap-2 items-center justify-center">
                <Database className="h-4 w-4" />
                <span className="hidden md:inline">数据管理</span>
                <span className="md:hidden">数据</span>
              </TabsTrigger>
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

          <TabsContent value="credentials" className="space-y-6 w-full flex-grow overflow-auto">
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
            >
              <CredentialsManagement />
            </motion.div>
          </TabsContent>

          <TabsContent value="data" className="space-y-6 w-full flex-grow overflow-auto">
            <DataManagement />
          </TabsContent>
        </Tabs>
      </div>
    </MainLayout>
  );
}
