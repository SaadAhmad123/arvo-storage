/**
 * AWS credentials and configuration for DynamoDB access.
 */
export type AWSCredentials = {
  /**
   * Optional AWS IAM access key ID for DynamoDB authentication.
   */
  awsAccessKey?: string;
  /**
   * Optional AWS IAM secret access key for DynamoDB authentication.
   */
  awsSecretKey?: string;
  /**
   * Optional AWS region for DynamoDB. If not provided, the default region is used.
   */
  awsRegion?: string;
  /**
   * Optional AWS session token for temporary credentials.
   */
  awsSessionToken?: string;
};
