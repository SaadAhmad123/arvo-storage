import { DefaultLockConfiguration } from '../utils/defaultLockConfiguration/types';

export interface ILocalJsonLock {
  config: {
    /** The path to the JSON file used for lock persistence. */
    filePath: string;

    /**
     * Default configuration for lock behavior.
     * This object contains settings that define the default behavior for lock acquisition and management.
     */
    defaultLockConfiguration?: DefaultLockConfiguration;
  };
}
