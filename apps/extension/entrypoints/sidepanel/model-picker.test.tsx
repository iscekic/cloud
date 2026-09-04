/* eslint-disable capitalized-comments, id-length, init-declarations, jest/no-hooks, jest/no-untyped-mock-factory, jest/no-conditional-expect, jest/no-conditional-in-test, max-lines, no-unused-expressions, sort-keys, vitest/prefer-import-in-mock, vitest/prefer-called-times -- test fixture constraints */
/* eslint-disable import/first */
// @vitest-environment jsdom

import { createElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render } from '@testing-library/react';
import type { StoredAuth } from '@/src/shared/auth';
import type { KiloGatewayModelOption } from '@/src/shared/kilo-api-client';
import { ModelPicker } from './model-picker';
import { useModelPreferences } from './use-model-preferences';

vi.mock('./use-model-preferences', () => ({
  useModelPreferences: vi.fn(),
}));

const auth: StoredAuth = { token: 'token-1', userEmail: 'user@kilo.ai' };

const gatewayModel = (id: string, name: string, isPreferred = false): KiloGatewayModelOption => ({
  id,
  isPreferred,
  name,
  variants: [],
});

const mockUseModelPreferences = vi.mocked(useModelPreferences);

const renderModelPicker = ({
  disabled = false,
  model,
  modelOptions,
}: {
  readonly disabled?: boolean;
  readonly model: string;
  readonly modelOptions: readonly KiloGatewayModelOption[];
}) =>
  render(
    createElement(ModelPicker, {
      auth,
      disabled,
      model,
      modelOptions,
      onModelChange: vi.fn(),
      organizationId: undefined,
    })
  );

describe('model picker stored-model display', () => {
  beforeEach(() => {
    mockUseModelPreferences.mockReturnValue({
      favorites: new Set<string>(),
      refetch: vi.fn(),
      status: 'ready',
      toggleError: false,
      toggleFavorite: vi.fn(),
    });
  });

  it('shows the stored model id while the catalog is empty', () => {
    const { getByLabelText } = renderModelPicker({
      model: 'anthropic/claude-sonnet-4',
      modelOptions: [],
    });

    const trigger = getByLabelText('Model');
    if (trigger instanceof HTMLButtonElement) {
      expect(trigger.textContent).toContain('anthropic/claude-sonnet-4');
      expect(trigger.dataset['modelId']).toBe('anthropic/claude-sonnet-4');
    }
  });

  it('shows Loading models... with no stored model and no catalog', () => {
    const { getByLabelText } = renderModelPicker({ model: '', modelOptions: [] });

    const trigger = getByLabelText('Model');
    if (trigger instanceof HTMLButtonElement) {
      expect(trigger.textContent).toContain('Loading models...');
      expect(trigger.dataset['modelId']).toBeUndefined();
    }
  });

  it('shows the catalog name when the catalog contains the stored model', () => {
    const { getByLabelText } = renderModelPicker({
      model: 'anthropic/claude-sonnet-4',
      modelOptions: [gatewayModel('anthropic/claude-sonnet-4', 'Claude Sonnet 4')],
    });

    const trigger = getByLabelText('Model');
    if (trigger instanceof HTMLButtonElement) {
      expect(trigger.textContent).toContain('Claude Sonnet 4');
      expect(trigger.textContent).not.toContain('anthropic/claude-sonnet-4');
    }
  });

  it('keeps the stored id when the catalog misses the stored model', () => {
    const { getByLabelText } = renderModelPicker({
      model: 'anthropic/claude-sonnet-4',
      modelOptions: [gatewayModel('other/alpha', 'Other Alpha', true)],
    });

    const trigger = getByLabelText('Model');
    if (trigger instanceof HTMLButtonElement) {
      expect(trigger.textContent).toContain('anthropic/claude-sonnet-4');
      expect(trigger.textContent).not.toContain('Other Alpha');
    }
  });

  it('stays closed when disabled', () => {
    const { getByLabelText, queryByRole } = renderModelPicker({
      disabled: true,
      model: 'anthropic/claude-sonnet-4',
      modelOptions: [],
    });

    const trigger = getByLabelText('Model');
    if (trigger instanceof HTMLButtonElement) {
      expect(trigger.disabled).toBe(true);
      fireEvent.click(trigger);
    }

    expect(queryByRole('dialog', { name: 'Select model' })).toBeNull();
  });

  it('keeps the search field pinned while the model list scrolls', () => {
    const modelOptions = Array.from({ length: 20 }, (_, index) =>
      gatewayModel(`provider/model-${index}`, `Model ${index}`)
    );
    const { getByLabelText, getByRole } = renderModelPicker({
      model: 'missing/model',
      modelOptions,
    });

    fireEvent.click(getByLabelText('Model'));

    const dialog = getByRole('dialog', { name: 'Select model' });
    const search = getByLabelText('Search models');
    const header = dialog.firstElementChild;
    if (!(search instanceof HTMLInputElement)) {
      throw new TypeError('Search models must be an input');
    }

    fireEvent.change(search, { target: { value: 'model' } });
    fireEvent.scroll(dialog);

    expect({
      dialogScrollable: dialog.classList.contains('overflow-y-auto'),
      headerPinned: ['sticky', 'top-0', 'h-14'].every(
        className => header?.classList.contains(className) === true
      ),
      searchPinned: ['sticky', 'top-14', 'z-10', 'shrink-0', 'bg-surface-background'].every(
        className => search.parentElement?.classList.contains(className) === true
      ),
    }).toStrictEqual({ dialogScrollable: true, headerPinned: true, searchPinned: true });
    expect({ activeElement: document.activeElement, value: search.value }).toStrictEqual({
      activeElement: search,
      value: 'model',
    });

    fireEvent.change(search, { target: { value: 'no such model' } });

    expect({
      activeElement: document.activeElement,
      clearSearchVisible: getByRole('button', { name: 'Clear search' }) !== null,
      value: search.value,
    }).toStrictEqual({ activeElement: search, clearSearchVisible: true, value: 'no such model' });
  });
});
