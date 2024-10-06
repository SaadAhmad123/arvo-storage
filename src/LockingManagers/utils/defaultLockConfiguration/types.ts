/**
* Default configuration for lock behavior.
* This object contains settings that define the default behavior for lock acquisition and management.
*/

export type DefaultLockConfiguration = {
   /**
    * The time-to-live (TTL) for lock entries in milliseconds.
    *
    * This determines how long a lock should be considered valid before it automatically expires.
    * It helps prevent indefinite locks in case of client failures.
    *
    * @default 30000 (30 seconds)
    */
   timeout: number,

   /**
    * The maximum number of retries when attempting to acquire a lock.
    *
    * This helps in handling contention scenarios where multiple clients
    * are trying to acquire the same lock simultaneously.
    *
    * @default 2
    */
   retries: number,

   /**
    * The base amount of time (in milliseconds) to wait between retries.
    *
    * This delay helps in reducing contention and spreading out retry attempts.
    * The actual wait time may increase with each retry attempt if using an exponential backoff strategy.
    *
    * @default 1000 (1 second)
    */
   retryDelay: number
}