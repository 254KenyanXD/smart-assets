
export function deriveDaystarAdmission(localPart: string): string | null {
  const match = /(\d{6,})$/.exec(localPart);
  const digits = match?.[1];
  if (digits === undefined) {
    return null;
  }
  return `${digits.slice(0, 2)}-${digits.slice(2)}`;
}

export function suggestDaystarPortal(localPart: string): "student" | "staff" {
  return deriveDaystarAdmission(localPart) === null ? "staff" : "student";
}
