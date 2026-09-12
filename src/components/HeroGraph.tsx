"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import type { Project } from "@/lib/projects";
import Hero from "./Hero";
import KnowledgeGraph from "./KnowledgeGraph";
import ProjectPanel from "./ProjectPanel";
import { HOME_EVENT } from "./HomeLink";
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

  // pressing the wordmark closes an open project, wherever we already are
  useEffect(() => {
    const onHome = () => setSelected(null);
    window.addEventListener(HOME_EVENT, onHome);
    return () => window.removeEventListener(HOME_EVENT, onHome);
  }, []);

  /*
    Deep link: /?project=<slug> opens that project. Read through
    useSearchParams rather than window.location so it stays correct across
    client navigations — reading it once on mount meant that leaving
    /?project=satie remounted this component, which then re-read the *old*
    URL and reopened the project the user had just closed.
  */
  const searchParams = useSearchParams();
  useEffect(() => {
    const slug = searchParams.get("project");
    setSelected(slug ? (projects.find((p) => p.slug === slug) ?? null) : null);
  }, [searchParams, projects]);

  return (
    /* bottom-aligned on purpose: the social row and the graph legend then sit
       on one line at any viewport height, which no margin can promise while
       the two columns are centred independently */
    <section className="grid items-end gap-12 lg:min-h-[calc(100dvh-9rem)] lg:grid-cols-[minmax(360px,34rem)_1fr] lg:gap-24 xl:gap-32">
      {/* hero and panel share one grid cell, so the column is always as tall
          as whichever is showing — never an inner scroll region.

          With a project open the cell takes a fixed height instead: the graph
          box plus twice the legend strip beneath it. Both columns are
          bottom-aligned, so that makes the cell's centre — and the panel
          centred in it — land exactly on the centre of the card, whatever
          height the copy happens to be. */}
      <div
        className={`grid min-w-0 ${selected ? "lg:h-[calc(var(--graph-h)+6.5rem)]" : ""}`}
      >
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
            <ProjectPanel key={selected.slug} project={selected} />
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
