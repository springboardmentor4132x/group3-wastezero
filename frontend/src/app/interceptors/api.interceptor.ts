import { HttpInterceptorFn, HttpResponse } from '@angular/common/http';
import { inject } from '@angular/core';
import { of, tap } from 'rxjs';
import { AuthService } from '../services/auth.service';

// Simple in-memory GET cache: url → { response, expiresAt }
const cache = new Map<string, { response: HttpResponse<unknown>; expiresAt: number }>();
const CACHE_TTL_MS = 15_000; // 15 seconds — safe for near-real-time data

export const apiInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);

  // 1. Attach Bearer token to all /api requests
  const token = auth.token;
  const isApiCall = req.url.includes('/api/');
  const authedReq = isApiCall && token
    ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } })
    : req;

  // Never cache message/conversation routes — they need to be realtime
  const isMessagesRoute = authedReq.url.includes('/api/messages');

  // 2. Return cached response for idempotent GET requests
  if (authedReq.method === 'GET' && isApiCall && !isMessagesRoute) {
    const cached = cache.get(authedReq.urlWithParams);
    if (cached && cached.expiresAt > Date.now()) {
      return of(cached.response.clone());
    }
  }

  return next(authedReq).pipe(
    tap((event) => {
      // 3. Cache successful GET responses (skip messages)
      if (
        authedReq.method === 'GET' &&
        isApiCall &&
        !isMessagesRoute &&
        event instanceof HttpResponse &&
        event.status === 200
      ) {
        cache.set(authedReq.urlWithParams, {
          response: event,
          expiresAt: Date.now() + CACHE_TTL_MS,
        });
      }
      // 4. Invalidate cache on mutations so next GET is fresh
      if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(authedReq.method) && isApiCall) {
        // Clear all cache entries for the same base path (e.g. /api/pickups)
        const basePath = authedReq.url.split('/').slice(0, 5).join('/');
        cache.forEach((_, key) => {
          if (key.includes(basePath)) cache.delete(key);
        });
      }
    })
  );
};
