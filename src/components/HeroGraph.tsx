"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import type { Project } from "@/lib/projects";
import Hero from "./Hero";
import KnowledgeGraph from "./KnowledgeGraph";
import ProjectPanel from "./ProjectPanel";
import { Reveal } from "./motion";

/*
  Owns the selected-project state for the whole first viewport, so that
  selecting a node in the graph swaps the hero copy on the left for the
  project's description and links, leaving the card on the right free to
  be nothing but the image.

  Hero stays mounted and fades out rather than unmounting — otherwise its
  entry animation would replay every time a project is closed.
*/

export default function HeroGraph({ projects }: { projects: Project[] }) {
  const [selected, setSelected] = useState<Project | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSelected(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // deep link: /?project=<slug> opens that project directly
  useEffect(() => {
    const slug = new URLSearchParams(window.location.search).get("project");
    if (slug) setSelected(projects.find((p) => p.slug === slug) ?? null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <section className="grid items-center gap-12 lg:min-h-[calc(100dvh-9rem)] lg:grid-cols-[minmax(360px,34rem)_1fr] lg:gap-24 xl:gap-32">
      {/* hero and panel share one grid cell, so the column is always as tall
          as whichever is showing — never an inner scroll region */}
      <div className="grid min-w-0">
        {/* fades out immediately on select, but waits for the panel to
            clear before fading back in — otherwise the two overlap */}
        <motion.div
          animate={{ opacity: selected ? 0 : 1 }}
          transition={{
            duration: 0.3,
            ease: [0.22, 1, 0.36, 1],
            delay: selected ? 0 : 0.25,
          }}
          className={`col-start-1 row-start-1 self-center ${selected ? "pointer-events-none" : ""}`}
          aria-hidden={selected ? true : undefined}
        >
          <Hero />
        </motion.div>

        <AnimatePresence mode="wait">
          {selected ? (
            <ProjectPanel
              key={selected.slug}
              project={selected}
              onClose={() => setSelected(null)}
            />
          ) : null}
        </AnimatePresence>
      </div>

      <Reveal delay={0.2} className="min-w-0">
        <KnowledgeGraph
          projects={projects}
          selected={selected}
          onSelect={setSelected}
        />
      </Reveal>
    </section>
  );
}
