import { trace, Span, AttributeValue } from '@opentelemetry/api';
import { getPackageInfo } from './utils';
import { TelemetryLogLevel } from './types';

const pkg = getPackageInfo();

/**
 * A tracer instance for the ArvoEventHandler package.
 */
export const ArvoStorageTracer = trace.getTracer(pkg.name, pkg.version);

/**
 * Logs a message to a span with additional parameters.
 * @param params - The parameters for the log message.
 * @param span - The span to log the message to. If not provided, the active span is used.
 *               If no active span is available, the message is logged to the console.
 */
export const logToSpan = (
  params: {
    /** The log level */
    level: TelemetryLogLevel;
    /** The log message */
    message: string;
    /** Other log parameters */
    [key: string]: string;
  },
  span: Span | undefined = trace.getActiveSpan(),
): void => {
  const toLog = {
    ...params,
    timestamp: performance.now(),
  };
  if (span) {
    span.addEvent('log_message', toLog);
  } else {
    console.log(JSON.stringify(toLog, null, 2));
  }
};

/**
 * Logs an exception to a span and sets exception-related attributes.
 * @param error - The error object to be logged.
 * @param span - The span to log the exception to. If not provided, the active span is used.
 *               If no active span is available, the error is logged to the console.
 */
export const exceptionToSpan = (
  error: Error,
  span: Span | undefined = trace.getActiveSpan(),
) => {
  if (span) {
    span.setAttributes({
      'exception.type': error.name,
      'exception.message': error.message,
    });
    span.recordException(error);
  } else {
    console.error(error);
  }
};

export const setSpanAttributes = (attributes: Record<string, AttributeValue | undefined>) => {
  trace.getActiveSpan()?.setAttributes(attributes)
}