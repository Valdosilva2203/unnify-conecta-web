interface RateLimitStore {
  [key: string]: {
    attempts: number;
    lastAttempt: number;
    blockedUntil?: number;
  };
}

const store: RateLimitStore = {};
const MAX_ATTEMPTS = 5;
const WINDOW_MS = 15 * 60 * 1000; // 15 minutos
const BLOCK_DURATION_MS = 15 * 60 * 1000; // 15 minutos

export function getClientIp(request?: Request): string {
  if (!request) {
    return 'unknown';
  }

  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }

  const real = request.headers.get('x-real-ip');
  if (real) {
    return real;
  }

  return 'unknown';
}

export function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const record = store[ip];

  if (!record) {
    return false;
  }

  // Se o IP está bloqueado, verificar se o bloqueio expirou
  if (record.blockedUntil && now < record.blockedUntil) {
    return true;
  }

  // Se o bloqueio expirou, limpar o registro
  if (record.blockedUntil && now >= record.blockedUntil) {
    delete store[ip];
    return false;
  }

  // Limpar tentativas se a janela de tempo expirou
  if (now - record.lastAttempt > WINDOW_MS) {
    delete store[ip];
    return false;
  }

  return false;
}

export function recordFailedAttempt(ip: string): number {
  const now = Date.now();

  if (!store[ip]) {
    store[ip] = {
      attempts: 0,
      lastAttempt: now,
    };
  }

  const record = store[ip];

  // Limpar tentativas se a janela de tempo expirou
  if (now - record.lastAttempt > WINDOW_MS) {
    record.attempts = 0;
  }

  record.attempts += 1;
  record.lastAttempt = now;

  // Se atingiu o máximo de tentativas, bloquear
  if (record.attempts >= MAX_ATTEMPTS) {
    record.blockedUntil = now + BLOCK_DURATION_MS;
  }

  return record.attempts;
}

export function recordSuccessfulAttempt(ip: string): void {
  if (store[ip]) {
    delete store[ip];
  }
}

export function getRemainingTime(ip: string): number {
  const record = store[ip];

  if (!record || !record.blockedUntil) {
    return 0;
  }

  const now = Date.now();
  const remaining = Math.ceil((record.blockedUntil - now) / 1000);

  return remaining > 0 ? remaining : 0;
}
