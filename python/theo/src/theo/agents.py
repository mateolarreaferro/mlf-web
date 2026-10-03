"""Cognitive agents: Critic, ObliqueStrategist, Facilitator.

All agents return structured Feedback — never rewritten text.
"""

from __future__ import annotations

import json
from abc import ABC, abstractmethod

import anthropic

from .config import MODEL
from .model import Essay, Feedback, FeedbackKind
from .renderer import serialize_essay_for_prompt
from .prompts import CRITIC_SYSTEM, OBLIQUE_STRATEGIST_SYSTEM, FACILITATOR_SYSTEM


class Agent(ABC):
    """Base class for cognitive agents."""

    name: str
    system_prompt: str

    @abstractmethod
    def review(self, essay: Essay, rendered: dict[str, str]) -> list[Feedback]:
        ...

    def _call_claude(
        self,
        essay: Essay,
        rendered: dict[str, str],
        model: str = MODEL,
    ) -> list[dict]:
        """Shared helper: send essay structure + rendered prose to Claude, parse JSON response."""
        client = anthropic.Anthropic()

        structure = serialize_essay_for_prompt(essay)
        rendered_text = "\n\n".join(
            f"--- {name} ---\n{prose}" for name, prose in rendered.items()
        )

        user_prompt = f"""Review the following essay.

STRUCTURE:
{structure}

RENDERED PROSE:
{rendered_text}

Provide your feedback as a JSON array."""

        message = client.messages.create(
            model=model,
            max_tokens=2048,
            system=self.system_prompt,
            messages=[{"role": "user", "content": user_prompt}],
        )

        text = message.content[0].text

        # Extract JSON from response (may be wrapped in markdown code block)
        text = text.strip()
        if text.startswith("```"):
            lines = text.splitlines()
            # Remove first and last lines (```json and ```)
            lines = [l for l in lines if not l.strip().startswith("```")]
            text = "\n".join(lines)

        return json.loads(text)

    def _parse_feedback(self, items: list[dict]) -> list[Feedback]:
        """Convert raw JSON dicts to Feedback dataclasses."""
        feedback = []
        for item in items:
            kind_str = item.get("kind", "conceptual")
            try:
                kind = FeedbackKind(kind_str)
            except ValueError:
                kind = FeedbackKind.CONCEPTUAL

            feedback.append(Feedback(
                agent_name=self.name,
                kind=kind,
                target=item.get("target", "essay"),
                comment=item.get("comment", ""),
                suggestion=item.get("suggestion"),
            ))
        return feedback


class Critic(Agent):
    name = "Critic"
    system_prompt = CRITIC_SYSTEM

    def review(self, essay: Essay, rendered: dict[str, str]) -> list[Feedback]:
        items = self._call_claude(essay, rendered)
        return self._parse_feedback(items)


class ObliqueStrategist(Agent):
    name = "ObliqueStrategist"
    system_prompt = OBLIQUE_STRATEGIST_SYSTEM

    def review(self, essay: Essay, rendered: dict[str, str]) -> list[Feedback]:
        items = self._call_claude(essay, rendered)
        return self._parse_feedback(items)


class Facilitator(Agent):
    name = "Facilitator"
    system_prompt = FACILITATOR_SYSTEM

    def review(self, essay: Essay, rendered: dict[str, str]) -> list[Feedback]:
        items = self._call_claude(essay, rendered)
        return self._parse_feedback(items)
