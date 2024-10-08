import { logToSpan } from '../../OpenTelemetry';

const __resourceKey = 'arvo.storage.data.key';
export const storageManagerOtelAttributes = {
  write: (path: string, data: any) => {
    let dataJson: string | undefined = undefined;
    try {
      dataJson = JSON.stringify(data);
    } catch (e) {
      logToSpan({
        level: 'ERROR',
        message: (e as Error).message,
      });
    }
    return {
      [__resourceKey]: path,
      'arvo.storage.data.size': dataJson?.length ?? 0,
    };
  },
  read: (path: string) => ({ [__resourceKey]: path }),
  delete: (path: string) => ({ [__resourceKey]: path }),
  exists: (path: string) => ({ [__resourceKey]: path }),
  dataFound: (success: boolean) => ({'arvo.storage.data.exists': success}),
};
