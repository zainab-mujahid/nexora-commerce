import Link from "next/link";
import type { Metadata } from "next";

import { Stagger, StaggerItem } from "@/app/_components/motion/reveal";
import { requireUser } from "@/lib/auth/dal";
import { getAddresses } from "@/lib/addresses/queries";

import { DeleteAddressButton } from "./delete-address-button";
import { SetDefaultAddressButton } from "./set-default-address-button";

export const metadata: Metadata = {
  title: "Addresses",
};

export default async function AddressesPage() {
  // getAddresses() already gates on requireUser() — this repeats the check
  // at the page level too, the same defense-in-depth convention
  // app/account/page.tsx already follows.
  await requireUser();

  const addresses = await getAddresses();

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1.5">
          <h1 className="display-title text-3xl sm:text-4xl">Addresses</h1>
          <p className="text-sm text-muted">
            Manage the addresses used for delivery.
          </p>
        </div>
        <Link
          href="/account/addresses/new"
          className="btn btn-primary"
        >
          New address
        </Link>
      </div>

      {addresses.length === 0 ? (
        <div className="surface-glow flex flex-col items-center gap-4 rounded-xl border border-dashed border-border bg-fill/40 px-6 py-16 text-center">
          <span aria-hidden="true" className="flex size-14 items-center justify-center rounded-2xl bg-surface text-accent shadow-[var(--shadow-card)] ring-1 ring-border">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="size-5">
              <path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21Z" />
              <circle cx="12" cy="9.5" r="2.5" />
            </svg>
          </span>
          <p className="max-w-sm text-sm text-muted">You haven&apos;t added any addresses yet.</p>
        </div>
      ) : (
        <Stagger as="ul" className="grid gap-4 md:grid-cols-2">
          {addresses.map((address) => (
            <StaggerItem as="li"
              key={address.id}
              className={`card flex flex-col text-sm ${address.is_default ? "border-input" : ""}`}
            >
              <div className="flex flex-1 flex-col gap-0.5 p-5 [overflow-wrap:anywhere]">
                <span className="mb-1 flex flex-wrap items-center gap-x-2 gap-y-1 font-semibold">
                  {address.full_name}
                  {address.is_default && (
                    <span className="badge font-medium">
                      Default
                    </span>
                  )}
                </span>
                <span className="text-muted">
                  {address.line1}
                  {address.line2 ? `, ${address.line2}` : ""}
                </span>
                <span className="text-muted">
                  {address.city}
                  {address.state ? `, ${address.state}` : ""}{" "}
                  {address.postal_code}
                </span>
                <span className="text-muted">{address.country}</span>
              </div>

              <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-border px-5 py-3 text-sm">
                <Link
                  href={`/account/addresses/${address.id}`}
                  className="link-action inline-flex h-8 items-center"
                >
                  Edit
                </Link>
                {!address.is_default && (
                  <SetDefaultAddressButton addressId={address.id} />
                )}
                <div className="ml-auto">
                  <DeleteAddressButton addressId={address.id} />
                </div>
              </div>
            </StaggerItem>
          ))}
        </Stagger>
      )}
    </div>
  );
}
