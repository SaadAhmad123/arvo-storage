import { z } from 'zod';
import { IStorageManager } from '../types';
import { IAWSResource } from '../../types';
import { IDynamoDBStorage } from './types';
import {
  DynamoDBClient,
  GetItemCommand,
  PutItemCommand,
  DeleteItemCommand,
  QueryCommand,
  GetItemCommandOutput,
  QueryCommandOutput,
} from '@aws-sdk/client-dynamodb';
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb';
import { defaultHashKey, executeDynamoDBCommandWithOTel } from '../../utils/dynamodb';
import { createExecutionTracer, setSpanAttributes } from '../../OpenTelemetry';
import { storageManagerOtelAttributes } from '../utils/otel.attributes';

/**
 * Implements the IStorageManager interface for DynamoDB storage.
 * This class provides methods to interact with a DynamoDB table for CRUD operations.
 *
 * @template TDataSchema - A Zod object schema type representing the structure
 *                         and validation rules for the data to be stored.
 */
export default class DynamoDBStorage<
  TDataSchema extends z.ZodObject<any, any, any>,
> implements IStorageManager<TDataSchema>
{
  private readonly client: DynamoDBClient;
  public readonly tableName: string;
  public readonly schema: TDataSchema;
  public readonly hashKey: string = defaultHashKey;
  
  private executeTraced = createExecutionTracer({
    name: 'DynamoDBStorage',
    attributes: {
      'rpc.system': 'aws-api',
      'rpc.service': 'DynamoDB',
      'db.system': 'dynamodb',
    },
  });

  /**
   * Creates an instance of DynamoDBStorage.
   *
   * @param param - Configuration parameters for DynamoDB storage.
   */
  constructor(param: IAWSResource<IDynamoDBStorage<TDataSchema>>) {
    this.tableName = param.config.tableName;
    this.schema = param.config.schema;
    this.hashKey = param.config.hashKey || this.hashKey;
    this.client = new DynamoDBClient({
      region: param.credentials?.awsRegion ?? 'ap-southeast-2',
      credentials: {
        ...(param.credentials?.awsAccessKey
          ? { accessKeyId: param.credentials?.awsAccessKey }
          : {}),
        ...(param.credentials?.awsSecretKey
          ? { secretAccessKey: param.credentials?.awsSecretKey }
          : {}),
        ...(param.credentials?.awsSessionToken
          ? { sessionToken: param.credentials?.awsSessionToken }
          : {}),
      } as any,
    });
  }

  /**
   * Reads data from the specified path in DynamoDB.
   *
   * @param path - The path (hash key) of the item to read.
   * @param defaultValue - The default value to return if the item is not found.
   * @returns The read and validated data, or the default value if not found.
   * @throws If the retrieved data doesn't conform to the schema.
   * @throws If the read operation fails.
   */
  async read(
    path: string,
    defaultValue: z.infer<TDataSchema> | null,
  ): Promise<z.infer<TDataSchema> | null> {
    return this.executeTraced(
      'read',
      async () => {
        const command = new GetItemCommand({
          TableName: this.tableName,
          Key: marshall({ [this.hashKey]: path }),
        });
  
        const { Item } = await executeDynamoDBCommandWithOTel(
          this.client,
          command
        ) as GetItemCommandOutput;
        setSpanAttributes(storageManagerOtelAttributes.dataFound(Boolean(Item)))
        if (!Item) {
          return defaultValue;
        }
  
        const unmarshalled = unmarshall(Item);
        return this.schema.parse(unmarshalled);
      },
      storageManagerOtelAttributes.read(path)
    )
  }

  /**
   * Writes data to the specified path in DynamoDB.
   *
   * @param data - The data to write.
   * @param path - The path (hash key) where the data should be written.
   * @throws If the data fails schema validation.
   * @throws If the write operation fails.
   */
  async write(data: z.infer<TDataSchema>, path: string): Promise<void> {
    return this.executeTraced(
      'write',
      async () => {
        const validatedData = this.schema.parse(data);
        const item = {
          ...validatedData,
          [this.hashKey]: path,
        };

        const command = new PutItemCommand({
          TableName: this.tableName,
          Item: marshall(item),
        });

        await executeDynamoDBCommandWithOTel(
          this.client,
          command
        )
      },
      storageManagerOtelAttributes.write(path, data)
    )
  }

  /**
   * Deletes an item from DynamoDB at the specified path.
   *
   * @param path - The path (hash key) of the item to delete.
   * @throws If the delete operation fails.
   */
  async delete(path: string): Promise<void> {
    return this.executeTraced(
      'delete', 
      async () => {
        const command = new DeleteItemCommand({
          TableName: this.tableName,
          Key: marshall({ [this.hashKey]: path }),
        });
  
        await executeDynamoDBCommandWithOTel(
          this.client,
          command,
        )
      },
      storageManagerOtelAttributes.delete(path)
    )
  }

  /**
   * Checks if an item exists in DynamoDB at the specified path.
   *
   * @param path - The path (hash key) to check for existence.
   * @returns True if the item exists, false otherwise.
   * @throws If the existence check fails.
   */
  async exists(path: string): Promise<boolean> {
    return this.executeTraced(
      'exists',
      async () => {
        const command = new QueryCommand({
          TableName: this.tableName,
          KeyConditionExpression: '#hashKey = :hashValue',
          ExpressionAttributeNames: {
            '#hashKey': this.hashKey,
          },
          ExpressionAttributeValues: marshall({
            ':hashValue': path,
          }),
          Limit: 1,
        });
  
        const { Count } = await executeDynamoDBCommandWithOTel(
          this.client,
          command
        ) as QueryCommandOutput;
  
        return (Count || 0) > 0;
      },
      storageManagerOtelAttributes.exists(path)
    )
  }
}
