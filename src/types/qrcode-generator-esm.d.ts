/* The ESM build of qrcode-generator, which the package's own bundled types do
   not describe — they document its CommonJS `export =` shape instead. See
   src/lib/qr.ts for why this is imported by path. */
declare module 'qrcode-generator/dist/qrcode.mjs' {
  interface QRCode {
    addData(data: string, mode?: 'Numeric' | 'Alphanumeric' | 'Byte' | 'Kanji'): void;
    make(): void;
    getModuleCount(): number;
    isDark(row: number, col: number): boolean;
  }

  export function qrcode(
    typeNumber: number,
    errorCorrectionLevel: 'L' | 'M' | 'Q' | 'H',
  ): QRCode;
}
