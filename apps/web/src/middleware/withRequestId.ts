import { type NextFetchEvent } from 'next/server';
import type { MiddlewareFactory } from '@/middleware/types';
import type { NextMiddlewareWithAuth, NextRequestWithAuth } from 'next-auth/middleware';

export const REQUEST_ID_HEADER = 'x-request-id';

// Ensures every HTTP response carries an x-request-id header. It reuses the
// incoming x-request-id when the client sends one, otherwise generates a UUID.
export const withRequestId: MiddlewareFactory = (nextMiddleware: NextMiddlewareWithAuth) => {
  return async (request: NextRequestWithAuth, nextFetchEvent: NextFetchEvent) => {
    const response = await nextMiddleware(request, nextFetchEvent);
    if (response) {
      const requestId = request.headers.get(REQUEST_ID_HEADER) ?? crypto.randomUUID();
      response.headers.set(REQUEST_ID_HEADER, requestId);
    }
    return response;
  };
};
