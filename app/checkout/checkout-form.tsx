"use client";

import Link from "next/link";
import { useActionState, useState } from "react";

import { pickDisplayImage } from "@/app/_components/product-image-display";
import { ProductImageFrame } from "@/app/_components/product-image-frame";
import type { Address } from "@/lib/addresses/queries";
import { formatPrice } from "@/lib/catalog/format";
import type { CartItem } from "@/lib/cart/queries";
import { placeOrder } from "@/lib/checkout/actions";

const THUMB = "size-14 shrink-0 rounded-md ring-1 ring-inset ring-border";

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
    <form
      action={formAction}
      className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_24rem] lg:gap-10"
    >
      <section aria-labelledby="checkout-address-heading" className="card flex flex-col gap-5 p-5 sm:p-6">
        <div className="flex items-center justify-between gap-4">
          <h2 id="checkout-address-heading" className="text-lg font-semibold tracking-tight">
            Shipping address
          </h2>
          <Link href="/account/addresses/new" className="link-action shrink-0 text-sm">
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
          // Real radio inputs (name="addressId") inside labels: the whole
          // card selects the address, and keyboard / screen-reader semantics
          // stay those of a native radio group.
          <ul className="grid gap-3 sm:grid-cols-2">
            {addresses.map((address) => {
              const selected = selectedAddressId === address.id;
              return (
                <li key={address.id} className="flex">
                  <label
                    className={`flex w-full cursor-pointer gap-3 rounded-lg border bg-surface p-4 text-sm transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ring ${
                      selected
                        ? "border-foreground ring-1 ring-foreground"
                        : "border-border hover:border-input"
                    }`}
                  >
                    <input
                      type="radio"
                      name="addressId"
                      value={address.id}
                      checked={selected}
                      onChange={() => setSelectedAddressId(address.id)}
                      // The card's own ring (has-[:focus-visible]) is the focus
                      // indicator, so the radio's native outline would double it.
                      className="mt-0.5 size-4 shrink-0 focus-visible:outline-none"
                    />
                    <span className="flex min-w-0 flex-col gap-0.5 [overflow-wrap:anywhere]">
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
              );
            })}
          </ul>
        )}
      </section>

      <section
        aria-labelledby="checkout-summary-heading"
        className="card flex flex-col gap-5 p-5 sm:p-6 lg:sticky lg:top-8"
      >
        <h2 id="checkout-summary-heading" className="text-lg font-semibold tracking-tight">
          Order summary
        </h2>
        <ul className="flex flex-col divide-y divide-border border-y border-border">
          {items.map((item) =>
            // See the CartItem["product"] comment in lib/cart/queries.ts —
            // null means RLS is hiding an inactive product from this
            // customer's own SELECT. item.unavailableProduct still gives a
            // name/image for this line without relying on that hidden row.
            item.product ? (
              <li key={item.id} className="flex gap-3 py-3 text-sm">
                <ProductImageFrame
                  image={pickDisplayImage(item.product.images)}
                  alt={item.product.name}
                  className={THUMB}
                />
                <div className="flex min-w-0 flex-1 items-start justify-between gap-3">
                  <div className="flex min-w-0 flex-col gap-0.5">
                    <p className="font-medium leading-snug [overflow-wrap:anywhere]">{item.product.name}</p>
                    <p className="text-muted tabular-nums">
                      {formatPrice(item.product.price)} &times; {item.quantity}
                    </p>
                  </div>
                  <p className="shrink-0 font-medium tabular-nums">
                    {formatPrice(Number(item.product.price) * item.quantity)}
                  </p>
                </div>
              </li>
            ) : (
              <li key={item.id} className="flex gap-3 py-3 text-sm">
                <ProductImageFrame
                  image={pickDisplayImage(item.unavailableProduct?.images ?? [])}
                  alt={item.unavailableProduct?.name ?? "Unavailable product"}
                  className={`${THUMB} opacity-60`}
                />
                <div className="flex min-w-0 flex-1 flex-col justify-center gap-0.5">
                  <p className="font-medium text-muted [overflow-wrap:anywhere]">
                    {item.unavailableProduct?.name ?? "Unavailable item"}
                  </p>
                  <p className="text-red-600 dark:text-red-400">No longer available.</p>
                </div>
              </li>
            ),
          )}
        </ul>

        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between text-sm text-muted">
            <span>Subtotal</span>
            <span className="tabular-nums">{formatPrice(subtotal)}</span>
          </div>
          <div className="flex items-baseline justify-between border-t border-border pt-3 text-base font-semibold">
            <span>Total</span>
            <span className="text-xl tracking-tight tabular-nums">{formatPrice(subtotal)}</span>
          </div>
          <p className="text-xs text-subtle">
            Shipping and taxes aren&apos;t supported yet — the total above is the product
            subtotal only.
          </p>
        </div>

        {state?.error && (
          <p className="rounded-md border border-danger/40 px-3 py-2 text-sm text-red-600 dark:text-red-400">
            {state.error}
          </p>
        )}

        <button
          type="submit"
          disabled={pending || disableSubmit || !selectedAddressId}
          className="btn btn-primary btn-lg w-full"
        >
          {pending && (
            <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" className="size-4 motion-safe:animate-spin">
              <circle cx="10" cy="10" r="7.5" stroke="currentColor" strokeOpacity="0.3" strokeWidth="2" />
              <path d="M17.5 10A7.5 7.5 0 0 0 10 2.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          )}
          {pending ? "Placing order…" : "Place order"}
        </button>
      </section>
    </form>
  );
}
