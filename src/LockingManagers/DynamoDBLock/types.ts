import { AWSCredentials } from '../../types';
import { DefaultLockConfiguration } from '../utils/defaultLockConfiguration/types';

/**
 * Configuration interface for DynamoDB-based locking mechanism.
 * This interface defines the necessary parameters to set up and use
 * a DynamoDB table for distributed locking purposes.
 */
export interface IDynamoDBLockConfig {
  /**
   * The name of the DynamoDB table used for lock storage.
   *
   * This table will be used to store and manage locks across distributed systems.
   * The table should already exist in your AWS account and be properly configured
   * for lock management.
   *
   * @example "MyAppDistributedLocks"
   */
  tableName: string;

  /**
   * The name of the hash key (partition key) column in the DynamoDB table.
   *
   * This is the primary key used to uniquely identify lock entries in the table.
   * If not specified, the default value "path_key" will be used.
   *
   * @default "path_key"
   * @example "lockKey"
   */
  hashKey?: string;

  /**
   * Default configuration for lock behavior.
   * This object contains settings that define the default behavior for lock acquisition and management.
   */
  defaultLockConfiguration?: DefaultLockConfiguration;
}
