export function EmptyState({
  title,
  message,
}: {
  title?: string;
  message: string;
}) {
  return (
    <div className="rounded-md border border-dashed border-black/15 p-8 text-center text-sm text-foreground/60 dark:border-white/20">
      {title && <p className="mb-1 font-medium text-foreground">{title}</p>}
      <p>{message}</p>
    </div>
  );
}
