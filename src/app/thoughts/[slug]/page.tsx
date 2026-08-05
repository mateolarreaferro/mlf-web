import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { MDXRemote } from "next-mdx-remote/rsc";
import remarkGfm from "remark-gfm";
import { Reveal } from "@/components/motion";
import { mdxComponents } from "@/components/mdx";
import { getThought, getThoughts, formatDate } from "@/lib/thoughts";

export function generateStaticParams() {
  return getThoughts().map((t) => ({ slug: t.slug }));
}

export async function generateMetadata({
  params,
}: PageProps<"/thoughts/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const thought = getThought(slug);
  if (!thought) return {};
  return { title: thought.title, description: thought.summary };
}

export default async function ThoughtPage({
  params,
}: PageProps<"/thoughts/[slug]">) {
  const { slug } = await params;
  const thought = getThought(slug);
  if (!thought) notFound();

  return (
    <article className="mx-auto max-w-2xl pt-20" lang={thought.lang}>
      <Reveal>
        <header>
          <p className="label">
            {String(thought.number).padStart(3, "0")} ·{" "}
            {formatDate(thought.date, thought.lang)}
          </p>
          <h1 className="mt-3 text-3xl font-light tracking-tight leading-snug">
            {thought.title}
          </h1>
        </header>
      </Reveal>

      <div className="thought-body mt-10 max-w-xl">
        <MDXRemote
          source={thought.content}
          components={mdxComponents}
          options={{ mdxOptions: { remarkPlugins: [remarkGfm] } }}
        />
      </div>

      <p className="mt-20">
        <Link href="/#thoughts" className="label hover:text-accent">
          ← thoughts
        </Link>
      </p>
    </article>
  );
}
