import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  FlightResultsBlock,
  PlaceResultsBlock,
  RouteResultsBlock,
  TrainResultsBlock,
  WeatherResultsBlock,
} from '@/types/conversation';
import i18n from '@/lib/i18n';
import {
  normalizeStructuredToolResultBlock,
  STRUCTURED_TOOL_RESULT_CONTRACTS,
} from '@/lib/chat/structuredToolResults';
import StructuredToolResults, { STRUCTURED_TOOL_RESULT_RENDERER_TYPES } from './StructuredToolResults';

function placeBlock(overrides: Partial<PlaceResultsBlock> = {}): PlaceResultsBlock {
  return {
    type: 'place_results',
    id: 'places-1',
    schema_version: 1,
    provider: 'amap',
    attribution: { label: '高德地图' },
    query: '烤肉',
    near: '深圳民治',
    status: 'success',
    result_count: 5,
    places: Array.from({ length: 6 }, (_, index) => ({
      provider_place_id: `p-${index + 1}`,
      name: `餐厅 ${index + 1}`,
      address: `民治大道 ${index + 1} 号`,
      distance_m: 500 + index * 100,
      actions: index < 5 ? [{
        kind: 'open_external',
        label: '查看详情',
        url: `https://www.amap.com/place/${index + 1}`,
      }] : [{
        kind: 'open_external',
        label: '查看详情',
        url: 'http://unsafe.example.com',
      }],
    })),
    limitations: ['不包含实时排队信息'],
    tool_call_log_id: 'tc-place',
    ...overrides,
  };
}

function routeBlock(overrides: Partial<RouteResultsBlock> = {}): RouteResultsBlock {
  return {
    type: 'route_results',
    id: 'routes-1',
    schema_version: 1,
    provider: 'amap',
    attribution: { label: '高德地图' },
    status: 'degraded',
    origin: { label: '民治地铁站', city: '深圳' },
    destination: { label: '星河 WORLD', city: '深圳' },
    routes: [{ mode: 'driving', distance_m: 6200, duration_s: 1100, toll_yuan: 0 }],
    unavailable_modes: ['transit'],
    limitations: ['路线时间和距离仅代表本次返回结果'],
    tool_call_log_id: 'tc-route',
    ...overrides,
  };
}

function flightBlock(overrides: Partial<FlightResultsBlock> = {}): FlightResultsBlock {
  return {
    type: 'flight_results',
    id: 'flights-1',
    schema_version: 1,
    provider: 'flyai',
    attribution: { label: '飞猪旅行' },
    status: 'success',
    origin: '深圳',
    destination: '上海',
    departure_date: '2026-08-01',
    observed_at: '2026-07-22T15:00:00+08:00',
    result_count: 2,
    flights: [
      {
        option_id: 'flight-1',
        airline_name: '南方航空',
        flight_no: 'CZ1234',
        departure: {
          city: '深圳',
          station_name: '深圳宝安国际机场',
          station_code: 'SZX',
          terminal: 'T3',
          scheduled_at: '2026-08-01T08:30:00+08:00',
        },
        arrival: {
          city: '上海',
          station_name: '上海虹桥国际机场',
          station_code: 'SHA',
          terminal: 'T2',
          scheduled_at: '2026-08-01T10:45:00+08:00',
        },
        duration_s: 8_100,
        cabin_class: '经济舱',
        stops: 0,
        price: { currency: 'CNY', amount_minor: 88_000 },
        actions: [{ kind: 'open_external', label: '安全预订', url: 'https://a.feizhu.com/flight/1' }],
      },
      {
        option_id: 'flight-2',
        airline_name: '东方航空',
        flight_no: 'MU5678',
        departure: { city: '深圳', station_name: '深圳宝安国际机场', scheduled_at: '2026-08-01T12:00:00+08:00' },
        arrival: { city: '上海', station_name: '上海浦东国际机场', scheduled_at: '2026-08-01T14:30:00+08:00' },
        duration_s: 9_000,
        stops: 0,
        actions: [],
      },
    ],
    limitations: ['价格和班次以预订页为准'],
    tool_call_log_id: 'tc-flight',
    ...overrides,
  };
}

function trainBlock(overrides: Partial<TrainResultsBlock> = {}): TrainResultsBlock {
  return {
    type: 'train_results',
    id: 'trains-1',
    schema_version: 1,
    provider: 'flyai',
    attribution: { label: '飞猪旅行' },
    status: 'success',
    origin: '深圳北',
    destination: '广州南',
    departure_date: '2026-08-01',
    observed_at: '2026-07-22T15:00:00+08:00',
    result_count: 1,
    trains: [{
      option_id: 'train-1',
      train_no: 'G100',
      train_type: '高速动车',
      departure: { city: '深圳', station_name: '深圳北站', scheduled_at: '2026-08-01T09:00:00+08:00' },
      arrival: { city: '广州', station_name: '广州南站', scheduled_at: '2026-08-01T09:32:00+08:00' },
      duration_s: 1_920,
      seat_class: '二等座',
      stops: 0,
      price: { currency: 'CNY', amount_minor: 7_450 },
      actions: [{ kind: 'open_external', label: '安全预订', url: 'https://a.feizhu.com/train/1' }],
    }],
    limitations: [],
    tool_call_log_id: 'tc-train',
    ...overrides,
  };
}

function weatherBlock(overrides: Partial<WeatherResultsBlock> = {}): WeatherResultsBlock {
  return {
    type: 'weather_results',
    id: 'weather-1',
    schema_version: 1,
    provider: 'amap',
    attribution: { label: '高德地图' },
    status: 'success',
    query: '南景新村',
    resolved_location: '龙华区',
    day_count: 4,
    forecast_days: [
      {
        date: '2026-07-23',
        weekday: 4,
        day_weather: '雷阵雨',
        night_weather: '雷阵雨',
        high_c: 32,
        low_c: 27,
        day_wind_direction: '南',
        night_wind_direction: '南',
        day_wind_power: '1-3',
        night_wind_power: '1-3',
      },
      {
        date: '2026-07-24',
        weekday: 5,
        day_weather: '多云',
        night_weather: '多云',
        high_c: 33,
        low_c: 27,
      },
      {
        date: '2026-07-25',
        weekday: 6,
        day_weather: '晴',
        night_weather: '多云',
        high_c: 34,
        low_c: 28,
      },
      {
        date: '2026-07-26',
        weekday: 7,
        day_weather: '阵雨',
        night_weather: '阵雨',
        high_c: 32,
        low_c: 27,
      },
    ],
    fetched_at: '2026-07-23T12:00:00+08:00',
    limitations: ['天气预报仅供出行参考'],
    tool_call_log_id: 'tc-weather',
    ...overrides,
  };
}

describe('StructuredToolResults', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('zh-CN');
  });

  it('每个已注册富结果协议都有对应渲染器', () => {
    expect([...STRUCTURED_TOOL_RESULT_RENDERER_TYPES].sort()).toEqual(
      STRUCTURED_TOOL_RESULT_CONTRACTS.map(contract => contract.type).sort(),
    );
  });

  it('未知富结果只展示低干扰提示，不泄露原始类型', () => {
    render(<StructuredToolResults blocks={[{
      type: 'unsupported_result',
      id: 'future-1',
      source_type: 'private_provider_result',
      source_schema_version: 9,
      reason: 'unsupported_version',
    }]} />);

    expect(screen.getByTestId('unsupported-structured-result')).toHaveTextContent(
      '此结果暂不受当前版本支持，请刷新页面或稍后再试。',
    );
    expect(screen.queryByText(/private_provider_result/)).not.toBeInTheDocument();
  });

  it('结构化结果占满消息可用宽度，不再限制超宽屏宽度', () => {
    render(<StructuredToolResults blocks={[placeBlock()]} />);

    expect(screen.getByTestId('structured-tool-results')).toHaveClass('w-full');
    expect(screen.getByTestId('structured-tool-results')).not.toHaveClass('max-w-4xl');
  });

  it('航班卡片以行程决策为中心展示两列摘要、完整细节和安全预订动作', () => {
    render(<StructuredToolResults blocks={[flightBlock()]} />);

    const region = screen.getByRole('region', { name: '航班查询结果' });
    expect(within(region).getByText('深圳 → 上海 · 2026-08-01')).toBeInTheDocument();
    expect(within(region).getByText('飞猪旅行')).toBeInTheDocument();
    expect(within(region).getByTestId('flight-results-grid')).toHaveClass(
      'grid-cols-1',
      'xl:grid-cols-2',
      '2xl:grid-cols-3',
    );
    expect(within(region).getByText('南方航空 · CZ1234')).toBeInTheDocument();
    expect(within(region).getByText('08:30')).toBeInTheDocument();
    expect(within(region).getByText('10:45')).toBeInTheDocument();
    expect(within(region).getByText('深圳宝安国际机场 · SZX · T3')).toBeInTheDocument();
    expect(within(region).getByText('上海虹桥国际机场 · SHA · T2')).toBeInTheDocument();
    expect(within(region).getByText('2 小时 15 分钟')).toBeInTheDocument();
    expect(within(region).getByText('经济舱')).toBeInTheDocument();
    expect(within(region).getAllByText('直达')).toHaveLength(2);
    expect(within(region).getByText('¥880')).toBeInTheDocument();
    expect(within(region).getByText('价格暂不可用')).toBeInTheDocument();
    expect(within(region).getByRole('link', { name: '查看详情' })).toHaveAttribute(
      'href',
      'https://a.feizhu.com/flight/1',
    );
    expect(within(region).getByRole('link', { name: '查看详情' })).toHaveAttribute('target', '_blank');
    expect(within(region).queryByText('安全预订')).toBeNull();
    expect(within(region).getByText(/查询于/)).toBeInTheDocument();
    expect(region.textContent).not.toMatch(/flyai|search_flights/i);
  });

  it('高铁卡片展示车次、车站、席别和价格，窄屏单列且缺字段不制造空白', () => {
    const { rerender } = render(<StructuredToolResults blocks={[trainBlock()]} />);

    const region = screen.getByRole('region', { name: '高铁查询结果' });
    expect(within(region).getByTestId('train-results-grid')).toHaveClass(
      'grid-cols-1',
      'xl:grid-cols-2',
      '2xl:grid-cols-3',
    );
    expect(within(region).getByText('G100 · 高速动车')).toBeInTheDocument();
    expect(within(region).getByText('深圳北站')).toBeInTheDocument();
    expect(within(region).getByText('广州南站')).toBeInTheDocument();
    expect(within(region).getByText('32 分钟')).toBeInTheDocument();
    expect(within(region).getByText('二等座')).toBeInTheDocument();
    expect(within(region).getByText('¥74.50')).toBeInTheDocument();

    rerender(<StructuredToolResults blocks={[trainBlock({
      attribution: undefined,
      result_count: 1,
      trains: [{
        option_id: 'train-minimal',
        train_no: 'D2288',
        departure: { station_name: '深圳北站', scheduled_at: '2026-08-01T18:00:00+08:00' },
        arrival: { station_name: '厦门北站', scheduled_at: '2026-08-01T21:30:00+08:00' },
        stops: 0,
        actions: [{ kind: 'open_external', label: '危险链接', url: 'https://evil.example/redirect' }],
      }],
    })]} />);

    expect(screen.getByText('出行服务')).toBeInTheDocument();
    expect(screen.getByText('D2288')).toBeInTheDocument();
    expect(screen.getByText('价格暂不可用')).toBeInTheDocument();
    expect(screen.queryByRole('link')).toBeNull();
    expect(screen.queryByText(/undefined|null/)).toBeNull();
  });

  it('合并后的高铁结果完整展示所有唯一车次，不再按单次查询上限截断', () => {
    const trains = Array.from({ length: 6 }, (_, index) => ({
      option_id: `train-${index + 1}`,
      train_no: `G${100 + index}`,
      departure: {
        city: '深圳',
        station_name: '深圳北站',
        scheduled_at: `2026-08-01T${String(8 + index).padStart(2, '0')}:00:00+08:00`,
      },
      arrival: {
        city: '广州',
        station_name: '广州南站',
        scheduled_at: `2026-08-01T${String(8 + index).padStart(2, '0')}:32:00+08:00`,
      },
      duration_s: 1_920,
      stops: 0 as const,
      actions: [],
    }));

    render(<StructuredToolResults blocks={[trainBlock({ result_count: trains.length, trains })]} />);

    expect(screen.getByText('G100')).toBeInTheDocument();
    expect(screen.getByText('G105')).toBeInTheDocument();
  });

  it('同一供应商同一 option_id 的不同舱等或席别使用唯一渲染键', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      const commonFlight = flightBlock().flights![0];
      const commonTrain = trainBlock().trains![0];
      render(<StructuredToolResults blocks={[
        flightBlock({
          result_count: 2,
          flights: [
            { ...commonFlight, option_id: 'shared-flight', cabin_class: '经济舱' },
            { ...commonFlight, option_id: 'shared-flight', cabin_class: '商务舱' },
          ],
        }),
        trainBlock({
          result_count: 2,
          trains: [
            { ...commonTrain, option_id: 'shared-train', seat_class: '二等座' },
            { ...commonTrain, option_id: 'shared-train', seat_class: '商务座' },
          ],
        }),
      ]} />);

      expect(screen.getByText('经济舱')).toBeInTheDocument();
      expect(screen.getByText('商务舱')).toBeInTheDocument();
      expect(screen.getByText('二等座')).toBeInTheDocument();
      expect(screen.getByText('商务座')).toBeInTheDocument();
      expect(consoleError.mock.calls.flat().join(' ')).not.toContain(
        'Encountered two children with the same key',
      );
    } finally {
      consoleError.mockRestore();
    }
  });

  it('航班与高铁空结果展示低干扰空状态', () => {
    render(<StructuredToolResults blocks={[
      flightBlock({ result_count: 0, flights: [] }),
      trainBlock({ result_count: 0, trains: [] }),
    ]} />);

    expect(screen.getByText('暂未找到符合条件的航班')).toBeInTheDocument();
    expect(screen.getByText('暂未找到符合条件的高铁车次')).toBeInTheDocument();
  });

  it('天气卡片以窄屏两列和桌面四列展示四天预报，并高亮今天', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-23T04:00:00Z'));
    try {
      render(<StructuredToolResults blocks={[weatherBlock()]} />);

      const region = screen.getByRole('region', { name: '天气预报结果' });
      expect(within(region).getByText('龙华区 · 四天天气')).toBeInTheDocument();
      expect(within(region).getByText('高德地图')).toBeInTheDocument();
      expect(within(region).getByText('4 天预报')).toBeInTheDocument();

      const grid = within(region).getByTestId('weather-results-grid');
      expect(grid).toHaveClass('grid-cols-2', 'lg:grid-cols-4');
      const days = within(grid).getAllByTestId('weather-forecast-day');
      expect(days).toHaveLength(4);
      expect(days[0]).toHaveAttribute('data-today', 'true');
      expect(days[0]).toHaveClass('border-primary/40', 'bg-primary/5');
      expect(within(days[0]).getByText('今天')).toBeInTheDocument();
      expect(within(days[0]).getByText('7月23日')).toBeInTheDocument();
      expect(within(days[0]).getByText('星期四')).toBeInTheDocument();
      expect(within(days[0]).getByTestId('weather-icon-thunder')).toBeInTheDocument();
      expect(within(days[0]).getByText('白天 雷阵雨')).toBeInTheDocument();
      expect(within(days[0]).getByText('夜间 雷阵雨')).toBeInTheDocument();
      expect(within(days[0]).getByText('27° – 32°')).toBeInTheDocument();
      expect(within(days[0]).getByText('白天 南风 1-3 级')).toBeInTheDocument();
      expect(within(days[0]).getByText('夜间 南风 1-3 级')).toBeInTheDocument();
      expect(within(days[3]).getByTestId('weather-icon-rain')).toBeInTheDocument();
      expect(within(region).getByText('获取于 2026/07/23 12:00')).toBeInTheDocument();
      expect(within(region).getByText('天气预报仅供出行参考')).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it('天气部分结果显示降级状态和实际天数，缺少风字段时不制造占位信息', () => {
    const allDays = weatherBlock().forecast_days;
    render(<StructuredToolResults blocks={[weatherBlock({
      status: 'degraded',
      day_count: 3,
      forecast_days: allDays.slice(0, 3).map(day => ({
        ...day,
        day_wind_direction: undefined,
        night_wind_direction: undefined,
        day_wind_power: undefined,
        night_wind_power: undefined,
      })),
      limitations: ['仅取得三天有效预报'],
    })]} />);

    const region = screen.getByRole('region', { name: '天气预报结果' });
    expect(within(region).getByText('龙华区 · 三天天气')).toBeInTheDocument();
    expect(within(region).getByText('部分预报可用')).toBeInTheDocument();
    expect(within(region).getAllByTestId('weather-forecast-day')).toHaveLength(3);
    expect(region.textContent).not.toMatch(/风向待确认|风力待确认|undefined|null/);
    expect(within(region).getByText('仅取得三天有效预报')).toBeInTheDocument();
  });

  it('天气卡片英文资源完整，不把获取时间描述为供应商更新时间', async () => {
    await i18n.changeLanguage('en-US');
    const firstDay = weatherBlock().forecast_days[0];
    const { unmount } = render(<StructuredToolResults blocks={[weatherBlock({
      status: 'degraded',
      day_count: 1,
      forecast_days: [firstDay],
    })]} />);

    const region = screen.getByRole('region', { name: 'Weather forecast results' });
    expect(within(region).getByText('龙华区 · 1-day forecast')).toBeInTheDocument();
    expect(within(region).getByText('Partial forecast available')).toBeInTheDocument();
    expect(within(region).getByText('Thursday')).toBeInTheDocument();
    expect(within(region).getByText('Day 雷阵雨')).toBeInTheDocument();
    expect(within(region).getByText('Night 雷阵雨')).toBeInTheDocument();
    expect(within(region).getByText('Fetched at 07/23/2026, 12:00')).toBeInTheDocument();
    expect(region.textContent).not.toMatch(/updated|更新时间/i);

    unmount();
    await i18n.changeLanguage('zh-CN');
  });

  it('航班和高铁新增文案在英文资源中完整渲染，不混入后端中文标签', async () => {
    await i18n.changeLanguage('en-US');
    const { unmount } = render(<StructuredToolResults blocks={[
      flightBlock({
        origin: undefined,
        destination: undefined,
        observed_at: '2026-07-22T15:00:00Z',
        result_count: 1,
        flights: [flightBlock().flights![0]],
      }),
      trainBlock({ result_count: 0, trains: [] }),
    ]} />);

    expect(screen.getByRole('region', { name: 'Flight search results' })).toBeInTheDocument();
    expect(screen.getByText('Trip pending · 2026-08-01')).toBeInTheDocument();
    expect(screen.getByText('2 hr 15 min')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'View details' })).toHaveAttribute(
      'href',
      'https://a.feizhu.com/flight/1',
    );
    expect(screen.getByText('Checked at 07/22/2026, 23:00')).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'High-speed rail results' })).toBeInTheDocument();
    expect(screen.getByText('No matching high-speed trains found')).toBeInTheDocument();
    expect(document.body.textContent).not.toContain('structuredResults.');
    expect(document.body.textContent).not.toMatch(/行程待确认|小时|分钟|安全预订/);

    unmount();
    await i18n.changeLanguage('zh-CN');
  });

  it('查询时间按 Asia/Shanghai 展示，不直接截取 UTC 时刻', () => {
    render(<StructuredToolResults blocks={[flightBlock({
      observed_at: '2026-07-22T15:00:00Z',
    })]} />);

    expect(screen.getByText('查询于 2026/07/22 23:00')).toBeInTheDocument();
    expect(screen.queryByText(/15:00/)).toBeNull();
  });

  it('班次时刻按 Asia/Shanghai 转换，并基于出发日期标记次日', () => {
    render(<StructuredToolResults blocks={[flightBlock({
      departure_date: '2026-08-01',
      result_count: 1,
      flights: [{
        ...flightBlock().flights![0],
        departure: {
          city: '深圳',
          station_name: '深圳宝安国际机场',
          scheduled_at: '2026-08-01T15:30:00Z',
        },
        arrival: {
          city: '上海',
          station_name: '上海虹桥国际机场',
          scheduled_at: '2026-08-01T17:45:00Z',
        },
      }],
    })]} />);

    expect(screen.getByText('23:30')).toBeInTheDocument();
    expect(screen.getByText('01:45')).toBeInTheDocument();
    expect(screen.getByText('次日')).toBeInTheDocument();
    expect(screen.queryByText('15:30')).toBeNull();
    expect(screen.queryByText('17:45')).toBeNull();
  });

  it('跨多日班次使用 +N 天标识，并提供英文文案', async () => {
    await i18n.changeLanguage('en-US');
    render(<StructuredToolResults blocks={[trainBlock({
      departure_date: '2026-08-01',
      result_count: 1,
      trains: [{
        ...trainBlock().trains![0],
        departure: {
          city: '深圳',
          station_name: '深圳北站',
          scheduled_at: '2026-08-01T01:00:00Z',
        },
        arrival: {
          city: '北京',
          station_name: '北京西站',
          scheduled_at: '2026-08-03T02:00:00Z',
        },
      }],
    })]} />);

    expect(screen.getByText('09:00')).toBeInTheDocument();
    expect(screen.getByText('10:00')).toBeInTheDocument();
    expect(screen.getByText('+2 days')).toBeInTheDocument();
  });

  it('有图和无图地点都使用窄屏单列、宽屏最多三列的自适应网格', () => {
    const { rerender } = render(<StructuredToolResults blocks={[placeBlock()]} />);

    expect(screen.getByTestId('place-results-grid')).toHaveClass(
      'grid',
      'grid-cols-1',
      'sm:grid-cols-2',
      '2xl:grid-cols-3',
    );

    rerender(<StructuredToolResults blocks={[placeBlock({
      places: [{
        provider_place_id: 'photo-place',
        name: '带图地点',
        photos: [{ url: 'https://img.example.com/place.jpg' }],
      }],
    })]} />);

    expect(screen.getByTestId('place-results-grid')).toHaveClass(
      'grid',
      'grid-cols-1',
      'sm:grid-cols-2',
      '2xl:grid-cols-3',
    );
  });

  it('无图地点使用紧凑卡片，默认 3 项并最多展开到 5 项，每项至多一个安全 CTA', () => {
    render(<StructuredToolResults blocks={[placeBlock()]} />);

    expect(screen.getByRole('region', { name: '地点推荐结果' })).toBeInTheDocument();
    expect(screen.getAllByTestId('place-result-item')).toHaveLength(3);
    expect(screen.queryByRole('img')).toBeNull();
    expect(screen.getAllByRole('link', { name: '查看详情' })).toHaveLength(3);

    fireEvent.click(screen.getByRole('button', { name: '展开更多地点' }));

    expect(screen.getAllByTestId('place-result-item')).toHaveLength(5);
    expect(screen.getAllByRole('link', { name: '查看详情' })).toHaveLength(5);
    expect(screen.queryByText('餐厅 6')).toBeNull();
    expect(screen.queryByRole('tab')).toBeNull();
  });

  it('真实 https 图片使用固定比例缩略图，点击后可预览原图并切换多图', async () => {
    const normalizedBlock = normalizeStructuredToolResultBlock(placeBlock({
      result_count: 2,
      places: [
        {
          provider_place_id: 'photo-1',
          name: '带图餐厅',
          reference_cost_yuan: 128,
          photos: [
            { url: 'http://unsafe.example.com/ignored.jpg' },
            { url: 'https://img.example.com/place.jpg', title: '门店实景' },
            { url: 'https://img.example.com/food.jpg', title: '招牌菜' },
          ],
        },
        {
          provider_place_id: 'photo-2',
          name: '无安全图片餐厅',
          photos: [{ url: 'javascript:alert(1)' }],
        },
      ],
    }));
    if (normalizedBlock?.type !== 'place_results') throw new Error('应规范化为地点结果块');
    render(<StructuredToolResults blocks={[normalizedBlock]} />);

    const image = screen.getByRole('img', { name: '门店实景' });
    const imageShell = screen.getByRole('button', { name: '预览带图餐厅图片' });
    expect(image).toHaveAttribute('src', 'https://img.example.com/place.jpg');
    expect(imageShell).toHaveClass(
      'relative',
      'h-24',
      'w-24',
      'sm:h-28',
      'sm:w-28',
    );
    expect(imageShell).not.toHaveClass('self-stretch');
    expect(image).toHaveClass(
      'absolute',
      'inset-0',
      'h-full',
      'w-full',
      'object-cover',
    );
    expect(within(imageShell).getByTestId('place-image-hover-indicator')).toHaveClass(
      'opacity-0',
      'group-hover:opacity-100',
      'group-focus-visible:opacity-100',
    );
    expect(screen.getByText(/参考消费 ¥128/)).toBeInTheDocument();
    expect(screen.getAllByTestId('place-result-item')).toHaveLength(2);
    expect(screen.queryByLabelText('地点图片占位')).toBeNull();
    screen.getAllByTestId('place-result-content').forEach(content => {
      expect(content).toHaveClass('min-w-0', 'flex-1');
    });

    fireEvent.click(imageShell);

    const preview = screen.getByRole('dialog', { name: '带图餐厅图片预览' });
    const previewImage = within(preview).getByRole('img', { name: '门店实景原图' });
    expect(previewImage).toHaveAttribute('src', 'https://img.example.com/place.jpg');
    expect(previewImage).toHaveClass('max-h-[85vh]', 'max-w-[90vw]', 'object-contain');
    expect(within(preview).getByText('1 / 2')).toBeInTheDocument();

    fireEvent.click(within(preview).getByRole('button', { name: '下一张图片' }));
    expect(within(preview).getByRole('img', { name: '招牌菜原图' })).toHaveAttribute(
      'src',
      'https://img.example.com/food.jpg',
    );
    expect(within(preview).getByText('2 / 2')).toBeInTheDocument();

    fireEvent.click(within(preview).getByRole('button', { name: '放大图片' }));
    expect(within(preview).getByRole('img', { name: '招牌菜原图' })).toHaveStyle({
      transform: 'scale(1.25)',
    });

    fireEvent.click(within(preview).getByRole('button', { name: '关闭图片预览' }));
    expect(screen.queryByRole('dialog', { name: '带图餐厅图片预览' })).not.toBeInTheDocument();
    await waitFor(() => expect(imageShell).toHaveFocus());
  });

  it('缩略图加载失败时依次尝试下一张安全图片，全部失败后才显示占位', () => {
    render(<StructuredToolResults blocks={[placeBlock({
      result_count: 1,
      places: [{
        provider_place_id: 'photo-fallback',
        name: '图片降级餐厅',
        photos: [
          { url: 'http://unsafe.example.com/ignored.jpg' },
          { url: 'https://img.example.com/broken.jpg', title: '失效门店图' },
          { url: 'https://img.example.com/fallback.jpg', title: '可用门店图' },
        ],
      }],
    })]} />);

    fireEvent.error(screen.getByRole('img', { name: '失效门店图' }));
    const fallbackImage = screen.getByRole('img', { name: '可用门店图' });
    expect(fallbackImage).toHaveAttribute('src', 'https://img.example.com/fallback.jpg');
    expect(screen.queryByLabelText('图片加载失败')).toBeNull();

    fireEvent.error(fallbackImage);
    expect(screen.queryByRole('img', { name: '可用门店图' })).toBeNull();
    expect(screen.getByLabelText('图片加载失败')).toHaveClass(
      'flex',
      'items-center',
      'justify-center',
    );
    expect(screen.queryByRole('button', { name: '预览图片降级餐厅图片' })).toBeNull();
  });

  it('预览原图加载失败时自动切换下一张，全部失败后显示明确降级', () => {
    render(<StructuredToolResults blocks={[placeBlock({
      result_count: 1,
      places: [{
        provider_place_id: 'preview-fallback',
        name: '预览降级餐厅',
        photos: [
          { url: 'https://img.example.com/preview-broken.jpg', title: '失效原图' },
          { url: 'https://img.example.com/preview-fallback.jpg', title: '备用原图' },
        ],
      }],
    })]} />);

    fireEvent.click(screen.getByRole('button', { name: '预览预览降级餐厅图片' }));
    const preview = screen.getByRole('dialog', { name: '预览降级餐厅图片预览' });

    fireEvent.error(within(preview).getByRole('img', { name: '失效原图原图' }));
    const fallbackImage = within(preview).getByRole('img', { name: '备用原图原图' });
    expect(fallbackImage).toHaveAttribute('src', 'https://img.example.com/preview-fallback.jpg');

    fireEvent.error(fallbackImage);
    expect(within(preview).getByRole('status')).toHaveTextContent('图片加载失败');
  });

  it('部分字段缺失时安全降级，不显示内部 alias 或不安全链接', () => {
    render(<StructuredToolResults blocks={[placeBlock({
      provider: 'mcp_internal_provider',
      attribution: undefined,
      query: undefined,
      near: undefined,
      result_count: undefined,
      status: undefined,
      places: [{
        provider_place_id: 'mcp_private_alias',
        name: undefined,
        platform_url: 'https://untrusted.example.com/place',
      }],
      limitations: undefined,
      tool_call_log_id: 'mcp_secret_tool_call',
    })]} />);

    expect(screen.getByText('地点信息待补充')).toBeInTheDocument();
    expect(screen.getByText('地图服务')).toBeInTheDocument();
    expect(screen.queryByRole('link')).toBeNull();
    expect(document.body.textContent).not.toMatch(/mcp_internal|mcp_private|mcp_secret/i);
  });

  it('通过通用归因和 HTTPS action 展示非高德地点提供商', () => {
    render(<StructuredToolResults blocks={[placeBlock({
      provider: 'future-map-provider',
      attribution: { label: '城市地图服务' },
      result_count: 1,
      places: [{
        provider_place_id: 'future-place-1',
        name: '未来餐厅',
        actions: [{
          kind: 'open_external',
          label: '打开地图',
          url: 'https://maps.example.com/place/1',
        }],
      }],
    })]} />);

    expect(screen.getByText('城市地图服务')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '打开地图' })).toHaveAttribute(
      'href',
      'https://maps.example.com/place/1',
    );
    expect(document.body.textContent).not.toContain('future-map-provider');
  });

  it('路线降级时同时展示可用路线和不可用方式', () => {
    render(<StructuredToolResults blocks={[routeBlock()]} />);

    const region = screen.getByRole('region', { name: '路线对比结果' });
    expect(within(region).getByText('民治地铁站 → 星河 WORLD')).toBeInTheDocument();
    expect(within(region).getByText('驾车')).toBeInTheDocument();
    expect(within(region).getByText(/6\.2 公里/)).toBeInTheDocument();
    expect(within(region).getByText(/约 18 分钟/)).toBeInTheDocument();
    expect(within(region).getByText('公共交通暂不可用')).toBeInTheDocument();
    expect(within(region).getByText('部分路线可用')).toBeInTheDocument();
  });

  it('路线卡片底部展示未按指定出发时间实时计算的边界说明', () => {
    render(<StructuredToolResults blocks={[routeBlock({
      limitations: ['未按指定出发时间的实时路况或班次计算'],
    })]} />);

    const region = screen.getByRole('region', { name: '路线对比结果' });
    const limitation = within(region).getByText('未按指定出发时间的实时路况或班次计算');
    expect(limitation).toHaveClass('mt-2', 'text-muted-foreground');
    expect(region.lastElementChild).toBe(limitation);
  });

  it('路线结果使用窄屏单列、宽屏两到三列的顶端对齐网格，并允许标题与指标换行', () => {
    render(<StructuredToolResults blocks={[routeBlock({
      routes: [
        {
          mode: 'driving',
          distance_m: 123_456,
          duration_s: 9_999,
          walking_distance_m: 1_234,
          toll_yuan: 88,
        },
        { mode: 'walking', distance_m: 6_200, duration_s: 4_000 },
        { mode: 'bicycling', distance_m: 6_800, duration_s: 2_000 },
      ],
    })]} />);

    expect(screen.getByTestId('route-results-grid')).toHaveClass(
      'grid',
      'grid-cols-1',
      'items-start',
      'lg:grid-cols-2',
      '2xl:grid-cols-3',
    );
    expect(screen.getByText('驾车')).toHaveClass('min-w-0', 'break-words');
    expect(screen.getByText(/约 167 分钟/)).toHaveClass('min-w-0', 'break-words');
    const routeItems = within(screen.getByTestId('route-results-grid')).getAllByRole('article');
    expect(within(routeItems[2]).getByText('用时最短')).toHaveClass(
      'border-violet-300/70',
      'bg-gradient-to-r',
      'text-violet-600',
    );
    expect(within(routeItems[2]).getByLabelText('本次返回方案中用时最短')).toBeInTheDocument();
    expect(within(routeItems[0]).queryByText('用时最短')).toBeNull();
    expect(within(routeItems[1]).queryByText('用时最短')).toBeNull();
    expect(screen.queryByText('AI 推荐')).toBeNull();
  });

  it('三方案中仅公交有复杂详情时默认选中公交，并可在稳定详情面板切换方案', () => {
    render(<StructuredToolResults blocks={[routeBlock({
      unavailable_modes: [],
      routes: [
        {
          mode: 'driving',
          distance_m: 8_600,
          duration_s: 1_080,
          summary: '路线最短',
        },
        {
          mode: 'transit',
          transit_type: 'bus',
          duration_s: 1_980,
          walking_distance_m: 528,
          transfers: 0,
          summary: '西乡地铁站上车',
          legs: [
            { kind: 'walking', distance_m: 228, duration_s: 180 },
            {
              kind: 'bus',
              line_name: 'M395 路',
              departure_stop: '西乡地铁站',
              arrival_stop: '科兴科学园站',
              via_stop_count: 9,
            },
            { kind: 'walking', distance_m: 300, duration_s: 240 },
          ],
          alternatives: [
            {
              transit_type: 'subway',
              duration_s: 2_040,
              walking_distance_m: 600,
              transfers: 0,
              summary: '地铁 1 号线转步行',
            },
            {
              transit_type: 'mixed',
              duration_s: 2_160,
              walking_distance_m: 876,
              transfers: 0,
              summary: '另一条公共交通方案',
            },
          ],
        },
        {
          mode: 'bicycling',
          distance_m: 9_300,
          duration_s: 2_220,
          summary: '适合天气良好时选择',
        },
      ],
    })]} />);

    const summaries = screen.getByTestId('route-summary-grid');
    expect(summaries).toHaveClass('grid-cols-1', 'lg:grid-cols-3');
    const drivingSummary = within(summaries).getByRole('button', { name: '查看驾车方案详情' });
    const transitSummary = within(summaries).getByRole('button', { name: '查看公交方案详情' });
    const cyclingSummary = within(summaries).getByRole('button', { name: '查看骑行方案详情' });
    expect(transitSummary).toHaveAttribute('aria-pressed', 'true');
    expect(within(drivingSummary).getByTestId('route-mode-icon-driving')).toBeInTheDocument();
    expect(within(transitSummary).getByTestId('route-mode-icon-bus')).toBeInTheDocument();
    expect(within(cyclingSummary).getByTestId('route-mode-icon-bicycling')).toBeInTheDocument();
    expect(within(drivingSummary).getByText('用时最短')).toBeInTheDocument();
    expect(within(drivingSummary).getByLabelText('本次返回方案中用时最短')).toBeInTheDocument();
    expect(within(transitSummary).queryByText('用时最短')).toBeNull();
    expect(within(cyclingSummary).queryByText('用时最短')).toBeNull();
    expect(screen.queryByText('AI 推荐')).toBeNull();

    const detailPanel = screen.getByTestId('route-detail-panel');
    expect(within(detailPanel).getByText('公交')).toBeInTheDocument();
    expect(within(detailPanel).getAllByTestId('route-mode-icon-bus')).toHaveLength(2);
    expect(within(detailPanel).getByRole('list', { name: '线路详情' })).toHaveTextContent(
      'M395 路',
    );
    const alternatives = within(detailPanel).getByRole('list', { name: '备选方案' });
    expect(alternatives).toHaveClass('grid', 'grid-cols-1', 'lg:grid-cols-2');
    expect(within(alternatives).getByText('备选 1 · 地铁')).toBeInTheDocument();
    expect(within(alternatives).getByText('备选 2 · 公交+地铁')).toBeInTheDocument();
    expect(within(alternatives).getByTestId('route-mode-icon-subway')).toBeInTheDocument();
    expect(within(alternatives).getByTestId('route-mode-icon-mixed')).toBeInTheDocument();

    fireEvent.click(drivingSummary);
    expect(screen.getByTestId('route-detail-panel')).toBe(detailPanel);
    expect(within(detailPanel).getByText('驾车')).toBeInTheDocument();
    expect(within(detailPanel).getByTestId('route-mode-icon-driving')).toBeInTheDocument();
    expect(within(detailPanel).queryByText('M395 路')).toBeNull();

    fireEvent.click(within(summaries).getByRole('button', { name: '查看骑行方案详情' }));
    expect(screen.getByTestId('route-detail-panel')).toBe(detailPanel);
    expect(within(detailPanel).getByText('骑行')).toBeInTheDocument();

    fireEvent.click(within(summaries).getByRole('button', { name: '查看公交方案详情' }));
    expect(screen.getByTestId('route-detail-panel')).toBe(detailPanel);
    expect(within(detailPanel).getByRole('list', { name: '线路详情' })).toHaveTextContent(
      '西乡地铁站 → 科兴科学园站',
    );
  });

  it('多条复杂路线使用窄屏友好的纵向堆叠并完整保留各自详情', () => {
    render(<StructuredToolResults blocks={[routeBlock({
      unavailable_modes: [],
      routes: [
        {
          mode: 'transit',
          transit_type: 'bus',
          legs: [{ kind: 'bus', line_name: 'M201 路' }],
        },
        {
          mode: 'transit',
          transit_type: 'subway',
          alternatives: [{ transit_type: 'mixed', summary: '地铁备选方案' }],
        },
      ],
    })]} />);

    const stack = screen.getByTestId('route-results-stack');
    expect(stack).toHaveClass('space-y-2');
    const routeItems = within(stack).getAllByRole('article');
    expect(routeItems).toHaveLength(2);
    fireEvent.click(within(routeItems[0]).getByRole('button', { name: '查看线路' }));
    expect(within(routeItems[0]).getByText('M201 路')).toBeInTheDocument();
    expect(within(stack).getByText('地铁备选方案')).toBeInTheDocument();
    expect(screen.queryByTestId('route-summary-grid')).toBeNull();
  });

  it('按公交类型展示地铁、公交、混合和通用公共交通标签', () => {
    const { rerender } = render(<StructuredToolResults blocks={[routeBlock({
      unavailable_modes: [],
      routes: [
        { mode: 'transit', transit_type: 'subway' },
        { mode: 'transit', transit_type: 'bus' },
        { mode: 'transit', transit_type: 'mixed' },
      ],
    })]} />);

    const region = screen.getByRole('region', { name: '路线对比结果' });
    expect(within(region).getByText('地铁')).toBeInTheDocument();
    expect(within(region).getByText('公交')).toBeInTheDocument();
    expect(within(region).getByText('公交+地铁')).toBeInTheDocument();

    rerender(<StructuredToolResults blocks={[routeBlock({
      unavailable_modes: [],
      routes: [{ mode: 'transit', transit_type: 'public_transit' }],
    })]} />);
    expect(screen.getByText('公共交通')).toBeInTheDocument();
  });

  it('主方案展示完整指标，可展开和收起步行及乘车线路段', () => {
    render(<StructuredToolResults blocks={[routeBlock({
      routes: [{
        mode: 'transit',
        transit_type: 'mixed',
        distance_m: 18_400,
        duration_s: 2_520,
        walking_distance_m: 860,
        transfers: 2,
        summary: '换乘较少',
        legs: [
          { kind: 'walking', distance_m: 320, duration_s: 300 },
          {
            kind: 'subway',
            line_name: '地铁 5 号线',
            departure_stop: '民治站',
            arrival_stop: '深圳北站',
            via_stop_count: 2,
            duration_s: 720,
            entrance: 'A 口',
            exit: 'D 口',
          },
          {
            kind: 'bus',
            line_name: 'M347 路',
            departure_stop: '深圳北汽车站',
            arrival_stop: '星河 WORLD 站',
            via_stop_count: 5,
          },
        ],
      }],
    })]} />);

    const route = screen.getByRole('article');
    expect(within(route).getByText(/约 42 分钟/)).toBeInTheDocument();
    expect(within(route).queryByText(/全程/)).toBeNull();
    expect(within(route).getByText(/步行 860 米/)).toBeInTheDocument();
    expect(within(route).getByText(/2 次换乘/)).toBeInTheDocument();

    const toggle = within(route).getByRole('button', { name: '查看线路' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(within(route).queryByRole('list', { name: '线路详情' })).toBeNull();

    fireEvent.click(toggle);

    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(toggle).toHaveAccessibleName('收起线路');
    const details = within(route).getByRole('list', { name: '线路详情' });
    expect(within(details).getByTestId('route-mode-icon-walking')).toBeInTheDocument();
    expect(within(details).getByTestId('route-mode-icon-subway')).toBeInTheDocument();
    expect(within(details).getByTestId('route-mode-icon-bus')).toBeInTheDocument();
    expect(within(details).getByText(/步行 320 米/)).toBeInTheDocument();
    expect(within(details).getByText('地铁 5 号线')).toBeInTheDocument();
    expect(within(details).getByText('民治站 → 深圳北站')).toBeInTheDocument();
    expect(within(details).getByText(/2 站/)).toBeInTheDocument();
    expect(within(details).getByText(/A 口/)).toBeInTheDocument();
    expect(within(details).getByText(/D 口/)).toBeInTheDocument();
    expect(within(details).getByText('M347 路')).toBeInTheDocument();
    expect(within(details).getByText('深圳北汽车站 → 星河 WORLD 站')).toBeInTheDocument();

    fireEvent.click(toggle);
    expect(within(route).queryByRole('list', { name: '线路详情' })).toBeNull();
  });

  it('最多展示两个紧凑备选方案，点击任一方案时联动展开或收起两条线路', () => {
    render(<StructuredToolResults blocks={[routeBlock({
      routes: [{
        mode: 'transit',
        transit_type: 'subway',
        alternatives: [
          {
            transit_type: 'bus',
            duration_s: 3_000,
            distance_m: 20_000,
            walking_distance_m: 420,
            transfers: 1,
            summary: '步行较少',
            legs: [{
              kind: 'bus',
              line_name: 'M201 路',
              departure_stop: '民治站',
              arrival_stop: '目的地站',
              via_stop_count: 8,
            }],
          },
          {
            transit_type: 'mixed',
            duration_s: 2_800,
            summary: '换乘更快',
            legs: [{
              kind: 'subway',
              line_name: '地铁 5 号线',
              departure_stop: '民治站',
              arrival_stop: '深圳北站',
              via_stop_count: 2,
            }],
          },
          { transit_type: 'public_transit', summary: '不应展示' },
        ],
      }],
    })]} />);

    const alternatives = screen.getByRole('list', { name: '备选方案' });
    expect(within(alternatives).getByText('备选 1 · 公交')).toBeInTheDocument();
    expect(within(alternatives).getByText('备选 2 · 公交+地铁')).toBeInTheDocument();
    expect(within(alternatives).queryByText('不应展示')).toBeNull();
    expect(within(alternatives).getByText(/步行 420 米/)).toBeInTheDocument();
    expect(within(alternatives).queryByText(/全程 20 公里/)).toBeNull();

    const alternativeItems = within(alternatives).getAllByRole('listitem');
    fireEvent.click(within(alternativeItems[0]).getByRole('button', { name: '查看线路' }));

    expect(within(alternatives).getAllByRole('button', { name: '收起线路' })).toHaveLength(2);
    const expandedDetails = within(alternatives).getAllByRole('list', { name: '线路详情' });
    expect(expandedDetails).toHaveLength(2);
    expect(within(expandedDetails[0]).getByText('M201 路')).toBeInTheDocument();
    expect(within(expandedDetails[0]).getByText('民治站 → 目的地站')).toBeInTheDocument();
    expect(within(expandedDetails[1]).getByText('地铁 5 号线')).toBeInTheDocument();
    expect(within(expandedDetails[1]).getByText('民治站 → 深圳北站')).toBeInTheDocument();

    fireEvent.click(within(alternativeItems[1]).getByRole('button', { name: '收起线路' }));
    expect(within(alternatives).queryByRole('list', { name: '线路详情' })).toBeNull();
    expect(within(alternatives).getAllByRole('button', { name: '查看线路' })).toHaveLength(2);
  });

  it('旧路线结构和空备选字段仍保持可读的降级展示', () => {
    render(<StructuredToolResults blocks={[routeBlock({
      routes: [
        { mode: 'transit', distance_m: 99_999, summary: '旧历史公交方案' },
        {
          mode: 'transit',
          transit_type: 'subway',
          alternatives: [
            { transit_type: 'subway' },
            { summary: '只有说明的备选' },
          ],
        },
      ],
    })]} />);

    const summaries = screen.getByTestId('route-summary-grid');
    const detailPanel = screen.getByTestId('route-detail-panel');
    expect(within(summaries).getByRole('button', { name: '查看地铁方案详情' }))
      .toHaveAttribute('aria-pressed', 'true');
    const alternatives = within(detailPanel).getByRole('list', { name: '备选方案' });
    expect(within(alternatives).getByText('备选 1 · 地铁')).toBeInTheDocument();
    expect(within(alternatives).getByText('备选 2 · 公共交通')).toBeInTheDocument();
    expect(within(alternatives).queryByRole('button', { name: '查看线路' })).toBeNull();

    fireEvent.click(within(summaries).getByRole('button', { name: '查看公交方案详情' }));
    expect(within(detailPanel).getByText('公交')).toBeInTheDocument();
    expect(within(detailPanel).getByText('旧历史公交方案')).toBeInTheDocument();
    expect(within(detailPanel).queryByText(/全程/)).toBeNull();
    expect(within(detailPanel).queryByRole('button', { name: '查看线路' })).toBeNull();
  });

  it('即使绕过规范化层，路线和不可用方式也各自最多展示 3 项', () => {
    render(<StructuredToolResults blocks={[routeBlock({
      routes: [
        { mode: 'driving' },
        { mode: 'transit' },
        { mode: 'walking' },
        { mode: 'bicycling' },
      ],
      unavailable_modes: ['driving', 'transit', 'walking', 'bicycling'],
    })]} />);

    const region = screen.getByRole('region', { name: '路线对比结果' });
    expect(within(region).queryByText('骑行')).toBeNull();
    expect(within(region).queryByText('骑行暂不可用')).toBeNull();
    expect(within(region).getAllByText(/暂不可用$/)).toHaveLength(3);
  });
});
