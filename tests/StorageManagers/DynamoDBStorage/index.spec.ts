import { z } from 'zod';
import { IAWSResource, IDynamoDBStorage, DynamoDBStorage } from '../../../src';
import * as dotenv from 'dotenv';
import { PutItemCommand } from '@aws-sdk/client-dynamodb';
import { marshall } from '@aws-sdk/util-dynamodb';
dotenv.config();

// Define a schema for our test data
const testSchema = z.object({
  id: z.string(),
  name: z.string(),
  age: z.number(),
});

// Create a type for our test data
type TestData = z.infer<typeof testSchema>;

// Set up the DynamoDBStorage instance
const config: IAWSResource<IDynamoDBStorage<typeof testSchema>> = {
  config: {
    tableName: process.env.AWS_STORAGE_TABLE_NAME!,
    schema: testSchema,
  },
  credentials: {
    awsAccessKey: process.env.AWS_ACCESS_KEY!,
    awsSecretKey: process.env.AWS_SECRET_KEY!,
    awsRegion: process.env.AWS_REGION ?? 'ap-southeast-2',
  },
};

const storage = new DynamoDBStorage(config);

describe('DynamoDBStorage', () => {
  const testData: TestData = {
    id: 'test-id-' + Date.now(),
    name: 'Test User',
    age: 30,
  };

  afterAll(async () => {
    // Clean up: delete the test item
    await storage.delete(testData.id);
  });

  test('write and read data', async () => {
    await storage.write(testData, testData.id);
    const readData = await storage.read(testData.id, null);
    expect(readData).toEqual(testData);
  });

  test('read non-existent data', async () => {
    const defaultValue = { id: 'default', name: 'Default', age: 0 };
    const readData = await storage.read('non-existent-id', defaultValue);
    expect(readData).toEqual(defaultValue);
  }, 10000);

  test('delete data', async () => {
    await storage.write(testData, testData.id);
    await storage.delete(testData.id);
    const readData = await storage.read(testData.id, null);
    expect(readData).toBeNull();
  });

  test('check existence', async () => {
    await storage.write(testData, testData.id);

    const exists = await storage.exists(testData.id);
    expect(exists).toBe(true);

    const nonExistent = await storage.exists('non-existent-id');
    expect(nonExistent).toBe(false);

    // Clean up
    await storage.delete(testData.id);
  });

  test('write and update data', async () => {
    await storage.write(testData, testData.id);
    const updatedData = { ...testData, name: 'Updated User', age: 31 };
    await storage.write(updatedData, testData.id);
    const readData = await storage.read(testData.id, null);
    expect(readData).toEqual(updatedData);
  });

  test('write data with invalid schema', async () => {
    const invalidData = { ...testData, age: 'thirty' };
    await expect(
      storage.write(invalidData as any, testData.id),
    ).rejects.toThrow(z.ZodError);
  });

  test('read data with invalid schema in database', async () => {
    const invalidData = {
      [storage.hashKey]: testData.id,
      name: testData.name,
      age: 'thirty', // Invalid age (should be a number)
    };

    await storage['client'].send(
      new PutItemCommand({
        TableName: storage.tableName,
        Item: marshall(invalidData),
      }),
    );

    // Now try to read it, which should throw a ZodError
    await expect(storage.read(testData.id, null)).rejects.toThrow(z.ZodError);

    // Clean up
    await storage.delete(testData.id);
  });

  test('delete non-existent data', async () => {
    await expect(storage.delete('non-existent-id')).resolves.not.toThrow();
  });

  test('exists with recently deleted item', async () => {
    await storage.write(testData, testData.id);
    await storage.delete(testData.id);
    const exists = await storage.exists(testData.id);
    expect(exists).toBe(false);
  });

  test('read with custom default value', async () => {
    const customDefault = { id: 'custom', name: 'Custom Default', age: 99 };
    const readData = await storage.read('non-existent-id', customDefault);
    expect(readData).toEqual(customDefault);
  });
});
