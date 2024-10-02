/**
 * Converts a Date object to a Unix timestamp in seconds.
 * 
 * @param date - The Date object to convert.
 * @returns The Unix timestamp in seconds.
 * 
 * @example
 * const now = new Date();
 * const timestamp = dateToUnixTimestampInSeconds(now);
 * console.log(timestamp); // e.g., 1635784800
 */
export const dateToUnixTimestampInSeconds = (date: Date): number => {
  return Math.floor(date.getTime() / 1000);
};

/**
 * Converts a Unix timestamp in seconds to a Date object.
 * 
 * @param timestamp - The Unix timestamp in seconds to convert.
 * @returns A Date object representing the Unix timestamp.
 * 
 * @example
 * const timestamp = 1635784800;
 * const date = unixTimestampInSecondsToDate(timestamp);
 * console.log(date.toISOString()); // e.g., "2021-11-01T12:00:00.000Z"
 */
export const unixTimestampInSecondsToDate = (timestamp: number): Date => {
  return new Date(timestamp * 1000);
};