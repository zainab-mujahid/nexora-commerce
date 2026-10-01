import "server-only";

import { existsSync } from "node:fs";
import path from "node:path";
import Image from "next/image";

import { BrandMark } from "./brand-mark";

// A large editorial image for the About page. `src` is a fixed local path
// under public/ (e.g. /images/about-discovery.webp) that can be replaced
// with the final artwork using the same filename — no code change needed.
// Until the file exists, a quiet frame of the same size and shape renders
// instead of a broken image, so the page layout stays exactly as designed.
// Decorative (alt=""): the adjacent copy carries the meaning.
export function EditorialImage({
  src,
  position = "object-center",
  className = "",
}: {
  src: `/images/${string}`;
  position?: string;
  className?: string;
}) {
  const available = existsSync(path.join(process.cwd(), "public", src));

  return (
    <div className={`relative overflow-hidden rounded-2xl ${className}`}>
      {available ? (
        <Image
          src={src}
          alt=""
          fill
          unoptimized
          sizes="(min-width: 1024px) 560px, 100vw"
          className={`object-cover ${position}`}
        />
      ) : (
        <div aria-hidden="true" className="editorial-placeholder absolute inset-0 flex items-center justify-center">
          <BrandMark className="size-10 opacity-25" />
        </div>
      )}
    </div>
  );
}
