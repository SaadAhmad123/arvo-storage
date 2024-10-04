import { LockOptions } from '../types';

export const lockingManagerOTelAttributes = {
  acquireLock: (path: string, options?: LockOptions) => ({
    'lock.path': path,
    'lock.timeout': options?.timeout,
    'lock.retry.count': options?.retries,
    'lock.retry.delay': options?.retryDelay,
  }),
  releaseLock: (path: string, lockId?: string) => ({ 'lock.path': path }),
  forceReleaseLock: (path: string) => ({ 'lock.path': path }),
  extendLock: (path: string, lockId: string, duration: number) => ({
    'lock.path': path,
    'lock.timeout.extension': duration,
  }),
  getLockInfo: (path: string) => ({ 'lock.path': path }),
  isLocked: (path: string) => ({ 'lock.path': path }),
};
