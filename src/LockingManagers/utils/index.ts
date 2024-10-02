import { LockInfo } from "../types";

/**
 * Checks if a lock has expired.
 * @param lock - The lock to check.
 * @returns True if the lock has expired, false otherwise.
 */
export function isLockExpired(lock: LockInfo): boolean {
  return new Date(lock.expiresAt) <= new Date();
}