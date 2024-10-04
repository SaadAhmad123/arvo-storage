import fs from 'fs/promises';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { ILockingManager, LockOptions, LockResult, LockInfo } from '../types';
import { trace, context, SpanStatusCode } from '@opentelemetry/api';
import { ArvoStorageTracer, logToSpan } from '../../OpenTelemetry';
import { isLockExpired, setSpanLockAcquiredStatus } from '../utils';
import { lockingManagerOTelAttributes } from '../utils/otel.attributes';

/**
 * Implements a file-based locking mechanism using JSON for persistence.
 * This class provides methods for acquiring, releasing, and managing locks
 * with OpenTelemetry instrumentation for observability.
 * @implements {ILockingManager}
 */
export class LocalJsonLock implements ILockingManager {
  private readonly filePath: string;
  private locks: Record<
    string,
    Omit<LockInfo, 'acquiredAt' | 'expiresAt'> & {
      acquiredAt: string;
      expiresAt: string;
    }
  > = {};

  /**
   * Creates an instance of LocalJsonLock.
   * @param {string} filePath - The path to the JSON file used for lock persistence.
   */
  constructor(filePath: string) {
    this.filePath = path.resolve(filePath);
  }

  /**
   * Executes a function with OpenTelemetry tracing.
   * @private
   * @template T
   * @param operation - The name of the operation being traced.
   * @param action - The async function to be executed within the traced context.
   * @param [attributes={}] - Additional attributes to be added to the span.
   * @returns  The result of the executed action.
   * @throws {Error} Rethrows any error that occurs during the operation, after recording it in the span.
   */
  private async executeTraced<T>(
    operation: string,
    action: () => Promise<T>,
    attributes: Record<string, any> = {},
  ): Promise<T> {
    const span = ArvoStorageTracer.startSpan(`LocalJsonLock.${operation}`, {
      attributes,
    });

    try {
      const result = await context.with(
        trace.setSpan(context.active(), span),
        action,
      );
      span.setStatus({ code: SpanStatusCode.OK });
      return result;
    } catch (error) {
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: (error as Error).message,
      });
      span.recordException(error as Error);
      throw error;
    } finally {
      span.end();
    }
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
      timeout = 30000,
      retries = 1,
      retryDelay = 1000,
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

            setSpanLockAcquiredStatus(true);

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
        setSpanLockAcquiredStatus(false);
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
        if (!this.locks[path]) {
          return true;
        }
        if (lockId && this.locks[path].lockId !== lockId) {
          return false;
        }
        delete this.locks[path];
        await this.saveToFile();
        return true;
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
        if (!this.locks[path] || this.locks[path].lockId !== lockId) {
          return false;
        }
        const lock = this.locks[path];
        lock.expiresAt = new Date(
          new Date(lock.expiresAt).getTime() + duration,
        ).toISOString();
        await this.saveToFile();
        return true;
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
