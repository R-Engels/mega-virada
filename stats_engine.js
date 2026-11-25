// -*- coding: utf-8 -*-
/**
 * Mega-Sena Potenza — V. 2.29 (Nuvem 24h Padrão)
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

  // Checagem de filtros para regras recomendadas
  function checkFilters(cand, lastDraw = null, rules = {}) {
    const s = cand.reduce((a, b) => a + b, 0);
    const sumMin = rules.sum_min || 130;
    const sumMax = rules.sum_max || 240;
    if (s < sumMin || s > sumMax) return false;

    const pares = cand.filter((n) => n % 2 === 0).length;
    const paresMin = rules.pares_min || 2;
    const paresMax = rules.pares_max || 4;
    if (pares < paresMin || pares > paresMax) return false;

    // Máximo por quadrante
    const qCounts = { 1: 0, 2: 0, 3: 0, 4: 0 };
    cand.forEach((n) => qCounts[getQuadrant(n)]++);
    const maxQ = rules.max_per_quadrant || 3;
    if (Object.values(qCounts).some((v) => v > maxQ)) return false;

    // Consecutivos máximos
    let maxCons = 1;
    let currCons = 1;
    for (let i = 1; i < cand.length; i++) {
      if (cand[i] === cand[i - 1] + 1) {
        currCons++;
        if (currCons > maxCons) maxCons = currCons;
      } else {
        currCons = 1;
      }
    }
    const maxAllowedCons = rules.max_consecutive || 2;
    if (maxCons > maxAllowedCons) return false;

    // Repetições do concurso anterior
    if (lastDraw && rules.max_repeat_last !== undefined) {
      const lastSet = new Set(lastDraw.dezenas || lastDraw);
      const rep = cand.filter((n) => lastSet.has(n)).length;
      if (rep > rules.max_repeat_last) return false;
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
    const rules = params.rules || {
      apply_filters: true,
      sum_min: 130,
      sum_max: 240,
      pares_min: 2,
      pares_max: 4,
      max_per_quadrant: 3,
      max_consecutive: 2,
      max_repeat_last: 2,
    };

    const fixed = Array.from(new Set(fixedNums.filter((n) => n >= 1 && n <= 60))).sort((a, b) => a - b);
    if (fixed.length > dezenasPorJogo) {
      throw new Error(`Números fixos (${fixed.length}) superam o limite de ${dezenasPorJogo} por aposta.`);
    }

    const seenSignatures = new Set(
      baseExisting.map((a) => {
        const sorted = [...(a.dezenas || a)].sort((x, y) => x - y);
        return sorted.map((n) => String(n).padStart(2, '0')).join('-');
      })
    );

    const numFreq = new Array(61).fill(0);
    const pairFreq = new Map();

    baseExisting.forEach((a) => {
      const arr = a.dezenas || a;
      arr.forEach((n) => numFreq[n]++);
      for (let i = 0; i < arr.length; i++) {
        for (let j = i + 1; j < arr.length; j++) {
          const x = Math.min(arr[i], arr[j]);
          const y = Math.max(arr[i], arr[j]);
          const k = `${x}-${y}`;
          pairFreq.set(k, (pairFreq.get(k) || 0) + 1);
        }
      }
    });

    const fixedSet = new Set(fixed);
    const poolNums = Array.from({ length: 60 }, (_, i) => i + 1).filter(
      (n) => !fixedSet.has(n) && !excludeNums.has(n)
    );

    const need = dezenasPorJogo - fixed.length;
    if (poolNums.length < need) {
      throw new Error('Quantidade insuficiente de dezenas disponíveis para sortear a aposta.');
    }

    const generated = [];
    let relaxed = false;

    for (let q = 0; q < quantidade; q++) {
      const weights = poolNums.map((n) => {
        const f = numFreq[n];
        const antiCrowd = n > 31 ? 1.25 : 1.0;
        return (1.0 / Math.pow(1 + f, 2.2)) * antiCrowd;
      });

      let bestCandidate = null;
      let bestGain = -1.0;
      let bestMeta = [0, 0];

      for (let attempt = 0; attempt < 300; attempt++) {
        const pick = weightedSample(poolNums, weights, need);
        const cand = [...fixed, ...pick].sort((a, b) => a - b);
        const sig = cand.map((n) => String(n).padStart(2, '0')).join('-');

        if (seenSignatures.has(sig)) continue;
        if (rules.apply_filters && attempt < 220 && !checkFilters(cand, lastDraw, rules)) {
          continue;
        }
        if (attempt >= 220 && bestCandidate === null) {
          relaxed = true;
        }

        const zerosHit = cand.filter((n) => numFreq[n] === 0).length;
        let newPairs = 0;
        for (let i = 0; i < cand.length; i++) {
          for (let j = i + 1; j < cand.length; j++) {
            const pairKey = `${cand[i]}-${cand[j]}`;
            if (!pairFreq.has(pairKey)) newPairs++;
          }
        }
        const antiCrowd = cand.filter((n) => n > 31).length;
        const gain =
          zerosHit * 10.0 +
          cand.reduce((acc, n) => acc + 3.0 / (1 + numFreq[n]), 0) +
          newPairs * 1.5 +
          antiCrowd * 0.5;

        if (gain > bestGain) {
          bestGain = gain;
          bestCandidate = cand;
          bestMeta = [zerosHit, newPairs];
        }

        if (attempt >= 50 && bestCandidate !== null) {
          break;
        }
      }

      if (!bestCandidate) {
        break;
      }

      const chosenSig = bestCandidate.map((n) => String(n).padStart(2, '0')).join('-');
      seenSignatures.add(chosenSig);

      bestCandidate.forEach((n) => numFreq[n]++);
      for (let i = 0; i < bestCandidate.length; i++) {
        for (let j = i + 1; j < bestCandidate.length; j++) {
          const pairKey = `${bestCandidate[i]}-${bestCandidate[j]}`;
          pairFreq.set(pairKey, (pairFreq.get(pairKey) || 0) + 1);
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

      resultado.detalhes.push({
        aposta_id: aposta.id,
        participante_id: aposta.participante_id,
        participante_nome: aposta.participante_nome || '',
        dezenas: arr,
        acertos: acertos,
        qtd_acertos: qtd,
        faixa: faixa,
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

    // Ordena mais recentes primeiro em cada faixa
    senasList.sort((a, b) => b.concurso - a.concurso);
    quinasList.sort((a, b) => b.concurso - a.concurso);
    quadrasList.sort((a, b) => b.concurso - a.concurso);

    const topHits = [...senasList, ...quinasList, ...quadrasList.slice(0, 30)];

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

  // Fechamentos Matemáticos (Covering Design C(v, k, t, m=6))
  // Suporta jogos de 6, 7 ou 8 dezenas por jogo (k = 6, 7, 8) com garantia de Quadra (4) ou Quina (5)
  function generateFechamento(selectedNums, k = 6, garantia = 4, basePrice6 = 6.0) {
    const nums = Array.from(
      new Set((selectedNums || []).map((n) => parseInt(n, 10)).filter((n) => n >= 1 && n <= 60))
    ).sort((a, b) => a - b);

    const v = nums.length;
    const betSize = Math.max(6, Math.min(8, parseInt(k, 10) || 6));
    const targetHit = Math.max(4, Math.min(5, parseInt(garantia, 10) || 4));
    const condicao = 6;

    if (v <= betSize) {
      throw new Error(`Selecione pelo menos ${betSize + 1} dezenas para fechar jogos de ${betSize} números.`);
    }
    if (v > 20) {
      throw new Error('Selecione no máximo 20 dezenas para o fechamento matemático.');
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
    const useExactCandidates = combTotal <= 2500;
    const allCandidates = useExactCandidates ? genBitmasks(v, betSize) : null;

    let uncovered = targets.slice();
    const chosenMasks = [];
    const chosenSet = new Set();
    const maxGames = 180;

    // Helper para expandir uma máscara de 6 bits para betSize bits (para k=7 ou k=8)
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
        idx = (idx + 7) % v;
      }
      return m;
    };

    let iter = 0;
    while (uncovered.length > 0 && chosenMasks.length < maxGames) {
      iter++;
      let candidates;
      if (useExactCandidates) {
        candidates = allCandidates;
      } else {
        // Pool inteligente de candidatos focados nos alvos ainda descobertos
        const candSet = new Set();
        const sampleLimit = Math.min(uncovered.length, 160);
        const step = Math.max(1, Math.floor(uncovered.length / sampleLimit));
        for (let i = 0; i < uncovered.length && candSet.size < 320; i += step) {
          const tMask = uncovered[i];
          if (betSize === 6) {
            candSet.add(tMask);
          } else {
            candSet.add(expandMask(tMask, i + iter * 3));
            candSet.add(expandMask(tMask, i + iter * 11 + 5));
          }
        }
        // Adiciona variações aleatórias controladas
        let seed = iter * 2654435761 + uncovered.length;
        const rand = () => {
          seed = (seed * 1664525 + 1013904223) >>> 0;
          return seed / 4294967296;
        };
        while (candSet.size < 420) {
          let m = 0;
          let b = 0;
          while (b < betSize) {
            const bit = 1 << Math.floor(rand() * v);
            if (!(m & bit)) {
              m |= bit;
              b++;
            }
          }
          candSet.add(m);
        }
        candidates = Array.from(candSet);
      }

      let bestMask = -1;
      let bestCov = -1;

      for (let c = 0; c < candidates.length; c++) {
        const cm = candidates[c];
        if (chosenSet.has(cm)) continue;
        let cov = 0;
        for (let u = 0; u < uncovered.length; u++) {
          if (popcount32(cm & uncovered[u]) >= targetHit) cov++;
        }
        if (cov > bestCov) {
          bestCov = cov;
          bestMask = cm;
          if (cov === uncovered.length) break;
        }
      }

      if (bestMask === -1 || bestCov <= 0) break;
      chosenMasks.push(bestMask);
      chosenSet.add(bestMask);
      uncovered = uncovered.filter((u) => popcount32(bestMask & u) < targetHit);
    }

    // Converte máscaras para dezenas ordenadas
    const jogos = chosenMasks.map((mask) => {
      const arr = [];
      for (let i = 0; i < v; i++) {
        if (mask & (1 << i)) arr.push(nums[i]);
      }
      return arr;
    });

    const coveredCount = targets.length - uncovered.length;
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
  };
})();

// Export global
window.StatsEngine = StatsEngine;
