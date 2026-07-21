import type { ProviderRouteResult } from '@/types/conversation';

export type RoutePresentationVariant = 'single' | 'grid' | 'summary-detail' | 'stack';

export interface RoutePresentation {
  variant: RoutePresentationVariant;
  initialSelectedIndex: number;
}

export function findFastestRouteIndex(
  routes: readonly ProviderRouteResult[],
): number | null {
  const timedRoutes = routes.flatMap((route, index) => (
    typeof route.duration_s === 'number' && Number.isFinite(route.duration_s) && route.duration_s >= 0
      ? [{ index, duration: route.duration_s }]
      : []
  ));
  if (timedRoutes.length < 2) return null;

  const fastestDuration = Math.min(...timedRoutes.map(route => route.duration));
  const fastestRoutes = timedRoutes.filter(route => route.duration === fastestDuration);
  return fastestRoutes.length === 1 ? fastestRoutes[0].index : null;
}

function hasComplexDetails(route: ProviderRouteResult): boolean {
  return (route.legs?.length ?? 0) > 0 || (route.alternatives?.length ?? 0) > 0;
}

export function buildRoutePresentation(
  routes: readonly ProviderRouteResult[],
): RoutePresentation {
  if (routes.length <= 1) {
    return { variant: 'single', initialSelectedIndex: 0 };
  }

  const complexRouteIndexes = routes.reduce<number[]>((indexes, route, index) => {
    if (hasComplexDetails(route)) indexes.push(index);
    return indexes;
  }, []);

  if (complexRouteIndexes.length === 0) {
    return { variant: 'grid', initialSelectedIndex: 0 };
  }
  if (complexRouteIndexes.length === 1) {
    return {
      variant: 'summary-detail',
      initialSelectedIndex: complexRouteIndexes[0],
    };
  }
  return {
    variant: 'stack',
    initialSelectedIndex: complexRouteIndexes[0],
  };
}
