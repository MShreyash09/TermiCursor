from setuptools import setup, find_packages

def read_requirements():
    with open("requirements.txt", "r", encoding="utf-8") as f:
        return [line.strip() for line in f if line.strip() and not line.startswith("#")]

setup(
    name="termicursor",
    version="0.1.0",
    description="TermiCursor - Interactive AI Coding Assistant",
    author="TermiCursor Team",
    packages=find_packages(),
    py_modules=["cli", "main", "server", "rag"],
    install_requires=read_requirements(),
    entry_points={
        "console_scripts": [
            "termicursor=cli:run",
        ],
    },
)
