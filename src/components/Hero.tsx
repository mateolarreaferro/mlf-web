"use client";

import { motion } from "motion/react";
import { FaGithub, FaInstagram, FaLinkedinIn, FaSoundcloud } from "react-icons/fa6";
import { AnimatedText, Reveal } from "./motion";

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

export default function Hero() {
  return (
    <div>
      <h1 className="text-3xl font-light leading-snug tracking-tight sm:text-4xl lg:text-[2.75rem] lg:leading-[1.2]">
        <AnimatedText text="I build technological tools for creativity and decision-making." />
      </h1>

      <Reveal delay={0.3}>
        <p className="mt-8 text-sm leading-relaxed text-faint sm:text-base">
          I am the CEO of{" "}
          <BioLink href="https://attractor.live">Attractor</BioLink>, where we
          build generative agent simulations for modeling complex social
          systems. Previously, I was a researcher and grad student at Stanford,
          where I explored world modeling through{" "}
          <BioLink href="https://www.machinemonks.studio/">digital twins</BioLink>{" "}
          and <BioLink href="https://satie.live">Satie</BioLink>, a system for
          generating spatially grounded sound. My background in immersive
          technology also includes engineering VR at{" "}
          <BioLink href="https://www.prismsvr.com/">Prisms</BioLink>{" "}
          (a16z-backed startup), teaching at MIT, and a degree in computer
          music from Berklee.
        </p>
      </Reveal>

      <Reveal delay={0.45}>
        <div className="mt-8 flex items-center gap-2">
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
              transition={{ type: "spring", stiffness: 400, damping: 18 }}
            >
              <Icon className="size-[18px]" />
            </motion.a>
          ))}
        </div>
      </Reveal>
    </div>
  );
}
