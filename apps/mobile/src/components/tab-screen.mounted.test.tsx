/* eslint-disable typescript-eslint/no-deprecated -- react-test-renderer is the DOM-free renderer used to mount React/RN trees under vitest (same pattern as member-limit.mounted.test.tsx) */
import { createElement } from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { describe, expect, it, vi } from 'vitest';

import { TabScreenScrollView } from '@/components/tab-screen';

vi.mock('react-native', () => ({
  Platform: { OS: 'ios' },
  ScrollView: 'ScrollView',
  useWindowDimensions: () => ({ fontScale: 1 }),
  View: 'View',
}));

vi.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ bottom: 34 }),
}));

vi.mock('@/lib/tab-bar-layout', () => ({
  getEffectiveTabBarHeight: () => 84,
}));

function findByType(
  root: TestRenderer.ReactTestInstance,
  type: string
): TestRenderer.ReactTestInstance[] {
  return root.findAll(node => typeof node.type === 'string' && (node.type as string) === type);
}

function mountScrollView(props: Record<string, unknown> = {}): TestRenderer.ReactTestRenderer {
  const ref: { current: TestRenderer.ReactTestRenderer | undefined } = { current: undefined };
  act(() => {
    ref.current = TestRenderer.create(createElement(TabScreenScrollView, props, 'content'));
  });
  if (!ref.current) {
    throw new Error('TabScreenScrollView did not render');
  }
  return ref.current;
}

describe('TabScreenScrollView', () => {
  it('adds a trailing tab-bar clearance spacer after the content', () => {
    const renderer = mountScrollView({ className: 'flex-1' });

    const scrollViews = findByType(renderer.root, 'ScrollView');
    const views = findByType(renderer.root, 'View');

    expect(scrollViews).toHaveLength(1);
    // One spacer View; no wrapper View hard-clips the viewport.
    expect(views).toHaveLength(1);

    const scrollView = scrollViews[0];
    const spacer = views[0];
    if (!scrollView || !spacer) {
      throw new Error('expected scroll view and spacer');
    }

    // getEffectiveTabBarHeight(84) + 16 breathing room.
    expect(spacer.props.style).toEqual({ height: 100 });
    expect(spacer.props.pointerEvents).toBe('none');
    // The spacer is the trailing child of the full-height ScrollView.
    expect(scrollView.children).toEqual(['content', spacer]);
  });

  it('forwards scroll props and keeps the content ahead of the spacer', () => {
    const renderer = mountScrollView({
      className: 'flex-1',
      contentContainerClassName: 'px-6 pt-4',
    });

    const scrollView = findByType(renderer.root, 'ScrollView')[0];
    if (!scrollView) {
      throw new Error('expected scroll view');
    }

    expect(scrollView.props.className).toBe('flex-1');
    expect(scrollView.props.contentContainerClassName).toBe('px-6 pt-4');
    expect(scrollView.children[0]).toBe('content');
  });
});
