import { LockInfo } from '../types';
import { setSpanAttributes } from '../../OpenTelemetry';

/**
 * Checks if a lock has expired based on its expiration time.
 *
 * This function compares the expiration time of the given lock with the current time
 * to determine if the lock has expired.
 *
 * @param lock - The lock information to check.
 * @returns {boolean} True if the lock has expired, false otherwise.
 *
 * @throws {TypeError} If the lock parameter is not a valid LockInfo object.
 *
 * @example
 * const lockInfo: LockInfo = {
 *   lockId: "123",
 *   acquiredAt: new Date(Date.now() - 60000), // 1 minute ago
 *   expiresAt: new Date(Date.now() - 1000), // 1 second ago
 *   metadata: {}
 * };
 * const expired = isLockExpired(lockInfo);
 * console.log(expired); // true
 *
 * @remarks
 * - This function considers a lock expired if its expiration time is less than or equal to the current time.
 * - The function uses the system clock, so ensure that the system time is accurate for reliable results.
 * - This function does not modify the lock or perform any cleanup operations.
 */
export function isLockExpired(lock: LockInfo): boolean {
  if (!lock || typeof lock.expiresAt === 'undefined') {
    throw new TypeError('Invalid lock information provided');
  }
  return new Date(lock.expiresAt) <= new Date();
}
