import { z } from 'zod';

export interface ILocalJsonStorage<
  TDataSchema extends z.ZodObject<any, any, any> = z.ZodObject<any, any, any>,
> {
  config: {
    filePath: string;
    schema: TDataSchema;
  };
}
