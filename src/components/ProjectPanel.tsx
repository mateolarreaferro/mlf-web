"use client";

import { motion } from "motion/react";
import type { Project } from "@/lib/projects";
import { hoverSpring, Typewriter, useTempo } from "./motion";
import RatsPanel from "./RatsPanel";
import PeripheryPanel from "./PeripheryPanel";
import SacredVisPanel from "./SacredVisPanel";

/* pieces that play in their card keep their readout and controls here */
const PANELS: Record<string, React.ComponentType> = {
  "rats-and-children": RatsPanel,
  periphery: PeripheryPanel,
  sacredvis: SacredVisPanel,
};

/*
  When a project is selected, this takes over the left column (where the
  hero bio normally sits) so the card on the right can be all image.
  Category, name, year/role, description, and every link the project has.
  On a phone the same copy sits under the picture in ProjectSheet, and the
  links grow to a thumb's size.
*/

const ease = [0.22, 1, 0.36, 1] as const;

export default function ProjectPanel({
  project,
  className = "col-start-1 row-start-1 self-center",
}: {
  project: Project;
  /* where it sits: the hero's grid cell when wide, the sheet's column on a phone */
  className?: string;
}) {
  const tempo = useTempo();
  const links = [
    project.demo ? { href: project.demo, text: "interactive demo" } : null,
    project.link ? { href: project.link, text: "visit" } : null,
    project.video ? { href: project.video, text: "watch video" } : null,
    project.repo ? { href: project.repo, text: "repository" } : null,
    project.paper ? { href: project.paper, text: "read paper" } : null,
  ].filter((a): a is { href: string; text: string } => a !== null);

  const meta = [project.year, project.role].filter(Boolean).join(" · ");

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0, transition: { duration: 0.5 * tempo, ease, delay: 0.2 * tempo } }}
      exit={{ opacity: 0, y: -12, transition: { duration: 0.22 * tempo, ease } }}
      className={className}
    >
      <motion.p
        className="label"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 * tempo, ease, delay: 0.06 * tempo }}
      >
        {project.category}
      </motion.p>

      <motion.h2
        className="mt-2 text-2xl font-medium leading-snug tracking-[-0.025em] sm:text-3xl lg:text-[2.1rem] lg:leading-[1.3]"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45 * tempo, ease, delay: 0.1 * tempo }}
      >
        <Typewriter text={project.name} perChar={40} delay={150} />
      </motion.h2>

      {meta || project.isActive ? (
        <motion.p
          className="label mt-3 flex flex-wrap items-center gap-x-3 gap-y-1"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.4 * tempo, ease, delay: 0.16 * tempo }}
        >
          {meta ? <span>{meta}</span> : null}
          {project.isActive ? (
            <span className="inline-flex items-center gap-1.5 !text-accent">
              <span className="size-1.5 rounded-full bg-accent" />
              in development
            </span>
          ) : null}
        </motion.p>
      ) : null}

      <motion.p
        className="mt-6 whitespace-pre-line text-sm leading-relaxed text-faint sm:text-base"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45 * tempo, ease, delay: 0.2 * tempo }}
      >
        {project.description}
      </motion.p>

      <motion.div
        className="mt-8 flex flex-wrap items-center gap-2"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45 * tempo, ease, delay: 0.28 * tempo }}
      >
        {links.map((a) => (
          <motion.a
            key={a.text}
            href={a.href}
            target="_blank"
            rel="noreferrer"
            className="label inline-flex min-h-11 items-center whitespace-nowrap rounded-full bg-ink px-5 !text-paper lg:min-h-0 lg:px-4 lg:py-1.5"
            whileHover={{ scale: 1.05, y: -2 }}
            whileTap={{ scale: 0.95 }}
            transition={hoverSpring(tempo)}
          >
            {a.text} ↗
          </motion.a>
        ))}
      </motion.div>

      {(() => {
        const item = project.media[0];
        const Panel = item?.type === "sketch" ? PANELS[item.src] : undefined;
        return Panel ? <Panel /> : null;
      })()}
    </motion.div>
  );
}
