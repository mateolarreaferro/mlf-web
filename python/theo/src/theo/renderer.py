"""Rendering pipeline: serialize structure → prompts → Claude API → prose."""

from __future__ import annotations

from pathlib import Path
from typing import Optional

import anthropic

from .config import MODEL
from .model import Essay, Section, Feedback
from .prompts import essay_system_prompt, section_prompt


def serialize_section(section: Section) -> str:
    """Structured text representation of a section (for debugging/logging)."""
    from .prompts import _serialize_element
    lines = [f"Section: {section.name} (rhetoric={section.rhetoric.value})"]
    if section.tone:
        lines.append(f"Tone: {section.tone}")
    for elem in section.elements:
        lines.append(_serialize_element(elem))
    return "\n".join(lines)


def serialize_essay_for_prompt(essay: Essay) -> str:
    """Full structural serialization of an essay (for agent review)."""
    parts = [f"Essay: \"{essay.title}\" by {essay.author}\n"]
    for sec in essay.sections:
        parts.append(serialize_section(sec))
        parts.append("")
    return "\n".join(parts)


def render_section(
    essay: Essay,
    section: Section,
    model: str,
    prior_sections: dict[str, str],
    temperature: float = 1.0,
) -> str:
    """Render a single section via one Claude API call."""
    client = anthropic.Anthropic()

    sys_prompt = essay_system_prompt(essay)
    user_prompt = section_prompt(section, prior_sections)

    print(f"  Rendering section: {section.name} ({section.rhetoric.value})...")

    message = client.messages.create(
        model=model,
        max_tokens=2048,
        # The SDK no longer has a temperature argument; the API still takes it.
        extra_body={"temperature": temperature},
        system=sys_prompt,
        messages=[{"role": "user", "content": user_prompt}],
    )

    prose = message.content[0].text
    return prose


def render_essay(
    essay: Essay,
    agents: Optional[list] = None,
    model: str = MODEL,
    output: Optional[str] = None,
) -> dict[str, str]:
    """Render all sections sequentially, then run agent reviews.

    If output is given, write the rendered essay to that file path.
    """
    agents = agents or []
    rendered: dict[str, str] = {}

    print(f"Rendering \"{essay.title}\"...\n")

    # Render sections sequentially — later sections see earlier prose
    for section in essay.sections:
        prose = render_section(essay, section, model, prior_sections=rendered)
        rendered[section.name] = prose
        essay._rendered[section.name] = prose

    print(f"\nAll {len(essay.sections)} sections rendered.")

    # Run agent reviews
    if agents:
        print(f"\nRunning {len(agents)} agent(s)...")
        for agent in agents:
            feedback_items = agent.review(essay, rendered)
            essay.feedback.extend(feedback_items)
            print(f"  {agent.name}: {len(feedback_items)} feedback items")

    # Write output file
    if output:
        lines = [essay.title, f"by {essay.author}", ""]
        for name, prose in rendered.items():
            lines.append(f"{'─' * 60}")
            lines.append(name.replace("_", " ").title())
            lines.append(f"{'─' * 60}")
            lines.append("")
            lines.append(prose)
            lines.append("")
        Path(output).write_text("\n".join(lines), encoding="utf-8")
        print(f"\nWritten to {output}")

    return rendered
