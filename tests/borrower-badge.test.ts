import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

/**
 * The home imports the desk actions through the found-tag card, and those boot
 * the auth runtime. Point it at a memory database so the render does not touch
 * the working copy of `data/app.db`. Both values are set before that import.
 */
process.env.DATABASE_URL = "sqlite::memory:";
process.env.BETTER_AUTH_SECRET ??= "test-secret-that-is-long-enough";

interface HomeData {
  readonly name: string;
  readonly initials: string;
  readonly meta: string;
  readonly universityName: string;
  readonly officialId: string | null;
  readonly loans: readonly { readonly assetTitle: string; readonly assetTag: string; readonly dueLabel: string }[];
  readonly onLoan: number;
  readonly loansThisTerm: number;
  readonly returnedOnTime: number;
  readonly overdue: number;
}

function homeData(officialId: string | null): HomeData {
  return {
    name: "Harris Wesley Mwasi",
    initials: "HM",
    meta: "23-1943 - Applied Computer Science",
    universityName: "Daystar University",
    officialId,
    loans: [],
    onLoan: 0,
    loansThisTerm: 0,
    returnedOnTime: 0,
    overdue: 0,
  };
}

async function render(officialId: string | null): Promise<string> {
  const { StudentHome } = await import("@/app/home/student-home");
  return renderToStaticMarkup(createElement(StudentHome, { data: homeData(officialId) }));
}

describe("student home borrower badge", () => {
  test("draws the QR symbol for a real admission number", async () => {
    const html = await render("23-1943");
    expect(html).toContain("<svg");
    expect(html).toContain('aria-label="Borrower badge"');
    expect(html).toContain("Show this at the desk");
    // The payload is the admission number, so the text is already on the card.
    expect(html).toContain("23-1943");
  });

  test("keeps the painted bars when the profile has no admission number", async () => {
    const html = await render(null);
    expect(html).not.toContain('aria-label="Borrower badge"');
    expect(html).toContain("h-[34px] w-0.5");
    expect(html).toContain("Show this at the desk");
  });
});
