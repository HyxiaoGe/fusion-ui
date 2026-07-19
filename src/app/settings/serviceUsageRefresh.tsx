"use client";

import { createContext, useContext, useEffect, type ReactNode } from "react";

export type ServiceUsageRefreshHandler = () => Promise<unknown> | unknown;

export interface ServiceUsageRefreshRegistry {
  register: (service: string, handler: ServiceUsageRefreshHandler) => () => void;
  refreshAll: () => Promise<PromiseSettledResult<unknown>[]>;
}

export function createServiceUsageRefreshRegistry(): ServiceUsageRefreshRegistry {
  const handlers = new Map<string, ServiceUsageRefreshHandler>();

  return {
    register(service, handler) {
      handlers.set(service, handler);
      return () => {
        if (handlers.get(service) === handler) handlers.delete(service);
      };
    },
    refreshAll() {
      return Promise.allSettled([...handlers.values()].map((handler) => Promise.resolve().then(handler)));
    },
  };
}

const ServiceUsageRefreshContext = createContext<ServiceUsageRefreshRegistry | null>(null);

export function ServiceUsageRefreshProvider({
  registry,
  children,
}: {
  registry: ServiceUsageRefreshRegistry;
  children: ReactNode;
}) {
  return (
    <ServiceUsageRefreshContext.Provider value={registry}>
      {children}
    </ServiceUsageRefreshContext.Provider>
  );
}

export function useServiceUsageRefreshHandler(service: string, handler: ServiceUsageRefreshHandler) {
  const registry = useContext(ServiceUsageRefreshContext);

  useEffect(() => {
    if (!registry) return;
    return registry.register(service, handler);
  }, [handler, registry, service]);
}
