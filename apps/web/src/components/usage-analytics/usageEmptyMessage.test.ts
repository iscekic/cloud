import {
  ORGANIZATION_USAGE_EMPTY_MESSAGE,
  PERSONAL_USAGE_EMPTY_MESSAGE,
  usageTableEmptyMessage,
} from './usageEmptyMessage';

describe('usageTableEmptyMessage', () => {
  it('shows the loading copy while the table query is in flight', () => {
    expect(usageTableEmptyMessage({ isLoading: true, isPersonalContext: true })).toBe('Loading…');
    expect(usageTableEmptyMessage({ isLoading: true, isPersonalContext: false })).toBe('Loading…');
  });

  it('shows the new personal copy when a personal account has no usage rows', () => {
    expect(usageTableEmptyMessage({ isLoading: false, isPersonalContext: true })).toBe(
      'No usage yet. Your first request will appear here.'
    );
  });

  it('keeps the existing organization copy for organization usage', () => {
    expect(usageTableEmptyMessage({ isLoading: false, isPersonalContext: false })).toBe(
      'No usage data.'
    );
  });

  it('exports the exact personal and organization messages', () => {
    expect(PERSONAL_USAGE_EMPTY_MESSAGE).toBe('No usage yet. Your first request will appear here.');
    expect(ORGANIZATION_USAGE_EMPTY_MESSAGE).toBe('No usage data.');
  });
});
