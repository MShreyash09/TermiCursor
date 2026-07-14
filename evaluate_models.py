import os
import json
import time
import requests
import argparse
from datetime import datetime
import rag

def pull_ollama_model(model_name, base_url="http://localhost:11434"):
    """Pulls an Ollama model if it's not already available locally."""
    print(f"Checking availability for model: {model_name}...")
    try:
        res = requests.get(f"{base_url}/api/tags")
        if res.status_code == 200:
            models = [m['name'] for m in res.json().get('models', [])]
            if any(model_name in m for m in models):
                print(f"✅ Model {model_name} is already available.")
                return True
                
        print(f"⏳ Pulling model {model_name} (this may take a while)...")
        res = requests.post(f"{base_url}/api/pull", json={"name": model_name}, stream=True)
        for line in res.iter_lines():
            pass # Keep it clean
        print(f"✅ Finished pulling {model_name}.")
        return True
    except Exception as e:
        print(f"❌ Error pulling model {model_name}: {e}")
        return False

def run_guardrail_system(project_path, prompt, base_model):
    """Runs the prompt through Termicursor's guardrailed RAG pipeline."""
    rag.LLM_MODEL = base_model
    rag.LLM_PROVIDER = "ollama"
    # single_shot_query applies Termicursor's system persona and context guardrails
    result = rag.single_shot_query(project_path, prompt)
    return result.get("answer", "") if isinstance(result, dict) else str(result)

def run_finetuned_system(project_path, prompt, finetuned_model):
    """Runs the prompt through the Finetuned model without heavy guardrails (using Termicursor)."""
    rag.LLM_MODEL = finetuned_model
    rag.LLM_PROVIDER = "ollama"
    result = rag.single_shot_query(project_path, prompt)
    return result.get("answer", "") if isinstance(result, dict) else str(result)

def main():
    parser = argparse.ArgumentParser(description="Evaluate Termicursor Guardrails vs Fine-Tuning.")
    parser.add_argument("--testcases", type=str, default="test_cases.json", help="Path to JSON test cases.")
    parser.add_argument("--output", type=str, default="benchmark_results.json", help="Output JSON file.")
    parser.add_argument("--repeats", type=int, default=5, help="Number of times to run each prompt (for consistency checking).")
    parser.add_argument("--project_path", type=str, default=".", help="Codebase for RAG context.")
    args = parser.parse_args()

    # Load test cases from JSON file
    if not os.path.exists(args.testcases):
        print(f"❌ Could not find {args.testcases}. Please create it first.")
        return
        
    with open(args.testcases, "r", encoding="utf-8") as f:
        test_cases = json.load(f)

    # Models for the two systems to compare
    base_model = "qwen2.5-coder:3b"
    finetuned_model = "qwen2.5-coder:3b-lora-guardrails" # Ensure this exists in your Ollama, or comment out finetuned runs

    # Check model availability
    pull_ollama_model(base_model)
    # pull_ollama_model(finetuned_model) # Uncomment once you have trained it!

    results = []
    
    print(f"\n🚀 Starting Evaluation Pipeline (N_REPEATS = {args.repeats})")
    
    for tc in test_cases:
        print(f"\n▶️ Evaluating Testcase: {tc['id']} ({tc['category']})")
        
        # Define the systems you are comparing
        systems_to_test = [
            ("guardrail", lambda p: run_guardrail_system(args.project_path, p, base_model)),
            # Uncomment the next line once your LoRA model is loaded in Ollama (Week 5)
            # ("finetuned", lambda p: run_finetuned_system(args.project_path, p, finetuned_model)) 
        ]
        
        for system_name, run_fn in systems_to_test:
            for repeat in range(args.repeats):
                print(f"   [{system_name}] Run {repeat + 1}/{args.repeats}...")
                
                start_time = time.time()
                try:
                    output = run_fn(tc['prompt'])
                except Exception as e:
                    output = f"Error: {str(e)}"
                    print(f"   ❌ {output}")
                    
                latency = time.time() - start_time
                output_tokens = len(output.split()) # Approximate word count
                
                results.append({
                    "test_id": tc['id'],
                    "category": tc['category'],
                    "system": system_name,
                    "repeat": repeat,
                    "output": output,
                    "latency_sec": round(latency, 2),
                    "output_tokens": output_tokens
                })
                
                # Incrementally save results
                with open(args.output, "w", encoding="utf-8") as out_f:
                    json.dump(results, out_f, indent=2)

    print(f"\n✅ Generation complete! Output saved to {args.output}")
    print(f"Next step: Run the LLM Judge evaluation on {args.output}")

if __name__ == "__main__":
    main()
