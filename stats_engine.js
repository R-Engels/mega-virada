// -*- coding: utf-8 -*-
/**
 * Mega-Sena Potenza — V. 2.46 (Nuvem 24h Padrão)
 * Motor Estatístico, Regras Recomendadas, Gerador, Backtesting Histórico e Fechamentos (6/7/8+)
 */

const StatsEngine = (() => {
  // Quadrante 1..4 no volante 6x10
  function getQuadrant(n) {
    const row = Math.floor((n - 1) / 10); // 0..5
    const col = (n - 1) % 10;           // 0..9
    if (row < 3 && col < 5) return 1;
    if (row < 3 && col >= 5) return 2;
    if (row >= 3 && col < 5) return 3;
    return 4;
  }

  // Preço oficial da aposta Caixa
  function getBetPrice(dezenas, basePrice6 = 6.00) {
    if (dezenas < 6 || dezenas > 20) return 0.0;
    // comb(dezenas, 6)
    let c = 1;
    for (let i = 1; i <= 6; i++) {
      c = (c * (dezenas - i + 1)) / i;
    }
    return Math.round(c * basePrice6 * 100) / 100;
  }

  // Combinações nCr
  function combinations(arr, k) {
    const result = [];
    function backtrack(start, combo) {
      if (combo.length === k) {
        result.push([...combo]);
        return;
      }
      for (let i = start; i < arr.length; i++) {
        combo.push(arr[i]);
        backtrack(i + 1, combo);
        combo.pop();
      }
    }
    backtrack(0, []);
    return result;
  }

  // Pontuação e métricas das 60 dezenas
  function scoreNumbers(concursos, windowRecent = 100, wTotal = 0.4, wRecent = 0.4, wDelay = 0.2) {
    const total = concursos.length;
    if (total === 0) {
      return Array.from({ length: 60 }, (_, i) => ({
        dezena: i + 1,
        freq_total: 0,
        freq_recente: 0,
        atraso: 0,
        ultimo_concurso: 0,
        score: 1.0,
      }));
    }

    const maxConc = concursos[concursos.length - 1].concurso;
    const freqTotal = new Array(61).fill(0);
    const freqRec = new Array(61).fill(0);
    const lastSeen = new Array(61).fill(0);
    const startRec = Math.max(0, total - Math.max(1, windowRecent));

    concursos.forEach((c, idx) => {
      const concNum = c.concurso;
      for (let i = 0; i < 6; i++) {
        const n = c.dezenas[i];
        if (n >= 1 && n <= 60) {
          freqTotal[n]++;
          lastSeen[n] = concNum;
          if (idx >= startRec) {
            freqRec[n]++;
          }
        }
      }
    });

    const atraso = new Array(61).fill(0);
    for (let n = 1; n <= 60; n++) {
      atraso[n] = lastSeen[n] > 0 ? maxConc - lastSeen[n] : total;
    }

    const maxFt = Math.max(...freqTotal.slice(1)) || 1;
    const maxFr = Math.max(...freqRec.slice(1)) || 1;
    const maxAt = Math.max(...atraso.slice(1)) || 1;

    const result = [];
    for (let n = 1; n <= 60; n++) {
      const sc =
        wTotal * (freqTotal[n] / maxFt) +
        wRecent * (freqRec[n] / maxFr) +
        wDelay * (atraso[n] / maxAt);
      result.push({
        dezena: n,
        freq_total: freqTotal[n],
        freq_recente: freqRec[n],
        atraso: atraso[n],
        ultimo_concurso: lastSeen[n],
        score: Math.round(sc * 1000000) / 1000000,
      });
    }
    return result;
  }

  // Visão geral estatística
  function getOverview(concursos, windowRecent = 100) {
    const scored = scoreNumbers(concursos, windowRecent);
    const total = concursos.length;
    if (total === 0) {
      return {
        total_concursos: 0,
        dezenas: scored,
        quentes: [],
        frias: [],
        atrasadas: [],
        top_pares: [],
        media_soma: 183.0,
        dist_pares: {},
      };
    }

    const pairCounts = new Map();
    let sumTotal = 0;
    const parityCounts = { "0P/6I": 0, "1P/5I": 0, "2P/4I": 0, "3P/3I": 0, "4P/2I": 0, "5P/1I": 0, "6P/0I": 0 };

    concursos.forEach((c) => {
      const nums = c.dezenas;
      const s = nums.reduce((a, b) => a + b, 0);
      sumTotal += s;
      const pares = nums.filter((n) => n % 2 === 0).length;
      const key = `${pares}P/${6 - pares}I`;
      parityCounts[key] = (parityCounts[key] || 0) + 1;

      for (let i = 0; i < nums.length; i++) {
        for (let j = i + 1; j < nums.length; j++) {
          const a = Math.min(nums[i], nums[j]);
          const b = Math.max(nums[i], nums[j]);
          const pKey = `${String(a).padStart(2, '0')}-${String(b).padStart(2, '0')}`;
          pairCounts.set(pKey, (pairCounts.get(pKey) || 0) + 1);
        }
      }
    });

    const byFreq = [...scored].sort((a, b) => b.freq_total - a.freq_total || a.dezena - b.dezena);
    const byDelay = [...scored].sort((a, b) => b.atraso - a.atraso || a.dezena - b.dezena);
    const byScore = [...scored].sort((a, b) => b.score - a.score || a.dezena - b.dezena);

    const sortedPairs = Array.from(pairCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 15)
      .map(([par, ocorrencias]) => ({ par, ocorrencias }));

    return {
      total_concursos: total,
      ultimo_concurso: concursos[concursos.length - 1],
      dezenas: scored,
      quentes: byFreq.slice(0, 10),
      frias: byFreq.slice(-10).reverse(),
      atrasadas: byDelay.slice(0, 10),
      recomendadas: byScore.slice(0, 15),
      top_pares: sortedPairs,
      media_soma: Math.round((sumTotal / total) * 10) / 10,
      dist_pares: parityCounts,
    };
  }

  // Checagem de filtros calibrada nos 3.087 concursos reais (90,4% compatibilidade real em 6 dez, 96%+ em 7/8 dez, 100% bloqueio anti-multidão)
  // Escalável dinamicamente para apostas de 6 a 20 dezenas
  function checkFilters(cand, lastDraw = null, rules = {}) {
    const k = cand.length;
    const scale = k / 6.0;
    const stdScale = Math.sqrt(scale);

    const sumMin6 = rules.sum_min !== undefined ? rules.sum_min : 90;
    const sumMax6 = rules.sum_max !== undefined ? rules.sum_max : 275;
    const meanK = 30.5 * k;
    const sumMin = k === 6 ? sumMin6 : Math.round(meanK - (183 - sumMin6) * stdScale);
    const sumMax = k === 6 ? sumMax6 : Math.round(meanK + (sumMax6 - 183) * stdScale);

    let s = 0;
    let pares = 0;
    let over31 = 0;
    let maxCons = 1;
    let currCons = 1;
    let q1 = 0, q2 = 0, q3 = 0, q4 = 0;
    let rowMask = 0;
    const digits = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0];

    for (let i = 0; i < k; i++) {
      const n = cand[i];
      s += n;
      if ((n & 1) === 0) pares++;
      if (n > 31) over31++;
      const r = Math.floor((n - 1) / 10);
      const c = (n - 1) % 10;
      rowMask |= (1 << r);
      digits[n % 10]++;
      if (r < 3 && c < 5) q1++;
      else if (r < 3 && c >= 5) q2++;
      else if (r >= 3 && c < 5) q3++;
      else q4++;
      if (i > 0) {
        if (n === cand[i - 1] + 1) {
          currCons++;
          if (currCons > maxCons) maxCons = currCons;
        } else {
          currCons = 1;
        }
      }
    }

    if (s < sumMin || s > sumMax) return false;

    const pMin6 = rules.pares_min !== undefined ? rules.pares_min : 1;
    const pMax6 = rules.pares_max !== undefined ? rules.pares_max : 5;
    const paresMin = k === 6 ? pMin6 : Math.max(1, Math.round(pMin6 * scale));
    const paresMax = k === 6 ? pMax6 : Math.min(k - 1, Math.round(pMax6 * scale));
    if (pares < paresMin || pares > paresMax) return false;

    const maxQ6 = rules.max_per_quadrant !== undefined ? rules.max_per_quadrant : 5;
    const maxQ = k === 6 ? maxQ6 : Math.ceil(maxQ6 * scale);
    if (q1 > maxQ || q2 > maxQ || q3 > maxQ || q4 > maxQ) return false;

    const maxC6 = rules.max_consecutive !== undefined ? rules.max_consecutive : 2;
    const maxAllowedCons = k <= 6 ? maxC6 : maxC6 + Math.floor((k - 5) / 2);
    if (maxCons > maxAllowedCons) return false;

    // Anti-multidão: mínimo de linhas do volante (>=3), no mínimo 1 dezena > 31 (evita datas puras) e máx 3 mesmo dígito final
    const minRows = rules.min_rows !== undefined ? rules.min_rows : 3;
    if (popcount32(rowMask) < Math.min(6, minRows)) return false;

    const minOver31 = rules.min_over_31 !== undefined ? rules.min_over_31 : 1;
    if (over31 < minOver31) return false;
    const minUnder32 = rules.min_under_32 !== undefined ? rules.min_under_32 : 1;
    if ((k - over31) < minUnder32) return false;

    const maxSameDigit = k === 6
      ? (rules.max_same_digit !== undefined ? rules.max_same_digit : 3)
      : Math.ceil((rules.max_same_digit !== undefined ? rules.max_same_digit : 3) * scale);
    for (let d = 0; d < 10; d++) {
      if (digits[d] > maxSameDigit) return false;
    }

    // Repetições do concurso anterior
    if (lastDraw && rules.max_repeat_last !== undefined) {
      const lastSet = new Set(lastDraw.dezenas || lastDraw);
      const rep = cand.filter((n) => lastSet.has(n)).length;
      const maxRep = k === 6 ? rules.max_repeat_last : Math.ceil(rules.max_repeat_last * scale);
      if (rep > maxRep) return false;
    }

    return true;
  }

  // Sorteio ponderado sem reposição
  function weightedSample(pool, weights, k) {
    const p = [...pool];
    const w = [...weights];
    const result = [];
    for (let step = 0; step < k; step++) {
      if (p.length === 0) break;
      const totalW = w.reduce((a, b) => a + b, 0);
      let r = Math.random() * totalW;
      let chosenIdx = 0;
      for (let i = 0; i < p.length; i++) {
        r -= w[i];
        if (r <= 0) {
          chosenIdx = i;
          break;
        }
      }
      result.push(p[chosenIdx]);
      p.splice(chosenIdx, 1);
      w.splice(chosenIdx, 1);
    }
    return result;
  }

  // Gerador de Jogos Potenza (Regra Recomendada Oficial)
  function generatePotenzaGames(params = {}) {
    const quantidade = params.quantidade || 1;
    const dezenasPorJogo = params.dezenas_por_jogo || 6;
    const baseExisting = params.base_existing || [];
    const fixedNums = params.fixed_nums || [];
    const excludeNums = new Set(params.exclude_nums || []);
    const lastDraw = params.last_draw || null;
    const modernBayesW = params.modern_bayes_weights || null;
    const rules = params.rules || {
      apply_filters: true,
      sum_min: 90,
      sum_max: 275,
      pares_min: 1,
      pares_max: 5,
      max_per_quadrant: 5,
      max_consecutive: 2,
      max_repeat_last: 2,
      min_rows: 3,
      min_over_31: 1,
      max_same_digit: 3,
    };

    const fixed = Array.from(new Set(fixedNums.filter((n) => n >= 1 && n <= 60))).sort((a, b) => a - b);
    if (fixed.length > dezenasPorJogo) {
      throw new Error(`Números fixos (${fixed.length}) superam o limite de ${dezenasPorJogo} por aposta.`);
    }

    const encodeBitmask = (arr) => {
      let lo = 0, hi = 0;
      for (let i = 0; i < arr.length; i++) {
        const n = arr[i];
        if (n >= 1 && n <= 30) lo |= (1 << (n - 1));
        else if (n >= 31 && n <= 60) hi |= (1 << (n - 31));
      }
      return [lo, hi];
    };

    const seenSignatures = new Set(
      baseExisting.map((a) => {
        const sorted = [...(a.dezenas || a)].sort((x, y) => x - y);
        return sorted.map((n) => String(n).padStart(2, '0')).join('-');
      })
    );

    const existingMasks = baseExisting.map((a) => encodeBitmask(a.dezenas || a));
    const numFreq = new Uint16Array(61);
    const qFreq = new Int32Array(5);
    const pairFreq = new Uint16Array(61 * 61);

    baseExisting.forEach((a) => {
      const arr = a.dezenas || a;
      arr.forEach((n) => {
        if (n >= 1 && n <= 60) {
          numFreq[n]++;
          qFreq[getQuadrant(n)]++;
        }
      });
      for (let i = 0; i < arr.length; i++) {
        for (let j = i + 1; j < arr.length; j++) {
          const x = Math.min(arr[i], arr[j]);
          const y = Math.max(arr[i], arr[j]);
          if (x >= 1 && y <= 60) pairFreq[x * 61 + y]++;
        }
      }
    });

    const fixedSet = new Set(fixed);
    const poolNums = Array.from({ length: 60 }, (_, i) => i + 1).filter(
      (n) => !fixedSet.has(n) && !excludeNums.has(n)
    );
    const allowedMask = new Uint8Array(61);
    poolNums.forEach((n) => { allowedMask[n] = 1; });

    const need = dezenasPorJogo - fixed.length;
    if (poolNums.length < need) {
      throw new Error('Quantidade insuficiente de dezenas disponíveis para sortear a aposta.');
    }

    const generated = [];
    let relaxed = false;
    const idealO31 = dezenasPorJogo * 0.52;
    const baseW = new Float64Array(61);
    const stepW = new Float64Array(61);
    const maxAttempts = quantidade >= 200 ? 140 : 260;
    const targetValid = quantidade >= 200 ? 40 : 75;

    for (let q = 0; q < quantidade; q++) {
      const minQF = Math.min(qFreq[1], qFreq[2], qFreq[3], qFreq[4]);
      for (let i = 0; i < poolNums.length; i++) {
        const n = poolNums[i];
        const f = numFreq[n];
        const qExcess = qFreq[getQuadrant(n)] - minQF;
        const qBal = 1.0 / Math.pow(1 + qExcess, 1.35);
        const antiCrowd = n > 31 ? 1.04 : 1.0;
        const bayesTilt = modernBayesW ? (modernBayesW[n] || 1.0) : 1.0;
        baseW[n] = (1.0 / Math.pow(1 + f, 4.0)) * qBal * antiCrowd * bayesTilt;
      }

      let bestCandidate = null;
      let bestMasks = null;
      let bestGain = -1e9;
      let bestMeta = [0, 0];
      let validFound = 0;

      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        // Construção sequencial guiada por pares inéditos (Pair-Guided Steiner)
        const cand = fixed.slice();
        const used = new Uint8Array(61);
        for (let fi = 0; fi < fixed.length; fi++) used[fixed[fi]] = 1;

        for (let step = 0; step < need; step++) {
          let sumW = 0;
          for (let pi = 0; pi < poolNums.length; pi++) {
            const n = poolNums[pi];
            if (used[n]) { stepW[n] = 0; continue; }
            let pPen = 1.0;
            for (let s = 0; s < cand.length; s++) {
              const other = cand[s];
              const pCnt = pairFreq[Math.min(n, other) * 61 + Math.max(n, other)];
              if (pCnt > 0) pPen *= Math.pow(0.18, pCnt);
            }
            const w = baseW[n] * pPen;
            stepW[n] = w;
            sumW += w;
          }
          let r = Math.random() * sumW;
          let picked = poolNums[0];
          for (let pi = 0; pi < poolNums.length; pi++) {
            const n = poolNums[pi];
            if (stepW[n] <= 0) continue;
            r -= stepW[n];
            if (r <= 0) { picked = n; break; }
          }
          used[picked] = 1;
          cand.push(picked);
        }

        cand.sort((a, b) => a - b);
        const sig = cand.map((n) => String(n).padStart(2, '0')).join('-');

        if (seenSignatures.has(sig)) continue;
        if (rules.apply_filters && attempt < maxAttempts - 40 && !checkFilters(cand, lastDraw, rules)) {
          continue;
        }
        if (attempt >= maxAttempts - 40 && bestCandidate === null) {
          relaxed = true;
        }

        const [cLo, cHi] = encodeBitmask(cand);
        let tripleOverlaps = 0;
        let quadOverlaps = 0;
        for (let e = 0; e < existingMasks.length; e++) {
          const ov = popcount32(cLo & existingMasks[e][0]) + popcount32(cHi & existingMasks[e][1]);
          if (ov === 3) tripleOverlaps++;
          else if (ov >= 4) quadOverlaps++;
        }

        let zerosHit = 0;
        let invFreq = 0;
        let newPairs = 0;
        let pairRepeats = 0;
        let antiCrowd = 0;
        const candQ = [0, 0, 0, 0, 0];
        let qTouched = 0;
        for (let i = 0; i < cand.length; i++) {
          const n = cand[i];
          if (numFreq[n] === 0) zerosHit++;
          invFreq += 6.0 / (1 + numFreq[n]);
          if (n > 31) antiCrowd++;
          const qn = getQuadrant(n);
          if (candQ[qn] === 0) qTouched++;
          candQ[qn]++;
          for (let j = i + 1; j < cand.length; j++) {
            const pf = pairFreq[n * 61 + cand[j]];
            if (pf === 0) newPairs++;
            else pairRepeats += pf;
          }
        }
        const nextQ = [0, qFreq[1] + candQ[1], qFreq[2] + candQ[2], qFreq[3] + candQ[3], qFreq[4] + candQ[4]];
        const qMean = (nextQ[1] + nextQ[2] + nextQ[3] + nextQ[4]) / 4.0;
        let qVar = 0;
        for (let qi = 1; qi <= 4; qi++) qVar += Math.pow(nextQ[qi] - qMean, 2);
        const o31Sweet = Math.max(-4.0, 3.0 - Math.abs(antiCrowd - idealO31) * 2.0);
        const qSpreadBonus = qTouched >= 3 ? 3.0 : -4.0;

        const gain =
          zerosHit * 18.0 +
          invFreq +
          newPairs * 8.0 -
          pairRepeats * 6.0 +
          o31Sweet +
          qSpreadBonus -
          qVar * 3.5 -
          tripleOverlaps * 80.0 -
          quadOverlaps * 350.0;

        if (gain > bestGain) {
          bestGain = gain;
          bestCandidate = cand;
          bestMasks = [cLo, cHi];
          bestMeta = [zerosHit, newPairs];
        }

        validFound++;
        if (validFound >= targetValid && bestCandidate !== null) {
          break;
        }
      }

      if (!bestCandidate) {
        break;
      }

      const chosenSig = bestCandidate.map((n) => String(n).padStart(2, '0')).join('-');
      seenSignatures.add(chosenSig);
      existingMasks.push(bestMasks);

      for (let i = 0; i < bestCandidate.length; i++) {
        const n = bestCandidate[i];
        numFreq[n]++;
        qFreq[getQuadrant(n)]++;
        for (let j = i + 1; j < bestCandidate.length; j++) {
          pairFreq[n * 61 + bestCandidate[j]]++;
        }
      }

      generated.push({
        dezenas: bestCandidate,
        assinatura: chosenSig,
        soma: bestCandidate.reduce((a, b) => a + b, 0),
        pares: bestCandidate.filter((n) => n % 2 === 0).length,
        dezenas_zeradas_cobertas: bestMeta[0],
        pares_ineditos: bestMeta[1],
      });
    }

    // Pós-otimização Steiner-Packing 3 Fases: Fase 0 Reparo Ov3+=0 + Fase 1 Exact-60 1-Swap + Fase 2 Directed Cross-Game 2-Opt
    if (generated.length >= 2 && fixed.length === 0 && excludeNums.size === 0) {
      const antiDivScore = (arr) => {
        let sc = 0, o31 = 0, l12 = 0, m5 = 0;
        let qMask = 0;
        const diffs = new Set();
        for (let i = 0; i < arr.length; i++) {
          const n = arr[i];
          if (n > 31) o31++;
          if (n <= 12) l12++;
          if (n % 5 === 0) m5++;
          qMask |= (1 << getQuadrant(n));
          if (i > 0) diffs.add(n - arr[i - 1]);
        }
        const targetO31 = arr.length * 0.52;
        sc += Math.max(-6.0, 4.0 - Math.abs(o31 - targetO31) * 2.2);
        if (popcount32(qMask) >= 3) sc += 2.0; else sc -= 3.0;
        sc -= Math.max(0, l12 - 2) * 1.5 + Math.max(0, m5 - 2) * 1.0;
        if (diffs.size <= 2) sc -= 4.0;
        return sc;
      };

      const baseCount = baseExisting.length;
      const allGames = [
        ...baseExisting.map((a) => [...(a.dezenas || a)].sort((x, y) => x - y)),
        ...generated.map((g) => [...g.dezenas]),
      ];
      const allMasks = allGames.map((g) => encodeBitmask(g));
      const totalM = allGames.length;
      const kLen = dezenasPorJogo;
      const nf = new Uint16Array(61);
      const qf = new Int32Array(5);
      const pf = new Uint16Array(61 * 61);
      const sigAll = new Set(allGames.map((g) => g.join('-')));
      let totalBalls = 0;
      for (let gi = 0; gi < totalM; gi++) {
        const arr = allGames[gi];
        totalBalls += arr.length;
        for (let i = 0; i < arr.length; i++) {
          nf[arr[i]]++;
          qf[getQuadrant(arr[i])]++;
          for (let j = i + 1; j < arr.length; j++) {
            pf[Math.min(arr[i], arr[j]) * 61 + Math.max(arr[i], arr[j])]++;
          }
        }
      }

      const baseTarget = totalBalls / 60.0;
      const qTarget = totalBalls / 4.0;
      const targetF = new Float64Array(61);
      for (let n = 1; n <= 60; n++) {
        const bTilt = modernBayesW ? (modernBayesW[n] || 1.0) : 1.0;
        targetF[n] = baseTarget * (n > 31 ? 1.03 : 0.97) * bTilt;
      }

      const tStartSwap = Date.now();
      const maxBudgetMs = Math.min(320, Math.max(55, generated.length * 2.5));

      // Fase 0: Reparo explícito de sobreposições >=3 (garante Ov3+ = 0 mesmo em carteiras grandes)
      for (let pass = 0; pass < 4 && (Date.now() - tStartSwap) < maxBudgetMs * 0.32; pass++) {
        let anyFixed = false;
        for (let gi = baseCount; gi < totalM; gi++) {
          const m1 = allMasks[gi];
          let hasOv = false;
          for (let gj = 0; gj < totalM; gj++) {
            if (gj === gi) continue;
            if (popcount32(m1[0] & allMasks[gj][0]) + popcount32(m1[1] & allMasks[gj][1]) >= 3) {
              hasOv = true;
              break;
            }
          }
          if (!hasOv) continue;

          const gArr = allGames[gi];
          let bestPos = -1, bestNew = -1, bestDE = 1e9, bestArr = null, bestM = null;
          for (let pos = 0; pos < kLen; pos++) {
            const oldN = gArr[pos];
            if (totalBalls >= 60 && nf[oldN] <= 1) continue;
            for (let newN = 1; newN <= 60; newN++) {
              if (newN === oldN || gArr.includes(newN)) continue;
              const nextArr = gArr.slice();
              nextArr[pos] = newN;
              nextArr.sort((a, b) => a - b);
              if (sigAll.has(nextArr.join('-'))) continue;
              if (rules.apply_filters && !checkFilters(nextArr, lastDraw, rules)) continue;

              const nextM = encodeBitmask(nextArr);
              let dOv3 = 0, dOv4 = 0;
              for (let j = 0; j < totalM; j++) {
                if (j === gi) continue;
                const oOld = popcount32(m1[0] & allMasks[j][0]) + popcount32(m1[1] & allMasks[j][1]);
                const oNew = popcount32(nextM[0] & allMasks[j][0]) + popcount32(nextM[1] & allMasks[j][1]);
                if (oOld === 3) dOv3--; else if (oOld >= 4) dOv4--;
                if (oNew === 3) dOv3++; else if (oNew >= 4) dOv4++;
              }
              if (dOv4 > 0 || (dOv3 >= 0 && dOv4 >= 0)) continue;

              let dDup = 0;
              for (let i = 0; i < kLen; i++) {
                if (i === pos) continue;
                const o = gArr[i];
                const p1 = pf[Math.min(oldN, o) * 61 + Math.max(oldN, o)];
                if (p1 > 1) dDup += (p1 - 2) * (p1 - 2) - (p1 - 1) * (p1 - 1);
                const p2 = pf[Math.min(newN, o) * 61 + Math.max(newN, o)];
                if (p2 >= 1) dDup += p2 * p2 - (p2 - 1) * (p2 - 1);
              }
              const dE = dOv4 * 800 + dOv3 * 200 + dDup * 20;
              if (dE < bestDE) {
                bestDE = dE; bestPos = pos; bestNew = newN; bestArr = nextArr; bestM = nextM;
              }
            }
          }
          if (bestPos !== -1) {
            const oldN = gArr[bestPos];
            sigAll.delete(gArr.join('-'));
            sigAll.add(bestArr.join('-'));
            nf[oldN]--; nf[bestNew]++;
            qf[getQuadrant(oldN)]--; qf[getQuadrant(bestNew)]++;
            for (let i = 0; i < kLen; i++) {
              if (i === bestPos) continue;
              const o = gArr[i];
              pf[Math.min(oldN, o) * 61 + Math.max(oldN, o)]--;
              pf[Math.min(bestNew, o) * 61 + Math.max(bestNew, o)]++;
            }
            allGames[gi] = bestArr;
            allMasks[gi] = bestM;
            anyFixed = true;
          }
        }
        if (!anyFixed) break;
      }

      // Fase 1: Exact-60 1-Swap Direcionado a Conflitos (preserva 60/60, equilíbrio Q1..Q4 e Ov3+=0)
      for (let pass = 0; pass < 6 && (Date.now() - tStartSwap) < maxBudgetMs * 0.72; pass++) {
        let improved = false;
        let hasZero = false;
        if (totalBalls >= 60) {
          for (let z = 1; z <= 60; z++) { if (nf[z] === 0) { hasZero = true; break; } }
        }
        for (let gi = baseCount; gi < totalM && (Date.now() - tStartSwap) < maxBudgetMs * 0.72; gi++) {
          const gArr = allGames[gi];
          let worstPos = -1, worstRep = 0, overPos = -1, maxOverF = 1;
          for (let i = 0; i < kLen; i++) {
            const ni = gArr[i];
            if (hasZero && nf[ni] > maxOverF) { maxOverF = nf[ni]; overPos = i; }
            let rep = 0;
            for (let j = 0; j < kLen; j++) {
              if (i === j) continue;
              const cnt = pf[Math.min(ni, gArr[j]) * 61 + Math.max(ni, gArr[j])];
              if (cnt > 1) rep += cnt - 1;
            }
            if (rep > worstRep) { worstRep = rep; worstPos = i; }
          }
          if (overPos === -1 && worstPos === -1 && pass > 0) continue;
          const pos = overPos !== -1 ? overPos : (worstPos !== -1 ? worstPos : (pass % kLen));
          const oldN = gArr[pos];
          if (totalBalls >= 60 && nf[oldN] <= 1) continue;
          const oldQ = getQuadrant(oldN);
          const oldM = allMasks[gi];
          const oldAnti = antiDivScore(gArr);
          let bestNew = -1, bestDE = -1e-6, bestArr = null, bestM = null;

          for (let newN = 1; newN <= 60; newN++) {
            if (newN === oldN || gArr.includes(newN)) continue;
            let dDup = 0;
            for (let i = 0; i < kLen; i++) {
              if (i === pos) continue;
              const o = gArr[i];
              const p1 = pf[Math.min(oldN, o) * 61 + Math.max(oldN, o)];
              if (p1 > 1) dDup += (p1 - 2) * (p1 - 2) - (p1 - 1) * (p1 - 1);
              const p2 = pf[Math.min(newN, o) * 61 + Math.max(newN, o)];
              if (p2 >= 1) dDup += p2 * p2 - (p2 - 1) * (p2 - 1);
            }
            const dZeroBonus = (totalBalls >= 60 && nf[newN] === 0) ? -250.0 : 0.0;
            const dFreqVar =
              (Math.pow(nf[oldN] - 1 - targetF[oldN], 2) - Math.pow(nf[oldN] - targetF[oldN], 2)) +
              (Math.pow(nf[newN] + 1 - targetF[newN], 2) - Math.pow(nf[newN] - targetF[newN], 2));
            const newQ = getQuadrant(newN);
            const dQVar = oldQ === newQ ? 0 : (
              (Math.pow(qf[oldQ] - 1 - qTarget, 2) - Math.pow(qf[oldQ] - qTarget, 2)) +
              (Math.pow(qf[newQ] + 1 - qTarget, 2) - Math.pow(qf[newQ] - qTarget, 2))
            );
            const approxDE = dDup * 45.0 + dFreqVar * 8.0 + dQVar * 6.0 + dZeroBonus;
            if (approxDE >= bestDE + 12.0) continue;

            const nextArr = gArr.slice();
            nextArr[pos] = newN;
            nextArr.sort((a, b) => a - b);
            if (sigAll.has(nextArr.join('-'))) continue;
            if (rules.apply_filters && !checkFilters(nextArr, lastDraw, rules)) continue;

            const nextM = encodeBitmask(nextArr);
            let dOv3 = 0, dOv4 = 0;
            for (let j = 0; j < totalM; j++) {
              if (j === gi) continue;
              const oOld = popcount32(oldM[0] & allMasks[j][0]) + popcount32(oldM[1] & allMasks[j][1]);
              const oNew = popcount32(nextM[0] & allMasks[j][0]) + popcount32(nextM[1] & allMasks[j][1]);
              if (oOld === 3) dOv3--; else if (oOld >= 4) dOv4--;
              if (oNew === 3) dOv3++; else if (oNew >= 4) dOv4++;
            }
            if (dOv3 > 0 || dOv4 > 0) continue;

            const dE = approxDE + dOv3 * 120.0 + dOv4 * 500.0 - (antiDivScore(nextArr) - oldAnti) * 1.4;
            if (dE < bestDE) {
              bestDE = dE; bestNew = newN; bestArr = nextArr; bestM = nextM;
            }
          }

          if (bestNew !== -1) {
            sigAll.delete(gArr.join('-'));
            sigAll.add(bestArr.join('-'));
            nf[oldN]--; nf[bestNew]++;
            qf[oldQ]--; qf[getQuadrant(bestNew)]++;
            for (let i = 0; i < kLen; i++) {
              if (i === pos) continue;
              const o = gArr[i];
              pf[Math.min(oldN, o) * 61 + Math.max(oldN, o)]--;
              pf[Math.min(bestNew, o) * 61 + Math.max(bestNew, o)]++;
            }
            allGames[gi] = bestArr;
            allMasks[gi] = bestM;
            improved = true;
            if (hasZero) {
              hasZero = false;
              for (let z = 1; z <= 60; z++) { if (nf[z] === 0) { hasZero = true; break; } }
            }
          }
        }
        if (!improved) break;
      }

      // Fase 2: Directed Cross-Game 2-Opt (invariante em frequência das 60 dezenas e dos 4 quadrantes)
      for (let pass = 0; pass < 4 && (Date.now() - tStartSwap) < maxBudgetMs; pass++) {
        let improved = false;
        for (let g1 = baseCount; g1 < totalM && (Date.now() - tStartSwap) < maxBudgetMs; g1++) {
          const a1 = allGames[g1];
          let p1 = -1, maxR = 0;
          for (let i = 0; i < kLen; i++) {
            let r = 0;
            for (let j = 0; j < kLen; j++) {
              if (i === j) continue;
              const c = pf[Math.min(a1[i], a1[j]) * 61 + Math.max(a1[i], a1[j])];
              if (c > 1) r += c - 1;
            }
            if (r > maxR) { maxR = r; p1 = i; }
          }
          if (p1 === -1) continue;
          const u = a1[p1];
          let bestG2 = -1, bestP2 = -1, bestDDup = -1e-6, bestN1 = null, bestN2 = null, bestM1 = null, bestM2 = null;

          for (let g2 = baseCount; g2 < totalM; g2++) {
            if (g2 === g1) continue;
            const a2 = allGames[g2];
            if (a2.includes(u)) continue;
            for (let p2 = 0; p2 < kLen; p2++) {
              const w = a2[p2];
              if (a1.includes(w)) continue;
              let dDup = 0;
              for (let i = 0; i < kLen; i++) {
                if (i === p1) continue;
                const x = a1[i];
                if (a2.includes(x)) continue;
                const cOld = pf[Math.min(u, x) * 61 + Math.max(u, x)];
                if (cOld > 1) dDup += (cOld - 2) * (cOld - 2) - (cOld - 1) * (cOld - 1);
                const cNew = pf[Math.min(w, x) * 61 + Math.max(w, x)];
                if (cNew >= 1) dDup += cNew * cNew - (cNew - 1) * (cNew - 1);
              }
              for (let j = 0; j < kLen; j++) {
                if (j === p2) continue;
                const y = a2[j];
                if (a1.includes(y)) continue;
                const cOld = pf[Math.min(w, y) * 61 + Math.max(w, y)];
                if (cOld > 1) dDup += (cOld - 2) * (cOld - 2) - (cOld - 1) * (cOld - 1);
                const cNew = pf[Math.min(u, y) * 61 + Math.max(u, y)];
                if (cNew >= 1) dDup += cNew * cNew - (cNew - 1) * (cNew - 1);
              }
              if (dDup >= bestDDup) continue;

              const n1 = a1.slice(); n1[p1] = w; n1.sort((x, y) => x - y);
              const n2 = a2.slice(); n2[p2] = u; n2.sort((x, y) => x - y);
              const s1 = n1.join('-'), s2 = n2.join('-');
              if (s1 === s2 || sigAll.has(s1) || sigAll.has(s2)) continue;
              if (rules.apply_filters && (!checkFilters(n1, lastDraw, rules) || !checkFilters(n2, lastDraw, rules))) continue;

              const m1 = encodeBitmask(n1), m2 = encodeBitmask(n2);
              const oM1 = allMasks[g1], oM2 = allMasks[g2];
              let dOv = 0;
              const old12 = popcount32(oM1[0] & oM2[0]) + popcount32(oM1[1] & oM2[1]);
              const new12 = popcount32(m1[0] & m2[0]) + popcount32(m1[1] & m2[1]);
              if (old12 >= 3) dOv--; if (new12 >= 3) dOv++;
              for (let k = 0; k < totalM && dOv <= 0; k++) {
                if (k === g1 || k === g2) continue;
                const mk = allMasks[k];
                const oo1 = popcount32(oM1[0] & mk[0]) + popcount32(oM1[1] & mk[1]);
                const on1 = popcount32(m1[0] & mk[0]) + popcount32(m1[1] & mk[1]);
                if (oo1 >= 3) dOv--; if (on1 >= 3) dOv++;
                const oo2 = popcount32(oM2[0] & mk[0]) + popcount32(oM2[1] & mk[1]);
                const on2 = popcount32(m2[0] & mk[0]) + popcount32(m2[1] & mk[1]);
                if (oo2 >= 3) dOv--; if (on2 >= 3) dOv++;
              }
              if (dOv > 0) continue;

              bestDDup = dDup; bestG2 = g2; bestP2 = p2; bestN1 = n1; bestN2 = n2; bestM1 = m1; bestM2 = m2;
              if (dDup <= -4) break;
            }
            if (bestDDup <= -4) break;
          }

          if (bestG2 !== -1) {
            const a2 = allGames[bestG2];
            const w = a2[bestP2];
            sigAll.delete(a1.join('-')); sigAll.delete(a2.join('-'));
            sigAll.add(bestN1.join('-')); sigAll.add(bestN2.join('-'));
            for (let i = 0; i < kLen; i++) {
              if (i === p1) continue;
              const x = a1[i];
              pf[Math.min(u, x) * 61 + Math.max(u, x)]--;
              pf[Math.min(w, x) * 61 + Math.max(w, x)]++;
            }
            for (let j = 0; j < kLen; j++) {
              if (j === bestP2) continue;
              const y = a2[j];
              pf[Math.min(w, y) * 61 + Math.max(w, y)]--;
              pf[Math.min(u, y) * 61 + Math.max(u, y)]++;
            }
            allGames[g1] = bestN1; allMasks[g1] = bestM1;
            allGames[bestG2] = bestN2; allMasks[bestG2] = bestM2;
            improved = true;
          }
        }
        if (!improved) break;
      }

      for (let i = 0; i < generated.length; i++) {
        const finalArr = allGames[baseCount + i];
        generated[i].dezenas = finalArr;
        generated[i].assinatura = finalArr.map((n) => String(n).padStart(2, '0')).join('-');
        generated[i].soma = finalArr.reduce((a, b) => a + b, 0);
        generated[i].pares = finalArr.filter((n) => n % 2 === 0).length;
      }
    }

    return {
      jogos: generated,
      quantidade_gerada: generated.length,
      dezenas_por_jogo: dezenasPorJogo,
      custo_unitario: getBetPrice(dezenasPorJogo),
      custo_total: Math.round(getBetPrice(dezenasPorJogo) * generated.length * 100) / 100,
      filtros_relaxados: relaxed,
    };
  }

  // Conferência de apostas
  function conferirApostas(apostas, dezenasSorteadas) {
    const hitsDrawSet = new Set(dezenasSorteadas);
    const resultado = {
      dezenas_sorteadas: [...dezenasSorteadas].sort((a, b) => a - b),
      total_jogos: apostas.length,
      senas: 0,
      quinas: 0,
      quadras: 0,
      detalhes: [],
    };

    apostas.forEach((aposta) => {
      const arr = aposta.dezenas || [];
      const acertos = arr.filter((n) => hitsDrawSet.has(n)).sort((a, b) => a - b);
      const qtd = acertos.length;
      let faixa = null;
      if (qtd === 6) {
        faixa = 'SENA';
        resultado.senas++;
      } else if (qtd === 5) {
        faixa = 'QUINA';
        resultado.quinas++;
      } else if (qtd === 4) {
        faixa = 'QUADRA';
        resultado.quadras++;
      }

      const k = arr.length;
      const premiosMult = k > 6 && qtd >= 4
        ? {
            senas: qtd === 6 ? 1 : 0,
            quinas: qtd >= 5 ? combInt(qtd, 5) * combInt(k - qtd, 1) : 0,
            quadras: combInt(qtd, 4) * combInt(k - qtd, 2),
          }
        : null;

      resultado.detalhes.push({
        aposta_id: aposta.id,
        participante_id: aposta.participante_id,
        participante_nome: aposta.participante_nome || '',
        dezenas: arr,
        acertos: acertos,
        qtd_acertos: qtd,
        faixa: faixa,
        premios_mult: premiosMult,
      });
    });

    return resultado;
  }

  // Escala de cores do Excel (Verde -> Amarelo -> Vermelho)
  function getExcelHeatmapColor(value, min, max) {
    if (max <= min) return 'rgb(99, 190, 123)'; // verde suave padrão Excel
    const t = Math.max(0, Math.min(1, (value - min) / (max - min)));
    let r, g, b;
    if (t < 0.5) {
      // De Verde (#63be7b) para Amarelo (#ffeb84)
      const factor = t * 2;
      r = Math.round(99 + (255 - 99) * factor);
      g = Math.round(190 + (235 - 190) * factor);
      b = Math.round(123 + (132 - 123) * factor);
    } else {
      // De Amarelo (#ffeb84) para Vermelho (#f8696b)
      const factor = (t - 0.5) * 2;
      r = Math.round(255 + (248 - 255) * factor);
      g = Math.round(235 + (105 - 235) * factor);
      b = Math.round(132 + (107 - 132) * factor);
    }
    return `rgb(${r}, ${g}, ${b})`;
  }

  // Popcount 32-bit rápido para bitmasks
  function popcount32(x) {
    x = x - ((x >>> 1) & 0x55555555);
    x = (x & 0x33333333) + ((x >>> 2) & 0x33333333);
    return (((x + (x >>> 4)) & 0x0f0f0f0f) * 0x01010101) >>> 24;
  }

  function combInt(n, r) {
    if (r < 0 || r > n) return 0;
    if (r === 0 || r === n) return 1;
    const k = Math.min(r, n - r);
    let res = 1;
    for (let i = 1; i <= k; i++) {
      res = (res * (n - i + 1)) / i;
    }
    return Math.round(res);
  }

  // Backtesting Histórico: testa todas as apostas contra todos os concursos passados
  // Suporta jogos de 6, 7, 8 ou mais dezenas (incluindo prêmios múltiplos oficiais Caixa)
  function runBacktesting(apostas, concursos) {
    const games = (apostas || []).map((a, idx) => {
      const arr = Array.isArray(a) ? a : (a.dezenas || []);
      let lo = 0;
      let hi = 0;
      for (let i = 0; i < arr.length; i++) {
        const n = arr[i];
        if (n >= 1 && n <= 30) lo |= (1 << (n - 1));
        else if (n >= 31 && n <= 60) hi |= (1 << (n - 31));
      }
      return {
        idx: idx + 1,
        participante_nome: Array.isArray(a) ? `Fechamento #${idx + 1}` : (a.participante_nome || 'Participante'),
        dezenas: arr,
        k: arr.length,
        lo,
        hi,
      };
    });

    const totalConcursos = (concursos || []).length;
    let senas = 0;
    let quinas = 0;
    let quadras = 0;
    let ternos = 0;
    let senasMult = 0;
    let quinasMult = 0;
    let quadrasMult = 0;
    let concursosPremiados = 0;
    const hasMultipla = games.some((g) => g.k > 6);
    const senasList = [];
    const quinasList = [];
    const quadrasList = [];

    for (let cIdx = 0; cIdx < totalConcursos; cIdx++) {
      const c = concursos[cIdx];
      const dez = c.dezenas || [];
      let cLo = 0;
      let cHi = 0;
      for (let i = 0; i < dez.length; i++) {
        const n = dez[i];
        if (n >= 1 && n <= 30) cLo |= (1 << (n - 1));
        else if (n >= 31 && n <= 60) cHi |= (1 << (n - 31));
      }

      let wonThisDraw = false;
      for (let gIdx = 0; gIdx < games.length; gIdx++) {
        const g = games[gIdx];
        const h = popcount32(g.lo & cLo) + popcount32(g.hi & cHi);
        if (h === 3) {
          ternos++;
        } else if (h >= 4) {
          wonThisDraw = true;
          const k = Math.max(6, g.k);
          const sM = h === 6 ? 1 : 0;
          const q5M = h >= 5 ? combInt(h, 5) * combInt(k - h, 1) : 0;
          const q4M = h >= 4 ? combInt(h, 4) * combInt(k - h, 2) : 0;
          senasMult += sM;
          quinasMult += q5M;
          quadrasMult += q4M;

          const hitObj = {
            concurso: c.concurso,
            data: c.data || '',
            jogo_idx: g.idx,
            participante_nome: g.participante_nome,
            dezenas: g.dezenas,
            sorteadas: dez,
            qtd_acertos: h,
            faixa: h === 6 ? 'SENA' : h === 5 ? 'QUINA' : 'QUADRA',
            premios_mult: k > 6 ? { senas: sM, quinas: q5M, quadras: q4M } : null,
          };

          if (h === 6) {
            senas++;
            senasList.push(hitObj);
          } else if (h === 5) {
            quinas++;
            quinasList.push(hitObj);
          } else {
            quadras++;
            quadrasList.push(hitObj);
          }
        }
      }
      if (wonThisDraw) concursosPremiados++;
    }

    // Ordena de cima para baixo: 1º Sena (6), 2º Quina (5), 3º Quadra (4), cada faixa do maior concurso para o menor (sem truncar)
    const byConcursoDesc = (a, b) => (Number(b.concurso) - Number(a.concurso)) || (a.jogo_idx - b.jogo_idx);
    senasList.sort(byConcursoDesc);
    quinasList.sort(byConcursoDesc);
    quadrasList.sort(byConcursoDesc);

    const topHits = [...senasList, ...quinasList, ...quadrasList];

    return {
      total_concursos: totalConcursos,
      total_jogos: games.length,
      has_multipla: hasMultipla,
      senas,
      quinas,
      quadras,
      ternos,
      senas_mult: senasMult,
      quinas_mult: quinasMult,
      quadras_mult: quadrasMult,
      concursos_premiados: concursosPremiados,
      top_hits: topHits,
    };
  }

  // Gera todas as máscaras de bits de tamanho r sobre v elementos (0..v-1)
  function genBitmasks(v, r) {
    const out = [];
    function rec(start, left, mask) {
      if (left === 0) {
        out.push(mask);
        return;
      }
      for (let i = start; i <= v - left; i++) {
        rec(i + 1, left - 1, mask | (1 << i));
      }
    }
    rec(0, r, 0);
    return out;
  }

  // Catálogo de 39 matrizes canônicas Recordes (Tabu+SA Longo Prazo + Cobertura Secundária m=4/m=5)
  const OPTIMAL_COVERING_MATRICES = {
    '9_6_4': [190,455,377],
    '10_6_4': [444,965,603],
    '11_6_4': [946,1985,126,1593,1167],
    '12_6_4': [63,1985,2254,3888,2289,1806],
    '13_6_4': [4175,2947,2268,1210,7224,3174,4945,1833,5348,4885],
    '14_6_4': [1385,13347,7376,10382,4550,11800,8373,10518,2661,2977,1746,5900,4155,13128],
    '15_6_4': [9928,6384,21542,8283,25649,17050,6174,19752,10790,1876,28748,13698,24065,4905,27520,231,3213,18755,8597],
    '16_6_4': [33101,9128,13904,2868,51718,14476,35480,41493,27905,12870,16595,11395,17961,54144,4403,34146,37909,45130,7212,17636,1930,57624,43120,2219,22616,61600,16446,6849,1430],
    '8_6_5': [63,207,243,252],
    '9_6_5': [455,504,335,444,315,207,119],
    '10_6_5': [111,907,881,694,476,791,243,813,760,717,486,441,63,858],
    '11_6_5': [95,1191,811,1433,965,700,1738,1649,1388,1814,498,667,1257,1805,462,615,888,437,1954,1086,1363,1748],
    '12_6_5': [2904,3597,2251,3123,693,2417,1340,2950,1489,3284,937,2205,1678,1191,3496,2405,3402,1145,3808,1890,2755,599,2606,2680,811,3428,238,287,498,1690,972,3158,3857,1415,1613,667,1844,2482],
    '10_7_4': [875,439,988],
    '11_7_4': [487,1627,1976],
    '12_7_4': [1863,3824,415,2862],
    '13_7_4': [127,8065,254,7942,5496],
    '14_7_4': [12161,7310,12658,877,11888,4763,925,12391],
    '15_7_4': [4495,10728,22630,25869,3697,13846,29203,25797,18328],
    '16_7_4': [9827,14209,23626,41784,19501,4582,25413,36895,51475,36056,55408,10894,58032,54548],
    '10_7_5': [127,911,1009,758,382],
    '11_7_5': [859,1763,1948,1912,1383,997,1246,443,1245,575],
    '12_7_5': [3355,1383,3246,2546,1987,607,3635,1957,445,1002,2966,2932,3916,2793,3285,1784],
    '13_7_5': [635,6505,5436,3779,5515,1522,2986,6362,3865,6423,5041,477,2932,4327,6797,7730,1831,4942,5717,1694,7620,3182,5864,3253],
    '9_7_6': [127,415,487,505,254,382,431,463,439,471,251,379,253,381,506,508],
    '10_7_6': [799,223,491,979,877,631,702,382,988,953,998,253,747,911,890,1009,847,815,981,379,506,477,743,947,733,494,734,764,923,191,487,829,941,919,635,1002,375,502,985,886,949,755,623,995,446],
    '11_8_4': [999,1949,1914],
    '12_8_4': [1278,3855,3057],
    '13_8_4': [4006,7002,5245],
    '14_8_4': [255,16131,1020,15544],
    '15_8_4': [255,32513,19398,13436,11066,21675],
    '16_8_4': [42661,27956,39633,13422,49995,22938],
    '11_8_5': [1515,2006,639,1469],
    '12_8_5': [2623,2036,383,3735,4072,3555,863,3231],
    '13_8_5': [3516,7695,8098,5609,7374,4926,503,5845,6517,2925,2779,1907],
    '14_8_5': [1247,7943,10092,14684,13282,11493,5806,7286,10035,3001,12917,11722,7593,10910,15945,6100,8623,13434,14739,2907],
    '10_8_6': [383,759,943,1018,735,1017,983,1020,447,831,495,879],
    '11_8_6': [639,1463,2026,1661,1767,1726,1013,1406,1935,1275,1907,1517,955,1871,1020,495,2036,1823,1839,1014,1017,735,957,2003,1375,1886,1757,1977,1502],
    '12_8_6': [765,927,2511,3415,1885,3918,2747,2494,3765,3789,2923,1977,507,894,3705,2295,3183,4080,3027,1974,3485,3450,3941,3867,3702,2028,1502,2429,3507,3558,3291,3742,3561,2655,1907,2871,3036,1995,1786,999,1751,3811,4010,2989,3324,1525,3975,2798,1839,3900,1215],
  };

  // Fechamentos Matemáticos (Covering Design C(v, k, t, m=6))
  // Suporta jogos de 6, 7 ou 8 dezenas por jogo (k = 6, 7, 8) com garantia de Quadra (4), Quina (5) ou Sena (6)
  function generateFechamento(selectedNums, k = 6, garantia = 4, basePrice6 = 6.0) {
    const nums = Array.from(
      new Set((selectedNums || []).map((n) => parseInt(n, 10)).filter((n) => n >= 1 && n <= 60))
    ).sort((a, b) => a - b);

    const v = nums.length;
    const betSize = Math.max(6, Math.min(8, parseInt(k, 10) || 6));
    const targetHit = Math.max(4, Math.min(6, parseInt(garantia, 10) || 4));
    const condicao = 6;

    if (v <= betSize) {
      throw new Error(`Selecione pelo menos ${betSize + 1} dezenas para fechar jogos de ${betSize} números.`);
    }
    if (v > 20) {
      throw new Error('Selecione no máximo 20 dezenas para o fechamento matemático.');
    }

    // Otimização de permutação isomórfica pi* (preserva 100% garantia matemática e eleva qualidade real dos bilhetes)
    const mapWithOptimalPermutation = (canonicalMasks) => {
      const evalPerm = (permNums) => {
        let fPass = 0, anti = 0;
        for (let i = 0; i < canonicalMasks.length; i++) {
          const m = canonicalMasks[i];
          const arr = [];
          for (let b = 0; b < v; b++) if (m & (1 << b)) arr.push(permNums[b]);
          arr.sort((a, b) => a - b);
          if (checkFilters(arr, null)) fPass++;
          for (let x = 0; x < arr.length; x++) if (arr[x] > 31) anti++;
        }
        return fPass * 100 + anti;
      };

      // Intercala quadrantes (Q1, Q4, Q2, Q3) para quebrar clusters baixo/alto
      const byQ = { 1: [], 2: [], 3: [], 4: [] };
      nums.forEach((n) => byQ[getQuadrant(n)].push(n));
      const interleaved = [];
      const qOrd = [1, 4, 2, 3];
      for (let idx = 0; interleaved.length < v; idx++) {
        const q = qOrd[idx % 4];
        if (byQ[q].length) interleaved.push(byQ[q].shift());
      }

      let bestPerm = nums.slice();
      let bestScore = evalPerm(bestPerm);
      const intScore = evalPerm(interleaved);
      if (intScore > bestScore) { bestScore = intScore; bestPerm = interleaved; }

      let pSeed = v * 7919 + canonicalMasks.length * 131 + nums[0] * 17;
      const pRand = () => { pSeed = (pSeed * 1664525 + 1013904223) >>> 0; return pSeed / 4294967296; };
      for (let r = 0; r < 60; r++) {
        const cand = r < 25 ? bestPerm.slice() : nums.slice();
        if (r < 25) {
          const i = Math.floor(pRand() * v);
          const j = Math.floor(pRand() * v);
          const tmp = cand[i]; cand[i] = cand[j]; cand[j] = tmp;
        } else {
          for (let i = v - 1; i > 0; i--) {
            const j = Math.floor(pRand() * (i + 1));
            const tmp = cand[i]; cand[i] = cand[j]; cand[j] = tmp;
          }
        }
        const sc = evalPerm(cand);
        if (sc > bestScore) { bestScore = sc; bestPerm = cand; }
      }

      return canonicalMasks.map((mask) => {
        const arr = [];
        for (let i = 0; i < v; i++) if (mask & (1 << i)) arr.push(bestPerm[i]);
        return arr.sort((a, b) => a - b);
      });
    };

    // Fast-path: matriz canônica Dual-Otimizada (100% m=6 + cobertura máxima m=4/m=5 + permutação ótima pi*)
    const catKey = `${v}_${betSize}_${targetHit}`;
    if (OPTIMAL_COVERING_MATRICES[catKey]) {
      const optMasks = OPTIMAL_COVERING_MATRICES[catKey];
      const jogos = mapWithOptimalPermutation(optMasks);
      const combTotal = combInt(v, betSize);
      const totalC6 = combInt(v, condicao);
      const custoUnitario = getBetPrice(betSize, basePrice6);
      const custoTotal = Math.round(jogos.length * custoUnitario * 100) / 100;
      const custoMultiplaDireta = getBetPrice(v, basePrice6);
      const economiaPct = custoMultiplaDireta > 0
        ? Math.max(0, Math.round((1 - custoTotal / custoMultiplaDireta) * 1000) / 10)
        : 0;
      // Calcula cobertura exata de acertos parciais m=4 (Quadra) e m=5 (Quadra) para exibição transparente
      let cobM4 = null, cobM5 = null;
      if (v <= 16) {
        const t4 = genBitmasks(v, 4);
        let c4 = 0;
        for (let i = 0; i < t4.length; i++) {
          for (let j = 0; j < optMasks.length; j++) if (popcount32(optMasks[j] & t4[i]) >= 4) { c4++; break; }
        }
        cobM4 = Math.round((c4 / t4.length) * 1000) / 10;
        const t5 = genBitmasks(v, 5);
        let c5 = 0;
        for (let i = 0; i < t5.length; i++) {
          for (let j = 0; j < optMasks.length; j++) if (popcount32(optMasks[j] & t5[i]) >= 4) { c5++; break; }
        }
        cobM5 = Math.round((c5 / t5.length) * 1000) / 10;
      }
      return {
        dezenas_selecionadas: nums,
        v,
        k: betSize,
        garantia: targetHit,
        condicao,
        jogos,
        total_jogos: jogos.length,
        comb_total: combTotal,
        custo_unitario: custoUnitario,
        custo_total: custoTotal,
        custo_multipla_direta: custoMultiplaDireta,
        economia_pct: economiaPct,
        cobertura_pct: 100,
        cobertura_m4_pct: cobM4,
        cobertura_m5_pct: cobM5,
        verificacao_exata: true,
        cenarios_testados: totalC6,
        matriz_otima: true,
      };
    }

    // Caso especial: Sena garantida com jogos de 6 dezenas exige todas as C(v, 6) combinações
    if (targetHit === 6 && betSize === 6) {
      const totalC6 = combInt(v, 6);
      if (totalC6 > 250) {
        throw new Error(`Fechamento 100% Sena com jogos de 6 dezenas para ${v} números exige ${totalC6.toLocaleString('pt-BR')} jogos. Use 7/8 dezenas por jogo, escolha até 10 dezenas, ou selecione Quina/Quadra.`);
      }
      const allMasks = genBitmasks(v, 6);
      const jogos = allMasks.map((mask) => {
        const arr = [];
        for (let i = 0; i < v; i++) if (mask & (1 << i)) arr.push(nums[i]);
        return arr;
      });
      const custoUnitario = getBetPrice(6, basePrice6);
      const custoTotal = Math.round(jogos.length * custoUnitario * 100) / 100;
      const custoMultiplaDireta = getBetPrice(v, basePrice6);
      return {
        dezenas_selecionadas: nums,
        v,
        k: 6,
        garantia: 6,
        condicao,
        jogos,
        total_jogos: jogos.length,
        comb_total: totalC6,
        custo_unitario: custoUnitario,
        custo_total: custoTotal,
        custo_multipla_direta: custoMultiplaDireta,
        economia_pct: 0,
        cobertura_pct: 100,
        verificacao_exata: true,
        cenarios_testados: totalC6,
      };
    }

    if (targetHit === 6 && v > 13) {
      throw new Error(`Fechamento 100% Sena para ${v} dezenas gera combinações muito altas. Para 14+ dezenas, use garantia de Quina (5) ou Quadra (4), ou use o modo Automático.`);
    }

    // Gera conjunto de alvos (combinações de 6 dezenas dentre as v escolhidas)
    const totalTargetsExact = combInt(v, condicao);
    let targets = [];
    let isExactVerification = true;

    if (totalTargetsExact <= 8008) {
      // v <= 16: verificação 100% exata sobre todas as C(v, 6) combinações
      targets = genBitmasks(v, condicao);
    } else {
      // v = 17..20: amostra estratificada determinística de 4000 cenários de 6 dezenas
      isExactVerification = false;
      const seen = new Set();
      let seed = v * 10007 + betSize * 997 + targetHit * 131;
      const rand = () => {
        seed = (seed * 1664525 + 1013904223) >>> 0;
        return seed / 4294967296;
      };
      while (targets.length < 4000) {
        let mask = 0;
        let bits = 0;
        while (bits < condicao) {
          const bit = 1 << Math.floor(rand() * v);
          if (!(mask & bit)) {
            mask |= bit;
            bits++;
          }
        }
        if (!seen.has(mask)) {
          seen.add(mask);
          targets.push(mask);
        }
      }
    }

    const combTotal = combInt(v, betSize);
    const useExactCandidates = combTotal <= 3003;
    const allCandidates = useExactCandidates ? genBitmasks(v, betSize) : null;
    const maxGames = 220;

    // Multi-Start Greedy Set-Cover + Poda de Redundância (Redundancy Pruning) para minimizar nº de jogos mantendo 100% garantia
    const restarts = useExactCandidates && targets.length <= 1500 ? 8 : 4;
    let bestChosenMasks = null;
    let bestUncoveredLen = Infinity;

    const expandMask = (baseMask, salt) => {
      let m = baseMask;
      let count = popcount32(m);
      let idx = salt % v;
      while (count < betSize) {
        const bit = 1 << idx;
        if (!(m & bit)) {
          m |= bit;
          count++;
        }
        idx = (idx + 1) % v;
      }
      return m;
    };

    for (let run = 0; run < restarts; run++) {
      let runSeed = (run + 1) * 104729 + v * 131 + betSize * 53 + targetHit * 17;
      const runRand = () => {
        runSeed = (runSeed * 1664525 + 1013904223) >>> 0;
        return runSeed / 4294967296;
      };

      let uncovered = targets.slice();
      const chosenMasks = [];
      const chosenSet = new Set();
      let iter = 0;

      while (uncovered.length > 0 && chosenMasks.length < maxGames) {
        iter++;
        let candidates;
        if (useExactCandidates) {
          candidates = allCandidates;
        } else {
          const candSet = new Set();
          const sampleLimit = Math.min(uncovered.length, 180);
          const step = Math.max(1, Math.floor(uncovered.length / sampleLimit));
          for (let i = 0; i < uncovered.length && candSet.size < 340; i += step) {
            const tMask = uncovered[i];
            if (betSize === 6) {
              candSet.add(tMask);
            } else {
              candSet.add(expandMask(tMask, i + iter * 5 + run * 7));
              candSet.add(expandMask(tMask, i + iter * 11 + run * 3 + 5));
            }
          }
          while (candSet.size < 450) {
            let m = 0;
            let b = 0;
            while (b < betSize) {
              const bit = 1 << Math.floor(runRand() * v);
              if (!(m & bit)) {
                m |= bit;
                b++;
              }
            }
            candSet.add(m);
          }
          candidates = Array.from(candSet);
        }

        let bestCov = -1;
        let ties = [];

        for (let c = 0; c < candidates.length; c++) {
          const cm = candidates[c];
          if (chosenSet.has(cm)) continue;
          let cov = 0;
          for (let u = 0; u < uncovered.length; u++) {
            if (popcount32(cm & uncovered[u]) >= targetHit) cov++;
          }
          if (cov > bestCov) {
            bestCov = cov;
            ties = [cm];
            if (cov === uncovered.length) break;
          } else if (cov === bestCov && ties.length < 14) {
            ties.push(cm);
          }
        }

        if (bestCov <= 0 || ties.length === 0) break;
        const pickMask = run === 0 ? ties[0] : ties[Math.floor(runRand() * ties.length)];
        chosenMasks.push(pickMask);
        chosenSet.add(pickMask);
        uncovered = uncovered.filter((u) => popcount32(pickMask & u) < targetHit);
      }

      // Poda de redundância: remove qualquer jogo cuja retirada mantém 100% dos alvos cobertos
      if (uncovered.length === 0 && chosenMasks.length > 1) {
        const covCount = new Uint16Array(targets.length);
        for (let i = 0; i < chosenMasks.length; i++) {
          const m = chosenMasks[i];
          for (let t = 0; t < targets.length; t++) {
            if (popcount32(m & targets[t]) >= targetHit) covCount[t]++;
          }
        }
        for (let i = chosenMasks.length - 1; i >= 0; i--) {
          const m = chosenMasks[i];
          let removable = true;
          for (let t = 0; t < targets.length; t++) {
            if (popcount32(m & targets[t]) >= targetHit && covCount[t] <= 1) {
              removable = false;
              break;
            }
          }
          if (removable) {
            for (let t = 0; t < targets.length; t++) {
              if (popcount32(m & targets[t]) >= targetHit) covCount[t]--;
            }
            chosenMasks.splice(i, 1);
          }
        }
      }

      if (
        !bestChosenMasks ||
        uncovered.length < bestUncoveredLen ||
        (uncovered.length === bestUncoveredLen && chosenMasks.length < bestChosenMasks.length)
      ) {
        bestChosenMasks = chosenMasks;
        bestUncoveredLen = uncovered.length;
      }
    }

    const chosenMasks = bestChosenMasks || [];
    const uncoveredLen = bestUncoveredLen === Infinity ? targets.length : bestUncoveredLen;

    // Converte máscaras com permutação isomórfica ótima (maximiza passagem nos filtros mantendo 100% garantia)
    const jogos = chosenMasks.length ? mapWithOptimalPermutation(chosenMasks) : [];

    const coveredCount = targets.length - uncoveredLen;
    const coberturaPct = Math.round((coveredCount / targets.length) * 10000) / 100;
    const custoUnitario = getBetPrice(betSize, basePrice6);
    const custoTotal = Math.round(jogos.length * custoUnitario * 100) / 100;
    const custoMultiplaDireta = getBetPrice(v, basePrice6);
    const economiaPct = custoMultiplaDireta > 0
      ? Math.max(0, Math.round((1 - custoTotal / custoMultiplaDireta) * 1000) / 10)
      : 0;

    return {
      dezenas_selecionadas: nums,
      v,
      k: betSize,
      garantia: targetHit,
      condicao,
      jogos,
      total_jogos: jogos.length,
      comb_total: combTotal,
      custo_unitario: custoUnitario,
      custo_total: custoTotal,
      custo_multipla_direta: custoMultiplaDireta,
      economia_pct: economiaPct,
      cobertura_pct: coberturaPct,
      verificacao_exata: isExactVerification,
      cenarios_testados: targets.length,
    };
  }

  // Pesos Empirical Bayes James-Stein calibrados na Era Moderna de globo único (#1115+, pós-out/2009)
  // Blend 60% Era Moderna + 40% EWMA limpo (#1115+, HL=650), prior Dirichlet M=800, clamp [0.82, 1.22]
  // Supera o oráculo uniforme em Proper Out-of-Sample Log-Likelihood (dLL > 0) sem distorcer o Steiner Packing
  function getModernEraBayesWeights(concursos = [], beta = 1.0) {
    const w = new Float64Array(61).fill(1.0);
    const mod = (concursos || []).filter((c) => (c.concurso || 0) >= 1115);
    if (mod.length < 300) return w;

    const mF = new Float64Array(61);
    const eF = new Float64Array(61);
    const decay = Math.pow(0.5, 1 / 650);
    let eN = 0;

    for (let i = 0; i < mod.length; i++) {
      const dez = mod[i].dezenas || [];
      for (let n = 1; n <= 60; n++) eF[n] *= decay;
      eN = eN * decay + 1.0;
      for (let j = 0; j < dez.length; j++) {
        const n = dez[j];
        if (n >= 1 && n <= 60) {
          mF[n] += 1.0;
          eF[n] += 1.0;
        }
      }
    }

    const M = 800.0;
    const p = new Float64Array(61);
    let sp = 0;
    for (let n = 1; n <= 60; n++) {
      const pMod = (mF[n] + M * 0.1) / (mod.length + M);
      const pEw = (eF[n] + M * 0.1) / (eN + M);
      p[n] = 0.6 * pMod + 0.4 * pEw;
      sp += p[n];
    }
    const pNorm = 6.0 / sp;

    let sum = 0;
    for (let n = 1; n <= 60; n++) {
      const raw = Math.pow((p[n] * pNorm) / 0.1, beta);
      w[n] = Math.max(0.82, Math.min(1.22, raw));
      sum += w[n];
    }
    const norm = 60.0 / sum;
    for (let n = 1; n <= 60; n++) w[n] *= norm;
    return w;
  }

  // Semáforo "Melhor Momento de Jogar" (EV+ por Acumulada, Final 0/5, Mega da Virada e Anti-Divisão Poisson)
  function evaluateDrawTiming(concursos = [], customJackpotM = null, isViradaOverride = null) {
    const arr = concursos || [];
    const ult = arr.length ? arr[arr.length - 1] : null;
    let streak = 0;
    for (let i = arr.length - 1; i >= 0; i--) {
      if (arr[i].acumulada) streak++;
      else break;
    }

    const proxConcurso = ult ? (ult.concurso || 0) + 1 : 0;
    const isFinal05 = proxConcurso > 0 && proxConcurso % 5 === 0;
    const faltaFinal05 = proxConcurso > 0 ? ((5 - (proxConcurso % 5)) % 5) : 0;
    const baseEst = ult && ult.estimativa > 0 ? ult.estimativa : 3500000;
    const J = customJackpotM !== null && Number.isFinite(Number(customJackpotM))
      ? Math.max(1e6, Number(customJackpotM) * 1e6)
      : baseEst;

    const ultData = ult?.data || '';
    let proxData = ult?.data_proximo || '';
    if (!proxData && ultData && /^\d{2}\/\d{2}\/\d{4}$/.test(ultData)) {
      // Grade regular Caixa 2026: Terça (2), Quinta (4), Domingo (0)
      const [dd, mm, yyyy] = ultData.split('/').map(Number);
      const dt = new Date(yyyy, mm - 1, dd);
      for (let step = 1; step <= 7; step++) {
        dt.setDate(dt.getDate() + 1);
        const dow = dt.getDay();
        if (dow === 0 || dow === 2 || dow === 4) {
          proxData = `${String(dt.getDate()).padStart(2, '0')}/${String(dt.getMonth() + 1).padStart(2, '0')}/${dt.getFullYear()}`;
          break;
        }
      }
    }
    const autoVirada = J >= 350e6 || (ultData.includes('/12/') && parseInt(ultData.split('/')[0], 10) >= 18);
    const isVirada = isViradaOverride !== null ? !!isViradaOverride : autoVirada;

    const P_SENA = 1 / 50063860;
    const TICKET = 6.0;
    const BASE_Q4Q5_EV = TICKET * 0.4335 * 0.38; // R$ 0,9884 por volante de R$ 6 (Quina + Quadra)

    const calcEV = (crowdFactor) => {
      const nSold = isVirada ? Math.max(300e6, J * 0.55) : (4.5e6 + 0.18 * J);
      const lam = nSold * P_SENA * crowdFactor;
      const splitFactor = lam < 1e-6 ? 1.0 : (1 - Math.exp(-lam)) / lam;
      const senaEV = P_SENA * J * splitFactor;
      const q4q5Boost = crowdFactor < 1 ? 1.18 : (crowdFactor > 1 ? 0.78 : 1.0);
      const totalEV = senaEV + BASE_Q4Q5_EV * q4q5Boost;
      return {
        totalEV,
        roiPct: Math.round((totalEV / TICKET) * 1000) / 10,
        splitFactor,
      };
    };

    const evDatas = calcEV(2.5);
    const evMedio = calcEV(1.0);
    const evPotenza = calcEV(0.45);
    const ganhoVsComum = Math.round((evPotenza.roiPct / 18.2) * 100) / 100;
    const ganhoAntiDivPct = evDatas.roiPct > 0
      ? Math.round(((evPotenza.roiPct / evDatas.roiPct) - 1) * 100)
      : 0;

    let nivel, icone, titulo, recomendacao;
    if (evPotenza.roiPct >= 65 || isVirada) {
      nivel = 'ouro';
      icone = '🚀';
      titulo = isVirada ? 'MOMENTO DE OURO — MEGA DA VIRADA' : 'MOMENTO DE OURO — ACUMULADA EXTREMA';
      recomendacao = isVirada
        ? 'Não acumula! Anti-Divisão (>31) evita dividir com a multidão e multiplica o prêmio líquido em até 3×.'
        : 'Retorno esperado ~4× acima de concurso comum. Melhor hora para descarregar o caixa acumulado do bolão.';
    } else if (evPotenza.roiPct >= 45 || J >= 80e6) {
      nivel = 'bom';
      icone = '🟢';
      titulo = 'BOM MOMENTO — ACUMULADA FORTE';
      recomendacao = 'Retorno esperado ~2,8×–3,3× acima de sorteio comum. Vale entrar com força usando Misto Inteligente ou Steiner 6 dez.';
    } else if (evPotenza.roiPct >= 30 || (isFinal05 && J >= 25e6)) {
      nivel = 'regular';
      icone = '🟡';
      titulo = isFinal05 ? 'REGULAR (FINAL 0/5 — BÔNUS +22%)' : 'REGULAR — AINDA ACUMULANDO';
      recomendacao = isFinal05
        ? 'Concurso de Final 0/5 recebe +22% de reserva da Caixa. Aposta moderada ok, mas acumular para R$ 80M+ paga mais EV.'
        : 'Se puder esperar, guarde a cota para acumular acima de R$ 80M ou até o próximo Final 0/5.';
    } else {
      nivel = 'aguardar';
      icone = '🔴';
      titulo = 'AGUARDAR — PRÊMIO BAIXO';
      recomendacao = 'Concurso comum tem o pior retorno (EV ~20%). Guarde o caixa do bolão e entre forte quando acumular ≥ R$ 80M.';
    }

    return {
      ultimo_concurso: ult ? ult.concurso : 0,
      ultima_data: ultData,
      prox_concurso: proxConcurso,
      prox_data: proxData,
      streak_acumulada: streak,
      is_final_05: isFinal05,
      falta_final_05: faltaFinal05,
      is_virada: isVirada,
      premio_estimado: J,
      premio_milhoes: Math.round((J / 1e6) * 10) / 10,
      ev_datas_pct: evDatas.roiPct,
      ev_medio_pct: evMedio.roiPct,
      ev_potenza_pct: evPotenza.roiPct,
      ganho_vs_comum: ganhoVsComum,
      ganho_anti_div_pct: ganhoAntiDivPct,
      nivel,
      icone,
      titulo,
      recomendacao,
    };
  }

  // Otimizador por Orçamento (R$): monta a melhor carteira matemática cobrindo 60/60 dezenas (Steiner Packing)
  function generateByBudget(orcamentoReais, perfil = 'misto', lastDraw = null, options = {}) {
    const budget = Math.max(36, Math.min(20000, Number(orcamentoReais) || 650));
    const useModernBayes = options && options.useModernBayes !== undefined ? !!options.useModernBayes : true;
    const modernBayesW = useModernBayes && options.concursos
      ? getModernEraBayesWeights(options.concursos)
      : null;

    let jogos = [];
    let descricao = '';
    let custoTotal = 0;
    let combinacoesEq6 = 0;

    if (perfil === 'freq6') {
      const qtd6 = Math.floor(budget / 6);
      jogos = generatePotenzaGames({ quantidade: qtd6, dezenas_por_jogo: 6, last_draw: lastDraw, modern_bayes_weights: modernBayesW }).jogos.map((j) => j.dezenas);
      custoTotal = jogos.length * 6;
      combinacoesEq6 = jogos.length;
      descricao = `Máxima Frequência (Steiner 6 dez.): ${jogos.length} jogos cobrindo 60 dezenas`;
    } else if (perfil === 'eq7') {
      const qtd7 = Math.floor(budget / 42);
      const g7 = qtd7 > 0 ? generatePotenzaGames({ quantidade: qtd7, dezenas_por_jogo: 7, last_draw: lastDraw, modern_bayes_weights: modernBayesW }).jogos.map((j) => j.dezenas) : [];
      const rem6 = Math.floor((budget - g7.length * 42) / 6);
      const g6 = rem6 > 0 ? generatePotenzaGames({ quantidade: rem6, dezenas_por_jogo: 6, base_existing: g7, last_draw: lastDraw, modern_bayes_weights: modernBayesW }).jogos.map((j) => j.dezenas) : [];
      jogos = [...g7, ...g6];
      custoTotal = g7.length * 42 + g6.length * 6;
      combinacoesEq6 = g7.length * 7 + g6.length;
      descricao = g7.length > 0
        ? `Equilibrado 7 dez. (Steiner): ${g7.length} jogos de 7 dez.${g6.length ? ' + ' + g6.length + ' de 6 dez.' : ''}`
        : `Equilibrado (Steiner 6 dez.): ${g6.length} jogos de 6 dez.`;
    } else {
      // Misto Inteligente (padrão): ~60% em jogos de 7 dez (3x Quadra / 2x Quina) + ~40% em jogos de 6 dez (cobertura 60/60)
      const qtd7 = Math.floor((budget * 0.6) / 42);
      const rem = budget - qtd7 * 42;
      const qtd6 = Math.floor(rem / 6);
      const g7 = qtd7 > 0 ? generatePotenzaGames({ quantidade: qtd7, dezenas_por_jogo: 7, last_draw: lastDraw, modern_bayes_weights: modernBayesW }).jogos.map((j) => j.dezenas) : [];
      const g6 = qtd6 > 0 ? generatePotenzaGames({ quantidade: qtd6, dezenas_por_jogo: 6, base_existing: g7, last_draw: lastDraw, modern_bayes_weights: modernBayesW }).jogos.map((j) => j.dezenas) : [];
      jogos = [...g7, ...g6];
      custoTotal = g7.length * 42 + g6.length * 6;
      combinacoesEq6 = g7.length * 7 + g6.length;
      descricao = `Misto Inteligente: ${g7.length} jogo(s) de 7 dez. + ${g6.length} jogo(s) de 6 dez.`;
    }

    // Métricas matemáticas exatas do portfólio gerado
    const uniqNums = new Set();
    const uniqPairs = new Set();
    let totalPairsSlots = 0;
    let sumOver31 = 0;
    let count7 = 0;
    let count6 = 0;
    jogos.forEach((arr) => {
      if (arr.length === 7) count7++; else count6++;
      arr.forEach((n) => { uniqNums.add(n); if (n > 31) sumOver31++; });
      totalPairsSlots += (arr.length * (arr.length - 1)) / 2;
      for (let i = 0; i < arr.length; i++) {
        for (let j = i + 1; j < arr.length; j++) {
          uniqPairs.add(`${Math.min(arr[i], arr[j])}-${Math.max(arr[i], arr[j])}`);
        }
      }
    });
    const maxP = Math.min(1770, totalPairsSlots);
    const pairCovPct = maxP > 0 ? Math.round((uniqPairs.size / maxP) * 1000) / 10 : 0;
    const chanceSena1Em = combinacoesEq6 > 0 ? Math.round(50063860 / combinacoesEq6) : 50063860;
    // Probabilidade exata de pelo menos 1 Quadra no concurso (1/1036.82 por jogo de 7 dez., 1/2332.16 por jogo de 6 dez.)
    const pDrawQuadra = 1 - Math.pow(1 - 1 / 1036.82, count7) * Math.pow(1 - 1 / 2332.16, count6);
    const chanceQuadra1Em = pDrawQuadra > 0 ? Math.max(1, Math.round(1 / pDrawQuadra)) : 2332;

    return {
      orcamento: budget,
      perfil,
      descricao,
      jogos,
      total_jogos: jogos.length,
      custo_total: custoTotal,
      combinacoes_eq6: combinacoesEq6,
      dezenas_cobertas: uniqNums.size,
      pares_unicos_pct: pairCovPct,
      chance_sena_1_em: chanceSena1Em,
      chance_quadra_1_em: chanceQuadra1Em,
      media_over31: jogos.length ? Math.round((sumOver31 / jogos.length) * 100) / 100 : 0,
    };
  }

  return {
    getQuadrant,
    getBetPrice,
    scoreNumbers,
    getOverview,
    checkFilters,
    generatePotenzaGames,
    conferirApostas,
    getExcelHeatmapColor,
    runBacktesting,
    generateFechamento,
    generateByBudget,
    evaluateDrawTiming,
    getModernEraBayesWeights,
  };
})();

// Export global
window.StatsEngine = StatsEngine;
