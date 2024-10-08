import { DefaultLockConfiguration } from './types';

export const defaultLockConfiguration: DefaultLockConfiguration = {
  timeout: 30000,
  retries: 2,
  retryDelay: 1000,
};
