"use client";

import Image from "next/image";
import type { MediaItem } from "@/lib/projects";
import LorenzThumb from "./LorenzThumb";

/*
  The right-hand panel: exactly one piece of media per project — an image,
  a video, an embed, or a local sketch. A project's `media` list may hold
  more, but only the first is shown; multi-slide cards were tried and cut.
  A project with none draws a live Lorenz attractor instead.

  Register local sketch components here and reference them from
  frontmatter as `{ sketch: "lorenz" }`.
*/

const sketches: Record<string, React.ComponentType> = {
  lorenz: LorenzThumb,
};

function Slide({ item, alt }: { item: MediaItem; alt: string }) {
  if (item.type === "image") {
    return (
      <Image
        src={item.src}
        alt={item.caption ?? alt}
        fill
        sizes="(min-width: 1024px) 45vw, 90vw"
        className={item.fit === "contain" ? "object-contain" : "object-cover"}
      />
    );
  }

  if (item.type === "sketch") {
    const Sketch = sketches[item.src];
    return Sketch ? <Sketch /> : <LorenzThumb />;
  }

  const src =
    item.type === "vimeo"
      ? `https://player.vimeo.com/video/${item.src}?title=0&byline=0&portrait=0`
      : item.type === "youtube"
        ? `https://www.youtube.com/embed/${item.src}?rel=0`
        : item.src;

  return (
    <iframe
      src={src}
      title={item.caption ?? alt}
      loading="lazy"
      allow="autoplay; fullscreen; picture-in-picture; xr-spatial-tracking"
      allowFullScreen
      className="size-full border-0 bg-ink"
    />
  );
}

export default function ProjectMedia({
  items,
  alt,
}: {
  items: MediaItem[];
  alt: string;
}) {
  const item = items[0];
  if (!item) return <LorenzThumb />;

  return (
    <div className="relative size-full">
      <Slide item={item} alt={alt} />
      {item.caption ? (
        <p className="label absolute inset-x-0 bottom-0 bg-gradient-to-t from-ink/70 to-transparent px-5 pb-4 pt-10 !text-paper">
          {item.caption}
        </p>
      ) : null}
    </div>
  );
}
