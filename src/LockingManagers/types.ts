/**
 * Options for acquiring a lock.
 */
export interface LockOptions {
  /**
   * Time in milliseconds after which the lock automatically expires.
   */
  timeout?: number;

  /**
   * Number of times to retry acquiring the lock if initial attempt fails.
   */
  retries?: number;

  /**
   * Time in milliseconds to wait between retry attempts.
   */
  retryDelay?: number;

  /**
   * Optional metadata to associate with the lock.
   */
  metadata?: Record<string, unknown>;
}

/**
 * Result of a lock acquisition attempt.
 */
export interface LockResult {
  /**
   * Whether the lock was successfully acquired.
   */
  success: boolean;

  /**
   * A unique identifier for the acquired lock, if successful.
   */
  lockId?: string;

  /**
   * The expiration time of the lock, if successful.
   */
  expiresAt?: string;

  /**
   * Error message if the lock acquisition failed.
   */
  error?: string;
}

/**
 * Information about a currently held lock.
 */
export interface LockInfo {
  /**
   * The unique identifier of the lock.
   */
  lockId: string;

  /**
   * When the lock was acquired.
   */
  acquiredAt: string;

  /**
   * When the lock will expire.
   */
  expiresAt: string;

  /**
   * Any metadata associated with the lock.
   */
  metadata?: Record<string, unknown>;
}

/**
 * Interface for managing distributed resource locks.
 *
 * This interface provides comprehensive methods for acquiring, releasing, and managing
 * locks in a distributed system. It ensures safe concurrent access to shared resources
 * and supports features like lock expiration, forced release, and lock metadata.
 *
 * @example
 * ```typescript
 * class RedisLockManager implements ILockingManager {
 *   // Implementation details...
 * }
 *
 * const lockManager = new RedisLockManager();
 * const lockResult = await lockManager.acquireLock('resource/123', {
 *   timeout: 5000,
 *   retries: 3
 * });
 *
 * if (lockResult.success) {
 *   try {
 *     // Perform operations on the locked resource
 *   } finally {
 *     await lockManager.releaseLock('resource/123');
 *   }
 * }
 * ```
 */
export interface ILockingManager {
  /**
   * Attempts to acquire a lock on the specified path.
   *
   * @param path - The path to acquire a lock on.
   * @param options - Optional settings for the lock acquisition.
   * @returns A promise resolving to a LockResult object.
   * @throws {Error} If the lock manager is not available or malfunctioning.
   *
   * @example
   * ```typescript
   * const result = await lockManager.acquireLock('users/123', {
   *   timeout: 10000,
   *   retries: 3,
   *   metadata: { owner: 'processId123' }
   * });
   *
   * if (result.success) {
   *   console.log(`Lock acquired: ${result.lockId}`);
   * }
   * ```
   */
  acquireLock(path: string, options?: LockOptions): Promise<LockResult>;

  /**
   * Releases a lock on the specified path.
   *
   * @param path - The path to release the lock from.
   * @param lockId - Optional lock ID to ensure only the correct lock is released.
   * @returns A promise resolving to true if the lock is successfully released, false otherwise.
   * @throws {Error} If the lock manager is not available or malfunctioning.
   *
   * @example
   * ```typescript
   * const released = await lockManager.releaseLock('users/123', 'lock-uuid-123');
   * if (!released) {
   *   console.error('Failed to release lock');
   * }
   * ```
   */
  releaseLock(path: string, lockId?: string): Promise<boolean>;

  /**
   * Forcibly releases a lock, regardless of ownership.
   * Use with caution as it can lead to race conditions if not used properly.
   *
   * @param path - The path to forcibly release the lock from.
   * @returns A promise resolving to true if the lock is successfully released.
   * @throws {Error} If the lock manager is not available or malfunctioning.
   */
  forceReleaseLock(path: string): Promise<boolean>;

  /**
   * Extends the expiration time of an existing lock.
   *
   * @param path - The path of the lock to extend.
   * @param lockId - The ID of the lock to extend.
   * @param duration - The additional time in milliseconds to extend the lock for.
   * @returns A promise resolving to true if the lock is successfully extended.
   * @throws {Error} If the lock doesn't exist or has already expired.
   */
  extendLock(path: string, lockId: string, duration: number): Promise<boolean>;

  /**
   * Retrieves information about a currently held lock.
   *
   * @param path - The path to check for lock information.
   * @returns A promise resolving to a LockInfo object if a lock exists, null otherwise.
   * @throws {Error} If the lock manager is not available or malfunctioning.
   */
  getLockInfo(path: string): Promise<LockInfo | null>;

  /**
   * Checks if a lock is currently held on the specified path.
   *
   * @param path - The path to check for a lock.
   * @returns A promise resolving to a boolean indicating if the path is locked.
   * @throws {Error} If the lock manager is not available or malfunctioning.
   *
   * @example
   * ```typescript
   * if (await lockManager.isLocked('users/123')) {
   *   console.log('Resource is currently locked');
   * }
   * ```
   */
  isLocked(path: string): Promise<boolean>;
}
