// EDRO | Ordo™ — MVP
// Pequena interação para botões "Em breve"
document.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-soon]");
  if (!btn) return;

  alert("Módulo em desenvolvimento. Este MVP demonstra, por ora, o Simulador de Crédito Corporativo (VPL/TIR/Payback/M. Carlo).");
});

