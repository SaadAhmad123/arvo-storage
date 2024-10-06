export const storageManagerOtelAttributes = {
  write: () => {},
  read: () => {},
  list: () => {},
  count: () => {},
  delete: () => {},
  exists: (path: string) => ({'arvo.storage.data.key': path})
}