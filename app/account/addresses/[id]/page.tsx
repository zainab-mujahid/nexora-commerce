import { notFound } from "next/navigation";
import type { Metadata } from "next";

import { getAddressById } from "@/lib/addresses/queries";

import { AddressForm } from "../address-form";

export async function generateMetadata({
  params,
}: PageProps<"/account/addresses/[id]">): Promise<Metadata> {
  const { id } = await params;
  const address = await getAddressById(id);

  return { title: address ? `Edit ${address.full_name}'s address` : "Address" };
}

export default async function EditAddressPage({
  params,
}: PageProps<"/account/addresses/[id]">) {
  const { id } = await params;
  const address = await getAddressById(id);

  if (!address) notFound();

  return (
    <main className="mx-auto flex w-full max-w-lg flex-1 flex-col gap-6 px-6 py-16">
      <h1 className="text-2xl font-semibold tracking-tight">Edit address</h1>
      <AddressForm address={address} />
    </main>
  );
}
