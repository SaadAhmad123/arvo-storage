import fs from 'fs/promises';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { ILockingManager, LockOptions, LockResult, LockInfo } from '../types';
import {
  createExecutionTracer,
  logToSpan,
} from '../../OpenTelemetry';
import { isLockExpired } from '../utils';
import { lockingManagerOTelAttributes } from '../utils/otel.attributes';
import { DefaultLockConfiguration } from '../utils/defaultLockConfiguration/types';
import { ILocalJsonLock } from './types';
import { defaultLockConfiguration } from '../utils/defaultLockConfiguration';

/**
 * Implements a file-based locking mechanism using JSON for persistence.
 * This class provides methods for acquiring, releasing, and managing locks
 * with OpenTelemetry instrumentation for observability.
 * @implements {ILockingManager}
 */
export class LocalJsonLock implements ILockingManager {
  public readonly defaultLockConfiguration: DefaultLockConfiguration =
    defaultLockConfiguration;
  private readonly filePath: string;
  private locks: Record<
    string,
    Omit<LockInfo, 'acquiredAt' | 'expiresAt'> & {
      acquiredAt: string;
      expiresAt: string;
    }
  > = {};
  private executeTraced = createExecutionTracer({
    name: 'LocalJsonLock',
  });

  /**
   * Creates an instance of LocalJsonLock.
   */
  constructor(param: ILocalJsonLock) {
    this.filePath = path.resolve(param.config.filePath);
    this.defaultLockConfiguration =
      param.config.defaultLockConfiguration ?? this.defaultLockConfiguration;
  }

  /**
   * Loads the locks from the JSON file.
   * @private
   * @throws {Error} If loading the locks fails for reasons other than the file not existing.
   */
  private async initialize(): Promise<void> {
    return this.executeTraced(
      'loadLocks',
      async () => {
        try {
          const data = await fs.readFile(this.filePath, 'utf-8');
          this.locks = JSON.parse(data);
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
            await this.saveToFile();
          } else {
            throw new Error(
              `Failed to initialize storage: ${(error as Error).message}`,
            );
          }
        }
      },
      { 'file.path': this.filePath },
    );
  }

  /**
   * Saves the current locks to the JSON file, creating the directory if it doesn't exist.
   * @private
   * @returns {Promise<void>}
   * @throws {Error} If saving the locks fails.
   */
  private async saveToFile(): Promise<void> {
    return this.executeTraced(
      'saveToFile',
      async () => {
        const directory = path.dirname(this.filePath);

        try {
          // Create the directory if it doesn't exist
          await fs.mkdir(directory, { recursive: true });
        } catch (error) {
          // Ignore the error if the directory already exists
          if ((error as NodeJS.ErrnoException).code !== 'EEXIST') {
            throw new Error(
              `Failed to create directory: ${(error as Error).message}`,
            );
          }
        }

        // Write the locks to the file
        await fs.writeFile(
          this.filePath,
          JSON.stringify(this.locks, null, 2),
          'utf-8',
        );
      },
      {
        'file.path': this.filePath,
        'locks.count': Object.keys(this.locks).length,
      },
    );
  }

  /**
   * Checks if a path is currently locked.
   * @param path - The path to check.
   * @returns True if the path is locked, false otherwise.
   */
  async isLocked(path: string): Promise<boolean> {
    return this.executeTraced(
      'isLocked',
      async () => {
        await this.initialize();
        const lock = this.locks[path];
        return (
          lock !== undefined &&
          !isLockExpired({
            ...lock,
            acquiredAt: new Date(lock.acquiredAt),
            expiresAt: new Date(lock.expiresAt),
          })
        );
      },
      lockingManagerOTelAttributes.isLocked(path),
    );
  }

  /**
   * Attempts to acquire a lock on a given path.
   * @param path - The path to lock.
   * @param [options={}] - Options for acquiring the lock.
   * @returns The result of the lock acquisition attempt.
   */
  async acquireLock(
    path: string,
    options: LockOptions = {},
  ): Promise<LockResult> {
    const {
      timeout = this.defaultLockConfiguration.timeout,
      retries = this.defaultLockConfiguration.retries,
      retryDelay = this.defaultLockConfiguration.retryDelay,
      metadata = {},
    } = options;
    return this.executeTraced(
      'acquireLock',
      async () => {
        await this.initialize();
        for (let attempt = 0; attempt <= retries; attempt++) {
          logToSpan({
            level: 'INFO',
            message: `[LocalJsonLock][acquireLock] -> attempt ${attempt + 1}/${retries + 1}`,
          });
          if (!(await this.isLocked(path))) {
            const lockId = uuidv4();
            const now = new Date();
            const expiresAt = new Date(now.getTime() + timeout);
            this.locks[path] = {
              lockId,
              acquiredAt: now.toISOString(),
              expiresAt: expiresAt.toISOString(),
              metadata,
            };
            await this.saveToFile();

            lockingManagerOTelAttributes.lockAcquiredSuccess(true);

            return {
              success: true,
              lockId: lockId,
              expiresAt: expiresAt,
            };
          }
          if (attempt < retries) {
            await new Promise((resolve) => setTimeout(resolve, retryDelay));
          }
        }
        lockingManagerOTelAttributes.lockAcquiredSuccess(false);
        return {
          success: false,
          error: 'Failed to acquire lock after retries',
        };
      },
      lockingManagerOTelAttributes.acquireLock(path, {
        timeout,
        retries,
        retryDelay,
        metadata,
      }),
    );
  }

  /**
   * Releases a lock on a given path.
   * @param path - The path of the lock to release.
   * @param [lockId] - The ID of the lock to release. If provided, it must match the current lock's ID.
   * @returns True if the lock was successfully released, false otherwise.
   */
  async releaseLock(path: string, lockId?: string): Promise<boolean> {
    return this.executeTraced(
      'releaseLock',
      async () => {
        await this.initialize();
        let result = false;
        if (!this.locks[path]) {
          result = true;
        } else if (lockId && this.locks[path].lockId !== lockId) {
          result = false;
        } else {
          delete this.locks[path];
          await this.saveToFile();
          result = true;
        }
        lockingManagerOTelAttributes.lockReleaseSuccess(result);
        return result;
      },
      lockingManagerOTelAttributes.releaseLock(path, lockId),
    );
  }

  /**
   * Forcibly releases a lock on a given path, regardless of the lock ID.
   * @param path - The path of the lock to forcibly release.
   * @returns True if a lock was present and released, false if no lock was present.
   */
  async forceReleaseLock(path: string): Promise<boolean> {
    return this.executeTraced(
      'forceReleaseLock',
      async () => {
        await this.initialize();
        if (this.locks[path]) {
          delete this.locks[path];
          await this.saveToFile();
        }
        lockingManagerOTelAttributes.lockForceReleaseSuccess(true);
        return true;
      },
      lockingManagerOTelAttributes.forceReleaseLock(path),
    );
  }

  /**
   * Extends the duration of an existing lock.
   * @param path - The path of the lock to extend.
   * @param lockId - The ID of the lock to extend.
   * @param duration - The duration in milliseconds to extend the lock by.
   * @returns True if the lock was successfully extended, false otherwise.
   */
  async extendLock(
    path: string,
    lockId: string,
    duration: number,
  ): Promise<boolean> {
    return this.executeTraced(
      'extendLock',
      async () => {
        await this.initialize();
        let result = false;
        if (!this.locks[path] || this.locks[path].lockId !== lockId) {
          result = false;
        } else {
          const lock = this.locks[path];
          lock.expiresAt = new Date(
            new Date(lock.expiresAt).getTime() + duration,
          ).toISOString();
          await this.saveToFile();
          result = true;
        }
        lockingManagerOTelAttributes.lockExtensionSuccess(result);
        return result;
      },
      lockingManagerOTelAttributes.extendLock(path, lockId, duration),
    );
  }

  /**
   * Retrieves information about a lock on a given path.
   * @param path - The path to get lock information for.
   * @returns The lock information if a valid lock exists, null otherwise.
   */
  async getLockInfo(path: string): Promise<LockInfo | null> {
    return this.executeTraced(
      'getLockInfo',
      async () => {
        await this.initialize();
        const lockData = this.locks[path];
        if (!lockData) {
          return null;
        }
        const lock: LockInfo = {
          ...lockData,
          expiresAt: new Date(lockData.expiresAt),
          acquiredAt: new Date(lockData.acquiredAt),
        };
        if (isLockExpired(lock)) {
          return null;
        }
        return lock;
      },
      lockingManagerOTelAttributes.getLockInfo(path),
    );
  }
}
