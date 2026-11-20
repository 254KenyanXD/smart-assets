"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";

import { SchoolRail } from "@/components/school-rail";
import { Button } from "@/components/ui/button";
import { decodeImage } from "@/lib/scan/decode";
import { createScanLoop, type ScanLoop } from "@/lib/scan/loop";
import { framePercentiles } from "@/lib/scan/timing";
import type { ScanHit } from "@/lib/scan/types";

const CAMERA_FAILED = "The camera did not start. Type the tag.";

const NOT_READ = "That file did not read.";

interface FileRead {
  readonly name: string;

  readonly hits: readonly ScanHit[];

  readonly ms: number | null;
}

export interface ScannerLabProps {
  readonly universityName: string;

  readonly userName: string;

  readonly userInitials: string;

  readonly userRoleLabel: string;

  readonly subtitle: string;
}

export function ScannerLab(props: ScannerLabProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const loopRef = useRef<ScanLoop | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const mountedRef = useRef(true);
  const samplesRef = useRef<number[]>([]);
  const [active, setActive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [file, setFile] = useState<FileRead | null>(null);
  const [tick, setTick] = useState(0);
  const stats = useMemo(() => framePercentiles(samplesRef.current), [tick]);

  const stopCamera = useCallback(() => {
    const loop = loopRef.current;
    loopRef.current = null;
    if (loop !== null) loop.stop();
    const stream = streamRef.current;
    streamRef.current = null;
    if (stream !== null) {
      for (const track of stream.getTracks()) track.stop();
    }
    const video = videoRef.current;
    if (video !== null) video.srcObject = null;
  }, []);

  const release = useCallback(() => {
    stopCamera();
    setActive(false);
  }, [stopCamera]);

  useEffect(() => stopCamera, [stopCamera]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => {
      setTick((value) => value + 1);
    }, 500);
    return () => {
      clearInterval(timer);
    };
  }, [active]);

  const start = useCallback(async () => {
    if (active) {
      release();
      return;
    }
    const video = videoRef.current;
    if (video === null) {
      setError(CAMERA_FAILED);
      return;
    }
    setError(null);
    if (typeof navigator === "undefined" || navigator.mediaDevices === undefined) {
      setError(CAMERA_FAILED);
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment", width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      if (!mountedRef.current) {
        for (const track of stream.getTracks()) track.stop();
        return;
      }
      streamRef.current = stream;
      video.srcObject = stream;
      samplesRef.current = [];
      setTick((value) => value + 1);
      setActive(true);
      await video.play();
      if (!mountedRef.current) {
        release();
        return;
      }
      const loop = createScanLoop({
        video,
        onSample: (sample) => {
          samplesRef.current.push(sample.ms);
        },
      });
      loopRef.current = loop;
      await loop.start();
    } catch {
      release();
      setError(CAMERA_FAILED);
    }
  }, [active, release]);

  async function readFile(event: ChangeEvent<HTMLInputElement>): Promise<void> {
    const input = event.currentTarget;
    const chosen = input.files?.[0];
    if (chosen === undefined) {
      setFile(null);
      return;
    }
    let bytes: Uint8Array;
    try {
      bytes = new Uint8Array(await chosen.arrayBuffer());
    } catch {
      setFile({ name: chosen.name, hits: [], ms: null });
      input.value = "";
      return;
    }
    const started = performance.now();
    const hits = await decodeImage(bytes, chosen.type);
    const elapsed = performance.now() - started;
    setFile({ name: chosen.name, hits, ms: elapsed });
    input.value = "";
  }

  return (
    <div className="flex min-h-screen flex-col bg-bg md:flex-row">
      <SchoolRail
        universityName={props.universityName}
        userName={props.userName}
        userInitials={props.userInitials}
        userRoleLabel={props.userRoleLabel}
        ariaLabel="Desk"
        current="Desk"
        hrefs={{ Desk: "/desk" }}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex flex-col gap-3 border-b border-line bg-surface px-5 py-3 md:flex-row md:items-center md:justify-between md:px-7">
          <nav aria-label="Breadcrumb">
            <ol className="flex flex-wrap items-center gap-[6px] text-[12px]">
              <li className="text-ink3">{props.universityName}</li>
              <li aria-hidden="true" className="text-ink3">
                <svg viewBox="0 0 14 14" className="h-3 w-3" aria-hidden="true">
                  <path d="M5 3.5 L8.5 7 L5 10.5" fill="none" stroke="currentColor" strokeWidth="1.4" />
                </svg>
              </li>
              <li className="font-medium text-ink2">Scanner lab</li>
            </ol>
          </nav>
          <div className="flex flex-wrap items-center gap-[10px]">
            <span className="flex h-[32px] w-[32px] shrink-0 items-center justify-center rounded-full bg-accsoft text-[10px] font-semibold text-accent">
              {props.userInitials}
            </span>
          </div>
        </header>
        <main className="flex flex-col gap-5 p-[20px] md:p-[24px_28px_26px_28px]">
          <div className="flex flex-col gap-[6px]">
            <h1 className="font-display text-[24px] font-semibold text-ink">Scanner lab</h1>
            <p className="text-[12.5px] text-ink3">{props.subtitle}</p>
          </div>
          <section className="flex flex-col gap-3 rounded-[18px] border border-line bg-surface p-[18px]">
            <h2 className="font-display text-[15px] font-semibold text-ink">Image file</h2>
            <p className="text-[12px] text-ink2">
              Decodes the file once on this device and times that decode. Nothing is recorded.
            </p>
            <label className="flex flex-col gap-1 text-[11px] text-ink3">
              Image
              <input
                type="file"
                accept="image/*"
                aria-label="Image file"
                onChange={(event) => {
                  void readFile(event);
                }}
                className="w-full max-w-[360px] rounded-[10px] border border-line bg-alt px-3 py-2 text-[12px] text-ink file:mr-3 file:rounded-lg file:border-0 file:bg-accsoft file:px-3 file:py-1.5 file:text-[12px] file:font-medium file:text-accent"
              />
            </label>
            {file === null ? null : <FileResult read={file} />}
          </section>
          <section className="flex flex-col gap-3 rounded-[18px] border border-line bg-surface p-[18px]">
            <h2 className="font-display text-[15px] font-semibold text-ink">Live camera</h2>
            <p className="text-[12px] text-ink2">
              The same loop the desk runs. It keeps running after a read here, so one tag produces
              many frames. Nothing is checked out or in.
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <Button
                variant="quiet"
                onClick={() => {
                  void start();
                }}
              >
                {active ? "Stop camera" : "Start camera"}
              </Button>
              {error !== null ? <p className="text-[12px] text-ink2">{error}</p> : null}
            </div>
            <video
              ref={videoRef}
              playsInline
              muted
              className={
                active
                  ? "h-[180px] w-full max-w-[320px] rounded-xl border border-line bg-alt object-cover"
                  : "hidden"
              }
            />
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <Stat label="Frames" value={stats === null ? "-" : String(stats.count)} />
              <Stat label="p50" value={stats === null ? "-" : `${Math.round(stats.p50)} ms`} />
              <Stat label="p95" value={stats === null ? "-" : `${Math.round(stats.p95)} ms`} />
              <Stat label="p99" value={stats === null ? "-" : `${Math.round(stats.p99)} ms`} />
            </div>
            {stats === null ? <p className="text-[12px] text-ink2">No frames yet.</p> : null}
          </section>
        </main>
      </div>
    </div>
  );
}

function FileResult({ read }: { readonly read: FileRead }) {
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-line bg-alt px-3 py-2">
      <p className="truncate text-[11px] text-ink3">{read.name}</p>
      {read.hits.length === 0 ? (
        <p className="text-[12px] text-ink2">{NOT_READ}</p>
      ) : (
        <ul className="flex flex-col gap-1">
          {read.hits.map((hit) => (
            <li key={`${hit.format}:${hit.text}`} className="flex flex-wrap items-baseline gap-2">
              <span className="font-mono text-[12px] text-ink">{hit.text}</span>
              <span className="font-mono text-[11px] text-ink3">{hit.format}</span>
            </li>
          ))}
        </ul>
      )}
      {read.ms === null ? null : (
        <p className="font-mono text-[11px] text-ink3">{Math.round(read.ms)} ms</p>
      )}
    </div>
  );
}

function Stat({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <div className="rounded-xl border border-line bg-alt px-3 py-2">
      <p className="text-[10px] font-semibold text-ink3">{label}</p>
      <p className="font-mono text-[13px] text-ink">{value}</p>
    </div>
  );
}
