"use client";

import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { motion } from "motion/react";
import type { Project } from "@/lib/projects";
import ProjectMedia, { mediaRatio } from "./ProjectMedia";
import ProjectPanel from "./ProjectPanel";
import { useTempo } from "./motion";

/*
  A project on a phone. The wide layout splits it in two (copy on the left,
  picture in the graph box on the right); one column cannot, and stacking
  the halves left the visitor looking at a picture with its words a screen
  and a half above. So below lg a project is one page of its own, sliding up
  over everything: back, the picture at full width, then the words and links,
  in a single scroll. The page underneath does not move, so closing lands
  exactly where the visitor tapped.

  Portalled to <body>: the route template and Reveal animate transform and
  filter, and either turns position: fixed into absolute.
*/

const ease = [0.22, 1, 0.36, 1] as const;

export default function ProjectSheet({
  project,
  onClose,
}: {
  project: Project;
  onClose: () => void;
}) {
  const tempo = useTempo();
  const scroller = useRef<HTMLDivElement>(null);

  // hold the page still underneath, and start each project at its top
  useEffect(() => {
    const root = document.documentElement;
    const before = root.style.overflow;
    root.style.overflow = "hidden";
    return () => {
      root.style.overflow = before;
    };
  }, []);
  useEffect(() => {
    scroller.current?.scrollTo(0, 0);
    // focus the sheet, not its button: a ring on "all projects" read as a bug
    scroller.current?.focus({ preventScroll: true });
  }, [project.slug]);

  return createPortal(
    <motion.div
      ref={scroller}
      role="dialog"
      aria-modal="true"
      aria-label={project.name}
      tabIndex={-1}
      className="fixed inset-0 z-50 overflow-y-auto outline-none overscroll-contain bg-paper/95 backdrop-blur-xl"
      initial={{ opacity: 0, y: 40 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 40 }}
      transition={{ duration: 0.4 * tempo, ease }}
    >
      <div className="sticky top-0 z-10 bg-paper/80 px-6 pb-2 pt-[max(1rem,env(safe-area-inset-top))] backdrop-blur-md sm:px-10">
        <button
          onClick={onClose}
          className="label -ml-3 inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-full px-3 !text-ink transition-colors hover:!text-accent"
        >
          <span aria-hidden>←</span> all projects
        </button>
      </div>

      <div className="mx-auto max-w-2xl px-6 pb-[max(3rem,env(safe-area-inset-bottom))] pt-2 sm:px-10">
        {/* full width, unless that would make a tall picture fill the screen */}
        <div
          className="relative mx-auto overflow-hidden rounded-3xl bg-soft"
          style={{
            aspectRatio: mediaRatio(project.media),
            width: `min(100%, calc(60dvh * ${mediaRatio(project.media)}))`,
          }}
        >
          <ProjectMedia items={project.media} alt={project.name} />
        </div>
        <ProjectPanel key={project.slug} project={project} className="mt-8" />
      </div>
    </motion.div>,
    document.body,
  );
}
