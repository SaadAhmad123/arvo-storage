/**
 * Converts a Date object to a Unix timestamp in seconds.
 *
 * This function takes a JavaScript Date object and converts it to the corresponding
 * Unix timestamp (number of seconds elapsed since January 1, 1970 00:00:00 UTC).
 * The result is rounded down to the nearest second.
 *
 * @param date - The Date object to convert.
 * @returns The Unix timestamp in seconds as an integer.
 *
 * @throws {TypeError} If the input is not a valid Date object.
 *
 * @example
 * const now = new Date();
 * const timestamp = dateToUnixTimestampInSeconds(now);
 * console.log(timestamp); // e.g., 1635784800
 *
 * @remarks
 * - This function uses `Math.floor()` to round down to the nearest second.
 * - The resulting timestamp is always a positive integer for dates after the Unix epoch.
 */
export const dateToUnixTimestampInSeconds = (date: Date): number => {
  if (!(date instanceof Date) || isNaN(date.getTime())) {
    throw new TypeError('Input must be a valid Date object');
  }
  return Math.floor(date.getTime() / 1000);
};

/**
 * Converts a Unix timestamp in seconds to a Date object.
 *
 * This function takes a Unix timestamp (number of seconds elapsed since January 1, 1970 00:00:00 UTC)
 * and converts it to a JavaScript Date object.
 *
 * @param timestamp - The Unix timestamp in seconds to convert.
 * @returns A Date object representing the Unix timestamp.
 *
 * @throws {TypeError} If the input is not a valid number.
 * @throws {RangeError} If the input timestamp is outside the range of valid Date values.
 *
 * @example
 * const timestamp = 1635784800;
 * const date = unixTimestampInSecondsToDate(timestamp);
 * console.log(date.toISOString()); // e.g., "2021-11-01T12:00:00.000Z"
 *
 * @remarks
 * - The function multiplies the input by 1000 to convert seconds to milliseconds,
 *   which is the unit used by the Date constructor.
 * - The valid range for timestamps is from -8,640,000,000,000 to 8,640,000,000,000 seconds
 *   (equivalent to ±100,000,000 days relative to January 1, 1970).
 */
export const unixTimestampInSecondsToDate = (timestamp: number): Date => {
  if (typeof timestamp !== 'number' || isNaN(timestamp)) {
    throw new TypeError('Input must be a valid number');
  }
  const date = new Date(timestamp * 1000);
  if (isNaN(date.getTime())) {
    throw new RangeError('Input timestamp is outside the valid range for Date');
  }
  return date;
};

/**
 * Creates a promise that resolves after a specified delay.
 *
 * This utility function can be used to introduce a delay in asynchronous operations,
 * which is useful for implementing timeouts, throttling, or simulating network latency.
 *
 * @param ms - The delay in milliseconds.
 * @returns A Promise that resolves after the specified delay.
 *
 * @throws {TypeError} If the input is not a valid number.
 *
 * @example
 * async function example() {
 *   console.log('Starting');
 *   await delay(2000);
 *   console.log('2 seconds have passed');
 * }
 *
 * @remarks
 * - The function uses `setTimeout` internally to create the delay.
 * - The returned promise does not reject. If you need cancellation, consider using
 *   `Promise.race()` with a cancellation token.
 * - For very long delays, be aware of the maximum delay value for setTimeout
 *   (usually around 24.8 days on most JavaScript engines).
 */
export const delay = (ms: number): Promise<void> => {
  if (typeof ms !== 'number' || isNaN(ms) || ms < 0) {
    throw new TypeError('Delay must be a non-negative number');
  }
  return new Promise((resolve) => setTimeout(resolve, ms));
};
