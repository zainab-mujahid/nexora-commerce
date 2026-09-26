"use client";

import { setDefaultAddress } from "@/lib/addresses/actions";

export function SetDefaultAddressButton({ addressId }: { addressId: string }) {
  return (
    <form action={setDefaultAddress.bind(null, addressId)}>
      <button type="submit" className="link-action">
        Set as default
      </button>
    </form>
  );
}
