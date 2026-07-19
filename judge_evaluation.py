import json
import os
from langchain_groq import ChatGroq
from dotenv import load_dotenv

load_dotenv()

JUDGE_PROMPT = """
You are an impartial judge evaluating an AI coding assistant's response.
You will read a prompt, the generated response, and a scoring rubric.

Original prompt: {prompt}

Response to evaluate:
```
{response}
```

Rubric criteria (score each 1=pass, 0=fail):
{rubric_criteria}

Based on the criteria above, provide your evaluation.
Return ONLY a valid JSON object matching this exact format, with no markdown fences, just the raw JSON:
{{"criterion_1_pass": 1, "criterion_2_pass": 0, "overall_score": 4, "reasoning": "One sentence explaining the score."}}
"""

def call_judge_api(prompt_text, response_text, rubric_criteria):
    # Using Groq (as configured in termicursor) to run a strong model like llama-3.3-70b as the judge
    # Alternatively, you can swap this for OpenAI GPT-4o or Anthropic Claude 3.5 Sonnet
    judge = ChatGroq(model="llama-3.3-70b-versatile", temperature=0.0)
    
    formatted_prompt = JUDGE_PROMPT.format(
        prompt=prompt_text,
        response=response_text,
        rubric_criteria=rubric_criteria
    )
    
    res = judge.invoke(formatted_prompt)
    try:
        # Strip potential markdown from LLM output
        clean_res = res.content.strip()
        if clean_res.startswith("```json"):
            clean_res = clean_res[7:-3]
        elif clean_res.startswith("```"):
            clean_res = clean_res[3:-3]
            
        return json.loads(clean_res)
    except Exception as e:
        print(f"Failed to parse Judge JSON: {e}\nRaw output: {res.content}")
        return {"overall_score": 0, "reasoning": "JSON parse failure"}

def main():
    if not os.path.exists("benchmark_results.json"):
        print("❌ Could not find benchmark_results.json. Run evaluate_models.py first.")
        return
        
    with open("benchmark_results.json", "r", encoding="utf-8") as f:
        results = json.load(f)
        
    with open("test_cases.json", "r", encoding="utf-8") as f:
        test_cases = {tc["id"]: tc for tc in json.load(f)}

    print("Starting LLM-as-a-Judge Evaluation...")
    for idx, r in enumerate(results):
        if "scores" in r:
            continue # Skip already scored
            
        print(f"Scoring {idx+1}/{len(results)} (Testcase: {r['test_id']}, System: {r['system']})")
        tc = test_cases[r['test_id']]
        
        scores = call_judge_api(tc['prompt'], r['output'], tc['rubric']['criteria'])
        r['scores'] = scores
        
        # Save after every score to prevent data loss
        with open("benchmark_results_scored.json", "w", encoding="utf-8") as out:
            json.dump(results, out, indent=2)
            
    print("Judging complete! Saved to benchmark_results_scored.json")

if __name__ == "__main__":
    main()
