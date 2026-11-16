import type { FrameReply, FrameRequest } from "./decode.worker";
import { acceptHit, scanFormats, type PriorHit, type ScanFormat, type ScanHit } from "./types";

/**
 * The camera loop.
 *
 * One decode is in flight at a time, and the next frame is requested only
 * after the last one was answered. Frames that arrive while a decode is busy
 * are not queued: a queue makes the desk feel slower, because it reads old
 * frames after the tag has already left the view.
 *
 * The native `BarcodeDetector` is used when the browser has one. Otherwise the
 * frame is rasterised and sent to the worker, so no JavaScript decoder ever
 * runs on the main thread. React is not involved until a hit is accepted.
 */

/** One barcode a native detector reported. */
interface DetectedBarcode {
  readonly rawValue: string;
  readonly format: string;
}

/** The part of `BarcodeDetector` this loop uses. Not in the DOM type set. */
interface Detector {
  detect(source: CanvasImageSource): Promise<readonly DetectedBarcode[]>;
}

interface DetectorConstructor {
  new (options?: { formats?: readonly string[] }): Detector;
}

/** One rasterised frame on its way to the worker. */
interface Frame {
  readonly width: number;
  readonly height: number;
  readonly pixels: ArrayBuffer;
}

/** A loop that has been created but not started. */
export interface ScanLoop {
  /** Begins reading frames from the video. Resolves as soon as the loop is running. */
  start(): Promise<void>;
  /** Cancels the pending frame, resolves any waiting decode and releases the worker. */
  stop(): void;
}

/** What the desk hands the loop. */
export interface ScanLoopOptions {
  readonly video: HTMLVideoElement;
  /** Called once per accepted read, after the vibration and the tone. */
  readonly onHit: (hit: ScanHit) => void;
}

/** How long the hit feedback tone lasts, in seconds. */
const TONE_SECONDS = 0.06;

/** Feedback tone, in hertz. High enough to hear over a room full of people. */
const TONE_HZ = 880;

function toFormat(value: string): ScanFormat | null {
  for (const format of scanFormats) {
    if (format === value) return format;
  }
  return null;
}

/**
 * Builds a native detector, or returns null when the browser has none.
 *
 * @returns A detector restricted to the desk formats, or null.
 */
function createDetector(): Detector | null {
  const constructor = (globalThis as { BarcodeDetector?: DetectorConstructor }).BarcodeDetector;
  if (constructor === undefined) return null;
  try {
    return new constructor({ formats: [...scanFormats] });
  } catch {
    // A browser may know the API and refuse one format in the list. Retrying
    // without the hint keeps the loop working, and the hits are filtered below.
    try {
      return new constructor();
    } catch {
      return null;
    }
  }
}

/**
 * Starts a scan loop over one video element.
 *
 * @param options - The video to read and the callback for an accepted read.
 * @returns A loop with `start` and `stop`.
 */
export function createScanLoop(options: ScanLoopOptions): ScanLoop {
  const { video, onHit } = options;
  const detector = createDetector();

  let running = false;
  let handle: number | null = null;
  let handleKind: "video" | "frame" | null = null;
  let prior: PriorHit | null = null;

  let worker: Worker | null = null;
  let pending: { readonly id: number; readonly resolve: (hits: readonly ScanHit[]) => void } | null = null;
  let requestId = 0;

  let canvas: HTMLCanvasElement | null = null;
  let audio: AudioContext | null = null;

  function beep(): void {
    if (typeof AudioContext === "undefined") return;
    try {
      if (audio === null) audio = new AudioContext();
      const context = audio;
      void context.resume();
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = "sine";
      oscillator.frequency.value = TONE_HZ;
      gain.gain.value = 0.08;
      oscillator.connect(gain);
      gain.connect(context.destination);
      const start = context.currentTime;
      oscillator.start(start);
      oscillator.stop(start + TONE_SECONDS);
    } catch {
      // Sound is feedback, not a requirement. A blocked AudioContext must not
      // stop the hit from reaching the desk.
    }
  }

  function vibrate(): void {
    if (typeof navigator === "undefined") return;
    if (typeof navigator.vibrate !== "function") return;
    navigator.vibrate(40);
  }

  function frameCanvas(): HTMLCanvasElement {
    if (canvas === null) {
      const element = document.createElement("canvas");
      canvas = element;
    }
    return canvas;
  }

  function grab(): Frame | null {
    const width = video.videoWidth;
    const height = video.videoHeight;
    if (width === 0 || height === 0) return null;
    const element = frameCanvas();
    if (element.width !== width) element.width = width;
    if (element.height !== height) element.height = height;
    const context = element.getContext("2d", { alpha: false, willReadFrequently: true });
    if (context === null) return null;
    context.drawImage(video, 0, 0, width, height);
    const image = context.getImageData(0, 0, width, height);
    const pixels = image.data.slice();
    return { width, height, pixels: pixels.buffer };
  }

  function ensureWorker(): Worker | null {
    if (worker !== null) return worker;
    if (typeof Worker === "undefined") return null;
    try {
      const created = new Worker(new URL("./decode.worker.ts", import.meta.url), { type: "module" });
      created.addEventListener("message", (event: MessageEvent<FrameReply>) => {
        const reply = event.data;
        const waiting = pending;
        if (waiting === null || waiting.id !== reply.id) return;
        pending = null;
        waiting.resolve("failed" in reply ? [] : reply.hits);
      });
      worker = created;
      return created;
    } catch {
      return null;
    }
  }

  function readNative(): Promise<readonly ScanHit[]> {
    if (detector === null) return Promise.resolve([]);
    return detector.detect(video).then(
      (found) => {
        const hits: ScanHit[] = [];
        for (const item of found) {
          if (item.rawValue.length === 0) continue;
          const format = toFormat(item.format);
          if (format === null) continue;
          hits.push({ text: item.rawValue, format });
        }
        return hits;
      },
      () => [],
    );
  }

  function readWorker(): Promise<readonly ScanHit[]> {
    const active = ensureWorker();
    if (active === null) return Promise.resolve([]);
    const frame = grab();
    if (frame === null) return Promise.resolve([]);
    return new Promise<readonly ScanHit[]>((resolve) => {
      requestId += 1;
      const id = requestId;
      pending = { id, resolve };
      const request: FrameRequest = {
        id,
        width: frame.width,
        height: frame.height,
        pixels: frame.pixels,
      };
      active.postMessage(request, [frame.pixels]);
    });
  }

  function read(): Promise<readonly ScanHit[]> {
    return detector === null ? readWorker() : readNative();
  }

  function schedule(): void {
    if (!running) return;
    if (typeof video.requestVideoFrameCallback === "function") {
      handleKind = "video";
      handle = video.requestVideoFrameCallback(() => {
        handle = null;
        void step();
      });
      return;
    }
    handleKind = "frame";
    handle = requestAnimationFrame(() => {
      handle = null;
      void step();
    });
  }

  function announce(hit: ScanHit): void {
    vibrate();
    beep();
    onHit(hit);
    stop();
  }

  async function step(): Promise<void> {
    if (!running) return;
    const hits = await read();
    if (!running) return;
    const now = performance.now();
    for (const hit of hits) {
      if (!acceptHit(prior, hit.text, now)) continue;
      prior = { text: hit.text, at: now };
      announce(hit);
      return;
    }
    schedule();
  }

  function stop(): void {
    running = false;
    if (handle !== null) {
      if (handleKind === "video" && typeof video.cancelVideoFrameCallback === "function") {
        video.cancelVideoFrameCallback(handle);
      }
      if (handleKind === "frame") cancelAnimationFrame(handle);
      handle = null;
    }
    handleKind = null;
    const waiting = pending;
    pending = null;
    if (waiting !== null) waiting.resolve([]);
    if (worker !== null) {
      worker.terminate();
      worker = null;
    }
    if (audio !== null) {
      void audio.close();
      audio = null;
    }
  }

  return {
    async start(): Promise<void> {
      if (running) return;
      running = true;
      schedule();
    },
    stop,
  };
}
