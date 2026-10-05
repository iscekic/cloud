export const PERSONAL_USAGE_EMPTY_MESSAGE = 'No usage yet. Your first request will appear here.';

export const ORGANIZATION_USAGE_EMPTY_MESSAGE = 'No usage data.';

export function usageTableEmptyMessage({
  isLoading,
  isPersonalContext,
}: {
  isLoading: boolean;
  isPersonalContext: boolean;
}): string {
  if (isLoading) return 'Loading…';
  return isPersonalContext ? PERSONAL_USAGE_EMPTY_MESSAGE : ORGANIZATION_USAGE_EMPTY_MESSAGE;
}
