import { DynamoDBClient, PutItemCommand, GetItemCommand, DeleteItemCommand, UpdateItemCommand } from "@aws-sdk/client-dynamodb";
import { marshall, unmarshall } from "@aws-sdk/util-dynamodb";
import { v4 as uuidv4 } from 'uuid';
import {
  ILockingManager,
  LockOptions,
  LockResult,
  LockInfo
} from '../types';
import { AWSCredentials } from '../../types';
import { trace, context, SpanStatusCode } from '@opentelemetry/api';
import { ArvoStorageTracer, logToSpan } from '../../OpenTelemetry';
import { dateToUnixTimestampInSeconds, delay, unixTimestampInSecondsToDate } from "../../utils";
import { isLockExpired } from "../utils";

/**
 * Implements a distributed locking mechanism using AWS DynamoDB with OpenTelemetry instrumentation.
 * This class provides methods for acquiring, releasing, and managing locks
 * with DynamoDB as the backend storage.
 * @implements {ILockingManager}
 */
export class DynamoDBLock implements ILockingManager {
  private readonly client: DynamoDBClient;

  /**
   * Creates an instance of DynamoDBLock.
   * @param tableName - The name of the DynamoDB table used for lock storage.
   * @param credentials - AWS credentials and configuration. If not provided, defaults to environment variables or IAM roles.
   * @param [primaryKey='path_key'] - The name of the primary key column in the DynamoDB table.
   */
  constructor(
    public readonly tableName: string,
    private readonly credentials: AWSCredentials,
    public readonly primaryKey: string = 'path_key',
  ) {
    this.client = new DynamoDBClient({
      region: credentials.awsRegion ?? 'ap-southeast-2',
      credentials: {
        ...(credentials.awsAccessKey ? { accessKeyId: credentials.awsAccessKey } : {}),
        ...(credentials.awsSecretKey ? { secretAccessKey: credentials.awsSecretKey } : {}),
        ...(credentials.awsSessionToken ? { sessionToken: credentials.awsSessionToken } : {}),
      } as any
    });
    this.tableName = tableName;
  }

  /**
   * Executes a function with OpenTelemetry tracing.
   * @private
   * @template T
   * @param operation - The name of the operation being traced.
   * @param action - The async function to be executed within the traced context.
   * @param [attributes={}] - Additional attributes to be added to the span.
   * @returns The result of the executed action.
   * @throws {Error} Rethrows any error that occurs during the operation, after recording it in the span.
   */
  private async executeTraced<T>(
    operation: string,
    action: () => Promise<T>,
    attributes: Record<string, any> = {},
  ): Promise<T> {
    const span = ArvoStorageTracer.startSpan(`DynamoDBLockManager.${operation}`, {
      attributes: { ...attributes, 'db.type': 'dynamodb', 'db.name': this.tableName },
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
   * Attempts to acquire a lock on the specified path.
   * @param {string} path - The path to acquire a lock on.
   * @param {LockOptions} [options={}] - Options for acquiring the lock.
   * @returns {Promise<LockResult>} A promise resolving to the result of the lock acquisition attempt.
   */
  async acquireLock(path: string, options: LockOptions = {}): Promise<LockResult> {
    return this.executeTraced('acquireLock', async () => {
      const {
        timeout = 30000,
        retries = 2,
        retryDelay = 1000,
        metadata = {}
      } = options;

      for (let attempt = 0; attempt <= retries; attempt++) {
        logToSpan({
          level: 'INFO',
          message: `[DynamoDBLockManager][acquireLock] -> attempt ${attempt + 1}/${retries + 1}`
        });

        const result = await this.tryAcquireLock(path, timeout, metadata);
        if (result.success) {
          return result;
        }

        if (attempt < retries) {
          await delay(retryDelay);
        }
      }

      return { success: false, error: 'Failed to acquire lock after retries' };
    }, { path, ...options });
  }

  private async tryAcquireLock(path: string, timeout: number, metadata: Record<string, any>): Promise<LockResult> {
    if (await this.getLockInfo(path)) {
      return { success: false };
    }

    const lockId = uuidv4();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + timeout);

    try {
      await this.putLockItem(path, lockId, now, expiresAt, metadata);
      return { success: true, lockId, expiresAt };
    } catch (error) {
      if (this.isConditionalCheckFailedException(error)) {
        return { success: false };
      }
      throw error;
    }
  }

  private async putLockItem(path: string, lockId: string, acquiredAt: Date, expiresAt: Date, metadata: Record<string, any>): Promise<void> {
    await this.client.send(new PutItemCommand({
      TableName: this.tableName,
      Item: marshall({
        [this.primaryKey]: path,
        lockId,
        acquiredAt: dateToUnixTimestampInSeconds(acquiredAt),
        expiresAt: dateToUnixTimestampInSeconds(expiresAt),
        metadata
      }),
      ConditionExpression: `attribute_not_exists(${this.primaryKey})`
    }));
  }

  private isConditionalCheckFailedException(error: any): boolean {
    return error.name === 'ConditionalCheckFailedException';
  }

  /**
   * Releases a lock on the specified path.
   * @param {string} path - The path of the lock to release.
   * @param {string} [lockId] - Optional lock ID to ensure only the correct lock is released.
   * @returns {Promise<boolean>} A promise resolving to true if the lock was successfully released, false otherwise.
   */
  async releaseLock(path: string, lockId?: string): Promise<boolean> {
    return this.executeTraced('releaseLock', async () => {
      const params: any = {
        TableName: this.tableName,
        Key: marshall({ [this.primaryKey]: path }),
      };

      if (lockId) {
        params.ConditionExpression = 'lockId = :lockId';
        params.ExpressionAttributeValues = marshall({ ':lockId': lockId });
      }

      try {
        await this.client.send(new DeleteItemCommand(params));
        return true;
      } catch (error) {
        if ((error as any).name === 'ConditionalCheckFailedException') {
          return false;
        }
        throw error;
      }
    }, { path, lock_id: lockId });
  }

  /**
   * Forcibly releases a lock on the specified path, regardless of the lock ID.
   * @param {string} path - The path of the lock to forcibly release.
   * @returns {Promise<boolean>} A promise resolving to true if a lock was present and released.
   */
  async forceReleaseLock(path: string): Promise<boolean> {
    return this.executeTraced('forceReleaseLock', async () => {
      await this.client.send(new DeleteItemCommand({
        TableName: this.tableName,
        Key: marshall({ [this.primaryKey]: path })
      }));
      return true;
    }, { path });
  }

  /**
   * Extends the duration of an existing lock.
   * @param {string} path - The path of the lock to extend.
   * @param {string} lockId - The ID of the lock to extend.
   * @param {number} duration - The additional time in milliseconds to extend the lock by.
   * @returns {Promise<boolean>} A promise resolving to true if the lock was successfully extended, false otherwise.
   */
  async extendLock(path: string, lockId: string, duration: number): Promise<boolean> {
    return this.executeTraced('extendLock', async () => {
      // First, get the existing lock info
      const existingLock = await this.getLockInfo(path);

      // If the lock doesn't exist or doesn't match the provided lockId or lock has expired, return false
      if (!existingLock || existingLock.lockId !== lockId || isLockExpired(existingLock)) {
        return false;
      }

      const newExpiresAt = new Date(existingLock.expiresAt.getTime() + duration);

      try {
        await this.client.send(new UpdateItemCommand({
          TableName: this.tableName,
          Key: marshall({ [this.primaryKey]: path }),
          UpdateExpression: 'SET expiresAt = :newExpiresAt',
          ConditionExpression: 'lockId = :lockId AND expiresAt = :currentExpiresAt',
          ExpressionAttributeValues: marshall({
            ':newExpiresAt': dateToUnixTimestampInSeconds(newExpiresAt),
            ':lockId': lockId,
            ':currentExpiresAt': dateToUnixTimestampInSeconds(existingLock.expiresAt)
          })
        }));
        return true;
      } catch (error) {
        if ((error as any).name === 'ConditionalCheckFailedException') {
          // The lock was modified or released between our check and update
          return false;
        }
        throw error;
      }
    }, { path, lockId, duration });
  }

  /**
   * Retrieves information about a lock on a given path.
   * If an expired lock is found, it will be forcibly deleted and null will be returned.
   * 
   * @param {string} path - The path to get lock information for.
   * @returns {Promise<LockInfo | null>} A promise resolving to the lock information if a valid lock exists, null otherwise.
   */
  async getLockInfo(path: string): Promise<LockInfo | null> {
    return this.executeTraced('getLockInfo', async () => {
      const result = await this.client.send(new GetItemCommand({
        TableName: this.tableName,
        Key: marshall({ [this.primaryKey]: path })
      }));

      if (!result.Item) {
        return null;
      }

      const data = unmarshall(result.Item);
      const item: LockInfo = {
        lockId: data["lockId"],
        acquiredAt: unixTimestampInSecondsToDate(data["acquiredAt"]),
        expiresAt: unixTimestampInSecondsToDate(data["expiresAt"]),
        metadata: data["metadata"]
      }

      if (isLockExpired(item)) {
        // Lock has expired, delete it and return null
        await this.forceReleaseLock(path);
        return null;
      }

      return item;
    }, { path });
  }

  /**
   * Checks if a path is currently locked.
   * @param {string} path - The path to check for a lock.
   * @returns {Promise<boolean>} A promise resolving to true if the path is locked, false otherwise.
   */
  async isLocked(path: string): Promise<boolean> {
    return this.executeTraced('isLocked', async () => {
      const lockInfo = await this.getLockInfo(path);
      return lockInfo !== null;
    }, { path });
  }
}