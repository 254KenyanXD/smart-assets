import { prepareZXingModule } from "zxing-wasm/reader";

import { decodeFrame } from "./decode";
import type { ScanHit } from "./types";

const WASM_PATH = "/scanner/zxing_reader.wasm";

prepareZXingModule({
  overrides: {
    locateFile: (path: string, prefix: string) => (path.endsWith(".wasm") ? WASM_PATH : prefix + path),
  },
});

export interface FrameRequest {
  readonly id: number;
  readonly width: number;
  readonly height: number;

  readonly pixels: ArrayBuffer;
}

export type FrameReply =
  | { readonly id: number; readonly hits: readonly ScanHit[] }
  | { readonly id: number; readonly failed: true };

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
    scope.postMessage({ id: request.id, failed: true });
  }
}

scope.addEventListener("message", (event) => {
  void decode(event.data);
});
