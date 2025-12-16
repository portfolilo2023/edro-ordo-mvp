// EDRO | Ordo™ — MVP (UI)
// 1) Botões "Em breve" (no portal)
// 2) Execução do simulador (na página credito.html)

document.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-soon]");
  if (!btn) return;

  alert("Módulo em desenvolvimento. Este MVP demonstra o Simulador de Crédito Corporativo (VPL/TIR/Payback/M. Carlo).");
});

function $(id){ return document.getElementById(id); }

function safeNum(id){
  const el = $(id);
  if (!el) return NaN;
  return Number(el.value);
}

function setText(id, text){
  const el = $(id);
  if (el) el.textContent = text;
}

function onCreditPage(){
  return !!document.getElementById("runBtn");
}

document.addEventListener("DOMContentLoaded", () => {
  if (!onCreditPage()) return;

  const runBtn = $("runBtn");
  const status = $("status");
  const canvas = $("hist");

  runBtn.addEventListener("click", () => {
    try{
      status.textContent = "Executando simulação...";

      const params = {
        principal: safeNum("principal"),
        termMonths: Math.max(1, Math.floor(safeNum("termMonths"))),
        rateAnnual: safeNum("rateAnnual"),
        amortType: String($("amortType").value || "PRICE"),
        graceMonths: Math.max(0, Math.floor(safeNum("graceMonths"))),
        discountAnnual: safeNum("discountAnnual"),
        pdAnnual: safeNum("pdAnnual"),
        lgdPct: safeNum("lgd"),
        delayProbPct: safeNum("delayProb"),
        delayMonths: Math.max(0, Math.floor(safeNum("delayMonths"))),
        iterations: Math.max(100, Math.floor(safeNum("iterations"))),
        seed: $("seed").value
      };

      const res = simulateCreditDecision(params);

      // Base
      setText("npvBase", formatBRL(res.base.npv));
      setText("irrBase", isFinite(res.base.irrAnnual) ? (res.base.irrAnnual*100).toFixed(2) + "% a.a." : "—");
      setText("dpbBase", res.base.dpbMonths === Infinity ? "não recupera" : `${res.base.dpbMonths} mês(es)`);

      // Monte Carlo
      setText("pNeg", (res.mc.pNeg*100).toFixed(2) + "%");
      setText("p5", formatBRL(res.mc.p5));
      setText("p50", formatBRL(res.mc.p50));
      setText("p95", formatBRL(res.mc.p95));

      // Histograma
      drawHistogram(canvas, res.mc.npvs, 30);

      status.textContent = "Simulação concluída. Ajuste parâmetros e rode novamente para comparar cenários.";
    } catch(err){
      console.error(err);
      status.textContent = "Falha na simulação. Verifique os parâmetros e tente novamente.";
      alert("Erro ao executar a simulação. Verifique os parâmetros e tente novamente.");
    }
  });
});
