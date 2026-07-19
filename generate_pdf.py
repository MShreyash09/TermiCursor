import json
from fpdf import FPDF
from collections import defaultdict

def create_pdf_report(filepath="benchmark_results_scored.json", output_path="Termicursor_Benchmark_Report.pdf"):
    try:
        with open(filepath, "r", encoding="utf-8") as f:
            results = json.load(f)
    except FileNotFoundError:
        print("Error: benchmark_results_scored.json not found.")
        return

    # Aggregate Data
    system_metrics = defaultdict(lambda: {
        "total_score": 0,
        "total_latency": 0,
        "total_tokens": 0,
        "count": 0
    })

    for r in results:
        sys_name = r.get("system", "Unknown")
        system_metrics[sys_name]["count"] += 1
        system_metrics[sys_name]["total_latency"] += r.get("latency_sec", 0)
        system_metrics[sys_name]["total_tokens"] += r.get("output_tokens", 0)
        
        scores = r.get("scores", {})
        system_metrics[sys_name]["total_score"] += scores.get("overall_score", 0)

    # Create PDF
    pdf = FPDF()
    pdf.add_page()
    pdf.set_font("helvetica", "B", 16)
    
    # Title
    pdf.cell(0, 10, "Termicursor Model Benchmark Report", ln=True, align="C")
    pdf.set_font("helvetica", "", 12)
    pdf.cell(0, 10, "Aligned Research: Guardrails vs Fine-Tuning Evaluation", ln=True, align="C")
    pdf.ln(10)
    
    # Summary Table
    pdf.set_font("helvetica", "B", 12)
    pdf.cell(40, 10, "System Model", border=1)
    pdf.cell(40, 10, "Avg Score (/5)", border=1, align="C")
    pdf.cell(40, 10, "Avg Latency (s)", border=1, align="C")
    pdf.cell(40, 10, "Avg Tokens", border=1, align="C")
    pdf.ln()
    
    pdf.set_font("helvetica", "", 12)
    for sys, metrics in system_metrics.items():
        count = metrics["count"]
        if count == 0: continue
        avg_score = metrics["total_score"] / count
        avg_latency = metrics["total_latency"] / count
        avg_tokens = metrics["total_tokens"] / count
        
        pdf.cell(40, 10, str(sys), border=1)
        pdf.cell(40, 10, f"{avg_score:.2f}", border=1, align="C")
        pdf.cell(40, 10, f"{avg_latency:.2f}", border=1, align="C")
        pdf.cell(40, 10, f"{avg_tokens:.1f}", border=1, align="C")
        pdf.ln()

    pdf.ln(10)
    
    # Detailed Test Cases
    pdf.set_font("helvetica", "B", 14)
    pdf.cell(0, 10, "Detailed Test Case Results", ln=True)
    pdf.set_font("helvetica", "", 10)
    
    for r in results:
        sys_name = r.get("system", "Unknown")
        test_id = r.get("test_id", "Unknown")
        category = r.get("category", "Unknown")
        scores = r.get("scores", {})
        overall = scores.get("overall_score", "N/A")
        reasoning = scores.get("reasoning", "No reasoning provided.")
        
        pdf.set_font("helvetica", "B", 10)
        pdf.cell(0, 8, f"Test ID: {test_id} | Category: {category} | System: {sys_name}", ln=True)
        
        pdf.set_font("helvetica", "", 10)
        # Using built-in simple multi_cell fallback for special characters
        try:
            pdf.multi_cell(0, 6, f"Score: {overall}/5")
            pdf.multi_cell(0, 6, f"Reasoning: {str(reasoning).encode('ascii', 'ignore').decode('ascii')}")
        except Exception:
            pass
        pdf.ln(4)
        
    pdf.output(output_path)
    print(f"PDF Report successfully saved to {output_path}")

if __name__ == "__main__":
    create_pdf_report()
