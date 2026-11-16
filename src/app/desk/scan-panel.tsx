"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { createScanLoop, type ScanLoop } from "@/lib/scan/loop";

/** Said when the browser will not open the camera. Typed entry stays on the form. */
const CAMERA_FAILED = "The camera did not start. Type the tag.";

/** Everything the desk Scan button needs. */
export interface ScanPanelProps {
  /** Button words. The desk switches this when the next press is for a badge. */
  readonly label: string;
  /** Called once per accepted read, after the camera has been released. */
  readonly onHit: (text: string) => void;
}

/**
 * The desk camera: one button, one read, then the camera is released.
 *
 * The loop decodes off the main thread and stops itself on the first accepted
 * read. This panel only starts it, shows the preview frame, and stops the
 * camera tracks so the phone does not keep the light on after a read.
 */
export function ScanPanel({ label, onHit }: ScanPanelProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const loopRef = useRef<ScanLoop | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const mountedRef = useRef(true);
  const [active, setActive] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /** Stops the loop, the worker and every camera track. Safe to call twice. */
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
      setActive(true);
      await video.play();
      if (!mountedRef.current) {
        release();
        return;
      }
      const loop = createScanLoop({
        video,
        onHit: (hit) => {
          stopCamera();
          setActive(false);
          onHit(hit.text);
        },
      });
      loopRef.current = loop;
      await loop.start();
    } catch {
      release();
      setError(CAMERA_FAILED);
    }
  }, [active, onHit, release, stopCamera]);

  return (
    <div className="flex flex-col gap-2 md:col-span-2">
      <div className="flex flex-wrap items-center gap-3">
        <Button
          variant="quiet"
          onClick={() => {
            void start();
          }}
        >
          {active ? "Stop camera" : label}
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
    </div>
  );
}
