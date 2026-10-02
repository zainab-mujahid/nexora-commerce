import type { NextRequest } from "next/server";

import { handleProviderRedirect } from "@/lib/checkout/provider-redirect";

// Safepay sends the customer here when they leave its page without paying.
// Only a hint: the payment is still verified, and nothing is released here.
export async function GET(request: NextRequest): Promise<never> {
  return handleProviderRedirect(request, "safepay", "cancel");
}
