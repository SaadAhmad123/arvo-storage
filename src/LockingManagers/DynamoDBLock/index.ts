import {
  DynamoDBClient,
  PutItemCommand,
  GetItemCommand,
  DeleteItemCommand,
  UpdateItemCommand,
  GetItemCommandOutput,
} from '@aws-sdk/client-dynamodb';
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb';
import { v4 as uuidv4 } from 'uuid';
import { ILockingManager, LockOptions, LockResult, LockInfo } from '../types';
import { IAWSResource } from '../../types';
import {
  createExecutionTracer,
  logToSpan,
  setSpanAttributes,
} from '../../OpenTelemetry';
import {
  dateToUnixTimestampInSeconds,
  delay,
  unixTimestampInSecondsToDate,
} from '../../utils';
import { isLockExpired } from '../utils';
import {
  defaultHashKey,
  executeDynamoDBCommandWithOTel,
} from '../../utils/dynamodb';
import { lockingManagerOTelAttributes } from '../utils/otel.attributes';
import { IDynamoDBLockConfig } from './types';
import { defaultLockConfiguration } from '../utils/defaultLockConfiguration';
import { DefaultLockConfiguration } from '../utils/defaultLockConfiguration/types';

/**
 * Implements a distributed locking mechanism using AWS DynamoDB with OpenTelemetry instrumentation.
 * This class provides methods for acquiring, releasing, and managing locks
 * with DynamoDB as the backend storage.
 * @implements {ILockingManager}
 */
export class DynamoDBLock implements ILockingManager {
  private readonly client: DynamoDBClient;
  public readonly tableName: string;
  public readonly hashKey: string = defaultHashKey;
  public readonly defaultLockConfiguration: DefaultLockConfiguration =
    defaultLockConfiguration;

  private executeTraced = createExecutionTracer({
    name: 'DynamoDBLock',
    attributes: {
      'rpc.system': 'aws-api',
      'rpc.service': 'DynamoDB',
      'db.system': 'dynamodb',
    },
  });

  /**
   * Creates an instance of DynamoDBLock.
   */
  constructor(param: IAWSResource<IDynamoDBLockConfig>) {
    this.tableName = param.config.tableName;
    this.hashKey = param.config.hashKey ?? this.hashKey;
    this.defaultLockConfiguration =
      param.config.defaultLockConfiguration ?? this.defaultLockConfiguration;
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
   * Attempts to acquire a lock on the specified path.
   * @param {string} path - The path to acquire a lock on.
   * @param {LockOptions} [options={}] - Options for acquiring the lock.
   * @returns {Promise<LockResult>} A promise resolving to the result of the lock acquisition attempt.
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
        for (let attempt = 0; attempt <= retries; attempt++) {
          logToSpan({
            level: 'INFO',
            message: `[DynamoDBLockManager][acquireLock] -> attempt ${attempt + 1}/${retries + 1}`,
          });

          const result = await this.tryAcquireLock(path, timeout, metadata);
          if (result.success) {
            lockingManagerOTelAttributes.lockAcquiredSuccess(true);
            return result;
          }

          if (attempt < retries) {
            await delay(retryDelay);
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

  private async tryAcquireLock(
    path: string,
    timeout: number,
    metadata: Record<string, any>,
  ): Promise<LockResult> {
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

  private async putLockItem(
    path: string,
    lockId: string,
    acquiredAt: Date,
    expiresAt: Date,
    metadata: Record<string, any>,
  ) {
    const command = new PutItemCommand({
      TableName: this.tableName,
      Item: marshall({
        [this.hashKey]: path,
        lockId,
        acquiredAt: dateToUnixTimestampInSeconds(acquiredAt),
        expiresAt: dateToUnixTimestampInSeconds(expiresAt),
        metadata,
      }),
      ConditionExpression: `attribute_not_exists(${this.hashKey})`,
      ReturnConsumedCapacity: 'INDEXES',
    });
    return await executeDynamoDBCommandWithOTel(this.client, command);
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
    return this.executeTraced(
      'releaseLock',
      async () => {
        const params: any = {
          TableName: this.tableName,
          Key: marshall({ [this.hashKey]: path }),
        };

        if (lockId) {
          params.ConditionExpression = 'lockId = :lockId';
          params.ExpressionAttributeValues = marshall({ ':lockId': lockId });
        }

        try {
          await executeDynamoDBCommandWithOTel(
            this.client,
            new DeleteItemCommand(params),
          );
          setSpanAttributes(
            lockingManagerOTelAttributes.lockReleaseSuccess(true),
          );
          return true;
        } catch (error) {
          setSpanAttributes(
            lockingManagerOTelAttributes.lockReleaseSuccess(false),
          );
          if ((error as any).name === 'ConditionalCheckFailedException') {
            return false;
          } else {
            throw error;
          }
        }
      },
      lockingManagerOTelAttributes.releaseLock(path, lockId),
    );
  }

  /**
   * Forcibly releases a lock on the specified path, regardless of the lock ID.
   * @param {string} path - The path of the lock to forcibly release.
   * @returns {Promise<boolean>} A promise resolving to true if a lock was present and released.
   */
  async forceReleaseLock(path: string): Promise<boolean> {
    return this.executeTraced(
      'forceReleaseLock',
      async () => {
        try {
          await executeDynamoDBCommandWithOTel(
            this.client,
            new DeleteItemCommand({
              TableName: this.tableName,
              Key: marshall({ [this.hashKey]: path }),
              ReturnConsumedCapacity: 'INDEXES',
            }),
          );
          setSpanAttributes(
            lockingManagerOTelAttributes.lockForceReleaseSuccess(true),
          );
          return true;
        } catch (e) {
          setSpanAttributes(
            lockingManagerOTelAttributes.lockForceReleaseSuccess(false),
          );
          throw e;
        }
      },
      lockingManagerOTelAttributes.forceReleaseLock(path),
    );
  }

  /**
   * Extends the duration of an existing lock.
   * @param {string} path - The path of the lock to extend.
   * @param {string} lockId - The ID of the lock to extend.
   * @param {number} duration - The additional time in milliseconds to extend the lock by.
   * @returns {Promise<boolean>} A promise resolving to true if the lock was successfully extended, false otherwise.
   */
  async extendLock(
    path: string,
    lockId: string,
    duration: number,
  ): Promise<boolean> {
    return this.executeTraced(
      'extendLock',
      async () => {
        // First, get the existing lock info
        const existingLock = await this.getLockInfo(path);

        // If the lock doesn't exist or doesn't match the provided lockId or lock has expired, return false
        if (
          !existingLock ||
          existingLock.lockId !== lockId ||
          isLockExpired(existingLock)
        ) {
          return false;
        }

        const newExpiresAt = new Date(
          existingLock.expiresAt.getTime() + duration,
        );

        try {
          const command = new UpdateItemCommand({
            TableName: this.tableName,
            Key: marshall({ [this.hashKey]: path }),
            UpdateExpression: 'SET expiresAt = :newExpiresAt',
            ConditionExpression:
              'lockId = :lockId AND expiresAt = :currentExpiresAt',
            ExpressionAttributeValues: marshall({
              ':newExpiresAt': dateToUnixTimestampInSeconds(newExpiresAt),
              ':lockId': lockId,
              ':currentExpiresAt': dateToUnixTimestampInSeconds(
                existingLock.expiresAt,
              ),
            }),
            ReturnConsumedCapacity: 'INDEXES',
          });
          await executeDynamoDBCommandWithOTel(this.client, command);
          setSpanAttributes(
            lockingManagerOTelAttributes.lockExtensionSuccess(true),
          );
          return true;
        } catch (error) {
          setSpanAttributes(
            lockingManagerOTelAttributes.lockExtensionSuccess(false),
          );
          if ((error as any).name === 'ConditionalCheckFailedException') {
            // The lock was modified or released between our check and update
            return false;
          }
          throw error;
        }
      },
      lockingManagerOTelAttributes.extendLock(path, lockId, duration),
    );
  }

  /**
   * Retrieves information about a lock on a given path.
   * If an expired lock is found, it will be forcibly deleted and null will be returned.
   *
   * @param {string} path - The path to get lock information for.
   * @returns {Promise<LockInfo | null>} A promise resolving to the lock information if a valid lock exists, null otherwise.
   */
  async getLockInfo(path: string): Promise<LockInfo | null> {
    return this.executeTraced(
      'getLockInfo',
      async () => {
        const command = new GetItemCommand({
          TableName: this.tableName,
          Key: marshall({ [this.hashKey]: path }),
          ReturnConsumedCapacity: 'INDEXES',
        });

        const result = (await executeDynamoDBCommandWithOTel(
          this.client,
          command,
        )) as GetItemCommandOutput;

        if (!result.Item) {
          return null;
        }

        const data = unmarshall(result.Item);
        const item: LockInfo = {
          lockId: data['lockId'],
          acquiredAt: unixTimestampInSecondsToDate(data['acquiredAt']),
          expiresAt: unixTimestampInSecondsToDate(data['expiresAt']),
          metadata: data['metadata'],
        };

        if (isLockExpired(item)) {
          // Lock has expired, delete it and return null
          await this.forceReleaseLock(path);
          return null;
        }

        return item;
      },
      lockingManagerOTelAttributes.getLockInfo(path),
    );
  }

  /**
   * Checks if a path is currently locked.
   * @param {string} path - The path to check for a lock.
   * @returns {Promise<boolean>} A promise resolving to true if the path is locked, false otherwise.
   */
  async isLocked(path: string): Promise<boolean> {
    return this.executeTraced(
      'isLocked',
      async () => {
        const lockInfo = await this.getLockInfo(path);
        return lockInfo !== null;
      },
      lockingManagerOTelAttributes.isLocked(path),
    );
  }
}
