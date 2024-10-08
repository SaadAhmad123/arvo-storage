import { IStorageManager } from './StorageMangers/types';
import { LocalJsonStorage } from './StorageMangers/LocalJsonStorage';
import {
  ILockingManager,
  LockInfo,
  LockOptions,
  LockResult,
} from './LockingManagers/types';
import { LocalJsonLock } from './LockingManagers/LocalJsonLock';
import { AWSCredentials } from './types';
import { DynamoDBLock } from './LockingManagers/DynamoDBLock';
import { IAWSResource } from './types';
import { IDynamoDBLockConfig } from './LockingManagers/DynamoDBLock/types';
import { ILocalJsonLock } from './LockingManagers/LocalJsonLock/types';
import { IDynamoDBStorage } from './StorageMangers/DynamoDBStorage/types';
import DynamoDBStorage from './StorageMangers/DynamoDBStorage';

export {
  IStorageManager,
  ILockingManager,
  LocalJsonStorage,
  LocalJsonLock,
  LockInfo,
  LockOptions,
  LockResult,
  AWSCredentials,
  DynamoDBLock,
  IAWSResource,
  IDynamoDBLockConfig,
  ILocalJsonLock,
  IDynamoDBStorage,
  DynamoDBStorage,
};
