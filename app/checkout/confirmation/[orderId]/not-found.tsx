import { RouteNotFound } from "@/app/_components/route-not-found";

export default function NotFound() {
  return (
    <RouteNotFound
      message="We couldn't find that order."
      backHref="/cart"
      backLabel="Back to cart"
    />
  );
}
