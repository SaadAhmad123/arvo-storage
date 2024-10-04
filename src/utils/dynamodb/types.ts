import {
  BatchGetItemCommand,
  BatchWriteItemCommand,
  CreateTableCommand,
  DeleteItemCommand,
  DeleteTableCommand,
  DescribeTableCommand,
  GetItemCommand,
  ListTablesCommand,
  PutItemCommand,
  QueryCommand,
  ScanCommand,
  UpdateItemCommand,
  UpdateTableCommand,
} from '@aws-sdk/client-dynamodb';

export type DynamoDBCommand =
  | CreateTableCommand
  | DeleteItemCommand
  | DeleteTableCommand
  | DescribeTableCommand
  | GetItemCommand
  | ListTablesCommand
  | PutItemCommand
  | QueryCommand
  | ScanCommand
  | UpdateItemCommand
  | UpdateTableCommand;
