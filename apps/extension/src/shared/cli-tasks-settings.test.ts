import { describe, expect, it } from 'vitest';
import {
  CLI_TASKS_SETTINGS_STORAGE_KEY,
  DEFAULT_CLI_TASKS_SETTINGS,
  getAdvertisedBrowserProfileId,
  loadCliTasksSettings,
  saveCliTasksSettings,
} from './cli-tasks-settings';

const createStorage = () => {
  const values = new Map<string, unknown>();
  return {
    getItem: (key: string) => values.get(key),
    setItem: (key: string, value: unknown) => {
      values.set(key, value);
    },
    values,
  };
};

describe('CLI tasks settings', () => {
  it('defaults CLI tasks to off', async () => {
    const storage = createStorage();

    expect(DEFAULT_CLI_TASKS_SETTINGS).toStrictEqual({ enableCliTasks: false });
    await expect(loadCliTasksSettings(storage)).resolves.toStrictEqual(DEFAULT_CLI_TASKS_SETTINGS);
  });

  it('loads the stored setting', async () => {
    const storage = createStorage();
    storage.values.set(CLI_TASKS_SETTINGS_STORAGE_KEY, { enableCliTasks: true });

    await expect(loadCliTasksSettings(storage)).resolves.toStrictEqual({ enableCliTasks: true });
  });

  it('saves the setting', async () => {
    const storage = createStorage();

    await saveCliTasksSettings(storage, { enableCliTasks: true });

    expect(storage.values.get(CLI_TASKS_SETTINGS_STORAGE_KEY)).toStrictEqual({
      enableCliTasks: true,
    });
  });

  it('advertises the browser profile only when enabled', () => {
    expect(getAdvertisedBrowserProfileId({ enableCliTasks: false }, 'profile-1')).toBeUndefined();
    expect(getAdvertisedBrowserProfileId({ enableCliTasks: true }, 'profile-1')).toBe('profile-1');
  });
});
