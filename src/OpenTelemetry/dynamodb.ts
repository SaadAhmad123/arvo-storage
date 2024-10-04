import { AttributeValue } from '@opentelemetry/api';
import {
  BatchGetItemCommand,
  BatchWriteItemCommand,
  CreateTableCommand,
  DeleteItemCommand,
  GetItemCommand,
  ListTablesCommand,
  PutItemCommand,
  QueryCommand,
  ScanCommand,
  UpdateItemCommand,
  UpdateTableCommand,
} from '@aws-sdk/client-dynamodb';
import { setSpanAttributes } from '.';
import { DynamoDBCommand } from '../utils/dynamodb/types';
const jsonStringify = <T>(item: T) => JSON.stringify(item);

/**
 * Sets DynamoDB-specific attributes on the active OpenTelemetry span based on the command and output.
 *
 * This function automatically determines the DynamoDB operation type from the command object
 * and sets relevant OpenTelemetry attributes according to the AWS DynamoDB semantic conventions.
 * It enhances observability by capturing details about the DynamoDB operation, including
 * consumed capacity, table names, and operation-specific parameters.
 *
 * @param command - The DynamoDB command object used for the operation. This should be an instance
 *                  of one of the command classes from the @aws-sdk/client-dynamodb package.
 * @param output - The output object returned by the DynamoDB operation after execution.
 *
 * @example
 * ```typescript
 * import { DynamoDBClient, PutItemCommand } from "@aws-sdk/client-dynamodb";
 * import { setSpanDynamoDbAttributes } from './path-to-this-module';
 *
 * const client = new DynamoDBClient({});
 * const command = new PutItemCommand({
 *   TableName: 'MyTable',
 *   Item: {
 *     id: { S: '1234' },
 *     name: { S: 'John Doe' }
 *   },
 *   ReturnConsumedCapacity: 'TOTAL'
 * });
 *
 * try {
 *   const result = await client.send(command);
 *   setSpanDynamoDbAttributes(command, result);
 * } catch (error) {
 *   console.error('Error:', error);
 * }
 * ```
 *
 * @remarks
 * - This function relies on the OpenTelemetry API and the `setSpanAttributes` utility.
 * - It automatically determines the operation type from the command object's constructor.
 * - Different attributes are set based on the operation type and the data available in the output and input.
 * - All attributes are set according to the AWS DynamoDB semantic conventions for OpenTelemetry.
 * - The function handles various DynamoDB operations including BatchGetItem, BatchWriteItem,
 *   CreateTable, DeleteItem, DeleteTable, DescribeTable, GetItem, ListTables, PutItem,
 *   Query, Scan, UpdateItem, and UpdateTable.
 * - Some attributes are conditionally set based on the presence of certain fields in the input or output.
 * - JSON stringification is used for complex objects to ensure they can be properly stored as span attributes.
 *
 * @throws This function does not throw errors directly, but errors may occur during the attribute setting
 *         process if invalid data is provided or if there are issues with the OpenTelemetry implementation.
 *
 * @see {@link https://opentelemetry.io/docs/specs/semconv/database/dynamodb/ | OpenTelemetry AWS DynamoDB Semantic Conventions}
 */
export const setSpanDynamoDbAttributes = (
  command: DynamoDBCommand,
  output: any,
): void => {
  const attributes: Record<string, AttributeValue | undefined> = {
    'rpc.system': 'aws-api',
    'rpc.service': 'DynamoDB',
    'rpc.method': command.constructor.name.replace('Command', ''),
  };

  const input = command.input;

  // Set consumed capacity attribute if available
  if (output.ConsumedCapacity) {
    const capacityAttribute = Array.isArray(output.ConsumedCapacity)
      ? output.ConsumedCapacity.map(JSON.stringify)
      : [JSON.stringify(output.ConsumedCapacity)];
    attributes['aws.dynamodb.consumed_capacity'] = capacityAttribute;
  }

  // Set table names attribute if available
  if ('TableName' in input) {
    attributes['aws.dynamodb.table_names'] = [input.TableName];
  } else if ('RequestItems' in input) {
    attributes['aws.dynamodb.table_names'] = Object.keys(
      input.RequestItems ?? {},
    );
  }

  // Set operation-specific attributes
  switch (command.constructor) {
    case BatchGetItemCommand:
    case BatchWriteItemCommand:
      if (output.ItemCollectionMetrics) {
        attributes['aws.dynamodb.item_collection_metrics'] = JSON.stringify(
          output.ItemCollectionMetrics,
        );
      }
      break;

    case CreateTableCommand:
    case UpdateTableCommand:
      if ('GlobalSecondaryIndexes' in input) {
        attributes['aws.dynamodb.global_secondary_indexes'] = (
          input.GlobalSecondaryIndexes ?? []
        ).map(jsonStringify);
      }
      if ('LocalSecondaryIndexes' in input) {
        attributes['aws.dynamodb.local_secondary_indexes'] = (
          input.LocalSecondaryIndexes ?? []
        ).map(jsonStringify);
      }
      if ('ProvisionedThroughput' in input) {
        attributes['aws.dynamodb.provisioned_read_capacity'] =
          input?.ProvisionedThroughput?.ReadCapacityUnits;
        attributes['aws.dynamodb.provisioned_write_capacity'] =
          input?.ProvisionedThroughput?.WriteCapacityUnits;
      }
      break;

    case DeleteItemCommand:
    case PutItemCommand:
    case UpdateItemCommand:
      if (output.ItemCollectionMetrics) {
        attributes['aws.dynamodb.item_collection_metrics'] = JSON.stringify(
          output.ItemCollectionMetrics,
        );
      }
      break;

    case GetItemCommand:
    case QueryCommand:
    case ScanCommand:
      if ('ConsistentRead' in input) {
        attributes['aws.dynamodb.consistent_read'] = input.ConsistentRead;
      }
      if ('ProjectionExpression' in input) {
        attributes['aws.dynamodb.projection'] = input.ProjectionExpression;
      }
      if ('Limit' in input) {
        attributes['aws.dynamodb.limit'] = input.Limit;
      }
      if ('IndexName' in input) {
        attributes['aws.dynamodb.index_name'] = input.IndexName;
      }
      if ('Select' in input) {
        attributes['aws.dynamodb.select'] = input.Select;
      }
      if (command instanceof ScanCommand) {
        attributes['aws.dynamodb.count'] = output.Count;
        attributes['aws.dynamodb.scanned_count'] = output.ScannedCount;
        if ('Segment' in input) {
          attributes['aws.dynamodb.segment'] = input.Segment;
        }
        if ('TotalSegments' in input) {
          attributes['aws.dynamodb.total_segments'] = input.TotalSegments;
        }
      }
      break;

    case ListTablesCommand:
      if ('ExclusiveStartTableName' in input) {
        attributes['aws.dynamodb.exclusive_start_table'] =
          input.ExclusiveStartTableName;
      }
      if ('Limit' in input) {
        attributes['aws.dynamodb.limit'] = input.Limit;
      }
      if (output.TableNames) {
        attributes['aws.dynamodb.table_count'] = output.TableNames.length;
      }
      break;
  }

  // Set the attributes on the current span
  setSpanAttributes(attributes);
};
