import { DynamoDBLock } from '../../../src';
import { v4 as uuidv4 } from 'uuid';
import * as dotenv from 'dotenv'
import { telemetrySdkStart, telemetrySdkStop } from '../../utils';
dotenv.config()

describe('DynamoDBLock', () => {
  beforeAll(() => {
    telemetrySdkStart();
  });

  afterAll(() => {
    telemetrySdkStop();
  });


  let lockManager: DynamoDBLock;
  const tableName = process.env.AWS_LOCK_TABLE_NAME || "";
  
  beforeAll(() => {
    const credentials = {
      awsAccessKey: process.env.AWS_ACCESS_KEY,
      awsSecretKey: process.env.AWS_SECRET_KEY,
      awsRegion: process.env.AWS_REGION || 'ap-southeast-2',
    };
    lockManager = new DynamoDBLock(tableName, credentials);
  });

  test('acquireLock should successfully acquire a lock', async () => {
    const path = `/test/lock/${uuidv4()}`;
    const result = await lockManager.acquireLock(path);
    
    expect(result.success).toBe(true);
    expect(result.lockId).toBeDefined();
    expect(result.expiresAt).toBeDefined();
  });

  test('acquireLock should fail when lock is already held', async () => {
    const path = `/test/lock/${uuidv4()}`;
    
    const firstLock = await lockManager.acquireLock(path);
    expect(firstLock.success).toBe(true);

    const secondLock = await lockManager.acquireLock(path);
    expect(secondLock.success).toBe(false);
    expect(secondLock.error).toBeDefined();
  }, 10000);

  test('releaseLock should release an acquired lock', async () => {
    const path = `/test/lock/${uuidv4()}`;
    
    const acquireResult = await lockManager.acquireLock(path);
    expect(acquireResult.success).toBe(true);

    const releaseResult = await lockManager.releaseLock(path, acquireResult.lockId);
    expect(releaseResult).toBe(true);

    const isLocked = await lockManager.isLocked(path);
    expect(isLocked).toBe(false);
  });

  test('forceReleaseLock should release a lock without lockId', async () => {
    const path = `/test/lock/${uuidv4()}`;
    
    await lockManager.acquireLock(path);
    const forceReleaseResult = await lockManager.forceReleaseLock(path);
    
    expect(forceReleaseResult).toBe(true);
    
    const isLocked = await lockManager.isLocked(path);
    expect(isLocked).toBe(false);
  });

  test('extendLock should extend the lock duration', async () => {
    const path = `/test/lock/${uuidv4()}`;
    const initialDuration = 5000; // 5 seconds
    const extensionDuration = 10000; // 10 seconds
    
    const acquireResult = await lockManager.acquireLock(path, { timeout: initialDuration });
    expect(acquireResult.success).toBe(true);

    const initialLockInfo = await lockManager.getLockInfo(path);
    const initialExpiresAt = new Date(initialLockInfo!.expiresAt).getTime();

    const extendResult = await lockManager.extendLock(path, acquireResult!.lockId!, extensionDuration);
    expect(extendResult).toBe(true);

    const extendedLockInfo = await lockManager.getLockInfo(path);
    const extendedExpiresAt = new Date(extendedLockInfo!.expiresAt).getTime();
    console.log({extendedExpiresAt, initialExpiresAt, diff: extendedExpiresAt - initialExpiresAt})
    expect(extendedExpiresAt).toBeGreaterThan(initialExpiresAt);
    expect(extendedExpiresAt - initialExpiresAt).toBeCloseTo(extensionDuration, -2); // Allow 100ms tolerance
  });

  test('getLockInfo should return null for non-existent lock', async () => {
    const path = `/test/lock/${uuidv4()}`;
    const lockInfo = await lockManager.getLockInfo(path);
    expect(lockInfo).toBeNull();
  });

  test('getLockInfo should return lock information for existing lock', async () => {
    const path = `/test/lock/${uuidv4()}`;
    const metadata = { owner: 'test-user' };
    
    const acquireResult = await lockManager.acquireLock(path, { metadata });
    expect(acquireResult.success).toBe(true);

    const lockInfo = await lockManager.getLockInfo(path);
    expect(lockInfo).not.toBeNull();
    expect(lockInfo!.lockId).toBe(acquireResult.lockId);
    expect(lockInfo!.metadata).toEqual(metadata);
  });

  test('isLocked should return true for locked path', async () => {
    const path = `/test/lock/${uuidv4()}`;
    
    await lockManager.acquireLock(path);
    const isLocked = await lockManager.isLocked(path);
    
    expect(isLocked).toBe(true);
  });

  test('isLocked should return false for unlocked path', async () => {
    const path = `/test/lock/${uuidv4()}`;
    const isLocked = await lockManager.isLocked(path);
    expect(isLocked).toBe(false);
  });

  test('getLockInfo should forcibly delete an expired lock and return null', async () => {
    const path = `/test/lock/${uuidv4()}`;
    const shortTimeout = 1000; // 1 second
    
    // Acquire a lock with a short timeout
    const acquireResult = await lockManager.acquireLock(path, { timeout: shortTimeout });
    expect(acquireResult.success).toBe(true);

    // Wait for the lock to expire
    await new Promise(resolve => setTimeout(resolve, shortTimeout + 100));

    // Get lock info, which should trigger force delete
    const lockInfo = await lockManager.getLockInfo(path);
    expect(lockInfo).toBeNull();

    // Verify that the lock is indeed deleted
    const isLocked = await lockManager.isLocked(path);
    expect(isLocked).toBe(false);
  });

  test('acquireLock should succeed immediately after an expired lock is deleted', async () => {
    const path = `/test/lock/${uuidv4()}`;
    const shortTimeout = 4000; // 1 second
    
    // Acquire a lock with a short timeout
    const firstAcquireResult = await lockManager.acquireLock(path, { timeout: shortTimeout });
    expect(firstAcquireResult.success).toBe(true);

    const failedTryToAcquireLock = await lockManager.acquireLock(path, {timeout: 1000})
    expect(failedTryToAcquireLock.success).toBe(false)
    expect(failedTryToAcquireLock.error).toBeDefined()

    // Wait for the lock to expire
    await new Promise(resolve => setTimeout(resolve, 2000 + 100));

    // Try to acquire the lock again, which should succeed
    const secondAcquireResult = await lockManager.acquireLock(path);
    expect(secondAcquireResult.success).toBe(true);
    expect(secondAcquireResult.lockId).not.toBe(firstAcquireResult.lockId);
  }, 10000);

  test('getLockInfo should return valid lock info for non-expired lock', async () => {
    const path = `/test/lock/${uuidv4()}`;
    const longTimeout = 30000; // 30 seconds
    
    // Acquire a lock with a long timeout
    const acquireResult = await lockManager.acquireLock(path, { timeout: longTimeout });
    expect(acquireResult.success).toBe(true);

    // Get lock info immediately after acquiring
    const lockInfo = await lockManager.getLockInfo(path);
    expect(lockInfo).not.toBeNull();
    expect(lockInfo!.lockId).toBe(acquireResult.lockId);
    expect(lockInfo!.expiresAt.getTime()).toBeGreaterThan(Date.now());
  });

  test('multiple calls to getLockInfo for expired lock should all return null', async () => {
    const path = `/test/lock/${uuidv4()}`;
    const shortTimeout = 1000; // 1 second
    
    // Acquire a lock with a short timeout
    const acquireResult = await lockManager.acquireLock(path, { timeout: shortTimeout });
    expect(acquireResult.success).toBe(true);

    // Wait for the lock to expire
    await new Promise(resolve => setTimeout(resolve, shortTimeout + 100));

    // Call getLockInfo multiple times
    const lockInfo1 = await lockManager.getLockInfo(path);
    const lockInfo2 = await lockManager.getLockInfo(path);
    const lockInfo3 = await lockManager.getLockInfo(path);

    expect(lockInfo1).toBeNull();
    expect(lockInfo2).toBeNull();
    expect(lockInfo3).toBeNull();
  });
});