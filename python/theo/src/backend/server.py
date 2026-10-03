"""FastAPI backend for Theo."""

from __future__ import annotations

import sys
import json
from pathlib import Path

# Add project root to path so we can import theo
sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent))

import anthropic
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional

from theo.parser import parse, ParseError
from theo.renderer import render_section as _render_section
from theo.prompts import essay_system_prompt, section_prompt, CLARIFY_SYSTEM, GENERATE_SYSTEM, _serialize_element
from theo.config import MODEL
from theo.model import Essay, Section

from version_store import list_versions, save_version, get_version

app = FastAPI(title="Theo Backend")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Request / Response models ──────────────────────────────

class ParseRequest(BaseModel):
    text: str

class RenderRequest(BaseModel):
    text: str
    section_name: str
    prior_rendered: dict[str, str] = {}
    temperature: float = 1.0

class ClarifyRequest(BaseModel):
    text: str
    section_name: str

class ClarifyAnswerRequest(BaseModel):
    text: str
    section_name: str
    answers: list[dict]
    prior_rendered: dict[str, str] = {}

class GenerateRequest(BaseModel):
    freeform: str
    existing_theo: str = ""
    temperature: float = 1.0
    context: str = ""  # additional context from chat answers

class PreGenClarifyRequest(BaseModel):
    freeform: str
    existing_theo: str = ""

class TrajectoriesRequest(BaseModel):
    text: str

class SaveVersionRequest(BaseModel):
    source: str
    parsed: dict
    label: str = ""


# ── Endpoints ──────────────────────────────────────────────

@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/parse")
def parse_theo(req: ParseRequest):
    try:
        builder = parse(req.text)
        return builder.essay.to_dict()
    except ParseError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/render")
def render(req: RenderRequest):
    try:
        builder = parse(req.text)
        essay = builder.essay

        section = None
        for s in essay.sections:
            if s.name == req.section_name:
                section = s
                break
        if section is None:
            raise HTTPException(status_code=404, detail=f"Section '{req.section_name}' not found")

        prose = _render_section(essay, section, model=MODEL, prior_sections=req.prior_rendered, temperature=req.temperature)
        return {"section": req.section_name, "prose": prose}
    except ParseError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/clarify")
def clarify(req: ClarifyRequest):
    try:
        builder = parse(req.text)
        essay = builder.essay

        section = None
        for s in essay.sections:
            if s.name == req.section_name:
                section = s
                break
        if section is None:
            raise HTTPException(status_code=404, detail=f"Section '{req.section_name}' not found")

        # Build a description of the section for the clarify agent
        elements_str = "\n".join(
            f"[{i}] {_serialize_element(e)}" for i, e in enumerate(section.elements)
        )
        user_prompt = f"""Section: {section.name}
Rhetoric mode: {section.rhetoric.value}
{f"Tone: {section.tone}" if section.tone else ""}

Elements:
{elements_str}

Read this section specification and ask 2-5 clarification questions for the author."""

        client = anthropic.Anthropic()
        message = client.messages.create(
            model=MODEL,
            max_tokens=1024,
            system=CLARIFY_SYSTEM,
            messages=[{"role": "user", "content": user_prompt}],
        )

        response_text = message.content[0].text
        # Extract JSON from response
        try:
            # Try to find JSON array in the response
            start = response_text.index("[")
            end = response_text.rindex("]") + 1
            questions = json.loads(response_text[start:end])
        except (ValueError, json.JSONDecodeError):
            questions = []

        return {"section": req.section_name, "questions": questions}
    except ParseError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/clarify/answer")
def clarify_answer(req: ClarifyAnswerRequest):
    try:
        builder = parse(req.text)
        essay = builder.essay

        section = None
        for s in essay.sections:
            if s.name == req.section_name:
                section = s
                break
        if section is None:
            raise HTTPException(status_code=404, detail=f"Section '{req.section_name}' not found")

        # Build enhanced prompt with author's answers
        answers_context = "\n".join(
            f"- Q: {a.get('question', '')} → A: {a.get('answer', '')}"
            for a in req.answers if a.get("answer")
        )

        sys_prompt = essay_system_prompt(essay)
        base_prompt = section_prompt(section, req.prior_rendered)
        enhanced_prompt = f"""{base_prompt}

The author has provided these clarifications about this section:
{answers_context}

Incorporate these clarifications into your rendering. They reflect the author's specific intent."""

        client = anthropic.Anthropic()
        message = client.messages.create(
            model=MODEL,
            max_tokens=2048,
            system=sys_prompt,
            messages=[{"role": "user", "content": enhanced_prompt}],
        )

        prose = message.content[0].text
        return {"section": req.section_name, "prose": prose}
    except ParseError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


PREGEN_CLARIFY_SYSTEM = """You are a thoughtful writing collaborator. Before converting freeform ideas into structured form, you ask the author 2-4 brief clarifying questions to better understand their intent.

Focus on:
- Structure: What are the key sections or divisions in this piece?
- Audience: Who is this for? What level of technicality?
- Tone: What rhetoric modes feel right? (dialectic, polemic, expository, compressed)
- Emphasis: Which ideas are central vs. supporting?
- Missing pieces: Are there arguments, counterpoints, or references that should be included?

Return a JSON array of questions:
[
  {"question": "Your question here", "context": "Brief note on why this matters"}
]

Be concise. Each question should meaningfully improve the structural output."""


@app.post("/pre-generate/clarify")
def pre_generate_clarify(req: PreGenClarifyRequest):
    try:
        user_prompt = f"The author wants to structure the following freeform text:\n\n{req.freeform}"
        if req.existing_theo.strip():
            user_prompt += f"\n\nThey already have this .theo structure:\n\n{req.existing_theo}"

        client = anthropic.Anthropic()
        message = client.messages.create(
            model=MODEL,
            max_tokens=1024,
            system=PREGEN_CLARIFY_SYSTEM,
            messages=[{"role": "user", "content": user_prompt}],
        )

        response_text = message.content[0].text
        try:
            start = response_text.index("[")
            end = response_text.rindex("]") + 1
            questions = json.loads(response_text[start:end])
        except (ValueError, json.JSONDecodeError):
            questions = []

        return {"questions": questions}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/generate")
def generate(req: GenerateRequest):
    try:
        user_prompt = f"Convert the following freeform text into .theo format:\n\n{req.freeform}"
        if req.context.strip():
            user_prompt += f"""

--- IMPORTANT: Pre-generation conversation with the author ---
The following is a conversation where the author clarified their intent, preferences, and structural decisions. You MUST incorporate these answers into the generated .theo — they take priority over assumptions.

{req.context}

--- End of conversation ---
Use the author's answers above to guide: section structure, rhetoric modes, tone settings, claim emphasis, argument framing, and any other structural decisions they specified."""
        if req.existing_theo.strip():
            user_prompt += f"\n\nExisting .theo to modify/extend (preserve structure where it still applies):\n\n{req.existing_theo}"

        client = anthropic.Anthropic()
        message = client.messages.create(
            model=MODEL,
            max_tokens=4096,
            extra_body={"temperature": req.temperature},
            system=GENERATE_SYSTEM,
            messages=[{"role": "user", "content": user_prompt}],
        )

        theo_text = message.content[0].text
        # Strip markdown fences if the model wrapped the output
        if theo_text.startswith("```"):
            lines = theo_text.splitlines()
            # Remove first and last fence lines
            if lines[-1].strip() == "```":
                lines = lines[1:-1]
            else:
                lines = lines[1:]
            theo_text = "\n".join(lines)

        return {"theo": theo_text}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


TRAJECTORIES_SYSTEM = """You are a structural writing analyst. Given an essay's structure (sections, claims, arguments, and their connections), you suggest alternative trajectories: different ways to connect and order the ideas.

Each trajectory is a possible narrative path through the material. Think about:
- Different orderings of sections that change the rhetorical arc
- Thematic threads that connect claims across non-adjacent sections
- Alternative groupings of ideas that reframe the argument

Return exactly 3 trajectories as a JSON array. Each trajectory has:
- "name": a short label (2-4 words)
- "description": one sentence explaining the logic of this path
- "edges": an array of {"from": "section_name", "to": "section_name", "reason": "brief reason"} representing the suggested connections in order

The edges define a reading/narrative path. They don't have to be linear — they can skip sections, loop back, or branch. The point is to show the author alternative ways their ideas could flow.

Return ONLY the JSON array, no other text."""


@app.post("/trajectories")
def trajectories(req: TrajectoriesRequest):
    try:
        builder = parse(req.text)
        essay = builder.essay

        # Build a summary of the structure for Claude
        parts = [f"Title: {essay.title}", f"Author: {essay.author}", ""]
        for sec in essay.sections:
            parts.append(f"Section: {sec.name} [{sec.rhetoric.value}]")
            for elem in sec.elements:
                parts.append(f"  {_serialize_element(elem)}")
            parts.append("")

        structure_summary = "\n".join(parts)

        client = anthropic.Anthropic()
        message = client.messages.create(
            model=MODEL,
            max_tokens=2048,
            system=TRAJECTORIES_SYSTEM,
            messages=[{"role": "user", "content": f"Analyze this essay structure and suggest 3 alternative trajectories:\n\n{structure_summary}"}],
        )

        response_text = message.content[0].text
        try:
            start = response_text.index("[")
            end = response_text.rindex("]") + 1
            trajectories_data = json.loads(response_text[start:end])
        except (ValueError, json.JSONDecodeError):
            trajectories_data = []

        return {"trajectories": trajectories_data}
    except ParseError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/versions")
def get_versions():
    return list_versions()


@app.post("/versions")
def create_version(req: SaveVersionRequest):
    return save_version(req.source, req.parsed, req.label)


@app.get("/versions/{vid}")
def get_version_by_id(vid: str):
    v = get_version(vid)
    if v is None:
        raise HTTPException(status_code=404, detail="Version not found")
    return v


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8420)
