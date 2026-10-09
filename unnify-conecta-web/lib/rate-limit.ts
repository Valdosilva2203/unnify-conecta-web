import { NextRequest } from 'next/server';

const requestMap = new Map<string, { count: number; reset: number }>();

export function rateLimit(request: NextRequest, maxRequests: number = 10, windowMs: number = 60000) {
  const ip = request.ip || request.headers.get('x-forwarded-for') || 'unknown';
  const now = Date.now();

  let record = requestMap.get(ip);

  if (!record || now > record.reset) {
    record = { count: 0, reset: now + windowMs };
    requestMap.set(ip, record);
  }

  record.count++;

  if (record.count > maxRequests) {
    return { allowed: false, retryAfter: Math.ceil((record.reset - now) / 1000) };
  }

  return { allowed: true };
}
