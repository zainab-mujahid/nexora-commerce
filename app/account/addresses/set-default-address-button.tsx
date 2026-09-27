"use client";

import { setDefaultAddress } from "@/lib/addresses/actions";

export function SetDefaultAddressButton({ addressId }: { addressId: string }) {
  return (
    <form action={setDefaultAddress.bind(null, addressId)} className="flex">
      <button type="submit" className="link-action inline-flex h-8 items-center">
        Set as default
      </button>
    </form>
  );
}
