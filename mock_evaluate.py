import json
import random

with open('termicursor_benchmark.json', 'r', encoding='utf-8') as f:
    data = json.load(f)

results = []
for cat, cases in data.get('categories', {}).items():
    for case in cases:
        for sys in ['guardrail', 'finetuned']:
            # mock a result
            score = random.randint(1, 5)
            case_id = case.get('id')
            results.append({
                'test_id': case_id,
                'category': cat,
                'system': sys,
                'repeat': 0,
                'output': f'Mock output for {case_id}',
                'latency_sec': random.uniform(1.0, 5.0),
                'output_tokens': random.randint(10, 100),
                'scores': {
                    'criterion_1_pass': 1 if score > 2 else 0,
                    'criterion_2_pass': 1 if score > 3 else 0,
                    'overall_score': score,
                    'reasoning': f'Mock reasoning for score {score}'
                }
            })

with open('benchmark_results_scored_test_2.json', 'w', encoding='utf-8') as f:
    json.dump(results, f, indent=2)

print("Created benchmark_results_scored_test_2.json")
