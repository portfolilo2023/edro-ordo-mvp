// EDRO | Ordo™ — Motor Financeiro + Monte Carlo (MVP)
// Implementa: fluxo de caixa de crédito (PRICE/SAC), NPV, IRR, Payback Descontado, simulação de risco.
//
// Simplificações (explícitas):
// - Carência: pagamento de juros-only; amortização inicia após carência.
// - Default: ocorre em algum mês com probabilidade mensal derivada do PD anual.
// - Recuperação: (1 - LGD) * saldo devedor no mês do default (recuperação imediata).
// - Atraso: com probabilidade por parcela, desloca o fluxo em k meses (se couber no horizonte).

function clamp(x, a, b){ return Math.max(a, Math.min(b, x)); }

function toMonthlyRateFromAnnualPercent(pctAnnual){
  const a = pctAnnual / 100;
  return Math.pow(1 + a, 1/12) - 1;
}

function formatBRL(x){
  if (!isFinite(x)) return "—";
  return x.toLocaleString("pt-BR", { style:"currency", currency:"BRL", maximumFractionDigits:0 });
}

function formatPct(x){
  if (!isFinite(x)) return "—";
  return (x * 100).toFixed(2) + "%";
}

function npv(rateMonthly, cashflows){
  let v = 0;
  for (let t=0; t<cashflows.length; t++){
    v += cashflows[t] / Math.pow(1 + rateMonthly, t);
  }
  return v;
}

// IRR mensal por bisseção (robusta para MVP).
function irrMonthly(cashflows){
  // precisa ter mudança de sinal
  let lo = -0.99;
  let hi = 10.0; // 1000% ao mês (cap alto para evitar falha)
  const f = (r) => npv(r, cashflows);

  let fLo = f(lo);
  let fHi = f(hi);

  // tenta expandir hi se necessário
  let tries = 0;
  while (fLo * fHi > 0 && tries < 40){
    hi *= 1.5;
    fHi = f(hi);
    tries++;
    if (hi > 1e6) break;
  }

  if (fLo * fHi > 0) return NaN;

  for (let i=0; i<80; i++){
    const mid = (lo + hi)/2;
    const fMid = f(mid);
    if (Math.abs(fMid) < 1e-9) return mid;
    if (fLo * fMid <= 0){
      hi = mid;
      fHi = fMid;
    } else {
      lo = mid;
      fLo = fMid;
    }
  }
  return (lo + hi)/2;
}

function discountedPayback(rateMonthly, cashflows){
  let cum = 0;
  for (let t=0; t<cashflows.length; t++){
    const pv = cashflows[t] / Math.pow(1 + rateMonthly, t);
    cum += pv;
    if (cum >= 0) return t; // em meses (t=0 é desembolso)
  }
  return Infinity;
}

function buildBaseSchedule({
  principal,
  termMonths,
  rateMonthly,
  amortType,
  graceMonths
}){
  const N = termMonths;
  const g = clamp(graceMonths, 0, N);
  const amortMonths = Math.max(0, N - g);

  // cashflows do ponto de vista do banco:
  // t=0: -principal
  // t>=1: recebimentos
  const cashflows = new Array(N + 1).fill(0);
  cashflows[0] = -principal;

  let outstanding = principal;

  // Durante carência: paga apenas juros
  for (let m=1; m<=g; m++){
    const interest = outstanding * rateMonthly;
    cashflows[m] = interest;
  }

  if (amortMonths === 0) return { cashflows, outstandingByMonth: buildOutstandingSeries(principal, N, g, rateMonthly, amortType) };

  if (amortType === "PRICE"){
    // parcela constante (após carência)
    const i = rateMonthly;
    const pmt = (i === 0)
      ? (outstanding / amortMonths)
      : (outstanding * (i * Math.pow(1+i, amortMonths)) / (Math.pow(1+i, amortMonths) - 1));

    for (let k=1; k<=amortMonths; k++){
      const m = g + k;
      const interest = outstanding * i;
      const amort = pmt - interest;
      outstanding = Math.max(0, outstanding - amort);
      cashflows[m] = pmt;
    }
  } else {
    // SAC: amortização constante (após carência)
    const i = rateMonthly;
    const amortConst = outstanding / amortMonths;

    for (let k=1; k<=amortMonths; k++){
      const m = g + k;
      const interest = outstanding * i;
      const pmt = amortConst + interest;
      outstanding = Math.max(0, outstanding - amortConst);
      cashflows[m] = pmt;
    }
  }

  // séries do saldo para LGD (para simplificar, reconstruímos novamente)
  const outstandingByMonth = buildOutstandingSeries(principal, N, g, rateMonthly, amortType);

  return { cashflows, outstandingByMonth };
}

// Série aproximada do saldo devedor no início de cada mês (m).
function buildOutstandingSeries(principal, N, g, i, amortType){
  const out = new Array(N + 1).fill(0);
  let outstanding = principal;
  out[0] = principal;

  // carência: sem amortização
  for (let m=1; m<=g; m++){
    out[m] = outstanding;
  }

  const amortMonths = Math.max(0, N - g);
  if (amortMonths === 0){
    for (let m=g+1; m<=N; m++) out[m] = outstanding;
    return out;
  }

  if (amortType === "PRICE"){
    const pmt = (i === 0)
      ? (outstanding / amortMonths)
      : (outstanding * (i * Math.pow(1+i, amortMonths)) / (Math.pow(1+i, amortMonths) - 1));

    for (let k=1; k<=amortMonths; k++){
      const m = g + k;
      const interest = outstanding * i;
      const amort = pmt - interest;
      outstanding = Math.max(0, outstanding - amort);
      out[m] = outstanding;
    }
  } else {
    const amortConst = outstanding / amortMonths;
    for (let k=1; k<=amortMonths; k++){
      const m = g + k;
      outstanding = Math.max(0, outstanding - amortConst);
      out[m] = outstanding;
    }
  }

  return out;
}

// PRNG simples com seed (mulberry32)
function mulberry32(seed){
  let t = seed >>> 0;
  return function(){
    t += 0x6D2B79F5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function percentile(sortedArr, p){
  if (sortedArr.length === 0) return NaN;
  const idx = (sortedArr.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sortedArr[lo];
  const w = idx - lo;
  return sortedArr[lo] * (1 - w) + sortedArr[hi] * w;
}

function applyDelay(cashflows, delayProb, delayMonths, rng){
  if (delayMonths <= 0 || delayProb <= 0) return cashflows;

  const cf = cashflows.slice();
  const N = cf.length - 1;

  for (let t=1; t<=N; t++){
    if (cf[t] <= 0) continue;
    if (rng() < delayProb){
      const target = t + delayMonths;
      const amount = cf[t];
      cf[t] = 0;
      if (target <= N){
        cf[target] += amount;
      } else {
        // se estourar o horizonte, perde-se o fluxo no MVP (simplificação conservadora)
      }
    }
  }
  return cf;
}

function applyDefault(cashflows, outstandingByMonth, pdMonthly, lgd, rng){
  const cf = cashflows.slice();
  const N = cf.length - 1;

  for (let t=1; t<=N; t++){
    if (rng() < pdMonthly){
      // default no mês t: substitui fluxo daquele mês por recuperação e zera o restante
      const outstanding = outstandingByMonth[t-1] ?? outstandingByMonth[t] ?? 0;
      const recovery = (1 - lgd) * outstanding; // lgd em [0,1]
      cf[t] = recovery;
      for (let k=t+1; k<=N; k++) cf[k] = 0;
      return cf;
    }
  }
  return cf;
}

function simulateCreditDecision(params){
  const {
    principal,
    termMonths,
    rateAnnual,
    amortType,
    graceMonths,
    discountAnnual,
    pdAnnual,
    lgdPct,
    delayProbPct,
    delayMonths,
    iterations,
    seed
  } = params;

  const rateMonthly = toMonthlyRateFromAnnualPercent(rateAnnual);
  const discMonthly = toMonthlyRateFromAnnualPercent(discountAnnual);

  const base = buildBaseSchedule({
    principal, termMonths, rateMonthly, amortType, graceMonths
  });

  const baseNPV = npv(discMonthly, base.cashflows);
  const baseIRR_m = irrMonthly(base.cashflows);
  const baseIRR_a = isFinite(baseIRR_m) ? (Math.pow(1 + baseIRR_m, 12) - 1) : NaN;
  const baseDPB = discountedPayback(discMonthly, base.cashflows);

  // risco
  const pdA = clamp(pdAnnual/100, 0, 1);
  // conversão aproximada anual->mensal (hazard)
  const pdMonthly = 1 - Math.pow(1 - pdA, 1/12);

  const lgd = clamp(lgdPct/100, 0, 1);
  const delayProb = clamp(delayProbPct/100, 0, 1);

  const rng = (seed !== null && seed !== undefined && String(seed).trim() !== "")
    ? mulberry32(Number(seed) || 0)
    : Math.random;

  const npvs = new Array(iterations);
  let neg = 0;

  for (let i=0; i<iterations; i++){
    let cf = base.cashflows;

    // atraso
    cf = applyDelay(cf, delayProb, delayMonths, rng);

    // default
    cf = applyDefault(cf, base.outstandingByMonth, pdMonthly, lgd, rng);

    const v = npv(discMonthly, cf);
    npvs[i] = v;
    if (v < 0) neg++;
  }

  const sorted = npvs.slice().sort((a,b)=>a-b);
  const p5 = percentile(sorted, 0.05);
  const p50 = percentile(sorted, 0.50);
  const p95 = percentile(sorted, 0.95);

  return {
    base: {
      npv: baseNPV,
      irrAnnual: baseIRR_a,
      dpbMonths: baseDPB
    },
    mc: {
      pNeg: neg / iterations,
      p5, p50, p95,
      npvs
    }
  };
}

// Histograma simples (canvas)
function drawHistogram(canvas, values, bins=30){
  const ctx = canvas.getContext("2d");
  const W = canvas.width;
  const H = canvas.height;
  ctx.clearRect(0,0,W,H);

  if (!values || values.length === 0){
    ctx.fillStyle = "rgba(255,255,255,0.72)";
    ctx.fillText("Sem dados", 12, 20);
    return;
  }

  let min = Infinity, max = -Infinity;
  for (const v of values){
    if (v < min) min = v;
    if (v > max) max = v;
  }
  if (min === max){
    min -= 1;
    max += 1;
  }

  const counts = new Array(bins).fill(0);
  for (const v of values){
    const x = (v - min) / (max - min);
    let b = Math.floor(x * bins);
    b = clamp(b, 0, bins-1);
    counts[b]++;
  }

  const maxC = Math.max(...counts);
  const pad = 18;
  const plotW = W - pad*2;
  const plotH = H - pad*2;

  // eixo base
  ctx.strokeStyle = "rgba(255,255,255,0.22)";
  ctx.beginPath();
  ctx.moveTo(pad, H - pad);
  ctx.lineTo(W - pad, H - pad);
  ctx.stroke();

  // barras
  const bw = plotW / bins;
  for (let i=0; i<bins; i++){
    const h = (counts[i] / maxC) * plotH;
    const x = pad + i * bw;
    const y = (H - pad) - h;

    ctx.fillStyle = "rgba(84,142,141,0.55)"; // EDRO teal com transparência (sem “estilo” extra)
    ctx.fillRect(x + 1, y, Math.max(1, bw - 2), h);
  }

  // rótulos min/max
  ctx.fillStyle = "rgba(255,255,255,0.68)";
  ctx.font = "12px system-ui, -apple-system, Segoe UI, Roboto, Arial";
  ctx.fillText("min", pad, 14);
  ctx.fillText("max", W - pad - 28, 14);
}

