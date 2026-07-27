import React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import i18n from '@/lib/i18n';
import type {
  FlightResultsBlock,
  ItineraryResultsBlock,
  RouteResultsBlock,
  TrainResultsBlock,
  WeatherResultsBlock,
} from '@/types/conversation';

import StructuredToolResults from './StructuredToolResults';

const flight: FlightResultsBlock = {
  type: 'flight_results',
  id: 'flight-outbound',
  schema_version: 1,
  provider: 'flyai',
  attribution: { label: '飞猪旅行' },
  status: 'success',
  origin: '深圳',
  destination: '上海',
  departure_date: '2026-08-01',
  observed_at: '2026-07-26T09:00:00+08:00',
  result_count: 1,
  flights: [{
    option_id: 'flight-1',
    airline_name: '测试航空',
    flight_no: 'ZH9501',
    departure: {
      city: '深圳',
      station_name: '深圳宝安国际机场',
      scheduled_at: '2026-08-01T08:00:00+08:00',
    },
    arrival: {
      city: '上海',
      station_name: '上海虹桥国际机场',
      scheduled_at: '2026-08-01T10:20:00+08:00',
    },
    duration_s: 8_400,
    stops: 0,
    price: { currency: 'CNY', amount_minor: 58_000 },
    actions: [],
  }],
  limitations: [],
};

const weather: WeatherResultsBlock = {
  type: 'weather_results',
  id: 'weather-shanghai',
  schema_version: 1,
  provider: 'amap',
  attribution: { label: '高德地图' },
  status: 'degraded',
  query: '上海',
  resolved_location: '上海市',
  day_count: 1,
  forecast_days: [{
    date: '2026-08-01',
    weekday: 6,
    day_weather: '晴',
    night_weather: '多云',
    high_c: 32,
    low_c: 27,
  }],
  fetched_at: '2026-07-26T10:00:00+08:00',
  limitations: [],
};

const localRoute: RouteResultsBlock = {
  type: 'route_results',
  id: 'route-local',
  schema_version: 1,
  provider: 'amap',
  attribution: { label: '高德地图' },
  status: 'success',
  origin: { label: '上海虹桥国际机场', city: '上海' },
  destination: { label: '人民广场', city: '上海' },
  routes: [{
    mode: 'transit',
    transit_type: 'subway',
    duration_s: 2_400,
    distance_m: 18_000,
    transfers: 1,
    summary: '地铁接驳',
  }],
  limitations: [],
};

const itinerary: ItineraryResultsBlock = {
  type: 'itinerary_results',
  id: 'itinerary-1',
  schema_version: 1,
  provider: 'fusion',
  status: 'degraded',
  trip_type: 'one_way',
  origin: '深圳',
  destination: '上海',
  start_date: '2026-08-01',
  end_date: null,
  recommended_plan_id: null,
  plans: [
    {
      id: 'lowest-price',
      title: '最低参考价组合',
      status: 'complete',
      strategy: 'lowest_reference_price',
      tags: ['lowest_reference_price'],
      known_cost: { currency: 'CNY', amount_minor: 58_000 },
      known_duration_s: 8_400,
      sections: [
        {
          id: 'outbound',
          kind: 'outbound_transport',
          status: 'complete',
          title: '去程',
          coverage: null,
          result_refs: [{ block_id: 'flight-outbound', item_ids: ['flight-1'] }],
        },
        {
          id: 'weather',
          kind: 'destination_weather',
          status: 'partial',
          title: '目的地天气',
          coverage: 'partial',
          result_refs: [{ block_id: 'weather-shanghai', item_ids: [] }],
        },
      ],
    },
    {
      id: 'shortest-duration',
      title: '班次计划时长最短组合',
      status: 'complete',
      strategy: 'shortest_scheduled_duration',
      tags: ['shortest_scheduled_duration'],
      known_cost: { currency: 'CNY', amount_minor: 58_000 },
      known_duration_s: 8_400,
      sections: [{
        id: 'outbound',
        kind: 'outbound_transport',
        status: 'complete',
        title: '去程',
        coverage: null,
        result_refs: [{ block_id: 'flight-outbound', item_ids: ['flight-1'] }],
      }],
    },
  ],
  availability: [
    { journey: 'outbound', mode: 'flight', status: 'available' },
    { journey: 'destination_weather', mode: 'weather', status: 'available' },
  ],
  limitations: ['参考票价不等于完整旅行总预算'],
};

describe('ItineraryResults', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('zh-CN');
  });

  it('收拢引用源卡，支持方案切换和详细结果展开', () => {
    render(<StructuredToolResults blocks={[flight, weather, itinerary]} />);

    const card = screen.getByTestId('itinerary-results');
    expect(within(card).getByText('深圳 → 上海')).toBeInTheDocument();
    expect(within(card).getAllByText(/8月1日/)).toHaveLength(2);
    expect(within(card).getByText('最低参考价')).toBeInTheDocument();
    expect(within(card).getByText('当前查看')).toBeInTheDocument();
    expect(within(card).getByText('备选方案')).toBeInTheDocument();
    expect(within(card).getByText('仅覆盖部分行程日期')).toBeInTheDocument();
    expect(within(card).getByText('航班 · 测试航空 ZH9501')).toBeInTheDocument();
    expect(within(card).getByText('08:00–10:20')).toBeInTheDocument();
    expect(within(card).getByText('8月1日 晴转多云 · 27–32℃')).toBeInTheDocument();
    expect(screen.queryByLabelText('航班查询结果')).not.toBeInTheDocument();

    const details = within(card).getByRole('button', { name: '查看详细班次与路线' });
    fireEvent.click(details);
    expect(details).toHaveAttribute('aria-expanded', 'true');
    expect(details).toHaveAccessibleName('收起详细班次与路线');
    expect(screen.getByTestId('itinerary-source-details')).toBeInTheDocument();

    const shortest = within(card).getByRole('button', {
      name: /省时间方案/,
    });
    expect(shortest).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(shortest);
    expect(shortest).toHaveAttribute('aria-pressed', 'true');
    expect(details).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByTestId('itinerary-source-details')).not.toBeInTheDocument();

    fireEvent.click(details);
    expect(details).toHaveAttribute('aria-expanded', 'true');
    expect(within(screen.getByTestId('itinerary-source-details')).getByText(/ZH9501/))
      .toBeInTheDocument();
  });

  it('多日行程只按真实日期并列首末天气，不用第一天概括全程', () => {
    const returnFlight: FlightResultsBlock = {
      ...flight,
      id: 'flight-return',
      origin: '上海',
      destination: '深圳',
      departure_date: '2026-08-03',
      flights: [{
        ...flight.flights![0],
        option_id: 'flight-return-1',
        flight_no: 'ZH9502',
        departure: {
          city: '上海',
          station_name: '上海虹桥国际机场',
          scheduled_at: '2026-08-03T18:00:00+08:00',
        },
        arrival: {
          city: '深圳',
          station_name: '深圳宝安国际机场',
          scheduled_at: '2026-08-03T20:20:00+08:00',
        },
      }],
    };
    const multiDayWeather: WeatherResultsBlock = {
      ...weather,
      id: 'weather-shanghai-multi',
      status: 'success',
      day_count: 3,
      forecast_days: [
        weather.forecast_days[0],
        {
          date: '2026-08-02',
          weekday: 7,
          day_weather: '多云',
          night_weather: '阵雨',
          high_c: 31,
          low_c: 26,
        },
        {
          date: '2026-08-03',
          weekday: 1,
          day_weather: '阵雨',
          night_weather: '阵雨',
          high_c: 30,
          low_c: 26,
        },
      ],
    };
    const roundTrip: ItineraryResultsBlock = {
      ...itinerary,
      trip_type: 'round_trip',
      end_date: '2026-08-03',
      plans: [{
        ...itinerary.plans[0],
        sections: [
          itinerary.plans[0].sections[0],
          {
            id: 'return',
            kind: 'return_transport',
            status: 'complete',
            title: '返程',
            coverage: null,
            result_refs: [{ block_id: 'flight-return', item_ids: ['flight-return-1'] }],
          },
          {
            ...itinerary.plans[0].sections[1],
            status: 'complete',
            coverage: 'full',
            result_refs: [{ block_id: 'weather-shanghai-multi', item_ids: [] }],
          },
        ],
      }],
    };

    render(
      <StructuredToolResults
        blocks={[flight, returnFlight, multiDayWeather, roundTrip]}
      />,
    );

    const card = screen.getByTestId('itinerary-results');
    expect(within(card).getByText(
      '8月1日 晴转多云 · 27–32℃；8月3日 阵雨 · 26–30℃',
    )).toBeInTheDocument();
    expect(within(card).queryByText(/8月2日/)).not.toBeInTheDocument();
  });

  it('把目的地接驳的结论提到首屏，路线步骤仍保留在按需展开区', () => {
    const withLocalRoute: ItineraryResultsBlock = {
      ...itinerary,
      plans: [{
        ...itinerary.plans[0],
        sections: [
          ...itinerary.plans[0].sections,
          {
            id: 'local-route',
            kind: 'local_route',
            status: 'complete',
            title: '当地路线',
            coverage: null,
            result_refs: [{ block_id: 'route-local', item_ids: [] }],
          },
        ],
      }],
      availability: [
        ...itinerary.availability,
        { journey: 'local_route', mode: 'route', status: 'available' },
      ],
    };

    render(<StructuredToolResults blocks={[flight, weather, localRoute, withLocalRoute]} />);

    const card = screen.getByTestId('itinerary-results');
    expect(within(card).getByText('地铁接驳')).toBeInTheDocument();
    expect(within(card).getByText('40 分钟 · 18 公里 · 1 次换乘')).toBeInTheDocument();
    expect(screen.queryByLabelText('路线对比结果')).not.toBeInTheDocument();

    fireEvent.click(within(card).getByRole('button', { name: '查看详细班次与路线' }));
    expect(screen.getByLabelText('路线对比结果')).toBeInTheDocument();
  });

  it('交通标识缺失时不展示尾随分隔符，并保留单侧班次时间', () => {
    const unidentifiedFlight: FlightResultsBlock = {
      ...flight,
      id: 'flight-unidentified',
      flights: [{
        ...flight.flights![0],
        option_id: 'flight-unidentified-1',
        airline_name: null,
        flight_no: null,
        arrival: {
          ...flight.flights![0].arrival,
          scheduled_at: null,
        },
      }],
    };
    const unidentifiedTrain: TrainResultsBlock = {
      type: 'train_results',
      id: 'train-unidentified',
      schema_version: 1,
      provider: 'flyai',
      attribution: { label: '飞猪旅行' },
      status: 'degraded',
      origin: '上海虹桥',
      destination: '杭州东',
      departure_date: '2026-08-03',
      result_count: 1,
      trains: [{
        option_id: 'train-unidentified-1',
        train_no: null,
        departure: {
          city: '上海',
          station_name: '上海虹桥站',
          scheduled_at: null,
        },
        arrival: {
          city: '杭州',
          station_name: '杭州东站',
          scheduled_at: '2026-08-03T12:00:00+08:00',
        },
      }],
      limitations: [],
    };
    const transportBoundaryItinerary: ItineraryResultsBlock = {
      ...itinerary,
      plans: [{
        ...itinerary.plans[0],
        sections: [
          {
            ...itinerary.plans[0].sections[0],
            result_refs: [{
              block_id: 'flight-unidentified',
              item_ids: ['flight-unidentified-1'],
            }],
          },
          {
            id: 'return',
            kind: 'return_transport',
            status: 'partial',
            title: '返程',
            coverage: null,
            result_refs: [{
              block_id: 'train-unidentified',
              item_ids: ['train-unidentified-1'],
            }],
          },
        ],
      }],
    };

    render(
      <StructuredToolResults
        blocks={[unidentifiedFlight, unidentifiedTrain, transportBoundaryItinerary]}
      />,
    );

    const card = screen.getByTestId('itinerary-results');
    expect(within(card).getByText('航班')).toBeInTheDocument();
    expect(within(card).getByText('高铁')).toBeInTheDocument();
    expect(within(card).queryByText(/^航班 ·/)).not.toBeInTheDocument();
    expect(within(card).queryByText(/^高铁 ·/)).not.toBeInTheDocument();
    expect(within(card).getByText('出发 08:00')).toBeInTheDocument();
    expect(within(card).getByText('到达 12:00')).toBeInTheDocument();
  });

  it('英文界面保留单侧班次时间的明确含义', async () => {
    await i18n.changeLanguage('en-US');
    const departureOnlyFlight: FlightResultsBlock = {
      ...flight,
      flights: [{
        ...flight.flights![0],
        arrival: {
          ...flight.flights![0].arrival,
          scheduled_at: null,
        },
      }],
    };
    const arrivalOnlyTrain: TrainResultsBlock = {
      type: 'train_results',
      id: 'train-arrival-only',
      schema_version: 1,
      status: 'degraded',
      result_count: 1,
      trains: [{
        option_id: 'train-arrival-only-1',
        train_no: 'G100',
        departure: { scheduled_at: null },
        arrival: { scheduled_at: '2026-08-03T12:00:00+08:00' },
      }],
    };
    const transportItinerary: ItineraryResultsBlock = {
      ...itinerary,
      plans: [{
        ...itinerary.plans[0],
        sections: [
          itinerary.plans[0].sections[0],
          {
            id: 'return',
            kind: 'return_transport',
            status: 'partial',
            title: '返程',
            coverage: null,
            result_refs: [{
              block_id: 'train-arrival-only',
              item_ids: ['train-arrival-only-1'],
            }],
          },
        ],
      }],
    };

    render(
      <StructuredToolResults
        blocks={[departureOnlyFlight, arrivalOnlyTrain, transportItinerary]}
      />,
    );

    expect(screen.getByText('Departure 08:00')).toBeInTheDocument();
    expect(screen.getByText('Arrival 12:00')).toBeInTheDocument();
  });

  it('通过既有追问回调发送日期、预算和少换乘请求，不在卡片内伪造结果', () => {
    const onFollowUp = vi.fn();
    render(
      <StructuredToolResults
        blocks={[flight, weather, itinerary]}
        onFollowUp={onFollowUp}
      />,
    );

    const actions = screen.getByTestId('itinerary-follow-up-actions');
    expect(actions).toHaveClass('flex-wrap');

    fireEvent.click(within(actions).getByRole('button', { name: '改日期' }));
    expect(onFollowUp).toHaveBeenLastCalledWith(expect.stringMatching(/深圳.*上海.*日期/));
    expect(onFollowUp).toHaveBeenCalledTimes(1);
    expect(within(actions).getByRole('button', { name: '改日期' })).toHaveAttribute('aria-busy', 'true');
    expect(within(actions).getByRole('button', { name: '调整预算' })).toBeDisabled();
    fireEvent.click(within(actions).getByRole('button', { name: '改日期' }));
    expect(onFollowUp).toHaveBeenCalledTimes(1);
  });

  it('流式更新时明确显示加载状态并暂时隐藏快捷追问', () => {
    render(
      <StructuredToolResults
        blocks={[flight, weather, itinerary]}
        isLoading
        onFollowUp={vi.fn()}
      />,
    );

    const card = screen.getByTestId('itinerary-results');
    expect(within(card).getByText('正在更新行程')).toBeInTheDocument();
    expect(screen.queryByTestId('itinerary-follow-up-actions')).not.toBeInTheDocument();
  });

  it('坏引用时保留源结果且不展示伪行程卡', () => {
    const invalid = {
      ...itinerary,
      plans: [{
        ...itinerary.plans[0],
        sections: [{
          ...itinerary.plans[0].sections[0],
          result_refs: [{ block_id: 'flight-outbound', item_ids: ['missing'] }],
        }],
      }],
    };

    render(<StructuredToolResults blocks={[flight, invalid]} />);

    expect(screen.queryByTestId('itinerary-results')).not.toBeInTheDocument();
    expect(screen.getByLabelText('航班查询结果')).toBeInTheDocument();
    expect(screen.getByTestId('unsupported-structured-result')).toBeInTheDocument();
  });

  it('明确展示未取得的返程或补充信息，不只依赖部分可用状态', () => {
    const partiallyAvailable: ItineraryResultsBlock = {
      ...itinerary,
      availability: [
        ...itinerary.availability,
        { journey: 'return', mode: 'train', status: 'unavailable' },
        { journey: 'local_route', mode: 'route', status: 'unavailable' },
      ],
    };

    render(<StructuredToolResults blocks={[flight, weather, partiallyAvailable]} />);

    const summary = screen.getByTestId('itinerary-unavailable-summary');
    expect(within(summary).getByText('以下结果暂未取得')).toBeInTheDocument();
    expect(within(summary).getByText('返程 · 高铁')).toBeInTheDocument();
    expect(within(summary).getByText('当地路线')).toBeInTheDocument();
  });

  it('区分完整、部分可用和暂无数据，不把 unavailable 写成部分可用', () => {
    const unavailableSection: ItineraryResultsBlock = {
      ...itinerary,
      plans: [{
        ...itinerary.plans[0],
        status: 'partial',
        sections: itinerary.plans[0].sections.map(section =>
          section.kind === 'destination_weather'
            ? { ...section, status: 'unavailable' as const, coverage: 'outside_range' as const }
            : section),
      }],
    };

    render(<StructuredToolResults blocks={[flight, weather, unavailableSection]} />);

    const card = screen.getByTestId('itinerary-results');
    expect(within(card).getByText('部分可用')).toBeInTheDocument();
    expect(within(card).getByText('暂无数据')).toBeInTheDocument();
    expect(within(card).getByText('当前预报窗口未覆盖')).toBeInTheDocument();
    expect(within(card).queryByText(/晴转多云 · 27–32℃/)).not.toBeInTheDocument();
  });

  it('刷新恢复后的同一结构化结果仍保留首屏摘要与可执行追问', () => {
    const onFollowUp = vi.fn();
    const { unmount } = render(
      <StructuredToolResults
        blocks={[flight, weather, itinerary]}
        onFollowUp={onFollowUp}
      />,
    );
    unmount();

    render(
      <StructuredToolResults
        blocks={[flight, weather, itinerary]}
        onFollowUp={onFollowUp}
      />,
    );

    expect(screen.getByText('航班 · 测试航空 ZH9501')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '调整预算' }));
    expect(onFollowUp).toHaveBeenCalledTimes(1);
  });

  it('英文界面从稳定枚举派生文案，不泄露服务端中文标题', async () => {
    await i18n.changeLanguage('en-US');

    render(<StructuredToolResults blocks={[flight, weather, itinerary]} />);

    expect(screen.getByText('Budget plan')).toBeInTheDocument();
    expect(screen.getByText('Destination weather')).toBeInTheDocument();
    expect(screen.queryByText('最低参考价组合')).not.toBeInTheDocument();
  });
});
