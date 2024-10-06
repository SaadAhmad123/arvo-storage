import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBCommand } from './types';
import { setSpanDynamoDbAttributes } from '../../OpenTelemetry/dynamodb';

/**
 * Executes a DynamoDB command and automatically sets OpenTelemetry span attributes.
 *
 * This function wraps the DynamoDB client's send method, executing the provided command
 * and then setting relevant OpenTelemetry span attributes based on the command and its result.
 * It provides a convenient way to ensure that all DynamoDB operations are properly instrumented
 * with OpenTelemetry attributes.
 *
 * @param client - The DynamoDB client instance to use for sending the command.
 * @param command - The DynamoDB command to execute. This should be an instance of a command
 *                  class from the @aws-sdk/client-dynamodb package.
 *
 * @returns A promise that resolves with the result of the DynamoDB command execution.
 *
 * @throws Will throw any error that occurs during the execution of the DynamoDB command.
 *
 * @example
 * ```typescript
 * import { DynamoDBClient, GetItemCommand, GetItemCommandOutput } from "@aws-sdk/client-dynamodb";
 * import { executeDynamoDBCommandWithOTel } from './path-to-this-module';
 *
 * const client = new DynamoDBClient({});
 * const command = new GetItemCommand({
 *   TableName: 'MyTable',
 *   Key: { id: { S: '1234' } }
 * });
 *
 * try {
 *   const result = await executeDynamoDBCommandWithOTel(client, command) as GetItemCommandOutput;
 *   console.log('Item retrieved:', result.Item);
 * } catch (error) {
 *   console.error('Error executing DynamoDB command:', error);
 * }
 * ```
 *
 * @remarks
 * - This function is designed to be used with any DynamoDB command supported by the AWS SDK for JavaScript v3.
 * - It automatically sets OpenTelemetry span attributes using the `setSpanDynamoDbAttributes` function.
 * - The function uses type assertion (`as any`) when sending the command to handle potential type mismatches.
 *   This is generally safe as the `DynamoDBCommand` type should encompass all valid command types.
 * - Error handling should be implemented by the caller, as this function will not catch errors from the command execution.
 *
 * @see {@link https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/dynamodb/ | AWS SDK for JavaScript v3 DynamoDB Client}
 * @see {@link https://opentelemetry.io/docs/instrumentation/js/getting-started/nodejs/ | OpenTelemetry for Node.js}
 */
export const executeDynamoDBCommandWithOTel = async (
  client: DynamoDBClient,
  command: DynamoDBCommand,
): Promise<unknown> => {
  const result = await client.send(command as any);
  setSpanDynamoDbAttributes(command, result);
  return result;
};

/**
 * The default hash key (partition key) used for DynamoDB tables in the storage system.
 * 
 * This constant defines the standard name for the primary key in DynamoDB tables
 * used by the storage system. It is used as the default value when a custom
 * hash key is not specified in the storage configuration.
 */
export const defaultHashKey = "path_key";