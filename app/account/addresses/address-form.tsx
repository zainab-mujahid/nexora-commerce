"use client";

import { useActionState } from "react";

import { TextField } from "@/app/_components/text-field";
import { createAddress, updateAddress } from "@/lib/addresses/actions";
import type { Address } from "@/lib/addresses/queries";

export function AddressForm({
  address,
  isFirstAddress = false,
}: {
  address?: Address;
  isFirstAddress?: boolean;
}) {
  const action = address
    ? updateAddress.bind(null, address.id)
    : createAddress;
  const [state, formAction, pending] = useActionState(action, undefined);

  // Editing the current default: the server always keeps it default (there
  // must be exactly one default whenever addresses exist, and the only way
  // to change which one that is is to set a *different* address as default
  // instead — see lib/addresses/actions.ts's updateAddress). The checkbox
  // reflects that instead of offering an uncheck that wouldn't do what it
  // looks like.
  const isLockedDefault = address?.is_default ?? false;

  return (
    <form action={formAction} className="flex max-w-md flex-col gap-4">
      <TextField
        label="Full name"
        name="fullName"
        autoComplete="name"
        defaultValue={address?.full_name}
        errors={state?.errors?.fullName}
      />
      <TextField
        label="Address line 1"
        name="line1"
        autoComplete="address-line1"
        defaultValue={address?.line1}
        errors={state?.errors?.line1}
      />
      <TextField
        label="Address line 2 (optional)"
        name="line2"
        autoComplete="address-line2"
        defaultValue={address?.line2 ?? ""}
        errors={state?.errors?.line2}
      />

      <div className="grid grid-cols-2 gap-4">
        <TextField
          label="City"
          name="city"
          autoComplete="address-level2"
          defaultValue={address?.city}
          errors={state?.errors?.city}
        />
        <TextField
          label="State/province (optional)"
          name="state"
          autoComplete="address-level1"
          defaultValue={address?.state ?? ""}
          errors={state?.errors?.state}
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <TextField
          label="Postal code"
          name="postalCode"
          autoComplete="postal-code"
          defaultValue={address?.postal_code}
          errors={state?.errors?.postalCode}
        />
        <TextField
          label="Country"
          name="country"
          autoComplete="country-name"
          defaultValue={address?.country}
          errors={state?.errors?.country}
        />
      </div>

      {isLockedDefault ? (
        <div className="flex flex-col gap-1">
          <label className="flex items-center gap-2 text-sm font-medium text-foreground/60">
            <input type="checkbox" checked disabled className="h-4 w-4" />
            Default address
          </label>
          <p className="text-xs text-foreground/60">
            This is your default address. To use a different one, set
            another address as default from the addresses list.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-1">
          <label className="flex items-center gap-2 text-sm font-medium">
            <input
              type="checkbox"
              name="isDefault"
              value="true"
              defaultChecked={isFirstAddress}
              disabled={isFirstAddress}
              className="h-4 w-4"
            />
            Set as default address
          </label>
          {isFirstAddress && (
            <p className="text-xs text-foreground/60">
              Your first address is automatically set as default.
            </p>
          )}
        </div>
      )}

      {state?.message && (
        <p className="text-sm text-red-600">{state.message}</p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="self-start rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background disabled:opacity-60"
      >
        {pending ? "Saving…" : "Save"}
      </button>
    </form>
  );
}
