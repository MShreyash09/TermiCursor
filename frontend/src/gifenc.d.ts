// gifenc ships no types; only what removeGifBackground.ts uses.
declare module 'gifenc' {
  type Palette = number[][];
  export function quantize(rgba: Uint8Array | Uint8ClampedArray, maxColors: number, opts?: { format?: string; oneBitAlpha?: boolean | number }): Palette;
  export function applyPalette(rgba: Uint8Array | Uint8ClampedArray, palette: Palette, format?: string): Uint8Array;
  export function GIFEncoder(): {
    writeFrame(index: Uint8Array, width: number, height: number, opts?: {
      palette?: Palette; delay?: number; transparent?: boolean; transparentIndex?: number; dispose?: number; repeat?: number;
    }): void;
    finish(): void;
    bytes(): Uint8Array;
  };
}
