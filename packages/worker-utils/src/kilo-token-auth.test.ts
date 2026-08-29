import { beforeEach, describe, expect, it } from 'vitest';
import { SignJWT } from 'jose';

import { clearSecretCacheForTest } from './cached-secret';
import { signKiloToken } from './kilo-token';
import { verifyKiloBearerAgainstCurrentPepper, type KiloUserPepperResult } from './kilo-token-auth';

const TEST_JWT_SECRET = 'test-secret-that-is-long-enough-for-hs256';
const reviewTokenConstraints = {
  requirePepper: true,
  requiredTokenSource: 'isolate-review',
  maxTokenLifetimeSeconds: 3600,
};

const userResultByUserId = new Map<string, KiloUserPepperResult>();

async function getUserPepper(
  _connectionString: string,
  userId: string
): Promise<KiloUserPepperResult | null | undefined> {
  return userResultByUserId.has(userId) ? userResultByUserId.get(userId)! : undefined;
}

async function signToken(params: {
  pepper: string | null;
  tokenSource: 'kilo-chat' | 'cloud-agent' | 'isolate-review';
  expiresInSeconds?: number;
}) {
  return signKiloToken({
    userId: 'user-xyz-789',
    pepper: params.pepper,
    secret: TEST_JWT_SECRET,
    expiresInSeconds: params.expiresInSeconds ?? 3600,
    env: 'production',
    extra: { tokenSource: params.tokenSource },
  });
}

function verifyToken(
  token: string | null,
  constraints: {
    requirePepper?: boolean;
    requiredTokenSource?: string;
    maxTokenLifetimeSeconds?: number;
  } = {}
) {
  return verifyKiloBearerAgainstCurrentPepper({
    token,
    nextAuthSecret: { get: async () => TEST_JWT_SECRET },
    workerEnv: 'production',
    ...constraints,
    connectionString: 'postgres://test',
    getUserPepper,
  });
}

describe('verifyKiloBearerAgainstCurrentPepper', () => {
  beforeEach(() => {
    clearSecretCacheForTest();
    userResultByUserId.clear();
    userResultByUserId.set('user-xyz-789', { pepper: 'pepper-current', blockedReason: null });
  });

  it('accepts a token with the current user pepper', async () => {
    const { token } = await signToken({ pepper: 'pepper-current', tokenSource: 'kilo-chat' });

    await expect(verifyToken(token)).resolves.toEqual({ userId: 'user-xyz-789' });
  });

  it('accepts valid tokens from any token source', async () => {
    const { token } = await signToken({ pepper: 'pepper-current', tokenSource: 'cloud-agent' });

    await expect(verifyToken(token)).resolves.toEqual({ userId: 'user-xyz-789' });
  });

  it('propagates a pepper-lookup failure instead of reporting an invalid token', async () => {
    const { token } = await signToken({ pepper: 'pepper-current', tokenSource: 'kilo-chat' });

    await expect(
      verifyKiloBearerAgainstCurrentPepper({
        token,
        nextAuthSecret: { get: async () => TEST_JWT_SECRET },
        workerEnv: 'production',
        connectionString: 'postgres://test',
        getUserPepper: async () => {
          throw new Error('connection refused');
        },
      })
    ).rejects.toThrow('connection refused');
  });

  it('propagates a secret-store failure instead of reporting an invalid token', async () => {
    const { token } = await signToken({ pepper: 'pepper-current', tokenSource: 'kilo-chat' });

    await expect(
      verifyKiloBearerAgainstCurrentPepper({
        token,
        nextAuthSecret: {
          get: async () => {
            throw new Error('secrets store unavailable');
          },
        },
        workerEnv: 'production',
        connectionString: 'postgres://test',
        getUserPepper,
      })
    ).rejects.toThrow('secrets store unavailable');
  });

  it('rejects tokens for missing users', async () => {
    userResultByUserId.clear();
    const { token } = await signToken({ pepper: 'pepper-current', tokenSource: 'kilo-chat' });

    await expect(verifyToken(token)).resolves.toBeNull();
  });

  it('rejects tokens when getUserPepper returns null', async () => {
    userResultByUserId.clear();
    // Simulate a custom getUserPepper that returns null instead of undefined
    await expect(
      verifyKiloBearerAgainstCurrentPepper({
        token: await signToken({ pepper: 'pepper-current', tokenSource: 'kilo-chat' }).then(
          ({ token }) => token
        ),
        nextAuthSecret: { get: async () => TEST_JWT_SECRET },
        workerEnv: 'production',
        connectionString: 'postgres://test',
        getUserPepper: async () => null,
      })
    ).resolves.toBeNull();
  });

  it('rejects tokens with stale peppers', async () => {
    const { token } = await signToken({ pepper: 'pepper-stale', tokenSource: 'kilo-chat' });

    await expect(verifyToken(token)).resolves.toBeNull();
  });

  it('rejects a user token with a null pepper when the stored pepper is non-null', async () => {
    userResultByUserId.set('user-xyz-789', { pepper: 'pepper-current', blockedReason: null });
    const { token } = await signToken({ pepper: null, tokenSource: 'kilo-chat' });

    await expect(verifyToken(token)).resolves.toBeNull();
  });

  it('rejects tokens for blocked users (pepper matches, but blocked_reason is set)', async () => {
    userResultByUserId.set('user-xyz-789', {
      pepper: 'pepper-current',
      blockedReason: 'manual block',
    });
    const { token } = await signToken({ pepper: 'pepper-current', tokenSource: 'kilo-chat' });

    await expect(verifyToken(token)).resolves.toBeNull();
  });

  it('rejects tokens for blocked users even when the stored pepper is null', async () => {
    userResultByUserId.set('user-xyz-789', {
      pepper: null,
      blockedReason: 'soft-deleted at 2026-01-01T00:00:00.000Z',
    });
    const { token } = await signToken({ pepper: null, tokenSource: 'kilo-chat' });

    await expect(verifyToken(token)).resolves.toBeNull();
  });

  it('accepts tokens when blockedReason is null and pepper matches', async () => {
    // Explicitly confirm null blockedReason + matching pepper passes.
    userResultByUserId.set('user-xyz-789', { pepper: 'pepper-current', blockedReason: null });
    const { token } = await signToken({ pepper: 'pepper-current', tokenSource: 'kilo-chat' });

    await expect(verifyToken(token)).resolves.toEqual({ userId: 'user-xyz-789' });
  });

  it('succeeds when a token with env is verified without workerEnv', async () => {
    const { token } = await signToken({ pepper: 'pepper-current', tokenSource: 'kilo-chat' });

    await expect(
      verifyKiloBearerAgainstCurrentPepper({
        token,
        nextAuthSecret: { get: async () => TEST_JWT_SECRET },
        connectionString: 'postgres://test',
        getUserPepper,
      })
    ).resolves.toEqual({ userId: 'user-xyz-789' });
  });

  it('fails when token env does not match a provided workerEnv', async () => {
    const { token } = await signToken({ pepper: 'pepper-current', tokenSource: 'kilo-chat' });

    await expect(
      verifyKiloBearerAgainstCurrentPepper({
        token,
        nextAuthSecret: { get: async () => TEST_JWT_SECRET },
        workerEnv: 'staging',
        connectionString: 'postgres://test',
        getUserPepper,
      })
    ).resolves.toBeNull();
  });
});

describe('optional Kilo bearer constraints', () => {
  beforeEach(() => {
    clearSecretCacheForTest();
    userResultByUserId.clear();
    userResultByUserId.set('user-xyz-789', { pepper: 'pepper-current', blockedReason: null });
  });

  it('rejects matching-environment pepper-less tokens only when a pepper is required', async () => {
    const now = Math.floor(Date.now() / 1000);
    const token = await new SignJWT({
      version: 3,
      kiloUserId: 'user-xyz-789',
      env: 'production',
      tokenSource: 'isolate-review',
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt(now)
      .setExpirationTime(now + 3600)
      .sign(new TextEncoder().encode(TEST_JWT_SECRET));

    await expect(verifyToken(token)).resolves.toEqual({ userId: 'user-xyz-789' });
    await expect(verifyToken(token, reviewTokenConstraints)).resolves.toBeNull();
  });

  it('accepts an explicitly null pepper when the stored pepper is null', async () => {
    userResultByUserId.set('user-xyz-789', { pepper: null, blockedReason: null });
    const { token } = await signToken({ pepper: null, tokenSource: 'isolate-review' });

    await expect(verifyToken(token, reviewTokenConstraints)).resolves.toEqual({
      userId: 'user-xyz-789',
    });
  });

  it.each([{ tokenSource: 'cloud-agent' }, { tokenSource: undefined }])(
    'rejects a token with tokenSource $tokenSource when isolate-review is required',
    async ({ tokenSource }) => {
      const { token } = await signKiloToken({
        userId: 'user-xyz-789',
        pepper: 'pepper-current',
        secret: TEST_JWT_SECRET,
        expiresInSeconds: 3600,
        env: 'production',
        ...(tokenSource === undefined ? {} : { extra: { tokenSource } }),
      });

      await expect(verifyToken(token, reviewTokenConstraints)).resolves.toBeNull();
    }
  );

  it('rejects a signed lifetime longer than the configured maximum', async () => {
    const { token } = await signToken({
      pepper: 'pepper-current',
      tokenSource: 'isolate-review',
      expiresInSeconds: 3601,
    });

    await expect(verifyToken(token, reviewTokenConstraints)).resolves.toBeNull();
  });

  it.each(['iat', 'exp'] as const)(
    'rejects a token without %s when its signed lifetime is bounded',
    async missingClaim => {
      const now = Math.floor(Date.now() / 1000);
      let signer = new SignJWT({
        version: 3,
        kiloUserId: 'user-xyz-789',
        apiTokenPepper: 'pepper-current',
        env: 'production',
        tokenSource: 'isolate-review',
      }).setProtectedHeader({ alg: 'HS256' });
      if (missingClaim !== 'iat') signer = signer.setIssuedAt(now);
      if (missingClaim !== 'exp') signer = signer.setExpirationTime(now + 3600);
      const token = await signer.sign(new TextEncoder().encode(TEST_JWT_SECRET));

      await expect(verifyToken(token, reviewTokenConstraints)).resolves.toBeNull();
    }
  );

  it('rejects a future-issued token that remains valid longer than the configured maximum', async () => {
    const now = Math.floor(Date.now() / 1000);
    const futureIssuedAt = now + 365 * 24 * 60 * 60;
    const token = await new SignJWT({
      version: 3,
      kiloUserId: 'user-xyz-789',
      apiTokenPepper: 'pepper-current',
      env: 'production',
      tokenSource: 'isolate-review',
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt(futureIssuedAt)
      .setExpirationTime(futureIssuedAt + 3600)
      .sign(new TextEncoder().encode(TEST_JWT_SECRET));

    await expect(verifyToken(token)).resolves.toEqual({ userId: 'user-xyz-789' });
    await expect(verifyToken(token, reviewTokenConstraints)).resolves.toBeNull();
  });

  it('accepts an isolate-review token whose signed lifetime is exactly one hour', async () => {
    const { token } = await signToken({
      pepper: 'pepper-current',
      tokenSource: 'isolate-review',
      expiresInSeconds: 3600,
    });

    await expect(verifyToken(token, reviewTokenConstraints)).resolves.toEqual({
      userId: 'user-xyz-789',
    });
  });

  it('preserves long-lived tokens from other sources without constraint opt-in', async () => {
    const { token } = await signToken({
      pepper: 'pepper-current',
      tokenSource: 'cloud-agent',
      expiresInSeconds: 24 * 60 * 60,
    });

    await expect(verifyToken(token)).resolves.toEqual({ userId: 'user-xyz-789' });
  });
});

describe('internal service tokens (no apiTokenPepper, no env)', () => {
  beforeEach(() => {
    clearSecretCacheForTest();
    userResultByUserId.clear();
    userResultByUserId.set('user-xyz-789', { pepper: 'pepper-current', blockedReason: null });
  });

  async function signInternalToken(): Promise<string> {
    const now = Math.floor(Date.now() / 1000);
    return new SignJWT({
      version: 3,
      kiloUserId: 'user-xyz-789',
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt(now)
      .setExpirationTime(now + 3600)
      .sign(new TextEncoder().encode(TEST_JWT_SECRET));
  }

  function verifyInternalToken(token: string, workerEnv?: string) {
    return verifyKiloBearerAgainstCurrentPepper({
      token,
      nextAuthSecret: { get: async () => TEST_JWT_SECRET },
      ...(workerEnv ? { workerEnv } : {}),
      connectionString: 'postgres://test',
      getUserPepper,
    });
  }

  it('succeeds when workerEnv is omitted and the user is active', async () => {
    const token = await signInternalToken();

    await expect(verifyInternalToken(token)).resolves.toEqual({ userId: 'user-xyz-789' });
  });

  it('fails when workerEnv is provided', async () => {
    const token = await signInternalToken();

    await expect(verifyInternalToken(token, 'production')).resolves.toBeNull();
  });

  it('fails when blocked_reason is set', async () => {
    userResultByUserId.set('user-xyz-789', { pepper: null, blockedReason: 'manual block' });
    const token = await signInternalToken();

    await expect(verifyInternalToken(token)).resolves.toBeNull();
  });
});

describe('C15 deviceSessionId compatibility', () => {
  beforeEach(() => {
    clearSecretCacheForTest();
    userResultByUserId.clear();
    userResultByUserId.set('user-xyz-789', { pepper: 'pepper-current', blockedReason: null });
  });

  it('accepts a token carrying deviceSessionId claim', async () => {
    const now = Math.floor(Date.now() / 1000);
    const token = await new SignJWT({
      version: 3,
      kiloUserId: 'user-xyz-789',
      apiTokenPepper: 'pepper-current',
      env: 'production',
      tokenSource: 'kilo-chat',
      deviceSessionId: 'session-abc-123',
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt(now)
      .setExpirationTime(now + 3600)
      .sign(new TextEncoder().encode(TEST_JWT_SECRET));

    await expect(verifyToken(token)).resolves.toEqual({ userId: 'user-xyz-789' });
  });
});
