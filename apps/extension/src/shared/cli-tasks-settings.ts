import { z } from 'zod';

export const CLI_TASKS_SETTINGS_STORAGE_KEY = 'local:kiloCliTasksSettings';

export type CliTasksSettings = {
  enableCliTasks: boolean;
};

export const DEFAULT_CLI_TASKS_SETTINGS: CliTasksSettings = {
  enableCliTasks: false,
};

const cliTasksSettingsSchema = z
  .object({
    enableCliTasks: z.boolean().default(false),
  })
  .strip();

type MaybePromise<Value> = Promise<Value> | Value;

export interface CliTasksSettingsStorageArea {
  getItem(key: typeof CLI_TASKS_SETTINGS_STORAGE_KEY): MaybePromise<unknown>;
  setItem(key: typeof CLI_TASKS_SETTINGS_STORAGE_KEY, value: unknown): MaybePromise<void>;
}

export const loadCliTasksSettings = async (
  storageArea: CliTasksSettingsStorageArea
): Promise<CliTasksSettings> => {
  const parsed = cliTasksSettingsSchema.safeParse(
    await storageArea.getItem(CLI_TASKS_SETTINGS_STORAGE_KEY)
  );
  return parsed.success ? parsed.data : DEFAULT_CLI_TASKS_SETTINGS;
};

export const saveCliTasksSettings = async (
  storageArea: CliTasksSettingsStorageArea,
  settings: CliTasksSettings
): Promise<void> => {
  await storageArea.setItem(CLI_TASKS_SETTINGS_STORAGE_KEY, cliTasksSettingsSchema.parse(settings));
};

export const getAdvertisedBrowserProfileId = (
  settings: CliTasksSettings,
  browserProfileId: string
): string | undefined => (settings.enableCliTasks ? browserProfileId : undefined);
