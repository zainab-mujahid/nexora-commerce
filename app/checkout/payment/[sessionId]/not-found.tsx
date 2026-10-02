import { RouteNotFound } from "@/app/_components/route-not-found";

export default function NotFound() {
  return (
    <RouteNotFound
      message="We couldn't find that payment. If you've just paid, your order will appear in your orders once it's confirmed."
      backHref="/orders"
      backLabel="View your orders"
    />
  );
}
