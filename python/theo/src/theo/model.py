"""Domain model: all dataclasses for the Theo structural IR."""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum
from typing import Optional


class Rhetoric(Enum):
    DIALECTIC = "dialectic"
    POLEMIC = "polemic"
    EXPOSITORY = "expository"
    COMPRESSED = "compressed"


class FeedbackKind(Enum):
    STRUCTURAL = "structural"
    RHETORICAL = "rhetorical"
    CONCEPTUAL = "conceptual"
    OBLIQUE = "oblique"


@dataclass
class Claim:
    text: str
    strength: str = "assert"  # "assert" | "suggest" | "question"
    tag: Optional[str] = None

    def to_dict(self) -> dict:
        return {"type": "claim", "text": self.text, "strength": self.strength, "tag": self.tag}


@dataclass
class Argument:
    thesis: str
    evidence: list[str] = field(default_factory=list)
    counter: Optional[str] = None
    synthesis: Optional[str] = None

    def to_dict(self) -> dict:
        return {
            "type": "argument", "thesis": self.thesis,
            "evidence": self.evidence, "counter": self.counter,
            "synthesis": self.synthesis,
        }


@dataclass
class Figure:
    name: str
    lang: str = "haskell"
    caption: Optional[str] = None
    code: Optional[str] = None

    def to_dict(self) -> dict:
        return {
            "type": "figure", "name": self.name, "lang": self.lang,
            "caption": self.caption, "code": self.code,
        }


@dataclass
class Reference:
    key: str
    authors: str
    title: str
    venue: str
    year: int

    def to_dict(self) -> dict:
        return {
            "key": self.key, "authors": self.authors, "title": self.title,
            "venue": self.venue, "year": self.year,
        }


@dataclass
class Section:
    name: str
    rhetoric: Rhetoric = Rhetoric.EXPOSITORY
    tone: Optional[str] = None
    elements: list[Claim | Argument | Figure] = field(default_factory=list)

    def to_dict(self) -> dict:
        return {
            "name": self.name, "rhetoric": self.rhetoric.value,
            "tone": self.tone,
            "elements": [e.to_dict() for e in self.elements],
        }


@dataclass
class Feedback:
    agent_name: str
    kind: FeedbackKind
    target: str
    comment: str
    suggestion: Optional[str] = None

    def to_dict(self) -> dict:
        return {
            "agent_name": self.agent_name, "kind": self.kind.value,
            "target": self.target, "comment": self.comment,
            "suggestion": self.suggestion,
        }


@dataclass
class Essay:
    title: str
    author: str
    sections: list[Section] = field(default_factory=list)
    references: list[Reference] = field(default_factory=list)
    feedback: list[Feedback] = field(default_factory=list)
    _rendered: dict[str, str] = field(default_factory=dict)

    def to_dict(self) -> dict:
        return {
            "title": self.title, "author": self.author,
            "sections": [s.to_dict() for s in self.sections],
            "references": [r.to_dict() for r in self.references],
            "rendered": dict(self._rendered),
        }
