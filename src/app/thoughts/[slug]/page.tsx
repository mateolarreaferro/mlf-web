import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { MDXRemote } from "next-mdx-remote/rsc";
import remarkGfm from "remark-gfm";
import { Reveal } from "@/components/motion";
import { mdxComponents } from "@/components/mdx";
import { ThoughtLock } from "@/components/ThoughtLock";
import {
  getThought,
  getThoughts,
  formatDate,
  unlockCookie,
} from "@/lib/thoughts";

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

  // A locked post is rendered per request, and its body only for the cookie.
  const locked =
    !!thought.password &&
    (await cookies()).get(unlockCookie(slug))?.value !== thought.password;

  return (
    <article className="mx-auto max-w-2xl pt-20" lang={thought.lang}>
      <Reveal>
        <header>
          <p className="label">
            {String(thought.number).padStart(3, "0")} ·{" "}
            {formatDate(thought.date)}
          </p>
          <h1 className="mt-3 text-2xl font-light tracking-tight leading-snug sm:text-[1.75rem]">
            {thought.title}
          </h1>
        </header>
      </Reveal>

      <div className="thought-body mt-10 max-w-xl">
        {locked ? (
          <ThoughtLock slug={slug} lang={thought.lang} />
        ) : (
          <MDXRemote
            source={thought.content}
            components={mdxComponents}
            options={{ mdxOptions: { remarkPlugins: [remarkGfm] } }}
          />
        )}
      </div>

      <p className="mt-20">
        <Link href="/#thoughts" className="label hover:text-accent">
          ← thoughts
        </Link>
      </p>
    </article>
  );
}
