import Link from "next/link";

export function EntryCard({
  href,
  title,
  description,
}: {
  href: string;
  title: string;
  description: string;
}) {
  return (
    <Link
      href={href}
      className="card card-interactive flex flex-col gap-1 rounded-md border p-5"
    >
      <span className="text-sm font-semibold">{title}</span>
      <span className="text-sm text-muted">{description}</span>
    </Link>
  );
}
