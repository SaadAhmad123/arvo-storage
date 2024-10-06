import { z } from 'zod';

/**
 * Interface for managing storage operations with strongly typed object schemas.
 *
 * This interface provides a type-safe abstraction for basic storage operations
 * including writing, reading, deleting, listing, counting, and existence checks
 * of data in a storage medium. It uses a generic type parameter constrained to
 * Zod object schemas to ensure type safety and validation of the stored data.
 *
 * @typeParam TDataSchema - A Zod object schema type representing the structure
 *                          and validation rules for the data to be stored.
 *                          Must be a Zod object schema, not a primitive or array schema.
 *
 * @example
 * ```typescript
 * // Define a schema for user data
 * const userSchema = z.object({
 *   id: z.string().uuid(),
 *   name: z.string().min(1),
 *   age: z.number().int().min(0),
 *   email: z.string().email().optional()
 * });
 *
 * // Create a type-safe storage manager for user data
 * class UserStorageManager implements IStorageManager<typeof userSchema> {
 *   schema = userSchema;
 *
 *   async write(data: z.infer<typeof userSchema>, path: string) {
 *     const validated = this.schema.parse(data); // Ensures type safety
 *     // Implementation details...
 *   }
 *
 *   // ... implement other methods
 * }
 *
 * // Usage
 * const storage = new UserStorageManager();
 * await storage.write({
 *   id: '123e4567-e89b-12d3-a456-426614174000',
 *   name: 'John Doe',
 *   age: 30
 * }, 'users/123');
 * ```
 */
export interface IStorageManager<
  TDataSchema extends z.ZodObject<any, any, any>,
> {
  /**
   * The Zod schema used for validating data in this storage manager.
   * This must be an object schema, not a primitive or array schema.
   */
  schema: TDataSchema;

  /**
   * Writes data to a specified storage path.
   *
   * @param data - The data to write, which must conform to the specified schema.
   *               The data will be validated against the schema before writing.
   * @param path - The target path for storing the data. This should be a unique
   *               identifier within the storage system.
   * @returns A promise that resolves once the write operation is complete.
   * @throws {z.ZodError} If the data fails schema validation.
   * @throws {Error} If the write operation fails for any other reason.
   *
   * @example
   * ```typescript
   * try {
   *   await userStorage.write({
   *     id: '123',
   *     name: 'John Doe',
   *     age: 30
   *   }, 'users/123');
   * } catch (error) {
   *   if (error instanceof z.ZodError) {
   *     console.error('Validation failed:', error.errors);
   *   } else {
   *     console.error('Write failed:', error);
   *   }
   * }
   * ```
   */
  write(data: z.infer<TDataSchema>, path: string): Promise<void>;

  /**
   * Reads data from a specified storage path.
   *
   * @param path - The path from which to read the data.
   * @param defaultValue - The default value to return if the data is not found.
   *                       Must be either a valid data object conforming to the schema or null.
   * @returns A promise resolving to the read data (validated against the schema) or the provided default value.
   * @throws {z.ZodError} If the retrieved data doesn't conform to the schema.
   * @throws {Error} If the read operation fails for any other reason.
   *
   * @example
   * ```typescript
   * try {
   *   const user = await userStorage.read('users/123', null);
   *   if (user) {
   *     console.log(`Found user: ${user.name}, age ${user.age}`);
   *   } else {
   *     console.log('User not found');
   *   }
   * } catch (error) {
   *   if (error instanceof z.ZodError) {
   *     console.error('Data validation failed:', error.errors);
   *   } else {
   *     console.error('Read failed:', error);
   *   }
   * }
   * ```
   */
  read(
    path: string,
    defaultValue: z.infer<TDataSchema> | null,
  ): Promise<z.infer<TDataSchema> | null>;

  /**
   * Deletes data from a specified storage path.
   *
   * @param path - The path from which to delete the data.
   * @returns A promise that resolves once the delete operation is complete.
   * @throws {Error} If the delete operation fails.
   *
   * @example
   * ```typescript
   * try {
   *   await userStorage.delete('users/123');
   *   console.log('User deleted successfully');
   * } catch (error) {
   *   console.error('Failed to delete user:', error);
   * }
   * ```
   */
  delete(path: string): Promise<void>;

  /**
   * Checks the existence of data at a specified storage path.
   *
   * @param path - The path to check for data existence.
   * @returns A promise resolving to a boolean indicating if the data exists.
   * @throws {Error} If the existence check fails.
   *
   * @example
   * ```typescript
   * try {
   *   if (await userStorage.exists('users/123')) {
   *     console.log('User exists');
   *   } else {
   *     console.log('User not found');
   *   }
   * } catch (error) {
   *   console.error('Failed to check user existence:', error);
   * }
   * ```
   */
  exists(path: string): Promise<boolean>;
}
