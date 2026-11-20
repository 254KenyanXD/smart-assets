import { chromium, expect, test, type Page } from "@playwright/test";

import {
  code128Video,
  daystarAttendantEmail,
  daystarTitle,
  partialOrigin,
  partialPassword,
  qrVideo,
  sharedTag,
  strathmoreAttendantEmail,
  strathmoreTitle,
  studentOfficialId,
} from "./partials-accounts";

async function signIn(page: Page, email: string): Promise<void> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await page.goto("/sign-in");
    await page.locator("#email").fill(email);
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    await expect(page.locator("#local-password")).toBeVisible();
    await page.locator("#local-password").fill(partialPassword);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    const reachedDesk = await page
      .waitForURL(/\/desk$/, { timeout: 8_000 })
      .then(() => true)
      .catch(() => false);
    if (reachedDesk) {
      await expect(page.getByRole("heading", { name: "Desk", exact: true })).toBeVisible();
      return;
    }
    await expect(page.getByText("Too many requests. Please try again later.")).toBeVisible();
    await page.waitForTimeout(10_000);
  }
  throw new Error(`Sign-in for ${email} stayed rate limited.`);
}

async function stat(page: Page, label: string): Promise<string> {
  const value = page.getByText(label, { exact: true }).locator("xpath=following-sibling::p[1]");
  return (await value.innerText()).trim();
}

test.describe.serial("two signed-in universities and a typed tag", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      const media = navigator.mediaDevices;
      if (media === undefined) return;
      const reject = () => Promise.reject(new Error("camera disabled"));
      media.getUserMedia = reject;
      const prototype = Object.getPrototypeOf(media) as MediaDevices | null;
      if (prototype !== null) {
        Object.defineProperty(prototype, "getUserMedia", { configurable: true, value: reject });
      }
    });
  });

  test("each university sees only its own asset", async ({ page }) => {
    await signIn(page, daystarAttendantEmail);
    await expect(page.getByText("Daystar University").first()).toBeVisible();
    await expect(page.getByText(daystarTitle)).toBeVisible();
    await expect(page.getByText(strathmoreTitle)).toHaveCount(0);
    await expect(page.getByRole("cell", { name: "Available", exact: true })).toBeVisible();

    await page.goto("/sign-in");
    await page.context().clearCookies();
    await signIn(page, strathmoreAttendantEmail);
    await expect(page.getByText("Strathmore University").first()).toBeVisible();
    await expect(page.getByText(strathmoreTitle)).toBeVisible();
    await expect(page.getByText(daystarTitle)).toHaveCount(0);
    await expect(page.getByRole("cell", { name: "Procured", exact: true })).toBeVisible();
  });

  test("a typed tag checks out the same asset with the camera disabled", async ({ page }) => {
    await signIn(page, daystarAttendantEmail);
    const cameraRefused = page.getByText("The camera did not start. Type the tag.");
    await expect(async () => {
      if (await cameraRefused.isVisible()) return;
      await page.getByRole("button", { name: "Scan tag" }).click();
      await expect(cameraRefused).toBeVisible({ timeout: 1_500 });
    }).toPass({ timeout: 15_000 });
    await expect(page.getByRole("button", { name: "Scan tag" })).toBeVisible();

    const checkout = page.locator("form").filter({ has: page.getByRole("heading", { name: "Checkout" }) });
    await checkout.getByRole("textbox", { name: "Asset tag" }).fill(sharedTag);
    await checkout.getByRole("textbox", { name: "Student email or admission number" }).fill(studentOfficialId);
    await checkout.getByRole("button", { name: "Confirm checkout" }).click();
    await expect(checkout.getByRole("textbox", { name: "Asset tag" })).toHaveValue("");

    await page.reload();
    await expect(page.getByText(daystarTitle).first()).toBeVisible();
    await expect(page.getByRole("cell", { name: "In custody", exact: true })).toBeVisible();
    await expect(page.getByText(studentOfficialId).first()).toBeVisible();
    await expect(page.getByRole("button", { name: "Check in" })).toBeVisible();
    await expect(page.getByText(strathmoreTitle)).toHaveCount(0);
  });
});

async function readWasmFrames(video: string, expected: string): Promise<void> {
  const browser = await chromium.launch({
    executablePath: "/usr/bin/chromium",
    headless: true,
    args: [
      "--no-sandbox",
      "--use-fake-ui-for-media-stream",
      "--use-fake-device-for-media-stream",
      `--use-file-for-fake-video-capture=${video}`,
      "--autoplay-policy=no-user-gesture-required",
    ],
  });
  const context = await browser.newContext({ baseURL: partialOrigin, viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();
  try {
    await collectWasmFrames(page, expected);
  } finally {
    await browser.close();
  }
}

async function collectWasmFrames(page: Page, expected: string): Promise<void> {
  await page.addInitScript(() => {
    const record = { replies: 0, hits: [] as string[] };
    (window as unknown as { __wasmFrames: { replies: number; hits: string[] } }).__wasmFrames = record;
    const nativeWorker = window.Worker;
    function PatchedWorker(this: Worker, url: string | URL, options?: WorkerOptions): Worker {
      const worker = new nativeWorker(url, options);
      worker.addEventListener("message", (event: MessageEvent) => {
        const data = event.data as { hits?: { text?: string; format?: string }[]; failed?: boolean };
        if (data === null || typeof data !== "object") return;
        record.replies += 1;
        if (!Array.isArray(data.hits)) return;
        for (const hit of data.hits) {
          if (typeof hit.text === "string" && typeof hit.format === "string") {
            record.hits.push(`${hit.format}:${hit.text}`);
          }
        }
      });
      return worker;
    }
    PatchedWorker.prototype = nativeWorker.prototype;
    window.Worker = PatchedWorker as unknown as typeof Worker;
    Object.defineProperty(window, "BarcodeDetector", { configurable: true, writable: true, value: undefined });
  });

  await signIn(page, daystarAttendantEmail);
  await page.goto("/lab/scanner");
  await expect(page.getByRole("heading", { name: "Scanner lab", exact: true })).toBeVisible();
  const detector = await page.evaluate(() => "BarcodeDetector" in window && window.BarcodeDetector !== undefined);
  expect(detector).toBe(false);
  await page.getByRole("button", { name: "Start camera" }).click();

  await expect
    .poll(async () => Number.parseInt(await stat(page, "Frames"), 10), { timeout: 90_000 })
    .toBeGreaterThanOrEqual(100);
  await page.waitForTimeout(600);

  const frames = await page.evaluate(() => {
    return (window as unknown as { __wasmFrames?: { replies: number; hits: string[] } }).__wasmFrames ?? {
      replies: 0,
      hits: [],
    };
  });
  expect(frames.replies).toBeGreaterThan(0);
  expect(frames.hits).toContain(expected);
  const p50 = await stat(page, "p50");
  const p95 = await stat(page, "p95");
  const p99 = await stat(page, "p99");
  const count = await stat(page, "Frames");
  console.log(`wasm-frames expected=${expected} count=${count} p50=${p50} p95=${p95} p99=${p99} replies=${frames.replies} hits=${frames.hits.length}`);
  await page.getByRole("button", { name: "Stop camera" }).click();
}

test("records a code 128 distribution with no BarcodeDetector", async () => {
  await readWasmFrames(code128Video, "code_128:10064908");
});

test("records a qr distribution with no BarcodeDetector", async () => {
  await readWasmFrames(qrVideo, "qr_code:Morden");
});
