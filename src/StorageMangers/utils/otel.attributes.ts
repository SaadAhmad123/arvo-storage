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
  list: (start: number, count: number) => ({
    'arvo.storage.data.list.query.start': start,
    'arvo.storage.data.list.query.count': count,
  }),
  count: () => ({}),
  delete: (path: string) => ({ [__resourceKey]: path }),
  exists: (path: string) => ({ [__resourceKey]: path }),
};
