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
      className="flex flex-col gap-1 rounded-md border border-black/10 p-4 transition-colors hover:border-black/25 dark:border-white/10 dark:hover:border-white/25"
    >
      <span className="text-sm font-medium">{title}</span>
      <span className="text-sm text-foreground/60">{description}</span>
    </Link>
  );
}
