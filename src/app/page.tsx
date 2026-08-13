import Link from "next/link";
import HeroGraph from "@/components/HeroGraph";
import CVTabs from "@/components/CVTabs";
import { Reveal, Stagger, Item } from "@/components/motion";
import { getProjects } from "@/lib/projects";
import { getPublications, getPublicationCategories, getTalks, getClasses } from "@/lib/cv";
import { getThoughts, formatDate } from "@/lib/thoughts";

export default function Home() {
  const thoughts = getThoughts();
  const projects = getProjects();
  const publications = getPublications();

  return (
    <div className="pt-10 lg:pt-0">
      <HeroGraph projects={projects} />

      <section id="publications" className="mt-28 scroll-mt-10">
        <Reveal>
          <CVTabs
            publications={publications}
            categories={getPublicationCategories(publications)}
            talks={getTalks()}
            classes={getClasses()}
          />
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
    </div>
  );
}
