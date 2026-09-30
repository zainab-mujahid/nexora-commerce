import { Reveal } from "./motion/reveal";

export function EmptyState({
  title,
  message,
}: {
  title?: string;
  message: string;
}) {
  return (
    <Reveal trigger="mount" scale={0.985} className="empty-state px-6 py-10 text-center text-sm text-muted">
      {title && <p className="mb-1 font-medium text-foreground">{title}</p>}
      <p>{message}</p>
    </Reveal>
  );
}
