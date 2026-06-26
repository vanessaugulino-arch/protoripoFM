// Shim para path e __dirname até que @types/node seja instalado via pnpm install
declare module "path" {
  export function resolve(...paths: string[]): string;
  export function join(...paths: string[]): string;
  export function dirname(p: string): string;
  export function basename(p: string, ext?: string): string;
  export function extname(p: string): string;
  export const sep: string;
  export const delimiter: string;
}

declare const __dirname: string;
declare const __filename: string;
