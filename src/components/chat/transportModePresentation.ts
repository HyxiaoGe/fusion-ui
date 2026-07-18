export type TransportIconKind =
  | 'driving'
  | 'taxi'
  | 'motorcycle'
  | 'bus'
  | 'subway'
  | 'mixed'
  | 'public-transit'
  | 'bicycling'
  | 'walking'
  | 'rail'
  | 'high-speed-rail'
  | 'flight'
  | 'ferry'
  | 'tram'
  | 'cable-car'
  | 'route';

export type TransportTone =
  | 'blue'
  | 'teal'
  | 'purple'
  | 'green'
  | 'amber'
  | 'orange'
  | 'sky'
  | 'neutral';

export interface TransportModePresentation {
  iconKind: TransportIconKind;
  label: string;
  tone: TransportTone;
}

interface ResolveTransportModeInput {
  mode?: string | null;
  transitType?: string | null;
  legKind?: string | null;
}

const PRESENTATIONS: Record<string, TransportModePresentation> = {
  driving: { iconKind: 'driving', label: '驾车', tone: 'blue' },
  car: { iconKind: 'driving', label: '驾车', tone: 'blue' },
  taxi: { iconKind: 'taxi', label: '出租车', tone: 'amber' },
  rideshare: { iconKind: 'taxi', label: '网约车', tone: 'amber' },
  motorcycle: { iconKind: 'motorcycle', label: '摩托车', tone: 'orange' },
  motorbike: { iconKind: 'motorcycle', label: '摩托车', tone: 'orange' },
  bus: { iconKind: 'bus', label: '公交', tone: 'teal' },
  coach: { iconKind: 'bus', label: '客运大巴', tone: 'teal' },
  subway: { iconKind: 'subway', label: '地铁', tone: 'purple' },
  metro: { iconKind: 'subway', label: '地铁', tone: 'purple' },
  mixed: { iconKind: 'mixed', label: '公交+地铁', tone: 'sky' },
  public_transit: { iconKind: 'public-transit', label: '公共交通', tone: 'sky' },
  transit: { iconKind: 'public-transit', label: '公共交通', tone: 'sky' },
  bicycling: { iconKind: 'bicycling', label: '骑行', tone: 'green' },
  cycling: { iconKind: 'bicycling', label: '骑行', tone: 'green' },
  bicycle: { iconKind: 'bicycling', label: '骑行', tone: 'green' },
  walking: { iconKind: 'walking', label: '步行', tone: 'amber' },
  walk: { iconKind: 'walking', label: '步行', tone: 'amber' },
  rail: { iconKind: 'rail', label: '铁路', tone: 'blue' },
  railway: { iconKind: 'rail', label: '铁路', tone: 'blue' },
  train: { iconKind: 'rail', label: '铁路', tone: 'blue' },
  high_speed_rail: { iconKind: 'high-speed-rail', label: '高铁', tone: 'orange' },
  highspeed_rail: { iconKind: 'high-speed-rail', label: '高铁', tone: 'orange' },
  flight: { iconKind: 'flight', label: '飞机', tone: 'sky' },
  plane: { iconKind: 'flight', label: '飞机', tone: 'sky' },
  air: { iconKind: 'flight', label: '飞机', tone: 'sky' },
  ferry: { iconKind: 'ferry', label: '轮渡', tone: 'blue' },
  ship: { iconKind: 'ferry', label: '轮渡', tone: 'blue' },
  tram: { iconKind: 'tram', label: '有轨电车', tone: 'purple' },
  cable_car: { iconKind: 'cable-car', label: '缆车', tone: 'purple' },
};

const FALLBACK: TransportModePresentation = {
  iconKind: 'route',
  label: '路线方案',
  tone: 'neutral',
};

export function resolveTransportModePresentation({
  mode,
  transitType,
  legKind,
}: ResolveTransportModeInput): TransportModePresentation {
  const normalizedLegKind = normalizeTransportValue(legKind);
  if (normalizedLegKind && normalizedLegKind !== 'other') {
    return PRESENTATIONS[normalizedLegKind] ?? FALLBACK;
  }

  const normalizedMode = normalizeTransportValue(mode);
  if (normalizedMode === 'transit') {
    const normalizedTransitType = normalizeTransportValue(transitType);
    return PRESENTATIONS[normalizedTransitType] ?? PRESENTATIONS.public_transit;
  }

  return PRESENTATIONS[normalizedMode] ?? FALLBACK;
}

function normalizeTransportValue(value?: string | null): string {
  return (value ?? '').trim().toLowerCase().replace(/[\s-]+/g, '_');
}
