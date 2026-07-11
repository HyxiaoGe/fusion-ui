'use client';

import { useCallback, useState } from 'react';
import { Activity, MessagesSquare, ScrollText, Users } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import AdminAuditEventsPanel from './AdminAuditEventsPanel';
import AdminConversationsPanel from './AdminConversationsPanel';
import AdminPerformancePanel from './AdminPerformancePanel';
import AdminUsersPanel from './AdminUsersPanel';

export type AdminAuditTab = 'users' | 'conversations' | 'performance' | 'events';

export default function AdminAuditCenter({ initialTab = 'users' }: { initialTab?: AdminAuditTab }) {
  const [accessRevoked, setAccessRevoked] = useState(false);
  const handleForbidden = useCallback(() => setAccessRevoked(true), []);

  if (accessRevoked) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center px-6">
        <div className="max-w-md rounded-xl border border-danger/30 bg-danger/5 p-8 text-center">
          <h1 className="font-semibold text-danger">管理员权限已失效</h1>
          <p className="mt-2 text-sm text-muted-foreground">敏感内容已从当前页面内存清空，请重新登录或联系系统管理员。</p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-[1600px] p-4 lg:p-6">
      <Tabs defaultValue={initialTab} className="min-h-0">
        <TabsList className="grid h-auto w-full grid-cols-2 gap-1 lg:w-fit lg:grid-cols-4">
          <TabsTrigger value="users"><Users />用户</TabsTrigger>
          <TabsTrigger value="conversations"><MessagesSquare />对话</TabsTrigger>
          <TabsTrigger value="performance"><Activity />压测</TabsTrigger>
          <TabsTrigger value="events"><ScrollText />访问审计</TabsTrigger>
        </TabsList>
        <TabsContent value="users" className="mt-4">
          <AdminUsersPanel onForbidden={handleForbidden} />
        </TabsContent>
        <TabsContent value="conversations" className="mt-4">
          <AdminConversationsPanel onForbidden={handleForbidden} />
        </TabsContent>
        <TabsContent value="performance" className="mt-4">
          <AdminPerformancePanel onForbidden={handleForbidden} />
        </TabsContent>
        <TabsContent value="events" className="mt-4">
          <AdminAuditEventsPanel onForbidden={handleForbidden} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
