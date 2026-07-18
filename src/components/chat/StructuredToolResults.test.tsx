import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { PlaceResultsBlock, RouteResultsBlock } from '@/types/conversation';
import { normalizeStructuredToolResultBlock } from '@/lib/chat/structuredToolResults';
import StructuredToolResults from './StructuredToolResults';

function placeBlock(overrides: Partial<PlaceResultsBlock> = {}): PlaceResultsBlock {
  return {
    type: 'place_results',
    id: 'places-1',
    schema_version: 1,
    provider: 'amap',
    query: '烤肉',
    near: '深圳民治',
    status: 'success',
    result_count: 5,
    places: Array.from({ length: 6 }, (_, index) => ({
      provider_place_id: `p-${index + 1}`,
      name: `餐厅 ${index + 1}`,
      address: `民治大道 ${index + 1} 号`,
      distance_m: 500 + index * 100,
      platform_url: index < 5 ? `https://www.amap.com/place/${index + 1}` : 'http://unsafe.example.com',
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

describe('StructuredToolResults', () => {
  it('结构化结果占满消息可用宽度，不再限制超宽屏宽度', () => {
    render(<StructuredToolResults blocks={[placeBlock()]} />);

    expect(screen.getByTestId('structured-tool-results')).toHaveClass('w-full');
    expect(screen.getByTestId('structured-tool-results')).not.toHaveClass('max-w-4xl');
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
    expect(screen.getAllByRole('link', { name: '高德查看' })).toHaveLength(3);

    fireEvent.click(screen.getByRole('button', { name: '展开更多地点' }));

    expect(screen.getAllByTestId('place-result-item')).toHaveLength(5);
    expect(screen.getAllByRole('link', { name: '高德查看' })).toHaveLength(5);
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
    expect(screen.getByText(/高德参考消费 ¥128/)).toBeInTheDocument();
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
