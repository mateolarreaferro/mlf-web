"""Parser for .theo plaintext format → Essay model.

Syntax reference:
  # Title
  @ Author
  ref KEY: Authors, "Title", Venue, Year
  == section_name [rhetoric]
  == section_name [rhetoric, tone=X]
  > claim text
  > claim text (suggest)   — strength
  > claim text #tag-name   — tag
  >> thesis: ...           — argument block (indented continuation)
  ~~ name (lang) "caption" — figure
  ``` ... ```              — fenced code block (after ~~)
"""

from __future__ import annotations

import re
from pathlib import Path
from typing import Optional

from .config import MODEL
from .model import Essay, Section, Claim, Argument, Figure, Reference, Rhetoric


class ParseError(Exception):
    """Raised when the .theo source contains a syntax error."""

    def __init__(self, message: str, line_number: int, line_text: str = ""):
        self.line_number = line_number
        self.line_text = line_text
        detail = f"Line {line_number}: {message}"
        if line_text:
            detail += f"\n  | {line_text}"
        super().__init__(detail)


# ── Regex patterns ──────────────────────────────────────────

_TITLE_RE = re.compile(r"^#\s+(.+)$")
_AUTHOR_RE = re.compile(r"^@\s+(.+)$")
_REF_RE = re.compile(r'^ref\s+(\w+):\s*(.+),\s*"([^"]+)",\s*(.+),\s*(\d{4})$')
_SECTION_RE = re.compile(r"^==\s+(\w+)\s*\[([^\]]+)\]$")
_CLAIM_RE = re.compile(r"^>\s+(.+)$")
_ARG_START_RE = re.compile(r"^>>\s+thesis:\s*(.+)$")
_ARG_FIELD_RE = re.compile(r"^\s+(evidence|counter|synthesis):\s*(.+)$")
_FIGURE_RE = re.compile(r'^~~\s+(\w+)(?:\s+\((\w+)\))?(?:\s+"([^"]*)")?$')
_FENCE_RE = re.compile(r"^```")


def _parse_claim(text: str) -> Claim:
    """Parse claim text for optional (strength) and #tag suffixes."""
    strength = "assert"
    tag = None

    # Extract #tag at end
    tag_match = re.search(r"\s+#([\w-]+)\s*$", text)
    if tag_match:
        tag = tag_match.group(1)
        text = text[: tag_match.start()]

    # Extract (strength) at end
    strength_match = re.search(r"\s+\((assert|suggest|question)\)\s*$", text)
    if strength_match:
        strength = strength_match.group(1)
        text = text[: strength_match.start()]

    return Claim(text=text.strip(), strength=strength, tag=tag)


def _parse_section_header(bracket_content: str) -> tuple[Rhetoric, Optional[str]]:
    """Parse bracket content like 'dialectic' or 'dialectic, tone=urgent'."""
    parts = [p.strip() for p in bracket_content.split(",")]
    rhetoric_str = parts[0]
    tone = None

    for part in parts[1:]:
        if part.startswith("tone="):
            tone = part[5:]

    try:
        rhetoric = Rhetoric(rhetoric_str)
    except ValueError:
        raise ValueError(f"Unknown rhetoric: {rhetoric_str}")

    return rhetoric, tone


def parse(text: str) -> "EssayBuilder":
    """Parse a .theo source string into an EssayBuilder.

    Raises ParseError on malformed input with line numbers.
    """
    lines = text.splitlines()
    title = None
    author = None
    references: list[Reference] = []
    sections: list[Section] = []
    current_section: Optional[Section] = None

    i = 0
    while i < len(lines):
        line = lines[i]
        stripped = line.strip()

        # Skip blank lines and visual separators
        if not stripped or stripped == "---":
            i += 1
            continue

        lineno = i + 1  # 1-based for error messages

        # ── Title ──
        m = _TITLE_RE.match(stripped)
        if m:
            if title is not None:
                raise ParseError("Duplicate title", lineno, stripped)
            title = m.group(1).strip()
            i += 1
            continue

        # ── Author ──
        m = _AUTHOR_RE.match(stripped)
        if m:
            author = m.group(1).strip()
            i += 1
            continue

        # ── Reference ──
        m = _REF_RE.match(stripped)
        if m:
            references.append(Reference(
                key=m.group(1),
                authors=m.group(2).strip(),
                title=m.group(3).strip(),
                venue=m.group(4).strip(),
                year=int(m.group(5)),
            ))
            i += 1
            continue

        # ── Section ──
        m = _SECTION_RE.match(stripped)
        if m:
            try:
                rhetoric, tone = _parse_section_header(m.group(2))
            except ValueError as e:
                raise ParseError(str(e), lineno, stripped)
            current_section = Section(name=m.group(1), rhetoric=rhetoric, tone=tone)
            sections.append(current_section)
            i += 1
            continue

        # ── Argument block ──
        m = _ARG_START_RE.match(stripped)
        if m:
            if current_section is None:
                raise ParseError("Argument outside section", lineno, stripped)
            thesis = m.group(1).strip()
            evidence: list[str] = []
            counter = None
            synthesis = None

            # Read indented continuation lines
            i += 1
            while i < len(lines):
                cont = lines[i]
                fm = _ARG_FIELD_RE.match(cont)
                if fm:
                    field_name, field_val = fm.group(1), fm.group(2).strip()
                    if field_name == "evidence":
                        evidence = [e.strip() for e in field_val.split(",")]
                    elif field_name == "counter":
                        counter = field_val
                    elif field_name == "synthesis":
                        synthesis = field_val
                    i += 1
                else:
                    break

            current_section.elements.append(
                Argument(thesis=thesis, evidence=evidence, counter=counter, synthesis=synthesis)
            )
            continue

        # ── Claim ──
        m = _CLAIM_RE.match(stripped)
        if m:
            if current_section is None:
                raise ParseError("Claim outside section", lineno, stripped)
            current_section.elements.append(_parse_claim(m.group(1)))
            i += 1
            continue

        # ── Figure ──
        m = _FIGURE_RE.match(stripped)
        if m:
            if current_section is None:
                raise ParseError("Figure outside section", lineno, stripped)
            fig_name = m.group(1)
            fig_lang = m.group(2) or "haskell"
            fig_caption = m.group(3)
            fig_code = None

            # Check for fenced code block on next non-blank line
            j = i + 1
            while j < len(lines) and not lines[j].strip():
                j += 1
            if j < len(lines) and _FENCE_RE.match(lines[j].strip()):
                # Read until closing fence
                j += 1
                code_lines = []
                while j < len(lines) and not _FENCE_RE.match(lines[j].strip()):
                    code_lines.append(lines[j])
                    j += 1
                if j >= len(lines):
                    raise ParseError("Unclosed code fence", lineno, stripped)
                j += 1  # skip closing ```
                fig_code = "\n".join(code_lines)
                i = j
            else:
                i += 1

            current_section.elements.append(
                Figure(name=fig_name, lang=fig_lang, caption=fig_caption, code=fig_code)
            )
            continue

        # ── Unknown line ──
        raise ParseError(f"Unexpected syntax: {stripped}", lineno, stripped)

    if title is None:
        raise ParseError("Missing title (# ...)", 1)
    if author is None:
        raise ParseError("Missing author (@ ...)", 1)

    essay = Essay(title=title, author=author, sections=sections, references=references)
    return EssayBuilder(essay)


def load(path: str) -> "EssayBuilder":
    """Load and parse a .theo file from disk."""
    p = Path(path)
    if not p.exists():
        raise FileNotFoundError(f"No such file: {path}")
    return parse(p.read_text(encoding="utf-8"))


# ── EssayBuilder (moved from decorators.py) ─────────────────

class EssayBuilder:
    """Wraps an Essay with .render(), .inspect(), and .essay access."""

    def __init__(self, essay_obj: Essay):
        self.essay = essay_obj

    def inspect(self) -> None:
        from .instrument import inspect_essay
        inspect_essay(self.essay)

    def render(
        self,
        agents: Optional[list] = None,
        model: str = MODEL,
        output: Optional[str] = None,
    ) -> dict[str, str]:
        from .renderer import render_essay
        return render_essay(self.essay, agents=agents or [], model=model, output=output)

    def show_feedback(self, agent_name: Optional[str] = None, kind=None) -> None:
        from .instrument import show_feedback
        show_feedback(self.essay, agent_name=agent_name, kind=kind)
