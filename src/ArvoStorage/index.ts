import { ArvoStorageTracer, exceptionToSpan } from '../OpenTelemetry';
import {
  SpanStatusCode,
  Span,
  AttributeValue,
  context,
  trace,
} from '@opentelemetry/api';
import { z } from 'zod';
import { IArvoStorage } from './types';
import { IStorageManager } from '../StorageMangers/types';
import { ILockingManager, LockResult } from '../LockingManagers/types';

/**
 * Custom error class for ArvoStorage-specific errors
 */
export class ArvoStorageError extends Error {
  constructor(
    message: string,
    public readonly cause?: Error,
  ) {
    super(message);
    this.name = 'ArvoStorageError';
  }
}

/**
 * ArvoStorage class provides a high-level interface for storage operations with built-in
 * schema validation, locking mechanisms, and OpenTelemetry tracing.
 *
 * Features:
 * - Type-safe data storage and retrieval
 * - Schema validation using Zod
 * - Optional locking mechanism for concurrent access
 * - Comprehensive OpenTelemetry tracing
 * - Batch operations support
 *
 * @template TDataSchema - A Zod object schema type representing the structure of the data to be stored.
 *
 * @example
 * ```typescript
 * const userSchema = z.object({
 *   id: z.string().uuid(),
 *   name: z.string(),
 *   email: z.string().email()
 * });
 *
 * const storage = new ArvoStorage({
 *   schema: userSchema,
 *   storageManager: new FileStorageManager(),
 *   lockingManager: new RedisLockManager()
 * });
 *
 * await storage.write({
 *   id: '123e4567-e89b-12d3-a456-426614174000',
 *   name: 'John Doe',
 *   email: 'john@example.com'
 * }, 'users/123');
 * ```
 */
export default class ArvoStorage<
  TDataSchema extends z.ZodObject<any, any, any>,
> {
  /**
   * The Zod schema used for data validation.
   */
  public readonly schema: TDataSchema;

  /**
   * The storage manager responsible for data persistence operations.
   */
  public readonly storageManager: IStorageManager<TDataSchema>;

  /**
   * The optional locking manager for concurrency control.
   */
  public readonly lockingManager: ILockingManager | null;

  /**
   * Creates an instance of ArvoStorage.
   *
   * @param params - Configuration parameters for ArvoStorage.
   * @throws {ArvoStorageError} If the schema or storage manager are invalid
   */
  constructor(params: IArvoStorage<TDataSchema>) {
    this.schema = params.schema;
    this.storageManager = params.storageManager;
    this.lockingManager = params.lockingManager ?? null;

    if (!this.schema || typeof this.schema.parse !== 'function') {
      throw new ArvoStorageError('Invalid schema provided to ArvoStorage');
    }

    if (!this.storageManager) {
      throw new ArvoStorageError('Storage manager is required');
    }
  }

  /**
   * Creates a traced execution context for ArvoStorage operations.
   *
   * @private
   */
  private async executeTraced<T>(
    operation: string,
    path: string,
    action: (span: Span) => Promise<T>,
    additionalAttributes: Record<string, AttributeValue | undefined> = {},
  ): Promise<T> {
    const span = ArvoStorageTracer.startSpan(`ArvoStorage.${operation}`, {
      attributes: {
        'arvo.storage.path': path,
        ...additionalAttributes,
      },
    });

    try {
      const result = await context.with(
        trace.setSpan(context.active(), span),
        () => action(span),
      );
      span.setAttributes({
        [`arvo.storage.${operation}.success`]: true,
      });
      span.setStatus({ code: SpanStatusCode.OK });
      return result;
    } catch (e) {
      const error = e as Error;
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: error.message,
      });
      span.setAttributes({
        [`arvo.storage.${operation}.success`]: false,
      });
      exceptionToSpan(error, span);
      throw new ArvoStorageError(`Operation ${operation} failed`, error);
    } finally {
      span.end();
    }
  }

  /**
   * Reads data from the specified path.
   *
   * @param path - The path to read data from.
   * @param defaultValue - The default value to return if no data is found.
   * @returns A promise that resolves to the read data or the default value.
   * @throws {ArvoStorageError} If the read operation fails
   *
   * @example
   * ```typescript
   * const user = await storage.read('users/123', null);
   * if (user) {
   *   console.log(user.name); // Type-safe access
   * }
   * ```
   */
  async read(
    path: string,
    defaultValue: z.infer<TDataSchema> | null = null,
  ): Promise<z.infer<TDataSchema> | null> {
    return this.executeTraced('read', path, async () => {
      const result = await this.storageManager.read(path, defaultValue);
      return result !== null ? this.schema.parse(result) : result;
    });
  }

  /**
   * Writes data to the specified path.
   *
   * @param data - The data to write, conforming to the specified schema.
   * @param path - The path to write the data to.
   * @returns A promise that resolves when the write operation is complete.
   * @throws {ArvoStorageError} If the write operation fails or data validation fails
   */
  async write(data: z.infer<TDataSchema>, path: string): Promise<void> {
    return this.executeTraced(
      'write',
      path,
      async () => {
        const dataToWrite = this.schema.parse(data);
        await this.storageManager.write(dataToWrite, path);
      },
      {
        'arvo.storage.data_length': JSON.stringify(data).length,
      },
    );
  }

  /**
   * Performs batch write operations.
   *
   * @param items - Array of items to write, each containing data and path
   * @returns Promise resolving to an array of results, each indicating success or failure
   */
  async batchWrite(
    items: Array<{ data: z.infer<TDataSchema>; path: string }>,
  ): Promise<
    Array<{
      path: string;
      success: boolean;
      error?: Error;
    }>
  > {
    return this.executeTraced('batchWrite', 'multiple', async (span) => {
      span.setAttributes({
        'arvo.storage.batch.count': items.length,
      });

      const results = await Promise.all(
        items.map(async ({ data, path }) => {
          try {
            await this.write(data, path);
            return { path, success: true };
          } catch (error) {
            return { path, success: false, error: error as Error };
          }
        }),
      );

      const successCount = results.filter((r) => r.success).length;
      span.setAttributes({
        'arvo.storage.batch.success_count': successCount,
        'arvo.storage.batch.failure_count': items.length - successCount,
      });

      return results;
    });
  }

  /**
   * Deletes data from the specified path.
   *
   * @param path - The path from which to delete data.
   * @returns A promise that resolves when the delete operation is complete.
   * @throws {ArvoStorageError} If the delete operation fails
   */
  async delete(path: string): Promise<void> {
    return this.executeTraced('delete', path, async () => {
      await this.storageManager.delete(path);
    });
  }

  /**
   * Checks for the existence of data at the specified path.
   *
   * @param path - The path to check for data existence.
   * @returns A promise resolving to a boolean indicating if the data exists.
   * @throws {ArvoStorageError} If the existence check fails
   */
  async exists(path: string): Promise<boolean> {
    return this.executeTraced('exists', path, async () => {
      return await this.storageManager.exists(path);
    });
  }

  /**
   * Attempts to acquire a lock on the specified path.
   *
   * @param path - The path to acquire a lock on.
   * @returns A promise resolving to true if the lock is acquired, false otherwise.
   * @throws {ArvoStorageError} If locking manager is not available or lock acquisition fails
   */
  async acquireLock(path: string): Promise<LockResult> {
    this.ensureLockingManager('acquireLock');
    return this.executeTraced('acquireLock', path, async () => {
      return await this.lockingManager!.acquireLock(path);
    });
  }

  /**
   * Releases a lock on the specified path.
   *
   * @param path - The path to release the lock from.
   * @returns A promise resolving to true if the lock is released successfully, false otherwise.
   * @throws {ArvoStorageError} If locking manager is not available or lock release fails
   */
  async releaseLock(path: string): Promise<boolean> {
    this.ensureLockingManager('releaseLock');
    return this.executeTraced('releaseLock', path, async () => {
      return await this.lockingManager!.releaseLock(path);
    });
  }

  /**
   * Checks if a lock is currently held on the specified path.
   *
   * @param path - The path to check for a lock.
   * @returns A promise resolving to a boolean indicating if the path is locked.
   * @throws {ArvoStorageError} If locking manager is not available or check fails
   */
  async isLocked(path: string): Promise<boolean> {
    this.ensureLockingManager('isLocked');
    return this.executeTraced('isLocked', path, async (span) => {
      const result = await this.lockingManager!.isLocked(path);
      span.setAttributes({
        'arvo.storage.lock.status': result ? 'locked' : 'unlocked',
      });
      return result;
    });
  }

  /**
   * Ensures that the locking manager is available.
   *
   * @private
   * @throws {ArvoStorageError} If locking manager is not available
   */
  private ensureLockingManager(operation: string): void {
    if (!this.lockingManager) {
      throw new ArvoStorageError(
        `Cannot perform ${operation}: No locking manager is configured`,
      );
    }
  }
}
