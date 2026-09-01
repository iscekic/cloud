import { z } from 'zod';

export const browserTaskStatusSchema = z.enum([
  'queued',
  'running',
  'progress',
  'completed',
  'failed',
  'stopped',
]);

export type BrowserTaskStatus = z.infer<typeof browserTaskStatusSchema>;

/** Honest terminal states. Only these may ever be stored as `terminalStatus`. */
export const browserTerminalStatusSchema = z.enum(['completed', 'failed', 'stopped']);

export type BrowserTerminalStatus = z.infer<typeof browserTerminalStatusSchema>;

/** Non-terminal live states the extension reports while a task runs. */
export const browserTaskProgressStatusSchema = z.enum(['running', 'progress']);

export const browserProfileIdSchema = z.string().min(1).max(128);

/**
 * Identifier of the CLI session that owns a submitted browser task (the
 * Kilo `ses_…` id). Two CLI processes submit as the same authenticated user,
 * so the session id — not the user — is what distinguishes their tasks in the
 * panel.
 */
export const browserTaskSessionIdSchema = z.string().min(1).max(128);

export const browserTaskSchema = z.object({
  taskId: z.string().min(1),
  ownerKiloUserId: z.string().min(1),
  browserProfileId: browserProfileIdSchema,
  provider: z.string().min(1).max(64),
  goal: z.string().min(1),
  invocationId: z.string().uuid(),
  status: browserTaskStatusSchema,
  summary: z.string().nullable(),
  evidence: z.unknown().nullable(),
  terminalStatus: browserTerminalStatusSchema.nullable(),
  boundTabId: z.number().int().positive().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type BrowserTask = z.infer<typeof browserTaskSchema>;

/** Public projection returned to callers. The owner is implicit from auth. */
export const browserTaskStatusResponseSchema = browserTaskSchema.omit({
  ownerKiloUserId: true,
});

export type BrowserTaskStatusResponse = z.infer<typeof browserTaskStatusResponseSchema>;

/** Enqueue input passed from the authenticated submit route into the DO. */
export const enqueueBrowserTaskInputSchema = z.object({
  ownerKiloUserId: z.string().min(1),
  browserProfileId: browserProfileIdSchema,
  provider: z.string().min(1).max(64),
  goal: z.string().min(1),
  invocationId: z.string().uuid(),
});

export type EnqueueBrowserTaskInput = z.infer<typeof enqueueBrowserTaskInputSchema>;

/**
 * CLI submit payload. `owner` is deliberately absent: the route always takes
 * the owner from `user_id` and ignores any owner field a model might send.
 * `sessionId` is the owning CLI session; it is carried to the extension panel
 * so the panel can attribute each task to the session that submitted it.
 */
export const submitBrowserTaskSchema = z.object({
  browserProfileId: browserProfileIdSchema,
  provider: z.string().min(1).max(64),
  goal: z.string().min(1),
  invocationId: z.string().uuid(),
  sessionId: browserTaskSessionIdSchema.optional(),
});

export type SubmitBrowserTaskPayload = z.infer<typeof submitBrowserTaskSchema>;

/** Extension progress/completion POST payload (`POST /api/browser-task/:taskId`). */
export const extensionBrowserTaskUpdateSchema = z.object({
  status: browserTaskProgressStatusSchema.optional(),
  summary: z.string().nullable().optional(),
  evidence: z.unknown().nullable().optional(),
  terminalStatus: browserTerminalStatusSchema.optional(),
  boundTabId: z.number().int().positive().nullable().optional(),
});

export type ExtensionBrowserTaskUpdatePayload = z.infer<typeof extensionBrowserTaskUpdateSchema>;
