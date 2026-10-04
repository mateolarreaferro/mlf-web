"use client";

import type { Project } from "@/lib/projects";
import { Item, Stagger } from "./motion";

/*
  The work as a list, for phones only. On a narrow screen the graph keeps
  its place as the picture of the work (and the photo still opens the
  chat), but twenty-odd names on a canvas a thumb wide overlap and are hard
  to hit, so every project is also a row here, grouped and coloured the way
  the graph groups them. It stands in for the graph's legend below lg.
*/

const GROUPS = [
  { group: "projects", color: "var(--w1)" },
  { group: "experiments / tools", color: "var(--w2)" },
  { group: "art", color: "var(--w3)" },
];

export default function ProjectIndex({
  projects,
  onSelect,
}: {
  projects: Project[];
  onSelect: (p: Project) => void;
}) {
  return (
    <nav aria-label="Projects" className="space-y-10">
      {GROUPS.map(({ group, color }) => {
        const peers = projects.filter((p) => p.group === group);
        if (peers.length === 0) return null;
        return (
          <Stagger key={group}>
            <Item>
              <h2 className="label mb-2 flex items-center gap-2">
                <span className="inline-block size-2.5 rounded-full" style={{ background: color }} />
                {group}
              </h2>
            </Item>
            <ul>
              {peers.map((p) => (
                <li key={p.slug}>
                  <Item>
                    <a
                      href={`/?project=${p.slug}`}
                      onClick={(e) => {
                        // the sheet opens in place; the href is for new tabs and copying
                        if (e.metaKey || e.ctrlKey || e.shiftKey) return;
                        e.preventDefault();
                        onSelect(p);
                      }}
                      className="block py-3 transition-colors active:text-accent"
                    >
                      <span className="block text-base leading-snug">{p.name}</span>
                      <span className="label mt-0.5 block leading-snug">{p.category}</span>
                    </a>
                  </Item>
                </li>
              ))}
            </ul>
          </Stagger>
        );
      })}
    </nav>
  );
}
