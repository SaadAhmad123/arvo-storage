import {
  trace,
  Span,
  AttributeValue,
  context,
  SpanStatusCode,
} from '@opentelemetry/api';
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

/**
 * Sets attributes on the currently active span.
 *
 * @param attributes - An object containing key-value pairs of attributes to set on the span.
 *                     Keys are strings, and values can be any valid AttributeValue or undefined.
 * @remarks
 * This function attempts to set the provided attributes on the currently active span.
 * If no active span is available, this function will have no effect.
 * Undefined values in the attributes object will be ignored.
 */
export const setSpanAttributes = (
  attributes: Record<string, AttributeValue | undefined>,
) => {
  trace.getActiveSpan()?.setAttributes(attributes);
};

/**
 * Creates an execution tracer function that wraps operations with OpenTelemetry tracing.
 *
 * @param param - Optional configuration for the tracer.
 * @param param.name - Optional prefix for the operation name.
 * @param param.attributes - Optional default attributes to be added to all spans.
 * @returns A function that executes operations with tracing.
 */
export const createExecutionTracer = (param?: {
  name?: string;
  attributes?: Record<string, AttributeValue | undefined>;
}) => {
  /**
   * Executes a function with OpenTelemetry tracing.
   *
   * @template T - The type of the value returned by the action.
   * @param operation - The name of the operation being traced.
   * @param action - The async function to be executed within the traced context.
   * @param attributes - Additional attributes to be added to the span.
   * @returns A promise that resolves to the result of the executed action.
   * @throws Rethrows any error that occurs during the operation, after recording it in the span.
   */
  return async <T>(
    operation: string,
    action: (span: Span) => Promise<T>,
    attributes: Record<string, AttributeValue | undefined> = {},
  ): Promise<T> => {
    const span = ArvoStorageTracer.startSpan(
      param?.name ? `${param.name}.${operation}` : operation,
      {
        attributes: {
          ...(param?.attributes ?? {}),
          ...attributes,
        },
      },
    );

    try {
      const result = await context.with(
        trace.setSpan(context.active(), span),
        async () => await action(span),
      );
      span.setStatus({ code: SpanStatusCode.OK });
      return result;
    } catch (error) {
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: (error as Error).message,
      });
      exceptionToSpan(error as Error, span);
      throw error;
    } finally {
      span.end();
    }
  };
};
