"""Instrumentation: inspect structural IR and feedback without any API calls."""

from __future__ import annotations

from typing import Optional

from .model import Essay, Section, Claim, Argument, Figure, Feedback, FeedbackKind


def inspect_essay(essay: Essay) -> None:
    """Pretty-print the full structural tree of an essay."""
    print(f"{'=' * 60}")
    print(f"ESSAY: {essay.title}")
    print(f"AUTHOR: {essay.author}")
    print(f"{'=' * 60}")

    if essay.references:
        print(f"\nREFERENCES ({len(essay.references)}):")
        for ref in essay.references:
            print(f"  [{ref.key}] {ref.authors}, \"{ref.title}\", {ref.venue}, {ref.year}")

    for i, sec in enumerate(essay.sections, 1):
        print(f"\n{'─' * 60}")
        print(f"SECTION {i}: {sec.name}")
        print(f"  rhetoric: {sec.rhetoric.value}", end="")
        if sec.tone:
            print(f"  |  tone: {sec.tone}", end="")
        print()

        for j, elem in enumerate(sec.elements, 1):
            if isinstance(elem, Claim):
                strength_marker = {"assert": "●", "suggest": "○", "question": "?"}
                marker = strength_marker.get(elem.strength, "·")
                tag_str = f" [{elem.tag}]" if elem.tag else ""
                print(f"  {marker} CLAIM{tag_str}: {elem.text}")

            elif isinstance(elem, Argument):
                print(f"  ▸ ARGUMENT:")
                print(f"      thesis:    {elem.thesis}")
                if elem.evidence:
                    print(f"      evidence:  {', '.join(elem.evidence)}")
                if elem.counter:
                    print(f"      counter:   {elem.counter}")
                if elem.synthesis:
                    print(f"      synthesis: {elem.synthesis}")

            elif isinstance(elem, Figure):
                cap = f" — {elem.caption}" if elem.caption else ""
                print(f"  ◻ FIGURE: {elem.name} ({elem.lang}){cap}")
                if elem.code:
                    for line in elem.code.strip().splitlines():
                        print(f"      | {line}")

    if essay._rendered:
        print(f"\n{'─' * 60}")
        print(f"RENDERED SECTIONS: {', '.join(essay._rendered.keys())}")

    if essay.feedback:
        print(f"\nFEEDBACK ({len(essay.feedback)} items)")

    print()


def show_feedback(
    essay: Essay,
    agent_name: Optional[str] = None,
    kind: Optional[FeedbackKind] = None,
) -> None:
    """Display feedback, optionally filtered by agent or kind."""
    items = essay.feedback

    if agent_name:
        items = [f for f in items if f.agent_name == agent_name]
    if kind:
        items = [f for f in items if f.kind == kind]

    if not items:
        print("No feedback found matching filters.")
        return

    print(f"\n{'=' * 60}")
    print(f"FEEDBACK ({len(items)} items)")
    print(f"{'=' * 60}")

    for fb in items:
        kind_marker = {
            FeedbackKind.STRUCTURAL: "🏗",
            FeedbackKind.RHETORICAL: "🎭",
            FeedbackKind.CONCEPTUAL: "💡",
            FeedbackKind.OBLIQUE: "🔀",
        }
        marker = kind_marker.get(fb.kind, "·")
        print(f"\n{marker} [{fb.agent_name}] {fb.kind.value.upper()}")
        print(f"  target: {fb.target}")
        print(f"  comment: {fb.comment}")
        if fb.suggestion:
            print(f"  suggestion: {fb.suggestion}")
