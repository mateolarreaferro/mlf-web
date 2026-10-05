"use client";

import Image from "next/image";
import type { MediaItem } from "@/lib/projects";
import { useEffect, useRef } from "react";
import LorenzThumb from "./LorenzThumb";
import SketchGallery, { GALLERY_RATIO } from "./SketchGallery";

/*
  The right-hand panel: exactly one piece of media per project: an image,
  a local clip (a recording of the project in use, muted and looping, held
  still for visitors who prefer reduced motion), a video, an embed, or a
  local sketch. A project's `media` list may hold
  more, but only the first is shown; multi-slide cards were tried and cut.
  A project with none draws a live Lorenz attractor instead.

  Register local sketch components here and reference them from
  frontmatter as `{ sketch: "lorenz" }`.
*/

/*
  The shape a project's picture wants: a measured image's own ratio (see
  `measure` in lib/projects), 16:9 for clips, video and embeds, square for a
  sketch or for anything we couldn't measure.
*/
export function mediaRatio(items: MediaItem[]): number {
  const item = items[0];
  if (item?.width && item.height) return item.width / item.height;
  if (item?.type === "sketch" && item.src === "gallery") return GALLERY_RATIO;
  return item && item.type !== "sketch" && item.type !== "image" ? 16 / 9 : 1;
}

const sketches: Record<string, React.ComponentType> = {
  lorenz: LorenzThumb,
  gallery: SketchGallery,
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

  if (item.type === "clip") {
    return <Clip src={item.src} label={item.caption ?? alt} />;
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

function Clip({ src, label }: { src: string; label: string }) {
  const ref = useRef<HTMLVideoElement>(null);
  // Reduced motion: hold the clip on its first frame and hand over the controls.
  useEffect(() => {
    const video = ref.current;
    if (!video || !window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    video.pause();
    video.controls = true;
  }, [src]);
  return (
    <video
      ref={ref}
      src={src}
      aria-label={label}
      autoPlay
      muted
      loop
      playsInline
      preload="metadata"
      className="size-full bg-ink object-cover"
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
