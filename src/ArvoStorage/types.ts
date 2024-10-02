import { z } from 'zod';
import { IStorageManager } from '../StorageMangers/types';
import { ILockingManager } from '../LockingManagers/types';

/**
 * Interface defining the configuration structure for ArvoStorage instances.
 *
 * ArvoStorage is a type-safe data storage class that combines schema validation,
 * storage management, and optional locking mechanisms for concurrent access control.
 * This interface defines the required and optional components needed to create
 * an ArvoStorage instance.
 *
 * @typeParam TDataSchema - A Zod object schema type that defines and validates
 *                          the structure of the data to be stored. Must be a
 *                          Zod object schema, not a primitive or array schema.
 *
 * @example
 * ```typescript
 * // Define a schema for user data
 * const userSchema = z.object({
 *   id: z.string().uuid(),
 *   name: z.string().min(1),
 *   email: z.string().email(),
 *   metadata: z.object({
 *     createdAt: z.date(),
 *     lastModified: z.date()
 *   }).optional()
 * });
 *
 * // Create storage and locking managers
 * const storageManager = new FileSystemStorageManager<typeof userSchema>();
 * const lockingManager = new RedisLockManager();
 *
 * // Configure ArvoStorage
 * const userStorageConfig: IArvoStorage<typeof userSchema> = {
 *   schema: userSchema,
 *   storageManager,
 *   lockingManager // Optional, but recommended for concurrent environments
 * };
 *
 * // Create ArvoStorage instance
 * const userStorage = new ArvoStorage(userStorageConfig);
 * ```
 */
export interface IArvoStorage<TDataSchema extends z.ZodObject<any, any, any>> {
  /**
   * The Zod object schema that defines and validates the data structure.
   *
   * This schema is used to:
   * 1. Validate data before storage operations
   * 2. Provide TypeScript type inference for stored data
   * 3. Ensure data consistency across storage operations
   *
   * @remarks
   * The schema must be a Zod object schema. Primitive schemas (string, number, etc.)
   * or array schemas are not supported directly. Wrap them in an object if needed.
   *
   * @example
   * ```typescript
   * const schema = z.object({
   *   id: z.string(),
   *   values: z.array(z.number()), // Array within an object is fine
   *   metadata: z.object({
   *     tags: z.array(z.string())
   *   }).optional()
   * });
   * ```
   */
  schema: TDataSchema;

  /**
   * The storage manager instance responsible for actual data persistence.
   *
   * This component handles the underlying storage operations (read, write, delete, etc.)
   * and must comply with the IStorageManager interface. The storage manager must
   * use the same schema type as defined in the ArvoStorage configuration.
   *
   * @example
   * ```typescript
   * class MyStorageManager implements IStorageManager<typeof mySchema> {
   *   schema = mySchema;
   *
   *   async write(data: z.infer<typeof mySchema>, path: string) {
   *     // Implementation
   *   }
   *
   *   async read(path: string, defaultValue: z.infer<typeof mySchema> | null) {
   *     // Implementation
   *   }
   *
   *   // ... other required method implementations
   * }
   * ```
   */
  storageManager: IStorageManager<TDataSchema>;

  /**
   * Optional locking manager for handling concurrent access to stored data.
   *
   * When provided, the locking manager ensures safe concurrent operations by:
   * 1. Preventing simultaneous writes to the same data
   * 2. Ensuring read consistency during updates
   * 3. Preventing race conditions in multi-user or multi-process environments
   *
   * @remarks
   * While optional, using a locking manager is highly recommended in any environment
   * where concurrent access to data is possible (e.g., web servers, distributed systems).
   *
   * @example
   * ```typescript
   * class MyLockManager implements ILockingManager {
   *   async acquireLock(path: string): Promise<boolean> {
   *     // Implementation
   *   }
   *
   *   async releaseLock(path: string): Promise<boolean> {
   *     // Implementation
   *   }
   *
   *   // ... other required method implementations
   * }
   * ```
   */
  lockingManager?: ILockingManager;
}

/**
 * Type alias for the inferred data type from an ArvoStorage instance.
 *
 * @typeParam T - The ArvoStorage interface type
 *
 * @example
 * ```typescript
 * const userStorageConfig: IArvoStorage<typeof userSchema> = {
 *   schema: userSchema,
 *   storageManager: new FileSystemStorageManager()
 * };
 *
 * // Infer the data type
 * type UserData = ArvoStorageData<typeof userStorageConfig>;
 * // UserData is now equivalent to z.infer<typeof userSchema>
 * ```
 */
export type ArvoStorageData<T extends IArvoStorage<any>> = z.infer<T['schema']>;
