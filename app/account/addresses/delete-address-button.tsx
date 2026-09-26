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
      <button type="submit" className="link-action link-danger">
        Delete
      </button>
    </form>
  );
}
