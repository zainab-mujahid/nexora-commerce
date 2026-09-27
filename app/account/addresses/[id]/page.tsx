import Link from "next/link";
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
    <div className="flex max-w-2xl flex-col gap-6">
      <div className="flex flex-col gap-3">
        <Link href="/account/addresses" className="nav-link inline-flex w-fit items-center gap-1.5 text-sm">
          <span aria-hidden="true">&larr;</span> Back to addresses
        </Link>
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Edit address</h1>
      </div>
      <AddressForm address={address} />
    </div>
  );
}
