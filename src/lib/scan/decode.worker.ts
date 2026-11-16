import { prepareZXingModule } from "zxing-wasm/reader";

import { decodeFrame } from "./decode";
import type { ScanHit } from "./types";

/**
 * The fallback decoder, for a browser without a usable `BarcodeDetector`.
 *
 * A worker keeps the WASM decode off the main thread, so the page never
 * stutters while a frame is being read. The loop sends one frame and waits for
 * the reply: there is only ever one decode in flight.
 */

/** Where the reader binary is served from. The file is `public/scanner/zxing_reader.wasm`. */
const WASM_PATH = "/scanner/zxing_reader.wasm";

prepareZXingModule({
  overrides: {
    locateFile: (path: string, prefix: string) => (path.endsWith(".wasm") ? WASM_PATH : prefix + path),
  },
});

/** One rasterised camera frame, sent by `loop.ts`. */
export interface FrameRequest {
  readonly id: number;
  readonly width: number;
  readonly height: number;
  /** RGBA pixels, `width * height * 4` bytes. */
  readonly pixels: ArrayBuffer;
}

/** The answer to one {@link FrameRequest}. */
export type FrameReply =
  | { readonly id: number; readonly hits: readonly ScanHit[] }
  | { readonly id: number; readonly failed: true };

/**
 * A worker has no `window`, and the DOM types describe the page rather than the
 * worker scope. This is the part of the scope the worker uses.
 */
interface WorkerScope {
  addEventListener(type: "message", listener: (event: MessageEvent<FrameRequest>) => void): void;
  postMessage(message: FrameReply): void;
}

const scope = globalThis as unknown as WorkerScope;

async function decode(request: FrameRequest): Promise<void> {
  try {
    const pixels = new Uint8ClampedArray(request.pixels);
    const hits = await decodeFrame(new ImageData(pixels, request.width, request.height));
    scope.postMessage({ id: request.id, hits });
  } catch {
    // A frame the browser handed over in a shape the decoder cannot use is
    // reported, not thrown: the loop has to keep reading the next one.
    scope.postMessage({ id: request.id, failed: true });
  }
}

scope.addEventListener("message", (event) => {
  void decode(event.data);
});
