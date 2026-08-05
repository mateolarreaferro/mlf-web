import Link from "next/link";
import Hero from "@/components/Hero";
import KnowledgeGraph from "@/components/KnowledgeGraph";
import { Reveal, Stagger, Item } from "@/components/motion";
import { getProjects } from "@/lib/projects";
import { getPublications } from "@/lib/publications";
import { getThoughts, formatDate } from "@/lib/thoughts";

export default function Home() {
  const thoughts = getThoughts();
  const projects = getProjects();
  const publications = getPublications();

  return (
    <div className="pt-10 lg:pt-0">
      <section className="grid items-center gap-12 lg:min-h-[calc(100dvh-9rem)] lg:grid-cols-[minmax(340px,30rem)_1fr] lg:gap-20">
        <Hero />
        <Reveal delay={0.2} className="min-w-0">
          <KnowledgeGraph projects={projects} />
        </Reveal>
      </section>

      <section id="thoughts" className="mt-28 scroll-mt-10">
        <Stagger>
          <Item>
            <h2 className="label mb-6">thoughts</h2>
          </Item>
          <ul className="space-y-8">
            {thoughts.map((t) => (
              <li key={t.slug}>
                <Item>
                  <Link href={`/thoughts/${t.slug}`} className="group block">
                    <div className="flex items-baseline gap-4">
                      <span className="label shrink-0">
                        {String(t.number).padStart(3, "0")}
                      </span>
                      <span className="text-lg transition-all duration-300 group-hover:translate-x-1 group-hover:text-accent">
                        {t.title}
                      </span>
                      <span className="label ml-auto hidden shrink-0 sm:inline">
                        {formatDate(t.date, t.lang)}
                      </span>
                    </div>
                    {t.summary ? (
                      <p className="mt-1 max-w-xl pl-11 text-sm text-faint transition-transform duration-500 ease-out group-hover:translate-x-1">
                        {t.summary}
                      </p>
                    ) : null}
                  </Link>
                </Item>
              </li>
            ))}
          </ul>
        </Stagger>
      </section>

      <section id="publications" className="mt-28 scroll-mt-10">
        <Stagger>
          <Item>
            <h2 className="label mb-6">publications</h2>
          </Item>
          <ul className="max-w-3xl space-y-5">
            {publications.map((pub) => (
              <li key={pub}>
                <Item>
                  <p className="text-sm leading-relaxed text-faint">{pub}</p>
                </Item>
              </li>
            ))}
          </ul>
        </Stagger>
      </section>
    </div>
  );
}
