import Link from "next/link";
import type { Metadata } from "next";

import { EmptyState } from "@/app/_components/empty-state";
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
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-4 py-12 sm:px-6">
      <div className="flex items-center justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">Addresses</h1>
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
        <EmptyState message="You haven't added any addresses yet." />
      ) : (
        <ul className="flex flex-col gap-4">
          {addresses.map((address) => (
            <li
              key={address.id}
              className="flex flex-col gap-2 card p-4 text-sm"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex flex-col">
                  <span className="font-medium">
                    {address.full_name}
                    {address.is_default && (
                      <span className="badge ml-2 align-middle">
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
              </div>

              <div className="flex gap-4 text-xs font-medium">
                <Link
                  href={`/account/addresses/${address.id}`}
                  className="link-action"
                >
                  Edit
                </Link>
                {!address.is_default && (
                  <SetDefaultAddressButton addressId={address.id} />
                )}
                <DeleteAddressButton addressId={address.id} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
