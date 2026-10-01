// Exact money for payments. Nexora's store and payment currency is USD only.
//
// Amounts are integer minor units (US cents) held as bigint, so no value on
// the payment path ever passes through floating point: "149.99" -> 14999n.
// Conversion is done on the decimal STRING itself — never Number(x) * 100,
// parseFloat or Math.round, which can silently produce the wrong number of cents.
//
// No "server-only" here on purpose: this module holds no secrets and the
// checkout UI may format amounts with it later.

export const STORE_CURRENCY = "USD";
export type Currency = typeof STORE_CURRENCY;

export type Money = {
  readonly currency: Currency;
  readonly amountMinor: bigint;
};

// The database stores totals as numeric(10, 2), so 99,999,999.99 is the
// largest amount that can ever exist on an order or checkout session.
// (BigInt() calls rather than 123n literals: the project compiles to ES2017.)
const ZERO = BigInt(0);
const ONE_HUNDRED = BigInt(100);
export const MAX_AMOUNT_MINOR = BigInt("9999999999");

// Whole dollars without leading zeros (or a single 0), up to 8 digits, then
// an optional 1–2 digit fraction. Rejects signs, exponents, separators,
// currency symbols, whitespace, "NaN" and "Infinity" by construction.
const USD_DECIMAL = /^(0|[1-9][0-9]{0,7})(?:\.([0-9]{1,2}))?$/;

export class MoneyFormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MoneyFormatError";
    Object.setPrototypeOf(this, MoneyFormatError.prototype);
  }
}

function assertInRange(amountMinor: bigint): void {
  if (amountMinor < ZERO) throw new MoneyFormatError("Amount must not be negative.");
  if (amountMinor > MAX_AMOUNT_MINOR) throw new MoneyFormatError("Amount exceeds the supported maximum.");
}

// "149.99" -> 14999, "1.5" -> 150, "0" -> 0 (as bigint). Throws MoneyFormatError for
// anything that is not an exact, non-negative USD decimal.
export function usdDecimalToMinor(value: string): bigint {
  if (typeof value !== "string") throw new MoneyFormatError("Amount must be a decimal string.");
  const match = USD_DECIMAL.exec(value);
  if (!match) throw new MoneyFormatError("Amount is not a valid USD decimal.");
  const whole = BigInt(match[1]);
  const fraction = BigInt((match[2] ?? "").padEnd(2, "0"));
  const amountMinor = whole * ONE_HUNDRED + fraction;
  assertInRange(amountMinor);
  return amountMinor;
}

// 14999 -> "149.99", 8000 -> "80.00".
export function minorToUsdDecimal(amountMinor: bigint): string {
  if (typeof amountMinor !== "bigint") throw new MoneyFormatError("Amount must be a bigint.");
  assertInRange(amountMinor);
  const whole = amountMinor / ONE_HUNDRED;
  const fraction = (amountMinor % ONE_HUNDRED).toString().padStart(2, "0");
  return `${whole}.${fraction}`;
}

export function usd(amountMinor: bigint): Money {
  if (typeof amountMinor !== "bigint") throw new MoneyFormatError("Amount must be a bigint.");
  assertInRange(amountMinor);
  return Object.freeze({ currency: STORE_CURRENCY, amountMinor });
}

export function usdFromDecimal(value: string): Money {
  return usd(usdDecimalToMinor(value));
}

// Integer minor units as they arrive from the database API: PostgREST
// returns bigint columns as JSON numbers (or digit strings). Accepts only an
// exact non-negative integer — a fractional, unsafe or non-numeric value is
// an invariant failure, never something to round.
export function minorFromDatabase(value: unknown): bigint {
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value)) throw new MoneyFormatError("Database amount is not a safe integer.");
    const amountMinor = BigInt(value);
    assertInRange(amountMinor);
    return amountMinor;
  }
  if (typeof value === "string" && /^(0|[1-9][0-9]*)$/.test(value)) {
    const amountMinor = BigInt(value);
    assertInRange(amountMinor);
    return amountMinor;
  }
  throw new MoneyFormatError("Database amount is not an integer.");
}

// For provider SDKs that take a JS number of minor units. Our maximum is far
// below Number.MAX_SAFE_INTEGER, but the check keeps the conversion explicit.
export function minorToSafeInteger(amountMinor: bigint): number {
  assertInRange(amountMinor);
  if (amountMinor > BigInt(Number.MAX_SAFE_INTEGER)) throw new MoneyFormatError("Amount is not a safe integer.");
  return Number(amountMinor);
}

export function moneyEquals(a: Money, b: Money): boolean {
  return a.currency === b.currency && a.amountMinor === b.amountMinor;
}

// JSON boundary. bigint is not JSON-serializable (JSON.stringify throws on
// it, which is the desired loud failure if a Money object is ever serialized
// by accident); these are the only intended conversions.
export type MoneyJson = { currency: Currency; amountMinor: string };

export function moneyToJson(money: Money): MoneyJson {
  return { currency: money.currency, amountMinor: money.amountMinor.toString() };
}

export function moneyFromJson(json: unknown): Money {
  if (!json || typeof json !== "object") throw new MoneyFormatError("Invalid money JSON.");
  const { currency, amountMinor } = json as Record<string, unknown>;
  if (currency !== STORE_CURRENCY) throw new MoneyFormatError("Unsupported currency.");
  if (typeof amountMinor !== "string" || !/^(0|[1-9][0-9]*)$/.test(amountMinor)) {
    throw new MoneyFormatError("Invalid amount.");
  }
  return usd(BigInt(amountMinor));
}
