import { parsePhoneNumberFromString } from "libphonenumber-js";

// Addresses store phone numbers as plain E.164 (e.g. "+923001234567") —
// this is display-only formatting for readability (e.g. "+92 300 1234567"),
// never used for validation or storage. Falls back to the raw value on
// anything unparsable rather than throwing, since this only ever renders
// already-stored data.
export function formatPhoneNumber(phone: string): string {
  const parsed = parsePhoneNumberFromString(phone);
  return parsed ? parsed.formatInternational() : phone;
}
