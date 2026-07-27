'use client';

import { useId, useState } from 'react';
import type { ReactNode } from 'react';
import type { TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';
import {
  CalendarDays,
  Check,
  ChevronDown,
  CircleAlert,
  CircleDollarSign,
  Clock3,
  CloudSun,
  CornerDownRight,
  MapPinned,
  Plane,
  Route,
  TrainFront,
} from 'lucide-react';

import { cn } from '@/lib/utils';
import type {
  ItineraryPlanPresentation,
  ItineraryPresentationItem,
  ItinerarySectionPresentation,
  ItinerarySourceBlock,
} from '@/lib/chat/itineraryResultPresentation';
import type { ItineraryAvailability } from '@/types/conversation';

interface ItineraryResultsProps {
  item: ItineraryPresentationItem;
  renderSourceBlocks: (blocks: ItinerarySourceBlock[]) => ReactNode;
  isLoading?: boolean;
  onFollowUp?: (question: string) => void;
}

export default function ItineraryResults({
  item,
  renderSourceBlocks,
  isLoading = false,
  onFollowUp,
}: ItineraryResultsProps) {
  const { t, i18n } = useTranslation();
  const [selectedPlanId, setSelectedPlanId] = useState(item.plans[0]?.id ?? '');
  const [detailsOpen, setDetailsOpen] = useState(false);
  const detailsId = useId();
  const selectedPlan = item.plans.find(plan => plan.id === selectedPlanId) ?? item.plans[0];
  if (!selectedPlan) return null;

  return (
    <section
      aria-label={t('structuredResults.itinerary.region')}
      className="overflow-hidden rounded-2xl border border-border/70 bg-background shadow-sm"
      data-testid="itinerary-results"
    >
      <header className="border-b border-border/60 bg-gradient-to-br from-primary/[0.07] via-background to-background px-4 py-4 sm:px-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <MapPinned className="h-4 w-4" aria-hidden="true" />
              </span>
              <span className="truncate">{item.block.origin} → {item.block.destination}</span>
            </div>
            <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1">
                <CalendarDays className="h-3.5 w-3.5" aria-hidden="true" />
                {formatDateRange(item.block.start_date, item.block.end_date, i18n.language)}
              </span>
              <span aria-hidden="true">·</span>
              <span>
                {item.block.trip_type === 'round_trip'
                  ? t('structuredResults.itinerary.roundTrip')
                  : t('structuredResults.itinerary.oneWay')}
              </span>
            </p>
          </div>
          <span className={cn(
            'rounded-full border px-2.5 py-1 text-[11px] font-medium',
            isLoading
              ? 'border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-900/70 dark:bg-sky-950/40 dark:text-sky-300'
              : item.block.status === 'success'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/70 dark:bg-emerald-950/40 dark:text-emerald-300'
              : 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/70 dark:bg-amber-950/40 dark:text-amber-300',
          )}>
            {isLoading
              ? t('structuredResults.itinerary.loading')
              : item.block.status === 'success'
                ? t('structuredResults.itinerary.complete')
                : t('structuredResults.itinerary.partial')}
          </span>
        </div>

        {item.plans.length > 1 ? (
          <div
            className="mt-4 grid gap-2 sm:grid-cols-2"
            aria-label={t('structuredResults.itinerary.planSwitcher')}
          >
            {item.plans.map(plan => (
              <PlanButton
                key={plan.id}
                plan={plan}
                selected={plan.id === selectedPlan.id}
                onSelect={() => {
                  setSelectedPlanId(plan.id);
                  setDetailsOpen(false);
                }}
              />
            ))}
          </div>
        ) : (
          <PlanSummary plan={selectedPlan} className="mt-4" />
        )}
      </header>

      <div className="space-y-3 px-4 py-4 sm:px-5">
        <div className="grid gap-3 lg:grid-cols-2">
          {selectedPlan.sections.map(section => (
            <SectionSummary
              key={section.id}
              section={section}
              startDate={item.block.start_date}
              endDate={item.block.end_date}
            />
          ))}
        </div>

        <UnavailableSummary availability={item.block.availability} />

        <button
          type="button"
          className="flex w-full items-center justify-between rounded-xl border border-border/60 bg-muted/20 px-3 py-2.5 text-left text-sm font-medium text-foreground transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
          aria-expanded={detailsOpen}
          aria-controls={detailsId}
          onClick={() => setDetailsOpen(open => !open)}
        >
          <span>
            {detailsOpen
              ? t('structuredResults.itinerary.hideDetails')
              : t('structuredResults.itinerary.details')}
          </span>
          <ChevronDown
            className={cn('h-4 w-4 transition-transform', detailsOpen && 'rotate-180')}
            aria-hidden="true"
          />
        </button>

        {detailsOpen ? (
          <div id={detailsId} className="space-y-4" data-testid="itinerary-source-details">
            {selectedPlan.sections.map(section => (
              <div key={section.id}>
                <p className="mb-2 text-xs font-medium text-muted-foreground">
                  {t(`structuredResults.itinerary.sections.${section.kind}`)}
                </p>
                {renderSourceBlocks(section.blocks)}
              </div>
            ))}
          </div>
        ) : null}

        {!isLoading && onFollowUp ? (
          <FollowUpActions
            origin={item.block.origin}
            destination={item.block.destination}
            onFollowUp={onFollowUp}
          />
        ) : null}

        {item.block.limitations.length > 0 ? (
          <ul className="space-y-1 text-[11px] leading-5 text-muted-foreground">
            {item.block.limitations.map(limitation => <li key={limitation}>· {limitation}</li>)}
          </ul>
        ) : null}

        {item.attributions.length > 0 ? (
          <p className="text-[11px] text-muted-foreground/80">
            {t('structuredResults.itinerary.sources', {
              sources: item.attributions.join(i18n.language.startsWith('zh') ? '、' : ', '),
            })}
          </p>
        ) : null}
      </div>
    </section>
  );
}

function UnavailableSummary({
  availability,
}: {
  availability: ItineraryAvailability[];
}) {
  const { t } = useTranslation();
  const unavailable = availability.filter(item => item.status === 'unavailable');
  if (unavailable.length === 0) return null;
  return (
    <div
      className="rounded-xl border border-amber-200 bg-amber-50/70 px-3 py-3 text-amber-900 dark:border-amber-900/70 dark:bg-amber-950/30 dark:text-amber-200"
      data-testid="itinerary-unavailable-summary"
    >
      <p className="flex items-center gap-2 text-xs font-medium">
        <CircleAlert className="h-4 w-4" aria-hidden="true" />
        {t('structuredResults.itinerary.unavailableTitle')}
      </p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {unavailable.map(item => (
          <span
            key={`${item.journey}:${item.mode}`}
            className="rounded-full border border-amber-300/70 bg-background/60 px-2 py-1 text-[11px] dark:border-amber-800"
          >
            {availabilityLabel(item, t)}
          </span>
        ))}
      </div>
    </div>
  );
}

function availabilityLabel(
  item: ItineraryAvailability,
  t: TFunction,
): string {
  if (item.journey === 'destination_weather' || item.journey === 'local_route') {
    return t(`structuredResults.itinerary.sections.${item.journey}`);
  }
  return t('structuredResults.itinerary.availabilityLabel', {
    journey: t(`structuredResults.itinerary.sections.${item.journey}_transport`),
    mode: t(`structuredResults.itinerary.modes.${item.mode}`),
  });
}

function PlanButton({
  plan,
  selected,
  onSelect,
}: {
  plan: ItineraryPlanPresentation;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      className={cn(
        'rounded-xl border px-3 py-3 text-left transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40',
        selected
          ? 'border-primary/40 bg-primary/[0.08] shadow-sm'
          : 'border-border/70 bg-background/80 hover:border-primary/25 hover:bg-muted/30',
      )}
      onClick={onSelect}
    >
      <span className={cn(
        'mb-2 inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium',
        selected
          ? 'bg-primary/10 text-primary'
          : 'bg-muted/70 text-muted-foreground',
      )}>
        {selected
          ? <PlanSelectionLabel selected />
          : <PlanSelectionLabel selected={false} />}
      </span>
      <PlanSummary plan={plan} embedded />
    </button>
  );
}

function PlanSelectionLabel({ selected }: { selected: boolean }) {
  const { t } = useTranslation();
  return (
    <>
      {selected ? <Check className="mr-1 h-3 w-3" aria-hidden="true" /> : null}
      {selected
        ? t('structuredResults.itinerary.currentPlan')
        : t('structuredResults.itinerary.alternativePlan')}
    </>
  );
}

function PlanSummary({
  plan,
  className,
  embedded = false,
}: {
  plan: ItineraryPlanPresentation;
  className?: string;
  embedded?: boolean;
}) {
  const { t, i18n } = useTranslation();
  const isPrice = plan.strategy === 'lowest_reference_price';
  return (
    <div className={cn(
      !embedded && 'rounded-xl border border-border/60 bg-background/80 px-3 py-3',
      className,
    )}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm font-semibold text-foreground">
          {isPrice
            ? t('structuredResults.itinerary.lowestPricePlan')
            : t('structuredResults.itinerary.shortestDurationPlan')}
        </span>
        <span className={cn(
          'shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold',
          isPrice
            ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300'
            : 'bg-sky-100 text-sky-700 dark:bg-sky-950/60 dark:text-sky-300',
        )}>
          {isPrice
            ? t('structuredResults.itinerary.lowestPrice')
            : t('structuredResults.itinerary.shortestDuration')}
        </span>
      </div>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1">
          <CircleDollarSign className="h-3.5 w-3.5" aria-hidden="true" />
          {formatMoney(plan.known_cost?.amount_minor, i18n.language)}
        </span>
        <span className="inline-flex items-center gap-1">
          <Clock3 className="h-3.5 w-3.5" aria-hidden="true" />
          {formatDuration(plan.known_duration_s, t)}
        </span>
      </div>
    </div>
  );
}

function SectionSummary({
  section,
  startDate,
  endDate,
}: {
  section: ItinerarySectionPresentation;
  startDate: string;
  endDate: string | null;
}) {
  const { t } = useTranslation();
  const Icon = sectionIcon(section);
  const overview = sectionOverview(section, startDate, endDate, t);
  const tone = section.status === 'complete'
    ? 'text-emerald-700 dark:text-emerald-300'
    : section.status === 'partial'
      ? 'text-amber-700 dark:text-amber-300'
      : 'text-muted-foreground';
  return (
    <article className="min-w-0 rounded-xl border border-border/60 bg-muted/[0.16] px-3 py-3">
      <div className="flex min-w-0 items-start gap-2">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-background text-primary shadow-sm">
          <Icon className="h-4 w-4" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 flex-wrap items-center justify-between gap-x-2 gap-y-1">
            <p className="truncate text-sm font-medium text-foreground">
              {t(`structuredResults.itinerary.sections.${section.kind}`)}
            </p>
            <p className={cn('shrink-0 text-[11px] font-medium', tone)}>
              {t(`structuredResults.itinerary.sectionStatus.${section.status}`)}
            </p>
          </div>
          {overview.primary ? (
            <p className="mt-2 break-words text-xs font-medium text-foreground">
              {overview.primary}
            </p>
          ) : null}
          {overview.secondary ? (
            <p className="mt-1 break-words text-[11px] text-muted-foreground">
              {overview.secondary}
            </p>
          ) : null}
        </div>
      </div>
    </article>
  );
}

function FollowUpActions({
  origin,
  destination,
  onFollowUp,
}: {
  origin: string;
  destination: string;
  onFollowUp: (question: string) => void;
}) {
  const { t } = useTranslation();
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const actions = [
    {
      key: 'dates',
      label: t('structuredResults.itinerary.followUps.changeDates'),
      prompt: t('structuredResults.itinerary.followUps.changeDatesPrompt', { origin, destination }),
    },
    {
      key: 'budget',
      label: t('structuredResults.itinerary.followUps.adjustBudget'),
      prompt: t('structuredResults.itinerary.followUps.adjustBudgetPrompt', { origin, destination }),
    },
    {
      key: 'transfers',
      label: t('structuredResults.itinerary.followUps.fewerTransfers'),
      prompt: t('structuredResults.itinerary.followUps.fewerTransfersPrompt', { origin, destination }),
    },
  ];
  return (
    <div className="border-t border-border/50 pt-3">
      <p className="text-xs font-medium text-foreground">
        {t('structuredResults.itinerary.followUps.title')}
      </p>
      <div
        className="mt-2 flex min-w-0 flex-wrap gap-2"
        data-testid="itinerary-follow-up-actions"
      >
        {actions.map(action => (
          <button
            key={action.key}
            type="button"
            className="inline-flex min-w-0 items-center gap-1.5 rounded-full border border-border/70 bg-background px-3 py-1.5 text-xs text-foreground transition-colors hover:border-primary/30 hover:bg-primary/[0.05] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={pendingAction !== null}
            aria-busy={pendingAction === action.key}
            onClick={() => {
              if (pendingAction !== null) return;
              setPendingAction(action.key);
              onFollowUp(action.prompt);
            }}
          >
            <CornerDownRight className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden="true" />
            <span>{action.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

interface SectionOverview {
  primary: string;
  secondary: string;
}

function sectionOverview(
  section: ItinerarySectionPresentation,
  startDate: string,
  endDate: string | null,
  t: TFunction,
): SectionOverview {
  if (section.kind === 'destination_weather') {
    const coverage = t(`structuredResults.itinerary.weatherCoverage.${section.coverage}`);
    if (section.coverage === 'outside_range' || section.status === 'unavailable') {
      return { primary: coverage, secondary: '' };
    }
    const weather = section.blocks.find(block => block.type === 'weather_results');
    const lastDate = endDate ?? startDate;
    const forecasts = weather?.forecast_days
      .filter(day => day.date >= startDate && day.date <= lastDate)
      .sort((left, right) => left.date.localeCompare(right.date)) ?? [];
    if (forecasts.length === 0) return { primary: '', secondary: coverage };
    const first = forecasts.find(day => day.date === startDate) ?? forecasts[0];
    const last = forecasts.find(day => day.date === lastDate) ?? forecasts.at(-1);
    const visibleForecasts = last && last.date !== first.date ? [first, last] : [first];
    return {
      primary: visibleForecasts
        .map(forecast => formatWeatherDay(forecast, t))
        .join(t('structuredResults.itinerary.weatherDayJoin')),
      secondary: coverage,
    };
  }

  if (section.kind === 'local_route') {
    const routeBlock = section.blocks.find(block => block.type === 'route_results');
    const route = routeBlock?.routes?.[0];
    if (!route) return { primary: '', secondary: '' };
    const details = [
      formatDuration(route.duration_s, t),
      formatDistance(route.distance_m, t),
      typeof route.transfers === 'number'
        ? t('structuredResults.itinerary.transferCount', { count: route.transfers })
        : '',
    ].filter(value => value && value !== '—');
    return {
      primary: route.summary?.trim() || t('structuredResults.itinerary.localRouteSummary'),
      secondary: details.join(' · '),
    };
  }

  const flightBlock = section.blocks.find(block => block.type === 'flight_results');
  const flight = flightBlock?.flights?.[0];
  if (flight) {
    const mode = t('structuredResults.itinerary.modes.flight');
    const identifier = [flight.airline_name?.trim(), flight.flight_no?.trim()]
      .filter(Boolean)
      .join(' ');
    return {
      primary: identifier ? `${mode} · ${identifier}` : mode,
      secondary: formatScheduleRange(
        flight.departure?.scheduled_at,
        flight.arrival?.scheduled_at,
        t,
      ),
    };
  }

  const trainBlock = section.blocks.find(block => block.type === 'train_results');
  const train = trainBlock?.trains?.[0];
  if (train) {
    const mode = t('structuredResults.itinerary.modes.train');
    const identifier = train.train_no?.trim() ?? '';
    return {
      primary: identifier ? `${mode} · ${identifier}` : mode,
      secondary: formatScheduleRange(
        train.departure?.scheduled_at,
        train.arrival?.scheduled_at,
        t,
      ),
    };
  }

  return { primary: '', secondary: '' };
}

function formatWeatherDay(
  forecast: {
    date: string;
    day_weather: string;
    night_weather: string;
    high_c: number;
    low_c: number;
  },
  t: TFunction,
): string {
  const [, month, day] = forecast.date.match(/^\d{4}-(\d{2})-(\d{2})$/) ?? [];
  const dateLabel = month && day
    ? t('structuredResults.itinerary.weatherDayLabel', {
      month: Number(month),
      day: Number(day),
    })
    : forecast.date;
  const condition = forecast.day_weather === forecast.night_weather
    ? forecast.day_weather
    : `${forecast.day_weather}${t('structuredResults.itinerary.weatherTransition')}${forecast.night_weather}`;
  return `${dateLabel} ${condition} · ${forecast.low_c}–${forecast.high_c}℃`;
}

function sectionIcon(section: ItinerarySectionPresentation) {
  if (section.kind === 'destination_weather') return CloudSun;
  if (section.kind === 'local_route') return Route;
  if (section.blocks.some(block => block.type === 'flight_results')) return Plane;
  if (section.blocks.some(block => block.type === 'train_results')) return TrainFront;
  return Route;
}

function formatDateRange(start: string, end: string | null, language: string): string {
  const formatter = new Intl.DateTimeFormat(
    language.startsWith('zh') ? 'zh-CN' : 'en-US',
    { month: 'short', day: 'numeric', timeZone: 'Asia/Shanghai' },
  );
  const startLabel = formatter.format(new Date(`${start}T00:00:00+08:00`));
  if (!end) return startLabel;
  return `${startLabel} – ${formatter.format(new Date(`${end}T00:00:00+08:00`))}`;
}

function formatScheduleRange(
  departure: string | null | undefined,
  arrival: string | null | undefined,
  t: TFunction,
): string {
  const departureTime = extractClockTime(departure);
  const arrivalTime = extractClockTime(arrival);
  if (departureTime && arrivalTime) return `${departureTime}–${arrivalTime}`;
  if (departureTime) {
    return t('structuredResults.itinerary.departureTime', { time: departureTime });
  }
  if (arrivalTime) {
    return t('structuredResults.itinerary.arrivalTime', { time: arrivalTime });
  }
  return '';
}

function extractClockTime(value: string | null | undefined): string {
  return value?.match(/T(\d{2}:\d{2})/)?.[1] ?? '';
}

function formatDistance(distanceM: number | null | undefined, t: TFunction): string {
  if (distanceM === null || distanceM === undefined || distanceM < 0) return '';
  if (distanceM < 1_000) {
    return t('structuredResults.itinerary.distanceMeters', { count: Math.round(distanceM) });
  }
  return t('structuredResults.itinerary.distanceKilometers', {
    count: Number((distanceM / 1_000).toFixed(1)),
  });
}

function formatMoney(
  amountMinor: number | null | undefined,
  language: string,
): string {
  if (amountMinor === null || amountMinor === undefined) return '—';
  return new Intl.NumberFormat(language.startsWith('zh') ? 'zh-CN' : 'en-US', {
    style: 'currency',
    currency: 'CNY',
    maximumFractionDigits: amountMinor % 100 === 0 ? 0 : 2,
  }).format(amountMinor / 100);
}

function formatDuration(
  durationSeconds: number | null | undefined,
  t: TFunction,
): string {
  if (durationSeconds === null || durationSeconds === undefined) return '—';
  const minutes = Math.round(durationSeconds / 60);
  const hours = Math.floor(minutes / 60);
  const restMinutes = minutes % 60;
  if (hours === 0) {
    return t('structuredResults.common.duration.minutes', { count: restMinutes });
  }
  if (restMinutes === 0) {
    return t('structuredResults.common.duration.hours', { count: hours });
  }
  return t('structuredResults.common.duration.hoursMinutes', {
    hours,
    minutes: restMinutes,
  });
}
