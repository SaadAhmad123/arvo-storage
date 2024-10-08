import { LockOptions } from '../types';

const __resourceKey = 'arvo.lock.resource';
export const lockingManagerOTelAttributes = {
  acquireLock: (path: string, options?: LockOptions) => ({
    [__resourceKey]: path,
    'arvo.lock.timeout': options?.timeout,
    'arvo.lock.retry.count': options?.retries,
    'arvo.lock.retry.delay': options?.retryDelay,
  }),
  releaseLock: (path: string, lockId?: string) => ({ [__resourceKey]: path }),
  forceReleaseLock: (path: string) => ({ [__resourceKey]: path }),
  extendLock: (path: string, lockId: string, duration: number) => ({
    [__resourceKey]: path,
    'arvo.lock.timeout.extension': duration,
  }),
  getLockInfo: (path: string) => ({ [__resourceKey]: path }),
  isLocked: (path: string) => ({ [__resourceKey]: path }),
  lockAcquiredSuccess: (success: boolean) => ({
    'arvo.lock.acquire.success': success,
  }),
  lockReleaseSuccess: (success: boolean) => ({
    'arvo.lock.release.success': success,
  }),
  lockExtensionSuccess: (success: boolean) => ({
    'arvo.lock.timeout.extension.success': success,
  }),
  lockForceReleaseSuccess: (success: boolean) => ({
    'arvo.lock.release.force.success': success,
  }),
};
