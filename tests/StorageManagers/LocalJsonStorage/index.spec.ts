import { z } from 'zod';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { LocalJsonStorage } from '../../../src';
import { telemetrySdkStart, telemetrySdkStop } from '../../utils';

describe('LocalJsonStorage', () => {
  beforeAll(() => {
    telemetrySdkStart();
  });

  afterAll(() => {
    telemetrySdkStop();
  });

  let storage: LocalJsonStorage<any>;
  let testFilePath: string;
  const testSchema = z.object({
    id: z.string(),
    name: z.string(),
    email: z.string().email(),
  });

  beforeEach(async () => {
    testFilePath = path.join(os.tmpdir(), `test-storage-${Date.now()}.json`);
    storage = new LocalJsonStorage({
      config: {
        filePath: testFilePath,
        schema: testSchema,
      },
    });
  });

  afterEach(async () => {
    try {
      await fs.unlink(testFilePath);
    } catch (error) {
      // Ignore errors if file doesn't exist
    }
  });

  test('write and read data', async () => {
    const testData = { id: '1', name: 'Alice', email: 'alice@example.com' };
    await storage.write(testData, 'users/1');
    const readData = await storage.read('users/1', null);
    expect(readData).toEqual(testData);
  });

  test('read non-existent data returns default value', async () => {
    const defaultValue = {
      id: '0',
      name: 'Default',
      email: 'default@example.com',
    };
    const readData = await storage.read('non-existent', defaultValue);
    expect(readData).toEqual(defaultValue);
  });

  test('delete item', async () => {
    await storage.write(
      { id: '1', name: 'Alice', email: 'alice@example.com' },
      'users/1',
    );
    await storage.delete('users/1');
    const exists = await storage.exists('users/1');
    expect(exists).toBe(false);
  });

  test('check existence', async () => {
    await storage.write(
      { id: '1', name: 'Alice', email: 'alice@example.com' },
      'users/1',
    );
    const exists = await storage.exists('users/1');
    expect(exists).toBe(true);
  });

  test('invalid data throws ZodError', async () => {
    const invalidData = { id: '1', name: 'Alice', email: 'invalid-email' };
    await expect(storage.write(invalidData, 'users/1')).rejects.toThrow(
      z.ZodError,
    );
  });

  test('persistence across instances', async () => {
    await storage.write(
      { id: '1', name: 'Alice', email: 'alice@example.com' },
      'users/1',
    );

    // Create a new instance with the same file
    const newStorage = new LocalJsonStorage({
      config: {
        filePath: testFilePath,
        schema: testSchema,
      },
    });
    const readData = await newStorage.read('users/1', null);
    expect(readData).toEqual({
      id: '1',
      name: 'Alice',
      email: 'alice@example.com',
    });
  });
});
