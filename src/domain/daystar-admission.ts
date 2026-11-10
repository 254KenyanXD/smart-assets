/**
 * Derive a Daystar admission number from an email local part.
 *
 * A trailing run of six or more digits becomes `AA-BBBB`.
 * `williamkengere231670` becomes `23-1670`. No digit run means the caller must ask.
 *
 * @param localPart - The email local part, already trimmed.
 * @returns The admission number, or null when the local part has no trailing digit run.
 */
export function deriveDaystarAdmission(localPart: string): string | null {
  const match = /(\d{6,})$/.exec(localPart);
  const digits = match?.[1];
  if (digits === undefined) {
    return null;
  }
  return `${digits.slice(0, 2)}-${digits.slice(2)}`;
}

/**
 * Suggest which Daystar portal an email local part belongs to.
 *
 * @param localPart - The email local part.
 * @returns `student` when a trailing digit run is present, otherwise `staff`.
 */
export function suggestDaystarPortal(localPart: string): "student" | "staff" {
  return deriveDaystarAdmission(localPart) === null ? "staff" : "student";
}
