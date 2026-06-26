// Fallback type declaration for xlsx (SheetJS) until installed via pnpm install
// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare module "xlsx" {
  export interface ParsingOptions {
    type?: "base64" | "binary" | "buffer" | "array" | "string";
    cellDates?: boolean;
    cellNF?: boolean;
    cellText?: boolean;
    dateNF?: string;
    raw?: boolean;
    [key: string]: any;
  }
  export interface Sheet2JSONOpts {
    header?: number | string | string[];
    defval?: any;
    blankrows?: boolean;
    raw?: boolean;
    range?: any;
    [key: string]: any;
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export function read(data: ArrayBuffer | Uint8Array | string, opts?: ParsingOptions): any;
  export const utils: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    sheet_to_json: (sheet: any, opts?: Sheet2JSONOpts) => any[];
    book_new: () => any;
    book_append_sheet: (wb: any, ws: any, name?: string) => void;
    aoa_to_sheet: (data: any[][]) => any;
    [key: string]: any;
  };
  export function writeFile(wb: any, filename: string, opts?: any): void;
}
