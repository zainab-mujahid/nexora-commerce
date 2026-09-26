import Link from "next/link";

export function RouteNotFound({
  message,
  backHref = "/products",
  backLabel = "Back to shop",
}: {
  message: string;
  backHref?: string;
  backLabel?: string;
}) {
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col items-center justify-center gap-4 px-4 py-24 text-center sm:px-6">
      <h1 className="text-xl font-semibold">Not found</h1>
      <p className="max-w-sm text-sm text-muted">{message}</p>
      <Link
        href={backHref}
        className="btn btn-primary"
      >
        {backLabel}
      </Link>
    </div>
  );
}
