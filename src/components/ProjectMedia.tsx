"use client";

import { useCallback, useRef, useState } from "react";
import Image from "next/image";
import type { MediaItem } from "@/lib/projects";
import LorenzThumb from "./LorenzThumb";

/*
  The right-hand panel. A project's `media` list becomes a vertical
  snap-scrolling stack — several images, a video, an embedded p5 sketch,
  in any combination. One item behaves exactly like the old single image.

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
        sizes="(min-width: 1024px) 60vw, 100vw"
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
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);

  const onScroll = useCallback(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const i = Math.round(el.scrollTop / el.clientHeight);
    setActive((prev) => (prev === i ? prev : i));
  }, []);

  const goTo = (i: number) => {
    const el = scrollerRef.current;
    if (el) el.scrollTo({ top: i * el.clientHeight, behavior: "smooth" });
  };

  if (!items.length) return <LorenzThumb />;

  return (
    <div className="relative size-full">
      <div
        ref={scrollerRef}
        onScroll={onScroll}
        className="size-full snap-y snap-mandatory overflow-y-auto overscroll-contain scroll-smooth [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {items.map((item, i) => (
          <div key={`${item.type}-${item.src}-${i}`} className="relative size-full shrink-0 snap-start">
            <Slide item={item} alt={alt} />
            {item.caption ? (
              <p className="label absolute inset-x-0 bottom-0 bg-gradient-to-t from-ink/70 to-transparent px-6 pb-5 pr-28 pt-10 !text-paper">
                {item.caption}
              </p>
            ) : null}
          </div>
        ))}
      </div>

      {items.length > 1 ? (
        <div className="absolute bottom-4 right-4 z-10 flex items-center gap-2 rounded-full bg-paper/70 px-3 py-2 backdrop-blur-sm">
          {items.map((item, i) => (
            <button
              key={`dot-${i}`}
              onClick={() => goTo(i)}
              aria-label={`Show item ${i + 1} of ${items.length}`}
              aria-current={i === active}
              className={`size-1.5 rounded-full transition-all duration-300 ${
                i === active ? "scale-125 bg-ink" : "bg-ink/30 hover:bg-ink/60"
              }`}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}
