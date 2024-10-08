import { z } from 'zod';

/**
 * Interface for DynamoDB storage configuration.
 * This interface defines the structure for configuring a DynamoDB storage instance.
 *
 * @template TDataSchema - A Zod object schema type representing the structure
 *                         and validation rules for the data to be stored.
 *                         Defaults to a generic Zod object schema if not specified.
 */
export interface IDynamoDBStorage<
  TDataSchema extends z.ZodObject<any, any, any> = z.ZodObject<any, any, any>,
> {
  /**
   * The Zod schema used for validating data in this storage.
   * This schema defines the structure and validation rules for the data
   * that will be stored in the DynamoDB table.
   */
  schema: TDataSchema;

  /**
   * The name of the DynamoDB table where data will be stored.
   * This should be a valid DynamoDB table name that exists in your AWS account.
   */
  tableName: string;

  /**
   * The name of the hash key (partition key) for the DynamoDB table.
   * This is optional and defaults to a predefined value if not specified.
   * The hash key is used as the primary key for items in the table.
   *
   * @default "path_key"
   */
  hashKey?: string;
}
