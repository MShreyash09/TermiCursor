from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Optional, Type

from pydantic import BaseModel


@dataclass
class ToolResult:
    """Uniform return type for every tool."""
    success: bool
    output: str = ""
    error: Optional[str] = None
    data: dict = field(default_factory=dict)

    def to_context_str(self) -> str:
        if self.success:
            return self.output if self.output else "(tool ran successfully, no output)"
        return f"ERROR: {self.error}"


class Tool(ABC):
    """Base class for every agent tool.

    Each tool declares an args schema (a pydantic model). The agent loop
    validates the model's proposed args against it BEFORE execution, so a
    malformed tool call is rejected and retried rather than run blindly.
    """

    name: str = ""
    description: str = ""
    args_model: Type[BaseModel] = BaseModel

    def json_schema(self) -> dict:
        return {
            "name": self.name,
            "description": self.description,
            "parameters": self.args_model.model_json_schema(),
        }

    def validate_args(self, raw_args: dict) -> BaseModel:
        return self.args_model(**(raw_args or {}))

    @abstractmethod
    async def run(self, args: BaseModel, *, project_root: str) -> ToolResult:
        raise NotImplementedError
