import { z } from "zod";

/**
 * Interface for managing storage operations.
 *
 * This interface abstracts the basic functionalities for storage operations
 * including writing, reading, deleting, and existence checks of data in a storage medium.
 * It uses a generic type parameter to ensure type safety of the stored data.
 *
 * @typeParam TDataSchema - A Zod schema type representing the structure of the data to be stored.
 */
export interface IStorageManager<TDataSchema extends z.ZodTypeAny> {
  /**
   * Writes data to a specified storage path.
   *
   * @param data - The data to write, conforming to the specified schema.
   * @param path - The target path for storing the data.
   * @returns A promise that resolves once the write operation is complete.
   */
  write(data: z.infer<TDataSchema>, path: string): Promise<void>;

  /**
   * Reads data from a specified storage path.
   *
   * @param path - The path from which to read the data.
   * @param defaultValue - The default value to return if the data is not found.
   * @returns A promise resolving to the read data or the provided default value.
   */
  read(
    path: string,
    defaultValue: z.infer<TDataSchema> | null
  ): Promise<z.infer<TDataSchema> | null>;

  /**
   * Deletes data from a specified storage path.
   *
   * @param path - The path from which to delete the data.
   * @returns A promise that resolves once the delete operation is complete.
   */
  delete(path: string): Promise<void>;

  /**
   * List the keys in stored in the storage system or the data base
   */
  list(start: number, count: number): Promise<string[]>

  /**
   * Returns the total count of all the keys stored in the storage system or the data base
   */
  count(): Promise<number>

  /**
   * Checks the existence of data at a specified storage path.
   *
   * @param path - The path to check for data existence.
   * @returns A promise resolving to a boolean indicating if the data exists.
   */
  exists(path: string): Promise<boolean>;
}