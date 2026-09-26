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
    <main className="mx-auto flex w-full max-w-lg flex-1 flex-col gap-6 px-4 py-12 sm:px-6">
      <h1 className="text-2xl font-semibold tracking-tight">New address</h1>
      <AddressForm isFirstAddress={addresses.length === 0} />
    </main>
  );
}
