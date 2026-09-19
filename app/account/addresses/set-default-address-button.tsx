"use client";

import { setDefaultAddress } from "@/lib/addresses/actions";

export function SetDefaultAddressButton({ addressId }: { addressId: string }) {
  return (
    <form action={setDefaultAddress.bind(null, addressId)}>
      <button type="submit" className="hover:opacity-70">
        Set as default
      </button>
    </form>
  );
}
