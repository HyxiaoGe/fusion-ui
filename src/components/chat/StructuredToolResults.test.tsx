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
  it('结构化结果限制超宽屏宽度，同时在窄屏保持自适应', () => {
    render(<StructuredToolResults blocks={[placeBlock()]} />);

    expect(screen.getByTestId('structured-tool-results')).toHaveClass('w-full', 'max-w-4xl');
  });

  it('无图地点使用紧凑列表，默认 3 项并最多展开到 5 项，每项至多一个安全 CTA', () => {
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
    expect(within(region).getByText('公交暂不可用')).toBeInTheDocument();
    expect(within(region).getByText('部分路线可用')).toBeInTheDocument();
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
