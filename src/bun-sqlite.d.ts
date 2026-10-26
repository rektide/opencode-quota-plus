declare module "bun:sqlite" {
  export type DatabaseOptions = {
    readonly?: boolean;
    readwrite?: boolean;
    create?: boolean;
  };

  export class Statement {
    all(...params: unknown[]): unknown[];
    get(...params: unknown[]): unknown;
    run(...params: unknown[]): unknown;
  }

  export class Database {
    constructor(filename: string, options?: DatabaseOptions);
    query(sql: string): Statement;
    close(): void;
  }
}
