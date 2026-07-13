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
  buildAdminAuditUrl, parseAdminAuditRoute, type AdminAuditRoute, type AdminAuditTab,
} from '@/lib/admin/adminAuditRoute';

type OpenedDetail = { kind: 'user' | 'conversation' | 'model' | 'performance'; id: string };

function withoutDetail(route: AdminAuditRoute): AdminAuditRoute {
  if (route.tab === 'conversations') {
    return { tab: route.tab, userId: route.userId, modelId: route.modelId };
  }
  return { tab: route.tab };
}

export default function AdminAuditCenter() {
  const router = useRouter();
  const routerRef = useRef(router);
  routerRef.current = router;
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const search = searchParams.toString();
  const route = useMemo(() => parseAdminAuditRoute(new URLSearchParams(search)), [search]);
  const [accessRevoked, setAccessRevoked] = useState(false);
  const [activeTab, setActiveTab] = useState<AdminAuditTab>(() => route.tab);
  const [visitedTabs, setVisitedTabs] = useState<Set<AdminAuditTab>>(() => new Set([route.tab]));
  const routeSnapshotsRef = useRef<Partial<Record<AdminAuditTab, AdminAuditRoute>>>({ [route.tab]: route });
  const [routeSnapshots, setRouteSnapshots] = useState<Partial<Record<AdminAuditTab, AdminAuditRoute>>>(() => ({ [route.tab]: route }));
  const openedDetailRef = useRef<OpenedDetail | null>(null);
  const activeTabRef = useRef<AdminAuditTab>(route.tab);

  const rememberRoute = useCallback((nextRoute: AdminAuditRoute) => {
    const remembered = routeSnapshotsRef.current[nextRoute.tab];
    if (remembered && buildAdminAuditUrl(remembered) === buildAdminAuditUrl(nextRoute)) return;
    routeSnapshotsRef.current = { ...routeSnapshotsRef.current, [nextRoute.tab]: nextRoute };
    setRouteSnapshots(current => ({ ...current, [nextRoute.tab]: nextRoute }));
  }, []);

  const showRoute = useCallback((nextRoute: AdminAuditRoute) => {
    const previousTab = activeTabRef.current;
    if (previousTab !== nextRoute.tab) {
      const previousRoute = routeSnapshotsRef.current[previousTab];
      if (previousRoute) rememberRoute(withoutDetail(previousRoute));
    }
    rememberRoute(nextRoute);
    setVisitedTabs(current => current.has(nextRoute.tab) ? current : new Set([...current, nextRoute.tab]));
    activeTabRef.current = nextRoute.tab;
    setActiveTab(nextRoute.tab);
  }, [rememberRoute]);

  useEffect(() => {
    const canonicalUrl = buildAdminAuditUrl(route);
    const currentUrl = search ? `${pathname}?${search}` : pathname;
    if (pathname === '/admin' && currentUrl !== canonicalUrl) {
      router.replace(canonicalUrl, { scroll: false });
    }
  }, [pathname, route, router, search]);

  useEffect(() => {
    showRoute(route);
  }, [route, showRoute]);

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
    routeSnapshotsRef.current = {};
    activeTabRef.current = 'users';
    setRouteSnapshots({});
    setVisitedTabs(new Set());
    setActiveTab('users');
    routerRef.current.replace('/admin', { scroll: false });
    setAccessRevoked(true);
  }, []);
  const handleTabChange = useCallback((value: string) => {
    const tab = value as AdminAuditTab;
    openedDetailRef.current = null;
    const nextRoute: AdminAuditRoute = { tab };
    showRoute(nextRoute);
    router.push(buildAdminAuditUrl(nextRoute), { scroll: false });
  }, [router, showRoute]);
  const handleOpenUser = useCallback((userId: string) => {
    openedDetailRef.current = { kind: 'user', id: userId };
    const nextRoute: AdminAuditRoute = { tab: 'users', userId };
    showRoute(nextRoute);
    router.push(buildAdminAuditUrl(nextRoute), { scroll: false });
  }, [router, showRoute]);
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
    const nextRoute: AdminAuditRoute = { tab: 'conversations', userId };
    showRoute(nextRoute);
    router.replace(buildAdminAuditUrl(nextRoute), { scroll: false });
  }, [router, showRoute]);
  const handleViewModelConversations = useCallback((modelId: string) => {
    openedDetailRef.current = null;
    const nextRoute: AdminAuditRoute = { tab: 'conversations', modelId };
    showRoute(nextRoute);
    router.push(buildAdminAuditUrl(nextRoute), { scroll: false });
  }, [router, showRoute]);
  const handleOpenConversation = useCallback((conversationId: string) => {
    openedDetailRef.current = { kind: 'conversation', id: conversationId };
    const conversationRoute = routeSnapshotsRef.current.conversations;
    const nextRoute: AdminAuditRoute = {
      tab: 'conversations', userId: conversationRoute?.userId, conversationId,
      modelId: conversationRoute?.modelId,
    };
    showRoute(nextRoute);
    router.push(buildAdminAuditUrl(nextRoute), { scroll: false });
  }, [router, showRoute]);
  const handleConversationFiltersChange = useCallback(({ userId, modelId }: { userId?: string; modelId?: string }) => {
    const conversationRoute = routeSnapshotsRef.current.conversations;
    if (userId === conversationRoute?.userId && modelId === conversationRoute?.modelId) return;
    openedDetailRef.current = null;
    const nextRoute: AdminAuditRoute = { tab: 'conversations', userId, modelId };
    showRoute(nextRoute);
    router.replace(buildAdminAuditUrl(nextRoute), { scroll: false });
  }, [router, showRoute]);
  const handleBackConversation = useCallback(() => {
    if (openedDetailRef.current?.kind === 'conversation' && openedDetailRef.current.id === route.conversationId) {
      openedDetailRef.current = null;
      router.back();
      return;
    }
    const conversationRoute = routeSnapshotsRef.current.conversations;
    const nextRoute: AdminAuditRoute = { tab: 'conversations', userId: conversationRoute?.userId, modelId: conversationRoute?.modelId };
    showRoute(nextRoute);
    router.replace(buildAdminAuditUrl(nextRoute), { scroll: false });
  }, [route.conversationId, router, showRoute]);
  const handleOpenModel = useCallback((modelId: string) => {
    openedDetailRef.current = { kind: 'model', id: modelId };
    const nextRoute: AdminAuditRoute = { tab: 'models', modelId };
    showRoute(nextRoute);
    router.push(buildAdminAuditUrl(nextRoute), { scroll: false });
  }, [router, showRoute]);
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
      const nextRoute: AdminAuditRoute = { tab: 'performance', runId };
      showRoute(nextRoute);
      router.push(buildAdminAuditUrl(nextRoute), { scroll: false });
      return;
    }
    if (openedDetailRef.current?.kind === 'performance' && openedDetailRef.current.id === route.runId) {
      openedDetailRef.current = null;
      router.back();
      return;
    }
    router.replace(buildAdminAuditUrl({ tab: 'performance' }), { scroll: false });
  }, [route.runId, router, showRoute]);

  const usersRoute = routeSnapshots.users ?? { tab: 'users' };
  const conversationsRoute = routeSnapshots.conversations ?? { tab: 'conversations' };
  const modelsRoute = routeSnapshots.models ?? { tab: 'models' };
  const performanceRoute = routeSnapshots.performance ?? { tab: 'performance' };

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
      <Tabs value={activeTab} onValueChange={handleTabChange} activationMode="manual" className="min-h-0">
        <TabsList className="grid h-auto w-full grid-cols-2 gap-1 lg:w-fit lg:grid-cols-5">
          <TabsTrigger value="users"><Users />用户</TabsTrigger>
          <TabsTrigger value="conversations"><MessagesSquare />对话</TabsTrigger>
          <TabsTrigger value="models"><Boxes />模型</TabsTrigger>
          <TabsTrigger value="performance"><Activity />压测</TabsTrigger>
          <TabsTrigger value="events"><ScrollText />访问审计</TabsTrigger>
        </TabsList>
        {visitedTabs.has('users') ? <TabsContent value="users" forceMount hidden={activeTab !== 'users'} className="mt-4 data-[state=inactive]:hidden">
          <AdminUsersPanel
            active={activeTab === 'users'}
            onForbidden={handleForbidden}
            selectedUserId={usersRoute.userId ?? null}
            onOpen={handleOpenUser}
            onClose={handleCloseUser}
            onViewConversations={handleViewConversations}
          />
        </TabsContent> : null}
        {visitedTabs.has('conversations') ? <TabsContent value="conversations" forceMount hidden={activeTab !== 'conversations'} className="mt-4 data-[state=inactive]:hidden">
          <AdminConversationsPanel
            onForbidden={handleForbidden}
            userIdFilter={conversationsRoute.userId}
            modelIdFilter={conversationsRoute.modelId}
            selectedConversationId={conversationsRoute.conversationId ?? null}
            onUserFilterChange={() => undefined}
            onFiltersChange={handleConversationFiltersChange}
            onOpen={handleOpenConversation}
            onBack={handleBackConversation}
          />
        </TabsContent> : null}
        {visitedTabs.has('models') ? <TabsContent value="models" forceMount hidden={activeTab !== 'models'} className="mt-4 data-[state=inactive]:hidden">
          <AdminModelsPanel
            active={activeTab === 'models'}
            onForbidden={handleForbidden}
            selectedModelId={modelsRoute.modelId ?? null}
            onOpen={handleOpenModel}
            onBack={handleBackModel}
            onViewConversations={handleViewModelConversations}
          />
        </TabsContent> : null}
        {visitedTabs.has('performance') ? <TabsContent value="performance" forceMount hidden={activeTab !== 'performance'} className="mt-4 data-[state=inactive]:hidden">
          <AdminPerformancePanel
            onForbidden={handleForbidden}
            selectedRunId={performanceRoute.runId ?? null}
            onToggle={handleTogglePerformance}
          />
        </TabsContent> : null}
        {visitedTabs.has('events') ? <TabsContent value="events" forceMount hidden={activeTab !== 'events'} className="mt-4 data-[state=inactive]:hidden">
          <AdminAuditEventsPanel active={activeTab === 'events'} onForbidden={handleForbidden} />
        </TabsContent> : null}
      </Tabs>
    </div>
  );
}
