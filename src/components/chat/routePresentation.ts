import type { ProviderRouteResult } from '@/types/conversation';

export type RoutePresentationVariant = 'single' | 'grid' | 'summary-detail' | 'stack';

export interface RoutePresentation {
  variant: RoutePresentationVariant;
  initialSelectedIndex: number;
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
