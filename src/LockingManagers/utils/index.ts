import { trace, Span } from '@opentelemetry/api';
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

/**
 * Sets the lock acquisition status as an attribute on the active OpenTelemetry span.
 *
 * This function is used to record the success or failure of a lock acquisition attempt
 * in the current tracing context.
 *
 * @param status - A boolean indicating whether the lock was successfully acquired.
 *
 * @example
 * // After attempting to acquire a lock
 * const lockAcquired = await tryAcquireLock();
 * setSpanLockAcquiredStatus(lockAcquired);
 *
 * @remarks
 * - This function relies on the OpenTelemetry API to access the current active span.
 * - If no active span is found, this function will silently do nothing.
 * - The attribute set is 'lock.acquired.success' with a boolean value.
 * - This function is typically used within a larger tracing context to provide
 *   detailed information about lock acquisition operations.
 */
export const setSpanLockAcquiredStatus = (status: boolean): void => {
  setSpanAttributes({'lock.acquire.success': status})
};
