import { describe, expect, test } from "bun:test";

import { routeScan } from "@/lib/scan/route";

const loans = [{ assetId: "asset_1", assetTag: "SA-0001" }];

describe("routeScan", () => {
  test("the student phase always answers a student, even when the payload is a loan tag", () => {
    expect(routeScan("student", "SA-0001", loans)).toEqual({ kind: "student" });
  });

  test("the asset phase matches an open loan by its exact tag", () => {
    expect(routeScan("asset", "SA-0001", loans)).toEqual({ kind: "loan", assetId: "asset_1" });
  });

  test("the asset phase treats any other payload as a checkout tag", () => {
    expect(routeScan("asset", "SA-0002", loans)).toEqual({ kind: "tag" });
  });

  test("trims the payload before matching", () => {
    expect(routeScan("asset", "  SA-0001\n", loans)).toEqual({ kind: "loan", assetId: "asset_1" });
    expect(routeScan("student", "  23-1943  ", loans)).toEqual({ kind: "student" });
  });

  test("a tag is matched as stored, so a different case is a new checkout tag", () => {
    expect(routeScan("asset", "sa-0001", loans)).toEqual({ kind: "tag" });
  });
});
