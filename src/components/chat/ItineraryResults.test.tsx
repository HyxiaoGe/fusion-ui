import React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import i18n from '@/lib/i18n';
import type {
  FlightResultsBlock,
  ItineraryResultsBlock,
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
    expect(within(card).getByText(/8月1日/)).toBeInTheDocument();
    expect(within(card).getByText('最低参考价')).toBeInTheDocument();
    expect(within(card).getByText('仅覆盖部分行程日期')).toBeInTheDocument();
    expect(screen.queryByLabelText('航班查询结果')).not.toBeInTheDocument();

    const details = within(card).getByRole('button', { name: '查看详细班次与路线' });
    fireEvent.click(details);
    expect(details).toHaveAttribute('aria-expanded', 'true');
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

  it('英文界面从稳定枚举派生文案，不泄露服务端中文标题', async () => {
    await i18n.changeLanguage('en-US');

    render(<StructuredToolResults blocks={[flight, weather, itinerary]} />);

    expect(screen.getByText('Budget plan')).toBeInTheDocument();
    expect(screen.getByText('Destination weather')).toBeInTheDocument();
    expect(screen.queryByText('最低参考价组合')).not.toBeInTheDocument();
  });
});
