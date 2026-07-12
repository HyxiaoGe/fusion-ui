'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Activity, Boxes, MessagesSquare, ScrollText, Users } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import AdminAuditEventsPanel from './AdminAuditEventsPanel';
import AdminConversationsPanel from './AdminConversationsPanel';
import AdminPerformancePanel from './AdminPerformancePanel';
import AdminUsersPanel from './AdminUsersPanel';
import AdminModelsPanel from './AdminModelsPanel';
import {
  buildAdminAuditUrl, parseAdminAuditRoute, type AdminAuditTab,
} from '@/lib/admin/adminAuditRoute';

type OpenedDetail = { kind: 'user' | 'conversation' | 'model' | 'performance'; id: string };

export default function AdminAuditCenter() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const search = searchParams.toString();
  const route = useMemo(() => parseAdminAuditRoute(new URLSearchParams(search)), [search]);
  const [accessRevoked, setAccessRevoked] = useState(false);
  const openedDetailRef = useRef<OpenedDetail | null>(null);

  useEffect(() => {
    const canonicalUrl = buildAdminAuditUrl(route);
    const currentUrl = search ? `${pathname}?${search}` : pathname;
    if (pathname === '/admin' && currentUrl !== canonicalUrl) {
      router.replace(canonicalUrl, { scroll: false });
    }
  }, [pathname, route, router, search]);

  useEffect(() => {
    const opened = openedDetailRef.current;
    if (!opened) return;
    const stillOpen = (opened.kind === 'user' && route.tab === 'users' && route.userId === opened.id)
      || (opened.kind === 'conversation' && route.tab === 'conversations' && route.conversationId === opened.id)
      || (opened.kind === 'model' && route.tab === 'models' && route.modelId === opened.id)
      || (opened.kind === 'performance' && route.tab === 'performance' && route.runId === opened.id);
    if (!stillOpen) openedDetailRef.current = null;
  }, [route]);

  const handleForbidden = useCallback(() => {
    openedDetailRef.current = null;
    router.replace('/admin', { scroll: false });
    setAccessRevoked(true);
  }, [router]);
  const handleTabChange = useCallback((value: string) => {
    openedDetailRef.current = null;
    router.push(buildAdminAuditUrl({ tab: value as AdminAuditTab }), { scroll: false });
  }, [router]);
  const handleOpenUser = useCallback((userId: string) => {
    openedDetailRef.current = { kind: 'user', id: userId };
    router.push(buildAdminAuditUrl({ tab: 'users', userId }), { scroll: false });
  }, [router]);
  const handleCloseUser = useCallback(() => {
    if (openedDetailRef.current?.kind === 'user' && openedDetailRef.current.id === route.userId) {
      openedDetailRef.current = null;
      router.back();
      return;
    }
    router.replace('/admin', { scroll: false });
  }, [route.userId, router]);
  const handleViewConversations = useCallback((userId: string) => {
    openedDetailRef.current = null;
    router.replace(buildAdminAuditUrl({ tab: 'conversations', userId }), { scroll: false });
  }, [router]);
  const handleViewModelConversations = useCallback((modelId: string) => {
    openedDetailRef.current = null;
    router.push(buildAdminAuditUrl({ tab: 'conversations', modelId }), { scroll: false });
  }, [router]);
  const handleOpenConversation = useCallback((conversationId: string) => {
    openedDetailRef.current = { kind: 'conversation', id: conversationId };
    router.push(buildAdminAuditUrl({
      tab: 'conversations', userId: route.userId, conversationId,
      modelId: route.modelId,
    }), { scroll: false });
  }, [route.modelId, route.userId, router]);
  const handleConversationFiltersChange = useCallback(({ userId, modelId }: { userId?: string; modelId?: string }) => {
    if (userId === route.userId && modelId === route.modelId) return;
    openedDetailRef.current = null;
    router.replace(buildAdminAuditUrl({ tab: 'conversations', userId, modelId }), { scroll: false });
  }, [route.modelId, route.userId, router]);
  const handleBackConversation = useCallback(() => {
    if (openedDetailRef.current?.kind === 'conversation' && openedDetailRef.current.id === route.conversationId) {
      openedDetailRef.current = null;
      router.back();
      return;
    }
    router.replace(buildAdminAuditUrl({ tab: 'conversations', userId: route.userId, modelId: route.modelId }), { scroll: false });
  }, [route.conversationId, route.modelId, route.userId, router]);
  const handleOpenModel = useCallback((modelId: string) => {
    openedDetailRef.current = { kind: 'model', id: modelId };
    router.push(buildAdminAuditUrl({ tab: 'models', modelId }), { scroll: false });
  }, [router]);
  const handleBackModel = useCallback(() => {
    if (openedDetailRef.current?.kind === 'model' && openedDetailRef.current.id === route.modelId) {
      openedDetailRef.current = null;
      router.back();
      return;
    }
    router.replace(buildAdminAuditUrl({ tab: 'models' }), { scroll: false });
  }, [route.modelId, router]);
  const handleTogglePerformance = useCallback((runId: string | null) => {
    if (runId) {
      openedDetailRef.current = { kind: 'performance', id: runId };
      router.push(buildAdminAuditUrl({ tab: 'performance', runId }), { scroll: false });
      return;
    }
    if (openedDetailRef.current?.kind === 'performance' && openedDetailRef.current.id === route.runId) {
      openedDetailRef.current = null;
      router.back();
      return;
    }
    router.replace(buildAdminAuditUrl({ tab: 'performance' }), { scroll: false });
  }, [route.runId, router]);

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
      <Tabs value={route.tab} onValueChange={handleTabChange} className="min-h-0">
        <TabsList className="grid h-auto w-full grid-cols-2 gap-1 lg:w-fit lg:grid-cols-5">
          <TabsTrigger value="users"><Users />用户</TabsTrigger>
          <TabsTrigger value="conversations"><MessagesSquare />对话</TabsTrigger>
          <TabsTrigger value="models"><Boxes />模型</TabsTrigger>
          <TabsTrigger value="performance"><Activity />压测</TabsTrigger>
          <TabsTrigger value="events"><ScrollText />访问审计</TabsTrigger>
        </TabsList>
        <TabsContent value="users" className="mt-4">
          <AdminUsersPanel
            onForbidden={handleForbidden}
            selectedUserId={route.tab === 'users' ? route.userId ?? null : null}
            onOpen={handleOpenUser}
            onClose={handleCloseUser}
            onViewConversations={handleViewConversations}
          />
        </TabsContent>
        <TabsContent value="conversations" className="mt-4">
          <AdminConversationsPanel
            onForbidden={handleForbidden}
            userIdFilter={route.tab === 'conversations' ? route.userId : undefined}
            modelIdFilter={route.tab === 'conversations' ? route.modelId : undefined}
            selectedConversationId={route.tab === 'conversations' ? route.conversationId ?? null : null}
            onUserFilterChange={() => undefined}
            onFiltersChange={handleConversationFiltersChange}
            onOpen={handleOpenConversation}
            onBack={handleBackConversation}
          />
        </TabsContent>
        <TabsContent value="models" className="mt-4">
          <AdminModelsPanel
            onForbidden={handleForbidden}
            selectedModelId={route.tab === 'models' ? route.modelId ?? null : null}
            onOpen={handleOpenModel}
            onBack={handleBackModel}
            onViewConversations={handleViewModelConversations}
          />
        </TabsContent>
        <TabsContent value="performance" className="mt-4">
          <AdminPerformancePanel
            onForbidden={handleForbidden}
            selectedRunId={route.tab === 'performance' ? route.runId ?? null : null}
            onToggle={handleTogglePerformance}
          />
        </TabsContent>
        <TabsContent value="events" className="mt-4">
          <AdminAuditEventsPanel onForbidden={handleForbidden} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
