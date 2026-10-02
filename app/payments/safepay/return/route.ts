import type { NextRequest } from "next/server";

import { handleProviderRedirect } from "@/lib/checkout/provider-redirect";

// Safepay sends the customer here after paying. Its query parameters are
// unsigned hints; see lib/checkout/provider-redirect.ts.
export async function GET(request: NextRequest): Promise<never> {
  return handleProviderRedirect(request, "safepay", "return");
}
