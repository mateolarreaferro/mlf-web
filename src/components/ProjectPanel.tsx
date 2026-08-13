"use client";

import { motion } from "motion/react";
import type { Project } from "@/lib/projects";

/*
  When a project is selected, this takes over the left column — where the
  hero bio normally sits — so the card on the right can be all image.
  Category, name, year/role, description, and every link the project has.
*/

const ease = [0.22, 1, 0.36, 1] as const;

export default function ProjectPanel({
  project,
  onClose,
}: {
  project: Project;
  onClose: () => void;
}) {
  const links = [
    project.link ? { href: project.link, text: "visit" } : null,
    project.video ? { href: project.video, text: "watch video" } : null,
    project.repo ? { href: project.repo, text: "repository" } : null,
    project.paper ? { href: project.paper, text: "read paper" } : null,
  ].filter((a): a is { href: string; text: string } => a !== null);

  const meta = [project.year, project.role].filter(Boolean).join(" · ");

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0, transition: { duration: 0.5, ease, delay: 0.2 } }}
      exit={{ opacity: 0, y: -12, transition: { duration: 0.22, ease } }}
      className="col-start-1 row-start-1 self-center"
    >
      <motion.p
        className="label !text-ochre"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease, delay: 0.06 }}
      >
        {project.category}
      </motion.p>

      <motion.h2
        className="mt-2 text-3xl font-light leading-snug tracking-tight sm:text-4xl lg:text-[2.75rem] lg:leading-[1.2]"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease, delay: 0.1 }}
      >
        {project.name}
      </motion.h2>

      {meta || project.isActive ? (
        <motion.p
          className="label mt-3 flex flex-wrap items-center gap-x-3 gap-y-1"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.4, ease, delay: 0.16 }}
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
        transition={{ duration: 0.45, ease, delay: 0.2 }}
      >
        {project.description}
      </motion.p>

      <motion.div
        className="mt-8 flex flex-wrap items-center gap-2"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease, delay: 0.28 }}
      >
        {links.map((a) => (
          <motion.a
            key={a.text}
            href={a.href}
            target="_blank"
            rel="noreferrer"
            className="label whitespace-nowrap rounded-full bg-ink px-4 py-1.5 !text-paper"
            whileHover={{ scale: 1.05, y: -2 }}
            whileTap={{ scale: 0.95 }}
            transition={{ type: "spring", stiffness: 400, damping: 18 }}
          >
            {a.text} ↗
          </motion.a>
        ))}
        <motion.button
          onClick={onClose}
          className="label whitespace-nowrap rounded-full bg-soft px-4 py-1.5 text-faint transition-colors hover:text-accent"
          whileHover={{ scale: 1.05, y: -2 }}
          whileTap={{ scale: 0.95 }}
        >
          ← back to the graph
        </motion.button>
      </motion.div>
    </motion.div>
  );
}
