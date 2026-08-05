import type { MDXComponents } from "mdx/types";
import SoundCloud from "./SoundCloud";
import Vimeo from "./Vimeo";
import HarmonicsDemo from "./HarmonicsDemo";

/*
  Components available inside every thought (.mdx file).
  Add a component here and it can be dropped into any post.
*/
export const mdxComponents: MDXComponents = {
  SoundCloud,
  Vimeo,
  HarmonicsDemo,
};
