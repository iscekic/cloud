/* eslint-disable typescript-eslint/no-deprecated -- react-test-renderer is the DOM-free renderer used to mount React/RN trees under vitest (same pattern as preferences-screen.mounted.test.tsx) */
import { type ReactElement } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { SegmentedControl } from '@/components/ui/segmented-control';

// The component is a thin RadioGroup over Pressables; mock react-native and
// the leaf UI so the node test never parses RN's Flow-typed sources (same
// pattern as radio-group.test.ts).
vi.mock('react-native', () => ({ Pressable: 'Pressable', View: 'View' }));
vi.mock('@/components/ui/text', () => ({ Text: 'Text' }));
vi.mock('@/lib/haptics', () => ({ selectionAsync: vi.fn() }));

function radioNodes(tree: ReactTestRenderer) {
  return tree.root.findAll(
    node => typeof node.type === 'string' && (node.type as string) === 'Pressable'
  );
}

let mountedTree: ReactTestRenderer | undefined = undefined;
function render(element: ReactElement): ReactTestRenderer {
  act(() => {
    mountedTree = create(element);
  });
  if (!mountedTree) {
    throw new Error('SegmentedControl did not mount');
  }
  return mountedTree;
}

beforeAll(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
});
afterEach(() => {
  mountedTree?.unmount();
  mountedTree = undefined;
  vi.unstubAllGlobals();
});

describe('SegmentedControl per-option accessibility labels', () => {
  it('defaults each radio label to the visible option label', () => {
    const tree = render(
      <SegmentedControl<'system' | 'light'>
        accessibilityLabel="Appearance"
        options={[
          { value: 'system', label: 'System' },
          { value: 'light', label: 'Light' },
        ]}
        value="system"
        onChange={() => undefined}
      />
    );

    const radios = radioNodes(tree);
    expect(radios.map(node => node.props.accessibilityLabel)).toEqual(['System', 'Light']);
    expect(radios.every(node => node.props.accessibilityRole === 'radio')).toBe(true);
  });

  it('uses the per-option accessibilityLabel when the option carries one', () => {
    const tree = render(
      <SegmentedControl<'off' | 'light' | 'full'>
        accessibilityLabel="Haptic feedback"
        options={[
          { value: 'off', label: 'Off' },
          { value: 'light', label: 'Light', accessibilityLabel: 'Haptic feedback, Light' },
          { value: 'full', label: 'Full' },
        ]}
        value="full"
        onChange={() => undefined}
      />
    );

    expect(radioNodes(tree).map(node => node.props.accessibilityLabel)).toEqual([
      'Off',
      'Haptic feedback, Light',
      'Full',
    ]);
  });

  it('keeps the visible text of an overridden option unchanged', () => {
    const tree = render(
      <SegmentedControl<'light'>
        accessibilityLabel="Haptic feedback"
        options={[{ value: 'light', label: 'Light', accessibilityLabel: 'Haptic feedback, Light' }]}
        value="light"
        onChange={() => undefined}
      />
    );

    const texts = tree.root.findAll(
      node => typeof node.type === 'string' && (node.type as string) === 'Text'
    );
    expect(texts.map(node => node.props.children)).toEqual(['Light']);
  });

  it('reports the selected option through checked state, not selected', () => {
    const tree = render(
      <SegmentedControl<'off' | 'full'>
        accessibilityLabel="Haptic feedback"
        options={[
          { value: 'off', label: 'Off' },
          { value: 'full', label: 'Full' },
        ]}
        value="full"
        onChange={() => undefined}
      />
    );

    expect(
      radioNodes(tree).map(node => (node.props.accessibilityState as { checked: boolean }).checked)
    ).toEqual([false, true]);
  });
});
