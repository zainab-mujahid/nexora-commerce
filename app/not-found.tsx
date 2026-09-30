import { RouteNotFound } from "@/app/_components/route-not-found";

// Unknown URLs (outside any segment's own not-found). Without this file Next
// renders its built-in 404, whose inline `body{color:#000;background:#fff}`
// fights Nexora's data-theme switch and leaves the page unreadable in the
// dark theme. Same component and wording as the segment not-found pages.
export default function NotFound() {
  return <RouteNotFound message="We couldn't find that." />;
}
