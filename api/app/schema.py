"""Content schema. Every YAML file under content/ is validated against these models at seed time,
so a typo in a block type or a dangling reference fails the build instead of the page."""

from __future__ import annotations

from typing import Annotated, Any, Literal, Union

from pydantic import BaseModel, ConfigDict, Field


class Strict(BaseModel):
    model_config = ConfigDict(extra="forbid")


# ---------------------------------------------------------------------------------------------
# Blocks: the building pieces of long-form content (deep dives, platform notes)
# ---------------------------------------------------------------------------------------------


class Markdown(Strict):
    type: Literal["markdown"]
    md: str


class Heading(Strict):
    type: Literal["heading"]
    text: str
    level: Literal[3, 4] = 3


class Formula(Strict):
    type: Literal["formula"]
    text: str
    caption: str | None = None


class Callout(Strict):
    type: Literal["callout"]
    kind: Literal["note", "warn", "prod"] = "note"
    title: str | None = None
    md: str


class Step(Strict):
    title: str
    md: str


class Steps(Strict):
    type: Literal["steps"]
    items: list[Step]


class Worked(Strict):
    type: Literal["worked"]
    title: str
    md: str


class Code(Strict):
    type: Literal["code"]
    lang: Literal["sql", "python", "yaml", "bash", "text", "json"] = "sql"
    code: str
    caption: str | None = None


class TableColumn(Strict):
    key: str
    label: str


class Table(Strict):
    type: Literal["table"]
    columns: list[TableColumn]
    rows: list[dict[str, str]]
    caption: str | None = None


class Visual(Strict):
    """A registered interactive or animated figure (frontend: src/visuals)."""

    type: Literal["visual"]
    key: str
    props: dict[str, Any] = {}
    caption: str | None = None


class StepperStep(Strict):
    title: str
    md: str
    state: dict[str, Any] = {}


class Stepper(Strict):
    """A visual walked through step by step: each step passes its `state` to the visual."""

    type: Literal["stepper"]
    key: str
    props: dict[str, Any] = {}
    steps: list[StepperStep]
    caption: str | None = None


class Related(Strict):
    type: Literal["related"]
    slugs: list[str]


Block = Annotated[
    Union[Markdown, Heading, Formula, Callout, Steps, Worked, Code, Table, Visual, Stepper, Related],
    Field(discriminator="type"),
]


# ---------------------------------------------------------------------------------------------
# Modules
# ---------------------------------------------------------------------------------------------

Level = Literal["junior", "mid", "senior", "staff"]
RoleKey = Literal["da", "ae", "de", "ds", "mle", "ai", "swe", "mgr"]


class Experiment(Strict):
    title: str
    goal: str
    look: str
    why: str
    # parameters handed to the lab's preset handler; omitted = nothing to set up
    setup: dict[str, Any] | None = None


class FollowUp(Strict):
    q: str
    a: str


class InterviewQuestion(Strict):
    level: Level
    q: str
    answer: str
    listen_for: list[str]
    follow_ups: list[FollowUp] = []


class CheckQuestion(Strict):
    q: str
    a: str


class Module(Strict):
    slug: str
    title: str
    track: str
    summary: str
    roles: list[RoleKey]
    lab: str  # key of the frontend lab component
    order: int
    status: Literal["live", "draft"] = "live"
    intuition: str = ""
    experiments: list[Experiment] = []
    deep_dive: list[Block] = []
    interview: list[InterviewQuestion] = []
    check: list[CheckQuestion] = []


class Track(Strict):
    key: str
    title: str
    blurb: str
    order: int


class Role(Strict):
    key: RoleKey
    title: str
    what: str
    ic: list[str]
    manager: list[str]
    interviews: list[str]
    planned: list[str]


class Market(Strict):
    source: str
    as_of: str
    sample: dict[RoleKey, int]
    demand: dict[str, dict[RoleKey, int]]


# ---------------------------------------------------------------------------------------------
# Platforms: comparing AWS, GCP, Azure, Snowflake, Databricks
# ---------------------------------------------------------------------------------------------


class Provider(Strict):
    key: str
    name: str
    kind: Literal["cloud", "platform"]
    summary: str
    color: str


class Category(Strict):
    key: str
    name: str
    layer: Literal["store", "process", "serve", "govern", "ai", "ops"]
    description: str
    order: int


class Service(Strict):
    provider: str
    category: str
    name: str
    summary: str
    pricing: str = ""
    serverless: bool | None = None
    open_source_base: str | None = None
    url: str | None = None


class Dimension(Strict):
    """One axis of the warehouse/lakehouse comparison, with a value per provider."""

    key: str
    name: str
    why: str
    values: dict[str, str]


class PricePoint(Strict):
    provider: str
    item: str
    unit: str
    usd: float
    note: str = ""
    source: str
    as_of: str


class Architecture(Strict):
    """A reference pipeline drawn as stages; each stage maps to one category."""

    key: str
    name: str
    description: str
    stages: list[dict[str, str]]  # {label, category}


class Platforms(Strict):
    providers: list[Provider]
    categories: list[Category]
    services: list[Service]
    dimensions: list[Dimension]
    prices: list[PricePoint]
    architectures: list[Architecture]
