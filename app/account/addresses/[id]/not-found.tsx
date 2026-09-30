import { RouteNotFound } from "@/app/_components/route-not-found";

// Unknown, malformed or another customer's address id. Rendered inside the
// account layout, so the account navigation stays in place.
export default function NotFound() {
  return (
    <RouteNotFound
      message="We couldn't find that address."
      backHref="/account/addresses"
      backLabel="Back to addresses"
    />
  );
}
