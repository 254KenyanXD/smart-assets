import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

process.env.DATABASE_URL = "sqlite::memory:";
process.env.BETTER_AUTH_SECRET ??= "test-secret-that-is-long-enough";

interface HomeData {
  readonly name: string;
  readonly initials: string;
  readonly photoUrl: string | null;
  readonly meta: string;
  readonly universityName: string;
  readonly officialId: string | null;
  readonly loans: readonly { readonly assetTitle: string; readonly assetTag: string; readonly dueLabel: string }[];
  readonly onLoan: number;
  readonly loansThisTerm: number;
  readonly returnedOnTime: number;
  readonly overdue: number;
}

function homeData(officialId: string | null, photoUrl: string | null = null): HomeData {
  return {
    name: "Harris Wesley Mwasi",
    initials: "HM",
    photoUrl,
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

async function render(officialId: string | null, photoUrl: string | null = null): Promise<string> {
  const { StudentHome } = await import("@/app/home/student-home");
  return renderToStaticMarkup(createElement(StudentHome, { data: homeData(officialId, photoUrl) }));
}

describe("student home borrower badge", () => {
  test("draws the QR symbol for a real admission number", async () => {
    const html = await render("23-1943");
    expect(html).toContain("<svg");
    expect(html).toContain('aria-label="Borrower badge"');
    expect(html).toContain("Show this at the desk");

    expect(html).toContain("23-1943");
  });

  test("keeps the painted bars when the profile has no admission number", async () => {
    const html = await render(null);
    expect(html).not.toContain('aria-label="Borrower badge"');
    expect(html).toContain("h-[34px] w-0.5");
    expect(html).toContain("Show this at the desk");
  });

  test("shows the stored portal photo in place of the initials", async () => {
    const photo = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";
    const html = await render("23-1943", photo);
    expect(html).toContain(`src="${photo}"`);
    expect(html).not.toContain(">HM<");
  });

  test("keeps the initials when the profile has no photo", async () => {
    const html = await render("23-1943", "   ");
    expect(html).toContain(">HM<");
    expect(html).not.toContain("<img");
  });
});
