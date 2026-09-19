"use client";

import { deleteAddress } from "@/lib/addresses/actions";

export function DeleteAddressButton({ addressId }: { addressId: string }) {
  return (
    <form
      action={deleteAddress.bind(null, addressId)}
      onSubmit={(event) => {
        if (!confirm("Delete this address?")) {
          event.preventDefault();
        }
      }}
    >
      <button type="submit" className="text-red-600 hover:opacity-70">
        Delete
      </button>
    </form>
  );
}
