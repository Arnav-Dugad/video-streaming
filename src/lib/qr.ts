/* ==========================================================================
   qrcode-generator, imported honestly.

   The package ships `export = qrcode` in its type declarations, which describes
   its CommonJS build. Its ESM build exports a *named* `qrcode` and no default
   at all — so the types say "default import" and the file a bundler actually
   picks says otherwise, and the build fails on the mismatch.

   Importing the ESM entry directly, with a declaration that matches what that
   file really exports, is the fix. It is a deep import, which is normally worth
   avoiding, but this package publishes no `exports` map, so the path is part of
   its public surface rather than something being reached around.

   Only the four members used here are declared. The library can draw its own
   SVG and canvas output; we want the module matrix and nothing else, because
   the drawing is ours.
   ========================================================================== */

import { qrcode as factory } from 'qrcode-generator/dist/qrcode.mjs';

export type ErrorCorrection = 'L' | 'M' | 'Q' | 'H';

export interface QrMatrix {
  count: number;
  isDark(row: number, col: number): boolean;
}

/** Type number 0 lets the library pick the smallest version the data fits. */
export function qrMatrix(data: string, level: ErrorCorrection = 'Q'): QrMatrix {
  const code = factory(0, level);
  code.addData(data);
  code.make();

  const count = code.getModuleCount();
  return { count, isDark: (row, col) => code.isDark(row, col) };
}
