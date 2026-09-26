"use client";

import Link from "next/link";
import { useActionState, useState } from "react";

import { ProductImageDisplay } from "@/app/_components/product-image-display";
import type { Address } from "@/lib/addresses/queries";
import { formatPrice } from "@/lib/catalog/format";
import type { CartItem } from "@/lib/cart/queries";
import { placeOrder } from "@/lib/checkout/actions";

export function CheckoutForm({
  items,
  subtotal,
  addresses,
  disableSubmit,
}: {
  items: CartItem[];
  subtotal: number;
  addresses: Address[];
  disableSubmit: boolean;
}) {
  const defaultAddress = addresses.find((address) => address.is_default) ?? addresses[0];
  const [selectedAddressId, setSelectedAddressId] = useState(defaultAddress?.id ?? "");
  const [state, formAction, pending] = useActionState(placeOrder, undefined);

  return (
    <form action={formAction} className="flex flex-col gap-8">
      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-lg font-semibold tracking-tight">Shipping address</h2>
          <Link href="/account/addresses/new" className="link-action self-start text-sm">
            Add address
          </Link>
        </div>

        {addresses.length === 0 ? (
          <p className="empty-state p-4 text-sm text-muted">
            You don&apos;t have any saved addresses yet.{" "}
            <Link href="/account/addresses/new" className="font-medium underline">
              Add one
            </Link>{" "}
            to continue.
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {addresses.map((address) => (
              <li key={address.id}>
                <label
                  className={`flex cursor-pointer gap-3 rounded-md border bg-surface p-4 text-sm transition-colors ${
                    selectedAddressId === address.id
                      ? "border-foreground ring-1 ring-foreground"
                      : "border-border hover:border-input"
                  }`}
                >
                  <input
                    type="radio"
                    name="addressId"
                    value={address.id}
                    checked={selectedAddressId === address.id}
                    onChange={() => setSelectedAddressId(address.id)}
                    className="mt-1"
                  />
                  <span className="flex flex-col">
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
                      {address.state ? `, ${address.state}` : ""} {address.postal_code}
                    </span>
                    <span className="text-muted">{address.country}</span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold tracking-tight">Order summary</h2>
        <ul className="flex flex-col gap-3">
          {items.map((item) =>
            // See the CartItem["product"] comment in lib/cart/queries.ts —
            // null means RLS is hiding an inactive product from this
            // customer's own SELECT. item.unavailableProduct still gives a
            // name/image for this line without relying on that hidden row.
            item.product ? (
              <li
                key={item.id}
                className="flex gap-3 card p-3 text-sm"
              >
                <ProductImageDisplay
                  images={item.product.images}
                  alt={item.product.name}
                  className="h-16 w-16 shrink-0 rounded-md"
                />
                <div className="flex flex-1 items-start justify-between gap-3">
                  <div>
                    <p className="font-medium">{item.product.name}</p>
                    <p className="text-muted">
                      {formatPrice(item.product.price)} &times; {item.quantity}
                    </p>
                  </div>
                  <p className="font-medium">
                    {formatPrice(Number(item.product.price) * item.quantity)}
                  </p>
                </div>
              </li>
            ) : (
              <li
                key={item.id}
                className="flex gap-3 card p-3 text-sm opacity-70"
              >
                <ProductImageDisplay
                  images={item.unavailableProduct?.images ?? []}
                  alt={item.unavailableProduct?.name ?? "Unavailable product"}
                  className="h-16 w-16 shrink-0 rounded-md"
                />
                <div className="flex flex-1 flex-col justify-center">
                  <p className="font-medium">
                    {item.unavailableProduct?.name ?? "Unavailable item"}
                  </p>
                  <p className="text-red-600 dark:text-red-400">No longer available.</p>
                </div>
              </li>
            ),
          )}
        </ul>

        <div className="flex flex-col gap-1 border-t border-border pt-3">
          <div className="flex items-center justify-between text-sm text-muted">
            <span>Subtotal</span>
            <span>{formatPrice(subtotal)}</span>
          </div>
          <div className="flex items-center justify-between text-lg font-semibold">
            <span>Total</span>
            <span>{formatPrice(subtotal)}</span>
          </div>
          <p className="text-xs text-subtle">
            Shipping and taxes aren&apos;t supported yet — the total above is the product
            subtotal only.
          </p>
        </div>
      </section>

      {state?.error && <p className="text-sm text-red-600 dark:text-red-400">{state.error}</p>}

      <button
        type="submit"
        disabled={pending || disableSubmit || !selectedAddressId}
        className="btn btn-primary btn-lg self-start"
      >
        {pending ? "Placing order…" : "Place order"}
      </button>
    </form>
  );
}
