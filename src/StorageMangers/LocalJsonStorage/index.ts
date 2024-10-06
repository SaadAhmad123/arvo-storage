import { z } from 'zod';
import fs from 'fs/promises';
import path from 'path';
import { IStorageManager } from '../types';
import { trace, context, SpanStatusCode } from '@opentelemetry/api';
import {
  ArvoStorageTracer,
  exceptionToSpan,
  setSpanAttributes,
} from '../../OpenTelemetry';
import { storageManagerOtelAttributes } from '../utils/otel.attributes';

/**
 * A storage manager that uses a JSON file as its database.
 * Implements the IStorageManager interface with OpenTelemetry instrumentation.
 *
 * This class provides a simple, file-based storage solution for small to medium-sized
 * datasets. It's suitable for local development, testing, or small-scale applications.
 * The class uses Zod for runtime type checking and OpenTelemetry for observability.
 *
 * @template TDataSchema - A Zod object schema type that defines the structure and validation rules for the stored data.
 *
 * @example
 * ```typescript
 * const userSchema = z.object({
 *   id: z.string().uuid(),
 *   name: z.string().min(1),
 *   email: z.string().email(),
 * });
 *
 * const storage = new LocalJsonStorageManager<typeof userSchema>('./users.json', userSchema);
 *
 * await storage.write({ id: '123', name: 'Alice', email: 'alice@example.com' }, 'users/123');
 * const user = await storage.read('users/123', null);
 * ```
 */
export class LocalJsonStorage<TDataSchema extends z.ZodObject<any, any, any>>
  implements IStorageManager<TDataSchema>
{
  private readonly filePath: string;
  private data: Record<string, unknown> = {};
  public readonly schema: TDataSchema;

  /**
   * Creates a new LocalJsonStorageManager instance.
   *
   * @param filePath - The path to the JSON file to use as storage. If the file doesn't exist, it will be created.
   * @param schema - The Zod schema for validating data. This schema defines the structure and validation rules for the stored data.
   *
   * @throws {Error} If the file path is invalid or inaccessible.
   *
   * @example
   * ```typescript
   * const userSchema = z.object({
   *   id: z.string().uuid(),
   *   name: z.string().min(1),
   *   email: z.string().email(),
   * });
   *
   * const storage = new LocalJsonStorageManager('./users.json', userSchema);
   * ```
   */
  constructor(filePath: string, schema: TDataSchema) {
    this.filePath = path.resolve(filePath);
    this.schema = schema;
  }

  /**
   * Creates a traced execution context for storage operations.
   *
   * This method wraps operations with OpenTelemetry instrumentation, providing
   * observability into the performance and behavior of storage operations.
   *
   * @private
   * @param operation - The name of the operation being traced.
   * @param action - The async function to be executed within the traced context.
   * @param attributes - Additional attributes to be added to the span for more detailed tracing.
   * @returns A promise that resolves with the result of the action.
   * @throws {Error} Rethrows any error that occurs during the operation, after recording it in the span.
   */
  private async executeTraced<T>(
    operation: string,
    action: () => Promise<T>,
    attributes: Record<string, any> = {},
  ): Promise<T> {
    const span = ArvoStorageTracer.startSpan(`LocalJsonStorage.${operation}`, {
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
      exceptionToSpan(error as Error, span);
      throw error;
    } finally {
      span.end();
    }
  }

  /**
   * Initializes the storage by loading the JSON file.
   * If the file doesn't exist, it creates an empty one.
   *
   * @private
   * @throws {Error} If the file cannot be read or parsed.
   */
  private async initialize(): Promise<void> {
    return this.executeTraced(
      'initialize',
      async () => {
        try {
          const fileContent = await fs.readFile(this.filePath, 'utf-8');
          this.data = JSON.parse(fileContent);
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
          JSON.stringify(this.data, null, 2),
          'utf-8',
        );
      },
      { 'file.path': this.filePath },
    );
  }

  /**
   * Writes data to the specified path in the storage.
   *
   * @param data - The data to write. Must conform to the schema specified in the constructor.
   * @param path - The path where the data should be stored.
   * @throws {z.ZodError} If the data fails schema validation.
   * @throws {Error} If the write operation fails.
   *
   * @example
   * ```typescript
   * await storage.write({ id: '123', name: 'Alice', email: 'alice@example.com' }, 'users/123');
   * ```
   */
  async write(data: z.infer<TDataSchema>, path: string): Promise<void> {
    return this.executeTraced(
      'write',
      async () => {
        await this.initialize();
        const validated = this.schema.parse(data);
        this.data[path] = validated;
        await this.saveToFile();
      },
      storageManagerOtelAttributes.write(path, data),
    );
  }

  /**
   * Reads data from the specified path in the storage.
   *
   * @param path - The path from which to read the data.
   * @param defaultValue - The value to return if no data is found at the specified path.
   * @returns The data stored at the specified path, or the default value if no data is found.
   * @throws {z.ZodError} If the stored data fails schema validation.
   * @throws {Error} If the read operation fails.
   *
   * @example
   * ```typescript
   * const user = await storage.read('users/123', null);
   * if (user) {
   *   console.log(user.name);
   * }
   * ```
   */
  async read(
    path: string,
    defaultValue: z.infer<TDataSchema> | null,
  ): Promise<z.infer<TDataSchema> | null> {
    return this.executeTraced(
      'read',
      async () => {
        await this.initialize();
        const storedData = this.data[path];
        setSpanAttributes({ 'data.found': Boolean(storedData) });
        if (storedData === undefined) {
          return defaultValue;
        }
        return this.schema.parse(storedData);
      },
      storageManagerOtelAttributes.read(path)
    );
  }

  /**
   * Lists keys in the storage with pagination support.
   *
   * @param start - The starting index for pagination (0-based).
   * @param count - The number of keys to retrieve.
   * @returns An array of keys (paths) in the storage.
   * @throws {Error} If the list operation fails.
   *
   * @example
   * ```typescript
   * const keys = await storage.list(0, 10); // Get the first 10 keys
   * ```
   */
  async list(start: number, count: number): Promise<string[]> {
    return this.executeTraced(
      'list',
      async () => {
        await this.initialize();
        const keys = Object.keys(this.data);
        const result = keys.slice(start, start + count);
        setSpanAttributes({
          'data.key.list.fetch.count': result.length,
        });
        return result;
      },
      storageManagerOtelAttributes.list(start, count)
    );
  }

  /**
   * Counts the total number of items in the storage.
   *
   * @returns The total number of items stored.
   * @throws {Error} If the count operation fails.
   *
   * @example
   * ```typescript
   * const totalItems = await storage.count();
   * console.log(`Total items: ${totalItems}`);
   * ```
   */
  async count(): Promise<number> {
    return this.executeTraced('count', async () => {
      await this.initialize();
      return Object.keys(this.data).length;
    });
  }

  /**
   * Deletes data at the specified path from the storage.
   *
   * @param path - The path of the data to delete.
   * @throws {Error} If the delete operation fails.
   *
   * @example
   * ```typescript
   * await storage.delete('users/123');
   * ```
   */
  async delete(path: string): Promise<void> {
    return this.executeTraced(
      'delete',
      async () => {
        await this.initialize();
        if (this.data[path]) {
          delete this.data[path];
          await this.saveToFile();
        }
      },
      storageManagerOtelAttributes.delete(path)
    );
  }

  /**
   * Checks if data exists at the specified path in the storage.
   *
   * @param path - The path to check for existence.
   * @returns True if data exists at the specified path, false otherwise.
   * @throws {Error} If the existence check fails.
   *
   * @example
   * ```typescript
   * const exists = await storage.exists('users/123');
   * if (exists) {
   *   console.log('User exists');
   * }
   * ```
   */
  async exists(path: string): Promise<boolean> {
    return this.executeTraced(
      'exists',
      async () => {
        await this.initialize();
        return path in this.data;
      },
      storageManagerOtelAttributes.exists(path)
    );
  }
}
