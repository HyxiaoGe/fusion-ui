'use client';

import { useRef, useState } from 'react';
import type { ReactNode } from 'react';
import {
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  ImageOff,
  MapPin,
  Minus,
  Plus,
  Route,
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
  RouteResultsBlock,
  StructuredToolResultBlock,
} from '@/types/conversation';
import { cn } from '@/lib/utils';

interface StructuredToolResultsProps {
  blocks: StructuredToolResultBlock[];
}

export default function StructuredToolResults({ blocks }: StructuredToolResultsProps) {
  if (blocks.length === 0) return null;
  return (
    <div className="mb-3 w-full max-w-4xl space-y-3" data-testid="structured-tool-results">
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
  const hasImages = visiblePlaces.some(place => Boolean(firstSecurePhoto(place.photos)));
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
        <div className={cn('mt-3', hasImages ? 'grid gap-3 sm:grid-cols-2' : 'space-y-2')}>
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
        <div className="mt-3 space-y-2">
          {routes.map((route, index) => (
            <RouteResultItem key={`${route.mode || 'route'}-${index}`} route={route} />
          ))}
        </div>
      ) : (
        <EmptyResult text="暂未取得可展示的路线方案" />
      )}

      {unavailableModes.length > 0 ? (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {unavailableModes.map(mode => (
            <span key={mode} className="rounded-full border border-warn/30 bg-warn/5 px-2 py-0.5 text-[11px] text-warn">
              {routeModeLabel(mode)}暂不可用
            </span>
          ))}
        </div>
      ) : null}
      <Limitations items={block.limitations} />
    </section>
  );
}

function RouteResultItem({ route }: { route: ProviderRouteResult }) {
  const details = compact([
    formatDistance(route.distance_m),
    formatDuration(route.duration_s),
    formatToll(route.toll_yuan),
    formatTransfers(route.transfers),
  ]);
  return (
    <article className="rounded-md border border-border/40 bg-background/70 px-3 py-2.5">
      <div className="flex items-center justify-between gap-3">
        <h4 className="text-sm font-medium text-foreground">{routeModeLabel(route.mode)}</h4>
        {details ? <span className="text-xs text-muted-foreground">{details}</span> : null}
      </div>
      {safeText(route.summary) ? (
        <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{route.summary}</p>
      ) : null}
    </article>
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

function firstSecurePhoto(photos?: ProviderPlacePhoto[] | null): ProviderPlacePhoto | null {
  return securePhotos(photos)[0] ?? null;
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

function routeModeLabel(mode?: string | null): string {
  const labels: Record<string, string> = {
    driving: '驾车',
    transit: '公交',
    walking: '步行',
    bicycling: '骑行',
  };
  return labels[safeText(mode).toLowerCase()] || '路线方案';
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

function safeText(value?: string | null): string {
  return typeof value === 'string' ? value.trim() : '';
}

function compact(values: string[]): string {
  return values.filter(Boolean).join(' · ');
}
