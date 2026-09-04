import { afterEach, beforeAll, describe, expect, it, jest } from '@jest/globals';
import { createRequire } from 'node:module';
import React, { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import type {
  RepositoryMultiSelect as RepositoryMultiSelectComponent,
  Repository,
} from './RepositoryMultiSelect';
import { HIDE_FORKS_STORAGE_KEY } from '@/lib/repositories/hide-forks';

jest.mock('lucide-react', () => new Proxy({}, { get: () => () => null }));
jest.mock('@/components/ui/button', () => ({
  Button: ({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) =>
    createElement('button', props, children),
}));
jest.mock('@/components/ui/input', () => ({
  Input: ({ onChange, ...props }: React.InputHTMLAttributes<HTMLInputElement>) =>
    createElement('input', {
      ...props,
      onInput: (event: React.FormEvent<HTMLInputElement>) =>
        onChange?.(event as React.ChangeEvent<HTMLInputElement>),
    }),
}));
jest.mock('@/components/ui/label', () => ({
  Label: ({ children, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) =>
    createElement('label', props, children),
}));
jest.mock('@/components/ui/switch', () => ({
  Switch: ({
    checked,
    onCheckedChange,
  }: {
    checked?: boolean;
    onCheckedChange?: (value: boolean) => void;
  }) =>
    createElement('button', {
      role: 'switch',
      'aria-checked': String(checked ?? false),
      onClick: () => onCheckedChange?.(!checked),
    }),
}));
jest.mock('@/components/ui/checkbox', () => ({
  Checkbox: ({
    checked,
    onCheckedChange,
  }: {
    checked?: boolean | 'indeterminate';
    onCheckedChange?: (value: boolean) => void;
  }) =>
    createElement('input', {
      type: 'checkbox',
      'aria-checked': String(checked === true),
      onChange: (event: React.ChangeEvent<HTMLInputElement>) =>
        onCheckedChange?.(event.currentTarget.checked),
    }),
}));

type LinkedomModule = {
  parseHTML: (html: string) => { window: typeof globalThis; document: Document };
};

function installDom() {
  const requireFromHere = createRequire(__filename);
  const requireFromNext = createRequire(requireFromHere.resolve('next/package.json'));
  const parsed = (requireFromNext('linkedom') as LinkedomModule).parseHTML(
    '<!doctype html><html><body><div id="root"></div></body></html>'
  );
  const globals = globalThis as typeof globalThis & Record<string, unknown>;
  const previous = new Map<string, unknown>();
  for (const name of [
    'React',
    'window',
    'document',
    'HTMLElement',
    'Element',
    'Node',
    'Event',
    'IS_REACT_ACT_ENVIRONMENT',
  ]) {
    previous.set(name, globals[name]);
  }
  Object.assign(globals, {
    React,
    window: parsed.window,
    document: parsed.document,
    HTMLElement: (parsed.window as { HTMLElement: typeof HTMLElement }).HTMLElement,
    Element: (parsed.window as { Element: typeof Element }).Element,
    Node: (parsed.window as { Node: typeof Node }).Node,
    Event: (parsed.window as { Event: typeof Event }).Event,
    IS_REACT_ACT_ENVIRONMENT: true,
  });
  const container = parsed.document.getElementById('root');
  if (!container) throw new Error('linkedom root missing');
  return {
    container: container as HTMLElement,
    window: parsed.window as unknown as { localStorage: Record<string, unknown> },
    document: parsed.document as unknown as Document,
    cleanup: () => {
      for (const [name, value] of previous) globals[name] = value;
    },
  };
}

let RepositoryMultiSelect!: typeof RepositoryMultiSelectComponent;
let dom: ReturnType<typeof installDom>;
let storage: Map<string, string>;

beforeAll(async () => {
  // Installed before the component import so `@/lib/localStorage` binds to a
  // window-backed (not server) storage implementation.
  dom = installDom();
  storage = new Map();
  Object.defineProperty(dom.window, 'localStorage', {
    configurable: true,
    get: () => ({
      getItem: (key: string) => (storage.has(key) ? (storage.get(key) as string) : null),
      setItem: (key: string, value: string) => void storage.set(key, value),
    }),
  });
  ({ RepositoryMultiSelect } = await import('./RepositoryMultiSelect'));
});

afterEach(() => {
  storage.clear();
});

type Props = React.ComponentProps<typeof RepositoryMultiSelectComponent>;

function repo(overrides: Partial<Repository> & { id: number }): Repository {
  return {
    name: `repo-${overrides.id}`,
    full_name: `org/repo-${overrides.id}`,
    private: false,
    ...overrides,
  };
}

function renderPicker(props: Partial<Props> = {}) {
  const onSelectionChange = jest.fn<Props['onSelectionChange']>();
  const allProps: Props = {
    repositories: [],
    selectedIds: [],
    onSelectionChange,
    ...props,
  };
  const container = dom.document.createElement('div') as HTMLElement;
  dom.document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(createElement(RepositoryMultiSelect, allProps));
  });
  // Flush the mount effects (stored hide-forks preference, pruning).
  return { container, onSelectionChange, allProps, root };
}

function hideForksSwitch(container: HTMLElement) {
  return container.querySelector('[role="switch"]');
}

async function clickHideForks(container: HTMLElement) {
  const element = hideForksSwitch(container);
  if (!element) throw new Error('Hide-forks switch missing');
  await act(async () => {
    element.dispatchEvent(new Event('click', { bubbles: true }));
    await Promise.resolve();
  });
}

describe('RepositoryMultiSelect hide-forks toggle visibility', () => {
  it('shows the toggle when the cache has known forks', () => {
    const { container } = renderPicker({
      repositories: [repo({ id: 1, fork: false }), repo({ id: 2, fork: true })],
    });
    expect(hideForksSwitch(container)).not.toBeNull();
    expect(container.textContent).toContain('Hide forks');
  });

  it('shows the toggle when the cache predates the fork flag on a fork-capable platform', () => {
    const { container } = renderPicker({
      repositories: [repo({ id: 1 }), repo({ id: 2 })],
    });
    expect(hideForksSwitch(container)).not.toBeNull();
    expect(container.textContent).toContain('Hide forks');
  });

  it('hides the toggle on a platform whose caches never carry fork data', () => {
    const { container } = renderPicker({
      repositories: [repo({ id: 1 }), repo({ id: 2 })],
      supportsForks: false,
    });
    expect(hideForksSwitch(container)).toBeNull();
    expect(container.textContent).not.toContain('Hide forks');
  });

  it('hides the toggle when fork data is present but no repo is a fork', () => {
    const { container } = renderPicker({
      repositories: [repo({ id: 1, fork: false }), repo({ id: 2, fork: false })],
    });
    expect(hideForksSwitch(container)).toBeNull();
  });

  it('hides the toggle for an empty repository list', () => {
    const { container } = renderPicker({ repositories: [] });
    expect(hideForksSwitch(container)).toBeNull();
    expect(container.textContent).toContain('No repositories available');
    expect(container.textContent).toContain('0 of 0 repositories selected');
  });

  it('keeps the toggle visible while the stored preference is on, even without fork data', async () => {
    storage.set(HIDE_FORKS_STORAGE_KEY, 'true');
    const { container } = renderPicker({
      repositories: [repo({ id: 1 })],
      supportsForks: false,
    });
    await act(async () => Promise.resolve());
    expect(hideForksSwitch(container)).not.toBeNull();
    expect(hideForksSwitch(container)?.getAttribute('aria-checked')).toBe('true');
  });
});

describe('RepositoryMultiSelect hide-forks behavior', () => {
  it.each([1, 2])(
    'selects every non-fork repository during search with repository %i selected',
    async selectedId => {
      storage.set(HIDE_FORKS_STORAGE_KEY, 'true');
      const { container, onSelectionChange } = renderPicker({
        repositories: [
          repo({ id: 1, fork: false }),
          repo({ id: 2, fork: false }),
          repo({ id: 3, fork: true }),
        ],
        selectedIds: [selectedId],
      });
      const input = container.querySelector('input[type="text"]') as HTMLInputElement;

      await act(async () => {
        input.value = 'repo-1';
        input.dispatchEvent(new Event('input', { bubbles: true }));
        await Promise.resolve();
      });

      const selectAll = [...container.querySelectorAll('button')].find(
        button => button.textContent === 'Select All'
      );
      if (!selectAll) throw new Error('Select All button missing');
      expect(selectAll.hasAttribute('disabled')).toBe(false);

      await act(async () => {
        selectAll.dispatchEvent(new Event('click', { bubbles: true }));
        await Promise.resolve();
      });

      expect(onSelectionChange).toHaveBeenLastCalledWith([1, 2]);
    }
  );

  it('keeps the selection count independent from search', async () => {
    const { container } = renderPicker({
      repositories: [repo({ id: 1, fork: false }), repo({ id: 2, fork: false })],
      selectedIds: [1, 2, 999],
    });
    const input = container.querySelector('input[type="text"]') as HTMLInputElement;

    await act(async () => {
      input.value = 'repo-1';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      await Promise.resolve();
    });

    expect(container.textContent).not.toContain('org/repo-2');
    expect(container.textContent).toContain('2 of 2 repositories selected');
  });

  it('does not render persisted hidden forks on the initial client render', () => {
    storage.set(HIDE_FORKS_STORAGE_KEY, 'true');
    const renderRepositoryAccessory = jest.fn(() => null);

    renderPicker({
      repositories: [repo({ id: 1, fork: false }), repo({ id: 2, fork: true })],
      renderRepositoryAccessory,
    });

    expect(renderRepositoryAccessory).not.toHaveBeenCalledWith(expect.objectContaining({ id: 2 }));
  });

  it('drops known forks from the list and the selection when toggled on', async () => {
    const { container, onSelectionChange } = renderPicker({
      repositories: [repo({ id: 1, fork: false }), repo({ id: 2, fork: true })],
      selectedIds: [1, 2],
    });

    await clickHideForks(container);

    expect(container.textContent).toContain('org/repo-1');
    expect(container.textContent).not.toContain('org/repo-2');
    expect(container.textContent).toContain('1 of 1 repositories selected');
    expect(onSelectionChange).toHaveBeenCalledWith([1]);
  });

  it('keeps unknown-fork rows visible while hide-forks is on (stale cache is not a fork)', async () => {
    const { container, onSelectionChange } = renderPicker({
      repositories: [repo({ id: 1 }), repo({ id: 2 })],
      selectedIds: [1, 2],
    });

    await clickHideForks(container);

    expect(container.textContent).toContain('org/repo-1');
    expect(container.textContent).toContain('org/repo-2');
    expect(onSelectionChange).not.toHaveBeenCalled();
  });
});
