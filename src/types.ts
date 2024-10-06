/**
 * Represents the AWS credentials and configuration required for DynamoDB access.
 * These credentials are used to authenticate and authorize requests to AWS services.
 */
export type AWSCredentials = {
  /**
   * The AWS IAM access key ID for DynamoDB authentication.
   * This is part of the security credentials for an AWS account.
   * If not provided, the AWS SDK will attempt to use credentials from the environment or instance metadata.
   * @example "AKIAIOSFODNN7EXAMPLE"
   */
  awsAccessKey?: string;

  /**
   * The AWS IAM secret access key for DynamoDB authentication.
   * This should be kept secure and not exposed in your codebase.
   * If not provided, the AWS SDK will attempt to use credentials from the environment or instance metadata.
   * @example "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY"
   */
  awsSecretKey?: string;

  /**
   * The AWS region for DynamoDB operations.
   * Specifies the geographical AWS Region where your DynamoDB table is hosted.
   * If not provided, the default region configured in your AWS SDK or environment will be used.
   * @example "us-west-2"
   */
  awsRegion?: string;

  /**
   * The AWS session token for temporary credentials.
   * This is typically used with temporary security credentials obtained via AWS STS (Security Token Service).
   * Only required when using temporary credentials; not needed for long-term access keys.
   * @example "AQoEXAMPLEH4aoAH0gNCAPyJxz4BlCFFxWNE1OPTgk5TthT+"
   */
  awsSessionToken?: string;
};


/**
 * Represents an AWS resource with its configuration and credentials.
 * This interface is generic, allowing for flexible configuration types.
 * 
 * @template TConfig - The type of the configuration object, which must be a record with string keys and any value types.
 */
export interface IAWSResource<TConfig extends Record<string, any>> {
  /**
   * The configuration object for the AWS resource.
   * This can contain any resource-specific settings or parameters.
   */
  config: TConfig;

  /**
   * The AWS credentials required to access the resource.
   * This includes access keys, region, and optional session token.
   */
  credentials?: AWSCredentials;
}

/**
 * Represents the credentials and configuration required for Azure Blob Storage access.
 * This interface provides the necessary information to connect to and interact with
 * a specific container in an Azure Storage account.
 */
export interface IAzureBlobStorageCredentials {
  /**
   * The connection string to the Azure Storage account.
   * This string includes all the authentication information required for your application
   * to access data in Azure Blob Storage. It can be found in the Azure portal under the
   * "Access keys" section of your storage account.
   * 
   * @example "DefaultEndpointsProtocol=https;AccountName=mystorageaccount;AccountKey=accountkey123==;EndpointSuffix=core.windows.net"
   * 
   * @remark
   * **Note**: This string contains sensitive information. Ensure it's stored securely
   * and not exposed in your source code or public repositories.
   */
  connectionString: string;

  /**
   * The name of the container within the Azure Blob Storage where blobs (files) will
   * be stored, read, and deleted.
   * 
   * Containers act like folders in Azure Blob Storage and provide a way to organize
   * sets of blobs. The container name must be lowercase, between 3-63 characters long,
   * and can contain only letters, numbers, and the dash (-) character.
   * 
   * @example "my-container"
   * 
   * @remarks If the specified container doesn't exist, your application should be
   * prepared to create it before performing any operations, or handle any resulting errors.
   */
  containerName: string;
}