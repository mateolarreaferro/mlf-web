"use client";

import { motion } from "motion/react";
import { FaGithub, FaInstagram, FaLinkedinIn, FaSoundcloud } from "react-icons/fa6";
import { AnimatedText, hoverSpring, Reveal, useTempo } from "./motion";

const socials = [
  { href: "https://www.instagram.com/larreaferro/", label: "Instagram", Icon: FaInstagram },
  { href: "https://www.linkedin.com/in/mateo-larrea-636967164/", label: "LinkedIn", Icon: FaLinkedinIn },
  { href: "https://github.com/mateolarreaferro", label: "GitHub", Icon: FaGithub },
  { href: "https://soundcloud.com/mateo-larrea-ferro", label: "SoundCloud", Icon: FaSoundcloud },
];

function BioLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="text-ink underline decoration-[color:var(--faint)] decoration-1 underline-offset-4 transition-colors hover:text-accent hover:decoration-[color:var(--accent)]"
    >
      {children}
    </a>
  );
}

function ProjectLink({ slug, children }: { slug: string; children: React.ReactNode }) {
  return (
    <a
      href={`/?project=${slug}`}
      className="text-ink underline decoration-[color:var(--faint)] decoration-1 underline-offset-4 transition-colors hover:text-accent hover:decoration-[color:var(--accent)]"
    >
      {children}
    </a>
  );
}

export default function Hero() {
  const tempo = useTempo();
  return (
    <div>
      <h1 className="text-2xl font-light leading-snug tracking-tight sm:text-3xl lg:text-[2.1rem] lg:leading-[1.3] xl:text-[2.4rem] xl:leading-[1.25]">
        <AnimatedText text="I design tools at the intersection of creativity, well-being, and education." />
      </h1>

      <Reveal delay={0.3}>
        <p className="mt-5 text-[13px] leading-relaxed text-faint sm:text-sm xl:text-[15px]">
          Currently, I am the CEO of{" "}
          <BioLink href="https://attractor.world">Attractor Labs</BioLink>. We
          are building audio world models to power a new generation of
          human-centered AI that is multimodal, inspectable, and highly
          expressive.
        </p>
        <p className="mt-3 text-[13px] leading-relaxed text-faint sm:text-sm xl:text-[15px]">
          Previously, I was a researcher at Stanford focusing on
          human-computer interaction and computer music (
          <BioLink href="https://shape.stanford.edu/">Shape Lab</BioLink> &amp;{" "}
          <BioLink href="https://ccrma.stanford.edu/groups/neuromusiclab/about.html">
            Neuromusic Lab
          </BioLink>
          ). My work explored human-in-the-loop creative tools (
          <BioLink href="https://satie.live">SATIE</BioLink>,{" "}
          <ProjectLink slug="headwave">HeadWave</ProjectLink>,{" "}
          <ProjectLink slug="theo">Theo</ProjectLink>), symmetrical AI agents
          that prompt users back (
          <BioLink href="https://www.machinemonks.studio/">TWINS</BioLink>),
          and social simulations driven by generative agents (
          <BioLink href="https://dl.acm.org/doi/full/10.1145/3706599.3720011">
            LoveSims
          </BioLink>
          , <ProjectLink slug="attractor-v1">Attractor v1</ProjectLink>).
        </p>
        <p className="mt-3 text-[13px] leading-relaxed text-faint sm:text-sm xl:text-[15px]">
          I also have a strong foundation in immersive technology and audio. I
          engineered VR at{" "}
          <BioLink href="https://www.prismsvr.com/">Prisms</BioLink> (an
          a16z-backed startup), taught VR at MIT, and hold a degree in computer
          music and psychoacoustics from Berklee.
        </p>
        <p className="mt-3 text-[13px] leading-relaxed text-faint sm:text-sm xl:text-[15px]">
          Outside the lab, I design video games and compose music as{" "}
          <BioLink href="https://open.spotify.com/artist/7z2V70xnAEDEk9Ip0YKvcn">
            Juancho Lagartos
          </BioLink>
          .
        </p>
      </Reveal>

      <Reveal delay={0.45} margin="0px 0px 120px 0px">
        <div className="mt-8 flex min-h-10 items-center justify-center gap-2 lg:mt-14 xl:mt-16">
          {socials.map(({ href, label, Icon }) => (
            <motion.a
              key={label}
              href={href}
              target="_blank"
              rel="noreferrer"
              aria-label={label}
              className="flex size-10 items-center justify-center rounded-full bg-soft text-faint transition-colors hover:text-accent"
              whileHover={{ scale: 1.1, y: -2 }}
              whileTap={{ scale: 0.92 }}
              transition={hoverSpring(tempo)}
            >
              <Icon className="size-[18px]" />
            </motion.a>
          ))}
        </div>
      </Reveal>
    </div>
  );
}
