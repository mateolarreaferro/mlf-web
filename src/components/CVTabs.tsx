"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import type { ClassGroup, Publication, Talk } from "@/lib/cv";

const ease = [0.22, 1, 0.36, 1] as const;

const TABS = ["publications", "talks", "classes"] as const;
type Tab = (typeof TABS)[number];

export default function CVTabs({
  publications,
  categories,
  talks,
  classes,
}: {
  publications: Publication[];
  categories: string[];
  talks: Talk[];
  classes: ClassGroup[];
}) {
  const [tab, setTab] = useState<Tab>("publications");

  return (
    <div>
      <div className="mb-8 flex flex-wrap items-center gap-2">
        {TABS.map((t) => (
          <motion.button
            key={t}
            onClick={() => setTab(t)}
            className={`label cursor-pointer rounded-full px-3.5 py-1.5 transition-colors ${
              tab === t ? "bg-sun !text-[#141412]" : "bg-soft hover:!text-accent"
            }`}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            transition={{ type: "spring", stiffness: 400, damping: 20 }}
          >
            {t}
          </motion.button>
        ))}
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={tab}
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.35, ease }}
        >
          {tab === "publications" ? (
            <div className="space-y-12">
              {categories.map((cat) => (
                <div key={cat}>
                  <h3 className="label mb-5 !text-ochre">{cat}</h3>
                  <ul className="space-y-7">
                    {publications
                      .filter((p) => p.category === cat)
                      .map((p, i) => (
                        <li key={`${p.title}-${i}`} className="group">
                          <div className="flex items-baseline gap-4">
                            <span className="label shrink-0">{p.year}</span>
                            {p.link ? (
                              <a
                                href={p.link}
                                target="_blank"
                                rel="noreferrer"
                                className="text-lg transition-colors group-hover:text-accent"
                              >
                                {p.title} ↗
                              </a>
                            ) : (
                              <span className="text-lg">{p.title}</span>
                            )}
                          </div>
                          <p className="mt-1 max-w-3xl pl-14 text-sm text-faint">
                            {p.authors} · {p.venue}
                            {p.note ? ` · ${p.note}` : ""}
                          </p>
                        </li>
                      ))}
                  </ul>
                </div>
              ))}
            </div>
          ) : null}

          {tab === "talks" ? (
            <ul className="space-y-7">
              {talks.map((t, i) => (
                <li key={`${t.title}-${i}`}>
                  <div className="flex items-baseline gap-4">
                    <span className="label shrink-0">{t.year}</span>
                    <span className="text-lg">{t.title}</span>
                  </div>
                  <p className="mt-1 max-w-3xl pl-14 text-sm text-faint">
                    {t.venue}
                    {t.place ? ` · ${t.place}` : ""}
                  </p>
                </li>
              ))}
            </ul>
          ) : null}

          {tab === "classes" ? (
            <div className="space-y-10">
              {classes.map((g) => (
                <div key={g.area}>
                  <h3 className="label mb-3 !text-ochre">{g.area}</h3>
                  <p className="max-w-3xl text-sm leading-relaxed text-faint">
                    {g.courses.join(" · ")}
                  </p>
                </div>
              ))}
            </div>
          ) : null}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
