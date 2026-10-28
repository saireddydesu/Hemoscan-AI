declare module 'jsfive' {
  export class File {
    constructor(buffer: ArrayBufferLike, filename?: string);
    keys: string[];
    get(path: string): unknown;
  }
}
