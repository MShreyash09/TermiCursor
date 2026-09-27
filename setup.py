import re

from setuptools import setup, find_packages

# Single source of truth for the version: core/__init__.py
with open("core/__init__.py", encoding="utf-8") as f:
    VERSION = re.search(r'__version__ = "([^"]+)"', f.read()).group(1)

def read_requirements():
    with open("requirements.txt", "r", encoding="utf-8") as f:
        return [line.strip() for line in f if line.strip() and not line.startswith("#")]

setup(
    name="termicursor",
    version=VERSION,
    description="TermiCursor - Interactive AI Coding Assistant",
    author="TermiCursor Team",
    license="MIT",
    packages=find_packages(),
    py_modules=["cli", "main", "server", "rag"],
    python_requires=">=3.10",
    install_requires=read_requirements(),
    entry_points={
        "console_scripts": [
            "termicursor=cli:run",
        ],
    },
)
