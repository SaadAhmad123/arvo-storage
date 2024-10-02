import fs from 'fs/promises';
import path from 'path';
import { telemetrySdkStart, telemetrySdkStop } from '../../utils';
import { LocalJsonLock } from '../../../src';

describe('LocalJsonLock', () => {
  beforeAll(() => {
    telemetrySdkStart();
  });

  afterAll(() => {
    telemetrySdkStop();
  });


  let lockManager: LocalJsonLock;
  let testFilePath: string;

  beforeEach(async () => {
    testFilePath = path.join(`.test_files`, `locks.json`);
    lockManager = new LocalJsonLock(testFilePath);
  });

  afterEach(async () => {
    try {
      await fs.unlink(testFilePath);
    } catch (error) {
      // Ignore errors if file doesn't exist
    }
  });

  test('acquireLock should acquire a lock successfully', async () => {
    const result = await lockManager.acquireLock('test-path');
    expect(result.success).toBe(true);
    expect(result.lockId).toBeDefined();
    expect(result.expiresAt).toBeDefined();
  });

  test('isLocked should return true for a locked path', async () => {
    await lockManager.acquireLock('test-path');
    const isLocked = await lockManager.isLocked('test-path');
    expect(isLocked).toBe(true);
  });

  test('isLocked should return false for an unlocked path', async () => {
    const isLocked = await lockManager.isLocked('non-existent-path');
    expect(isLocked).toBe(false);
  });

  test('releaseLock should release an acquired lock', async () => {
    const { lockId } = await lockManager.acquireLock('test-path');
    const released = await lockManager.releaseLock('test-path', lockId);
    expect(released).toBe(true);
    const isLocked = await lockManager.isLocked('test-path');
    expect(isLocked).toBe(false);
  });

  test('releaseLock should fail with incorrect lockId', async () => {
    await lockManager.acquireLock('test-path');
    const released = await lockManager.releaseLock('test-path', 'incorrect-id');
    expect(released).toBe(false);
    const isLocked = await lockManager.isLocked('test-path');
    expect(isLocked).toBe(true);
  });

  test('forceReleaseLock should release a lock without lockId', async () => {
    await lockManager.acquireLock('test-path');
    const released = await lockManager.forceReleaseLock('test-path');
    expect(released).toBe(true);
    const isLocked = await lockManager.isLocked('test-path');
    expect(isLocked).toBe(false);
  });

  test('extendLock should extend the lock duration', async () => {
    const { lockId } = await lockManager.acquireLock('test-path', {
      timeout: 1000,
    });
    const extended = await lockManager.extendLock(
      'test-path',
      lockId || '',
      2000,
    );
    expect(extended).toBe(true);
    const lockInfo = await lockManager.getLockInfo('test-path');
    expect(lockInfo).toBeDefined();
    expect(new Date(lockInfo!.expiresAt).getTime()).toBeGreaterThan(
      Date.now() + 2500,
    ); // 2.5 seconds from now
  });

  test('getLockInfo should return null for an unlocked path', async () => {
    const lockInfo = await lockManager.getLockInfo('non-existent-path');
    expect(lockInfo).toBeNull();
  });

  test('getLockInfo should return lock info for a locked path', async () => {
    const { lockId } = await lockManager.acquireLock('test-path', {
      metadata: { owner: 'test' },
    });
    const lockInfo = await lockManager.getLockInfo('test-path');
    expect(lockInfo).toBeDefined();
    expect(lockInfo!.lockId).toBe(lockId);
    expect(lockInfo!.metadata).toEqual({ owner: 'test' });
  });

  test('acquireLock should fail after retries', async () => {
    await lockManager.acquireLock('test-path');
    const result = await lockManager.acquireLock('test-path', {
      retries: 2,
      retryDelay: 100,
    });
    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });

  test('locks should persist across instances', async () => {
    await lockManager.acquireLock('test-path');

    // Create a new instance with the same file
    const newLockManager = new LocalJsonLock(testFilePath);
    const isLocked = await newLockManager.isLocked('test-path');
    expect(isLocked).toBe(true);
  });

  test('releaseLock should return true for non-existent lock', async () => {
    const released = await lockManager.releaseLock('non-existent-path');
    expect(released).toBe(true);
  });

  test('forceReleaseLock should return true for non-existent lock', async () => {
    const released = await lockManager.forceReleaseLock('non-existent-path');
    expect(released).toBe(true);
  });
});
