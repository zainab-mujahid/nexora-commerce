import Link from "next/link";
import type { Metadata } from "next";

import { requireUser } from "@/lib/auth/dal";
import { getAddresses } from "@/lib/addresses/queries";

import { AddressForm } from "../address-form";

export const metadata: Metadata = {
  title: "New address",
};

export default async function NewAddressPage() {
  await requireUser();

  const addresses = await getAddresses();

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <div className="flex flex-col gap-3">
        <Link href="/account/addresses" className="nav-link inline-flex w-fit items-center gap-1.5 text-sm">
          <span aria-hidden="true">&larr;</span> Back to addresses
        </Link>
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">New address</h1>
      </div>
      <AddressForm isFirstAddress={addresses.length === 0} />
    </div>
  );
}
