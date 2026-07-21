'use client';

import { useId, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import {
  AlertTriangle,
  Bike,
  BusFront,
  CableCar,
  CarFront,
  CarTaxiFront,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Footprints,
  Gauge,
  ImageOff,
  MapPin,
  Minus,
  Plane,
  Plus,
  Route,
  Ship,
  Timer,
  Train,
  TrainFront,
  TramFront,
  Waypoints,
  X,
  ZoomIn,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog';
import type {
  NetworkSourceStatus,
  PlaceResultsBlock,
  ProviderPlacePhoto,
  ProviderPlaceResult,
  ProviderRouteResult,
  ProviderTransitAlternative,
  ProviderTransitLeg,
  ProviderTransitType,
  RouteResultsBlock,
  StructuredToolResultBlock,
} from '@/types/conversation';
import { cn } from '@/lib/utils';
import { buildRoutePresentation, findFastestRouteIndex } from './routePresentation';
import {
  resolveTransportModePresentation,
  type TransportIconKind,
  type TransportTone,
} from './transportModePresentation';

interface StructuredToolResultsProps {
  blocks: StructuredToolResultBlock[];
}

export default function StructuredToolResults({ blocks }: StructuredToolResultsProps) {
  if (blocks.length === 0) return null;
  return (
    <div className="mb-3 w-full space-y-3" data-testid="structured-tool-results">
      {blocks.map(block => block.type === 'place_results'
        ? <PlaceResults key={block.id} block={block} />
        : <RouteResults key={block.id} block={block} />)}
    </div>
  );
}

function PlaceResults({ block }: { block: PlaceResultsBlock }) {
  const places = (block.places ?? []).slice(0, 5);
  const [expanded, setExpanded] = useState(false);
  const visiblePlaces = places.slice(0, expanded ? 5 : 3);
  const resultCount = safeCount(block.result_count) ?? places.length;

  return (
    <section
      aria-label="地点推荐结果"
      className="rounded-lg border border-border/50 bg-card/40 p-3"
    >
      <ResultHeader
        icon={<MapPin className="h-4 w-4 text-teal" aria-hidden="true" />}
        title={buildPlaceTitle(block)}
        provider={block.provider}
        status={block.status}
        statusText={block.status === 'degraded' ? '部分地点可用' : `${resultCount} 个地点`}
      />

      {visiblePlaces.length > 0 ? (
        <div
          data-testid="place-results-grid"
          className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 2xl:grid-cols-3"
        >
          {visiblePlaces.map((place, index) => (
            <PlaceResultItem
              key={place.provider_place_id || `${block.id}-${index}`}
              place={place}
            />
          ))}
        </div>
      ) : (
        <EmptyResult text="暂未取得可展示的地点信息" />
      )}

      {places.length > 3 ? (
        <button
          type="button"
          aria-label={expanded ? '收起地点' : '展开更多地点'}
          onClick={() => setExpanded(current => !current)}
          className="mt-3 text-xs font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
        >
          {expanded ? '收起' : `查看更多（${Math.min(5, places.length) - 3}）`}
        </button>
      ) : null}

      <Limitations items={block.limitations} />
    </section>
  );
}

function PlaceResultItem({ place }: { place: ProviderPlaceResult }) {
  const name = safeText(place.name) || '地点信息待补充';
  const photos = securePhotos(place.photos);
  const showImageLayout = photos.length > 0;
  const platformUrl = safeAmapUrl(place.platform_url);
  const metadata = compact([
    safeText(place.category),
    formatDistance(place.distance_m),
    formatRating(place.rating),
    formatReferenceCost(place.reference_cost_yuan),
  ]);
  const location = compact([safeText(place.district), safeText(place.business_area), safeText(place.address)]);

  return (
    <article
      data-testid="place-result-item"
      className={cn(
        'flex min-w-0 rounded-md border border-border/40 bg-background/70',
        showImageLayout ? 'overflow-hidden' : 'px-3 py-2.5',
      )}
    >
      {showImageLayout ? <SafePlaceImage photos={photos} fallbackName={name} /> : null}
      <div
        data-testid="place-result-content"
        className={cn('min-w-0 flex-1', showImageLayout && 'p-2.5')}
      >
        <div className="flex min-w-0 items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <h4 className="truncate text-sm font-medium text-foreground" title={name}>{name}</h4>
            {metadata ? <p className="mt-0.5 truncate text-xs text-muted-foreground">{metadata}</p> : null}
            {location ? <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">{location}</p> : null}
            {safeText(place.open_hours) ? (
              <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">{place.open_hours}</p>
            ) : null}
          </div>
          {platformUrl ? (
            <a
              href={platformUrl}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="高德查看"
              className="inline-flex shrink-0 items-center gap-1 rounded-full border border-border/50 px-2 py-1 text-[11px] font-medium text-foreground hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
            >
              高德查看
              <ExternalLink className="h-3 w-3" aria-hidden="true" />
            </a>
          ) : null}
        </div>
      </div>
    </article>
  );
}

function SafePlaceImage({ photos, fallbackName }: { photos: ProviderPlacePhoto[]; fallbackName: string }) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const photo = photos[activeIndex] ?? null;

  const closePreview = () => {
    setPreviewIndex(null);
    requestAnimationFrame(() => triggerRef.current?.focus());
  };

  return (
    <>
      {photo ? (
        <button
          ref={triggerRef}
          type="button"
          aria-label={`预览${fallbackName}图片`}
          data-testid="place-result-image"
          className="group relative h-24 w-24 shrink-0 overflow-hidden bg-muted/30 outline-none sm:h-28 sm:w-28 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/60"
          onClick={() => setPreviewIndex(activeIndex)}
        >
          {/* 图片源来自受控结果块，仍只允许 HTTPS；失败时依次尝试下一张安全图片。 */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={photo.url}
            alt={safeText(photo.title) || fallbackName}
            loading="lazy"
            decoding="async"
            referrerPolicy="no-referrer"
            className="absolute inset-0 h-full w-full object-cover transition-transform duration-200 group-hover:scale-[1.03]"
            onError={() => setActiveIndex(current => current + 1)}
          />
          <span
            data-testid="place-image-hover-indicator"
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/0 opacity-0 transition-all duration-200 group-hover:bg-black/20 group-hover:opacity-100 group-focus-visible:bg-black/20 group-focus-visible:opacity-100"
          >
            <span className="flex h-8 w-8 scale-90 items-center justify-center rounded-full border border-white/30 bg-black/55 text-white shadow-md backdrop-blur-sm transition-transform duration-200 group-hover:scale-100 group-focus-visible:scale-100">
              <ZoomIn className="h-4 w-4" />
            </span>
          </span>
        </button>
      ) : (
        <div
          data-testid="place-result-image"
          aria-label="图片加载失败"
          className="flex h-24 w-24 shrink-0 items-center justify-center bg-muted/30 text-muted-foreground sm:h-28 sm:w-28"
        >
          <ImageOff className="h-5 w-5" aria-hidden="true" />
        </div>
      )}

      {previewIndex != null ? (
        <PlaceImagePreview
          photos={photos}
          initialIndex={previewIndex}
          fallbackName={fallbackName}
          onClose={closePreview}
        />
      ) : null}
    </>
  );
}

function PlaceImagePreview({
  photos,
  initialIndex,
  fallbackName,
  onClose,
}: {
  photos: ProviderPlacePhoto[];
  initialIndex: number;
  fallbackName: string;
  onClose: () => void;
}) {
  const [activeIndex, setActiveIndex] = useState(initialIndex);
  const [failedIndexes, setFailedIndexes] = useState<Set<number>>(() => new Set());
  const [zoom, setZoom] = useState(1);
  const photo = failedIndexes.has(activeIndex) ? null : photos[activeIndex] ?? null;

  const move = (direction: 1 | -1, excluded = failedIndexes) => {
    for (let offset = 1; offset <= photos.length; offset += 1) {
      const nextIndex = (activeIndex + direction * offset + photos.length) % photos.length;
      if (!excluded.has(nextIndex)) {
        setActiveIndex(nextIndex);
        setZoom(1);
        return true;
      }
    }
    return false;
  };

  const handleImageError = () => {
    const nextFailedIndexes = new Set(failedIndexes).add(activeIndex);
    setFailedIndexes(nextFailedIndexes);
    move(1, nextFailedIndexes);
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        aria-label={`${fallbackName}图片预览`}
        showCloseButton={false}
        className="inset-0 left-0 top-0 h-screen w-screen max-w-none translate-x-0 translate-y-0 overflow-hidden rounded-none border-none bg-transparent p-0 shadow-none sm:max-w-none"
      >
        <DialogTitle className="sr-only">{fallbackName}图片预览</DialogTitle>
        <DialogDescription className="sr-only">查看地点原图，可切换图片和调整缩放比例</DialogDescription>

        <button
          type="button"
          aria-label="关闭图片预览"
          onClick={onClose}
          className="fixed right-4 top-4 z-[60] flex h-9 w-9 items-center justify-center rounded-full border border-white/25 bg-black/55 text-white shadow-lg backdrop-blur transition-colors hover:bg-black/75 focus:outline-none focus:ring-2 focus:ring-white/70"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>

        <div className="pointer-events-none fixed left-1/2 top-4 z-[60] -translate-x-1/2 rounded-full border border-white/15 bg-black/55 px-3 py-1 text-xs text-white backdrop-blur">
          {activeIndex + 1} / {photos.length}
        </div>

        {photos.length > 1 ? (
          <>
            <button
              type="button"
              aria-label="上一张图片"
              onClick={(event) => {
                event.stopPropagation();
                move(-1);
              }}
              className="fixed left-4 top-1/2 z-[60] flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-white/20 bg-black/50 text-white backdrop-blur transition-colors hover:bg-black/75 focus:outline-none focus:ring-2 focus:ring-white/70"
            >
              <ChevronLeft className="h-5 w-5" aria-hidden="true" />
            </button>
            <button
              type="button"
              aria-label="下一张图片"
              onClick={(event) => {
                event.stopPropagation();
                move(1);
              }}
              className="fixed right-4 top-1/2 z-[60] flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-white/20 bg-black/50 text-white backdrop-blur transition-colors hover:bg-black/75 focus:outline-none focus:ring-2 focus:ring-white/70"
            >
              <ChevronRight className="h-5 w-5" aria-hidden="true" />
            </button>
          </>
        ) : null}

        <div
          className="absolute inset-0 flex h-full w-full items-center justify-center overflow-auto px-16 py-16"
          onClick={onClose}
        >
          {photo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={photo.url}
              alt={`${safeText(photo.title) || fallbackName}原图`}
              referrerPolicy="no-referrer"
              className="max-h-[85vh] max-w-[90vw] rounded-lg object-contain shadow-2xl transition-transform duration-150"
              style={{ transform: `scale(${zoom})` }}
              onClick={(event) => event.stopPropagation()}
              onDoubleClick={() => setZoom(current => current > 1 ? 1 : 2)}
              onError={handleImageError}
            />
          ) : (
            <div
              role="status"
              className="flex flex-col items-center gap-2 rounded-lg border border-white/15 bg-black/55 px-6 py-5 text-sm text-white backdrop-blur"
              onClick={(event) => event.stopPropagation()}
            >
              <ImageOff className="h-7 w-7" aria-hidden="true" />
              图片加载失败
            </div>
          )}
        </div>

        <div className="fixed bottom-5 left-1/2 z-[60] flex -translate-x-1/2 items-center gap-1 rounded-full border border-white/15 bg-black/55 p-1 text-white backdrop-blur">
          <button
            type="button"
            aria-label="缩小图片"
            disabled={zoom <= 1}
            onClick={() => setZoom(current => Math.max(1, current - 0.25))}
            className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-white/15 focus:outline-none focus:ring-2 focus:ring-white/70 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Minus className="h-4 w-4" aria-hidden="true" />
          </button>
          <button
            type="button"
            aria-label="重置图片缩放"
            onClick={() => setZoom(1)}
            className="min-w-12 rounded-full px-2 py-1 text-xs hover:bg-white/15 focus:outline-none focus:ring-2 focus:ring-white/70"
          >
            {Math.round(zoom * 100)}%
          </button>
          <button
            type="button"
            aria-label="放大图片"
            disabled={zoom >= 2}
            onClick={() => setZoom(current => Math.min(2, current + 0.25))}
            className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-white/15 focus:outline-none focus:ring-2 focus:ring-white/70 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function RouteResults({ block }: { block: RouteResultsBlock }) {
  const routes = (block.routes ?? []).slice(0, 3);
  const unavailableModes = (block.unavailable_modes ?? []).slice(0, 3);
  const routeTitle = `${safeText(block.origin?.label) || '起点待确认'} → ${safeText(block.destination?.label) || '终点待确认'}`;
  return (
    <section
      aria-label="路线对比结果"
      className="rounded-lg border border-border/50 bg-card/40 p-3"
    >
      <ResultHeader
        icon={<Route className="h-4 w-4 text-info" aria-hidden="true" />}
        title={routeTitle}
        provider={block.provider}
        status={block.status}
        statusText={routeStatusText(block.status, routes.length)}
      />

      {routes.length > 0 ? (
        <RouteResultList routes={routes} />
      ) : (
        <EmptyResult text="暂未取得可展示的路线方案" />
      )}

      {unavailableModes.length > 0 ? (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {unavailableModes.map(mode => (
            <span key={mode} className="rounded-full border border-warn/30 bg-warn/5 px-2 py-0.5 text-[11px] text-warn">
              {routeUnavailableModeLabel(mode)}暂不可用
            </span>
          ))}
        </div>
      ) : null}
      <Limitations items={block.limitations} />
    </section>
  );
}

function RouteResultList({ routes }: { routes: ProviderRouteResult[] }) {
  const presentation = buildRoutePresentation(routes);
  const fastestRouteIndex = findFastestRouteIndex(routes);
  const [selectedRouteIndex, setSelectedRouteIndex] = useState<number | null>(null);

  if (presentation.variant === 'summary-detail') {
    const fallbackSelectedIndex = routes[presentation.initialSelectedIndex]
      ? presentation.initialSelectedIndex
      : 0;
    const effectiveSelectedIndex = selectedRouteIndex != null && routes[selectedRouteIndex]
      ? selectedRouteIndex
      : fallbackSelectedIndex;
    const selectedRoute = routes[effectiveSelectedIndex] ?? routes[0];
    const summaryColumns = routes.length === 2 ? 'lg:grid-cols-2' : 'lg:grid-cols-3';

    return (
      <div className="mt-3 min-w-0">
        <div
          data-testid="route-summary-grid"
          className={cn('grid grid-cols-1 items-stretch gap-2', summaryColumns)}
        >
          {routes.map((route, index) => (
            <RouteSummaryButton
              key={`${route.mode || 'route'}-${index}`}
              route={route}
              selected={index === effectiveSelectedIndex}
              fastest={index === fastestRouteIndex}
              onSelect={() => setSelectedRouteIndex(index)}
            />
          ))}
        </div>
        <section
          aria-label="当前路线详情"
          data-testid="route-detail-panel"
          className="mt-2 min-w-0"
        >
          <RouteResultItem
            key={`route-detail-${effectiveSelectedIndex}`}
            route={selectedRoute}
            expandLegsByDefault
          />
        </section>
      </div>
    );
  }

  if (presentation.variant === 'grid') {
    return (
      <div
        data-testid="route-results-grid"
        className="mt-3 grid grid-cols-1 items-start gap-2 lg:grid-cols-2 2xl:grid-cols-3"
      >
        {routes.map((route, index) => (
          <RouteResultItem
            key={`${route.mode || 'route'}-${index}`}
            route={route}
            fastest={index === fastestRouteIndex}
          />
        ))}
      </div>
    );
  }

  if (presentation.variant === 'stack') {
    return (
      <div data-testid="route-results-stack" className="mt-3 min-w-0 space-y-2">
        {routes.map((route, index) => (
          <RouteResultItem
            key={`${route.mode || 'route'}-${index}`}
            route={route}
            fastest={index === fastestRouteIndex}
          />
        ))}
      </div>
    );
  }

  return (
    <div data-testid="route-result-single" className="mt-3 min-w-0">
      <RouteResultItem route={routes[0]} />
    </div>
  );
}

function RouteSummaryButton({
  route,
  selected,
  fastest,
  onSelect,
}: {
  route: ProviderRouteResult;
  selected: boolean;
  fastest: boolean;
  onSelect: () => void;
}) {
  const label = routeModeLabel(route.mode, route.transit_type);
  const details = buildRouteDetails(route);

  return (
    <button
      type="button"
      aria-label={`查看${label}方案详情`}
      aria-pressed={selected}
      onClick={onSelect}
      className={cn(
        'h-full min-w-0 rounded-md border px-3 py-2.5 text-left transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40',
        selected
          ? 'border-primary/40 bg-primary/5'
          : 'border-border/40 bg-background/70 hover:bg-muted/30',
      )}
    >
      <span className="flex min-w-0 items-center gap-2">
        <RouteModeIcon mode={route.mode} transitType={route.transit_type} />
        <span className="min-w-0 break-words text-sm font-medium text-foreground">
          {label}
        </span>
        {fastest ? <RouteFastestBadge /> : null}
      </span>
      {details ? (
        <span className="mt-1 block min-w-0 break-words text-xs text-muted-foreground">
          {details}
        </span>
      ) : null}
      {safeText(route.summary) ? (
        <span className="mt-1 block line-clamp-1 text-[11px] text-muted-foreground">
          {route.summary}
        </span>
      ) : null}
    </button>
  );
}

function buildRouteDetails(route: ProviderRouteResult): string {
  return compact([
    formatDuration(route.duration_s),
    safeText(route.mode).toLowerCase() === 'transit' ? '' : formatTotalDistance(route.distance_m),
    formatWalkingDistance(route.walking_distance_m),
    formatToll(route.toll_yuan),
    formatTransfers(route.transfers),
  ]);
}

function RouteModeIcon({
  mode,
  transitType,
  legKind,
  compactView = false,
}: {
  mode?: string | null;
  transitType?: string | null;
  legKind?: string | null;
  compactView?: boolean;
}) {
  const presentation = resolveTransportModePresentation({ mode, transitType, legKind });
  const Icon = TRANSPORT_ICONS[presentation.iconKind];

  return (
    <span
      aria-hidden="true"
      data-testid={`route-mode-icon-${presentation.iconKind}`}
      className={cn(
        'flex shrink-0 items-center justify-center rounded-md',
        compactView ? 'h-5 w-5 rounded' : 'h-7 w-7',
        TRANSPORT_TONES[presentation.tone],
      )}
    >
      <Icon className={compactView ? 'h-3 w-3' : 'h-3.5 w-3.5'} strokeWidth={1.8} />
    </span>
  );
}

const TRANSPORT_ICONS: Record<TransportIconKind, typeof Route> = {
  driving: CarFront,
  taxi: CarTaxiFront,
  motorcycle: Gauge,
  bus: BusFront,
  subway: TrainFront,
  mixed: Waypoints,
  'public-transit': Waypoints,
  bicycling: Bike,
  walking: Footprints,
  rail: Train,
  'high-speed-rail': Train,
  flight: Plane,
  ferry: Ship,
  tram: TramFront,
  'cable-car': CableCar,
  route: Route,
};

const TRANSPORT_TONES: Record<TransportTone, string> = {
  blue: 'bg-info-bg text-info',
  teal: 'bg-teal/10 text-teal',
  purple: 'bg-primary/10 text-primary',
  green: 'bg-success/10 text-success',
  amber: 'bg-warn/10 text-warn',
  orange: 'bg-orange-500/10 text-orange-600 dark:text-orange-400',
  sky: 'bg-sky-500/10 text-sky-600 dark:text-sky-400',
  neutral: 'bg-muted text-muted-foreground',
};

function RouteResultItem({
  route,
  fastest = false,
  expandLegsByDefault = false,
}: {
  route: ProviderRouteResult;
  fastest?: boolean;
  expandLegsByDefault?: boolean;
}) {
  const details = buildRouteDetails(route);
  return (
    <article className="min-w-0 rounded-md border border-border/40 bg-background/70 px-3 py-2.5">
      <div className="flex min-w-0 flex-wrap items-start justify-between gap-x-3 gap-y-1">
        <div className="flex min-w-0 items-center gap-2">
          <RouteModeIcon mode={route.mode} transitType={route.transit_type} />
          <h4 className="min-w-0 break-words text-sm font-medium text-foreground">
            {routeModeLabel(route.mode, route.transit_type)}
          </h4>
          {fastest ? <RouteFastestBadge /> : null}
        </div>
        {details ? (
          <span className="min-w-0 max-w-full break-words text-right text-xs text-muted-foreground">
            {details}
          </span>
        ) : null}
      </div>
      {safeText(route.summary) ? (
        <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{route.summary}</p>
      ) : null}
      <RouteLegDetails legs={route.legs} defaultExpanded={expandLegsByDefault} />
      <TransitAlternatives alternatives={route.alternatives} />
    </article>
  );
}

function RouteFastestBadge() {
  return (
    <span
      aria-label="本次返回方案中用时最短"
      className="inline-flex shrink-0 items-center gap-1 rounded-full border border-violet-300/70 bg-gradient-to-r from-violet-50 to-sky-50 px-1.5 py-0.5 text-[10px] font-medium leading-none text-violet-600 shadow-[0_1px_2px_rgba(124,58,237,0.08)] dark:border-violet-500/30 dark:from-violet-500/10 dark:to-sky-500/10 dark:text-violet-300"
    >
      <Timer className="h-2.5 w-2.5" aria-hidden="true" />
      用时最短
    </span>
  );
}

function TransitAlternatives({
  alternatives,
}: {
  alternatives?: ProviderTransitAlternative[] | null;
}) {
  const visibleAlternatives = (alternatives ?? []).slice(0, 2);
  const [detailsExpanded, setDetailsExpanded] = useState(false);
  if (visibleAlternatives.length === 0) return null;

  return (
    <div className="mt-2.5 border-t border-border/30 pt-2">
      <p className="text-[11px] font-medium text-muted-foreground">备选方案</p>
      <ol
        aria-label="备选方案"
        className="mt-1.5 grid grid-cols-1 gap-1.5 lg:grid-cols-2"
      >
        {visibleAlternatives.map((alternative, index) => (
          <li
            key={`${alternative.transit_type || 'transit'}-${index}`}
            className="rounded border border-border/30 bg-muted/10 px-2.5 py-2"
          >
            <div className="flex min-w-0 flex-wrap items-start justify-between gap-x-3 gap-y-1">
              <div className="flex min-w-0 items-center gap-1.5">
                <RouteModeIcon
                  mode="transit"
                  transitType={alternative.transit_type}
                  compactView
                />
                <p className="min-w-0 break-words text-xs font-medium text-foreground">
                  备选 {index + 1} · {transitTypeLabel(alternative.transit_type)
                    || '公共交通'}
                </p>
              </div>
              <RouteMetrics
                durationS={alternative.duration_s}
                walkingDistanceM={alternative.walking_distance_m}
                transfers={alternative.transfers}
              />
            </div>
            {safeText(alternative.summary) ? (
              <p className="mt-0.5 line-clamp-1 text-[11px] text-muted-foreground">
                {alternative.summary}
              </p>
            ) : null}
            <RouteLegDetails
              legs={alternative.legs}
              compactView
              expanded={detailsExpanded}
              onExpandedChange={setDetailsExpanded}
            />
          </li>
        ))}
      </ol>
    </div>
  );
}

function RouteMetrics({
  durationS,
  walkingDistanceM,
  transfers,
}: {
  durationS?: number | null;
  walkingDistanceM?: number | null;
  transfers?: number | null;
}) {
  const details = compact([
    formatDuration(durationS),
    formatWalkingDistance(walkingDistanceM),
    formatTransfers(transfers),
  ]);
  return details ? (
    <span className="min-w-0 max-w-full break-words text-right text-[11px] text-muted-foreground">
      {details}
    </span>
  ) : null;
}

function RouteLegDetails({
  legs,
  compactView = false,
  defaultExpanded = false,
  expanded: controlledExpanded,
  onExpandedChange,
}: {
  legs?: ProviderTransitLeg[] | null;
  compactView?: boolean;
  defaultExpanded?: boolean;
  expanded?: boolean;
  onExpandedChange?: (expanded: boolean) => void;
}) {
  const visibleLegs = (legs ?? []).slice(0, 8);
  const [internalExpanded, setInternalExpanded] = useState(defaultExpanded);
  const expanded = controlledExpanded ?? internalExpanded;
  const detailsId = useId();
  if (visibleLegs.length === 0) return null;

  const toggleExpanded = () => {
    const nextExpanded = !expanded;
    if (controlledExpanded === undefined) {
      setInternalExpanded(nextExpanded);
    }
    onExpandedChange?.(nextExpanded);
  };

  return (
    <div className={compactView ? 'mt-1.5' : 'mt-2'}>
      <button
        type="button"
        aria-expanded={expanded}
        aria-controls={detailsId}
        onClick={toggleExpanded}
        className="text-[11px] font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
      >
        {expanded ? '收起线路' : '查看线路'}
      </button>
      {expanded ? (
        <ol
          id={detailsId}
          aria-label="线路详情"
          className="mt-1.5 space-y-1.5 border-l border-border/40 pl-2.5"
        >
          {visibleLegs.map((leg, index) => (
            <TransitLegItem key={`${leg.kind || 'other'}-${leg.line_name || index}-${index}`} leg={leg} />
          ))}
        </ol>
      ) : null}
    </div>
  );
}

function TransitLegItem({ leg }: { leg: ProviderTransitLeg }) {
  const kind = transitLegKindLabel(leg.kind);
  const title = safeText(leg.line_name) || kind;
  const stops = safeText(leg.departure_stop) && safeText(leg.arrival_stop)
    ? `${safeText(leg.departure_stop)} → ${safeText(leg.arrival_stop)}`
    : safeText(leg.departure_stop) || safeText(leg.arrival_stop);
  const metrics = compact([
    formatDistance(leg.distance_m),
    formatDuration(leg.duration_s),
    formatViaStops(leg.via_stop_count),
  ]);
  const access = compact([
    safeText(leg.entrance) ? `入口 ${safeText(leg.entrance)}` : '',
    safeText(leg.exit) ? `出口 ${safeText(leg.exit)}` : '',
  ]);

  return (
    <li className="flex min-w-0 items-start gap-1.5 text-[11px] text-muted-foreground">
      <RouteModeIcon legKind={leg.kind} compactView />
      <div className="min-w-0 pt-0.5">
        <p className="break-words font-medium text-foreground">
          {leg.kind === 'walking'
            ? compact([`${kind}${formatDistance(leg.distance_m) ? ` ${formatDistance(leg.distance_m)}` : ''}`, formatDuration(leg.duration_s)])
            : title}
        </p>
        {leg.kind !== 'walking' && stops ? <p className="mt-0.5 break-words">{stops}</p> : null}
        {leg.kind !== 'walking' && metrics ? <p className="mt-0.5">{metrics}</p> : null}
        {access ? <p className="mt-0.5 break-words">{access}</p> : null}
      </div>
    </li>
  );
}

function ResultHeader({
  icon,
  title,
  provider,
  status,
  statusText,
}: {
  icon: ReactNode;
  title: string;
  provider?: string | null;
  status?: NetworkSourceStatus | null;
  statusText: string;
}) {
  return (
    <header className="flex min-w-0 items-start justify-between gap-3">
      <div className="flex min-w-0 items-start gap-2">
        <span className="mt-0.5 shrink-0">{icon}</span>
        <div className="min-w-0">
          <h3 className="truncate text-sm font-medium text-foreground" title={title}>{title}</h3>
          <p className="mt-0.5 text-[11px] text-muted-foreground">{providerLabel(provider)}</p>
        </div>
      </div>
      <span className={cn(
        'shrink-0 rounded-full border px-2 py-0.5 text-[11px]',
        status === 'failed' || status === 'degraded'
          ? 'border-warn/30 bg-warn/5 text-warn'
          : 'border-border/40 text-muted-foreground',
      )}>
        {statusText}
      </span>
    </header>
  );
}

function EmptyResult({ text }: { text: string }) {
  return (
    <div className="mt-3 flex items-center gap-2 rounded-md border border-dashed border-border/50 px-3 py-2 text-xs text-muted-foreground">
      <AlertTriangle className="h-3.5 w-3.5 text-warn" aria-hidden="true" />
      {text}
    </div>
  );
}

function Limitations({ items }: { items?: string[] | null }) {
  const safeItems = (items ?? []).map(safeText).filter(Boolean).slice(0, 2);
  if (safeItems.length === 0) return null;
  return <p className="mt-2 text-[11px] text-muted-foreground">{safeItems.join('；')}</p>;
}

function buildPlaceTitle(block: PlaceResultsBlock): string {
  const query = safeText(block.query);
  const near = safeText(block.near);
  if (query && near) return `${near} · ${query}`;
  return query || near || '地点推荐';
}

function providerLabel(provider?: string | null): string {
  return safeText(provider).toLowerCase() === 'amap' ? '高德地图' : '地图服务';
}

function securePhotos(photos?: ProviderPlacePhoto[] | null): ProviderPlacePhoto[] {
  const seen = new Set<string>();
  return (photos ?? []).reduce<ProviderPlacePhoto[]>((result, photo) => {
    const parsed = parseHttpsUrl(photo.url);
    if (!parsed) return result;
    const url = parsed.toString();
    if (seen.has(url)) return result;
    seen.add(url);
    result.push({ ...photo, url });
    return result;
  }, []);
}

function safeAmapUrl(value?: string | null): string | null {
  const parsed = parseHttpsUrl(value);
  if (!parsed) return null;
  return parsed.hostname === 'uri.amap.com' || parsed.hostname === 'www.amap.com'
    ? parsed.toString()
    : null;
}

function parseHttpsUrl(value?: string | null): URL | null {
  const normalized = safeText(value);
  if (!normalized) return null;
  try {
    const parsed = new URL(normalized);
    return parsed.protocol === 'https:' ? parsed : null;
  } catch {
    return null;
  }
}

function routeStatusText(status: NetworkSourceStatus | null | undefined, routeCount: number): string {
  if (status === 'degraded') return '部分路线可用';
  if (status === 'failed') return '路线暂不可用';
  if (status === 'interrupted') return '路线查询已中断';
  return routeCount > 0 ? `${routeCount} 种方案` : '路线结果';
}

function routeModeLabel(mode?: string | null, transitType?: ProviderTransitType | null): string {
  if (safeText(mode).toLowerCase() === 'transit' && !transitType) return '公交';
  return resolveTransportModePresentation({ mode, transitType }).label;
}

function routeUnavailableModeLabel(mode?: string | null): string {
  return safeText(mode).toLowerCase() === 'transit'
    ? '公共交通'
    : routeModeLabel(mode);
}

function transitTypeLabel(value?: ProviderTransitType | null): string {
  return value
    ? resolveTransportModePresentation({ mode: 'transit', transitType: value }).label
    : '';
}

function transitLegKindLabel(value?: ProviderTransitLeg['kind']): string {
  if (!value || value === 'other') return '其他路段';
  return resolveTransportModePresentation({ legKind: value }).label;
}

function safeCount(value?: number | null): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? Math.floor(value)
    : null;
}

function formatDistance(value?: number | null): string {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return '';
  if (value < 1000) return `${Math.round(value)} 米`;
  return `${(value / 1000).toFixed(value >= 10_000 ? 0 : 1)} 公里`;
}

function formatDuration(value?: number | null): string {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return '';
  return `约 ${Math.max(1, Math.round(value / 60))} 分钟`;
}

function formatTotalDistance(value?: number | null): string {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return '';
  if (value < 1000) return `全程 ${Math.round(value)} 米`;
  const kilometers = value / 1000;
  const formatted = Number.isInteger(kilometers) ? kilometers.toFixed(0) : kilometers.toFixed(1);
  return `全程 ${formatted} 公里`;
}

function formatWalkingDistance(value?: number | null): string {
  const distance = formatDistance(value);
  return distance ? `步行 ${distance}` : '';
}

function formatRating(value?: number | null): string {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? `评分 ${value.toFixed(1)}`
    : '';
}

function formatReferenceCost(value?: number | null): string {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? `高德参考消费 ¥${Math.round(value)}`
    : '';
}

function formatToll(value?: number | null): string {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? `过路费 ¥${Math.round(value)}`
    : '';
}

function formatTransfers(value?: number | null): string {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? `${Math.floor(value)} 次换乘`
    : '';
}

function formatViaStops(value?: number | null): string {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? `途经 ${Math.floor(value)} 站`
    : '';
}

function safeText(value?: string | null): string {
  return typeof value === 'string' ? value.trim() : '';
}

function compact(values: string[]): string {
  return values.filter(Boolean).join(' · ');
}
