// -*- coding: utf-8 -*-
/**
 * Mega-Sena Potenza — V. 2.41 (Nuvem 24h Padrão)
 * Aplicação Principal 100% Client-Side (GitHub Pages + Firebase Realtime)
 */

const state = {
  concursos: [],
  boloes: [],
  nomesCatalogo: [],
  currentBolaoId: null,
  bolaoPickerSelected: new Set(),
  fechamentoSelected: new Set(),
  fechamentoResult: null,
  printerProfiles: [],
  currentProfile: null,
  slipsPayload: null,
  confResultado: null,
  currentConcursoIndex: null,
};

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

function toast(msg, isError = false) {
  const el = $('#toast');
  if (!el) return;
  el.textContent = msg;
  el.style.borderColor = isError ? 'var(--danger)' : 'var(--accent)';
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), 3600);
}

function ballsHtml(nums, hitsSet = null) {
  return `<span class="balls">${nums
    .map((n) => {
      const cls = hitsSet ? (hitsSet.has(n) ? 'ball hit' : 'ball dim') : 'ball';
      return `<span class="${cls}">${String(n).padStart(2, '0')}</span>`;
    })
    .join('')}</span>`;
}

// ===== PERSISTÊNCIA & SINCRONIZAÇÃO =====

function getCurrentBolao() {
  return state.boloes.find((b) => b.id === state.currentBolaoId) || state.boloes[0] || null;
}

function persistAndBroadcast() {
  const payload = {
    boloes: state.boloes,
    nomes_catalogo: state.nomesCatalogo,
    current_bolao_id: state.currentBolaoId,
    printer_profiles: state.printerProfiles,
    updated_at: new Date().toISOString(),
  };
  return FirebaseSync.saveState(payload);
}

function onRemoteDataChanged(data) {
  if (!data) return;
  if (data.boloes && Array.isArray(data.boloes)) {
    state.boloes = data.boloes;
  }
  if (data.nomes_catalogo && Array.isArray(data.nomes_catalogo)) {
    state.nomesCatalogo = data.nomes_catalogo;
  }
  if (data.current_bolao_id && state.boloes.some((b) => b.id === data.current_bolao_id)) {
    state.currentBolaoId = data.current_bolao_id;
  }
  renderAll();
}

// ===== GESTÃO DE PARTICIPANTES & COTAS =====

function getSelectedParticipantName() {
  const selVal = ($('#aposta-part-select')?.value || '').trim();
  const manual = ($('#aposta-novo-nome')?.value || '').trim();
  if (manual) return manual.toUpperCase();
  if (selVal && selVal !== '__NEW__') return selVal.toUpperCase();
  return null;
}

function getParticipantStats(name) {
  const b = getCurrentBolao();
  if (!b || !name) return null;
  const cleanName = name.trim().toUpperCase();
  const p = (b.participantes || []).find((x) => x.nome.toUpperCase() === cleanName);
  const cotas = p ? Math.max(1, parseInt(p.cotas, 10) || 1) : 1;
  const jogosPorCota = Math.max(1, parseInt(b.jogos_por_cota, 10) || 4);
  const maxJogos = cotas * jogosPorCota;

  const jogos = (b.apostas || []).filter(
    (a) => (a.participante_nome || '').trim().toUpperCase() === cleanName
  );
  const totalJogos = jogos.length;
  const restantes = Math.max(0, maxJogos - totalJogos);
  const proximoJogoIndex = totalJogos + 1;
  const isComplete = totalJogos >= maxJogos;

  return {
    participante: p,
    nome: cleanName,
    cotas,
    maxJogos,
    totalJogos,
    restantes,
    proximoJogoIndex,
    isComplete,
    jogos,
  };
}

function updateActionButtonsState(st) {
  const btnUma = $('#btn-sortear-uma');
  const btnQuota = $('#btn-sortear-quota');
  const quotaBox = $('#part-quota-box');
  const pickerBoard = $('#bolao-volante-picker');
  const btnAdd = $('#btn-add-aposta');

  const selCount = state.bolaoPickerSelected.size;

  if (!st) {
    if (quotaBox) {
      quotaBox.innerHTML = '';
      quotaBox.style.display = 'none';
    }
    if (btnUma) {
      btnUma.disabled = false;
      if (selCount > 0 && selCount < 6) {
        btnUma.textContent = `🎯 Completar no Cartão (+${6 - selCount} dezenas)`;
      } else if (selCount === 6) {
        btnUma.textContent = `🎲 Sortear 1 Jogo Novo Direto pro Bolão`;
      } else {
        btnUma.textContent = '🎲 Sortear 1 Jogo Direto pro Bolão (6 dezenas)';
      }
    }
    if (btnQuota) {
      btnQuota.textContent = '⚡ Sortear 4 Jogos Inteiros (Regra Recomendada)';
      btnQuota.disabled = false;
    }
    if (pickerBoard) pickerBoard.style.opacity = '1';
    if (btnAdd) btnAdd.disabled = false;
    return;
  }

  const pLabel = `${st.nome} (${st.cotas} cota${st.cotas > 1 ? 's' : ''})`;

  if (st.isComplete) {
    if (quotaBox) {
      quotaBox.style.display = 'block';
      quotaBox.innerHTML = `
        <span class="quota-tag complete">✅ Cota completa: ${st.totalJogos}/${st.maxJogos} jogos preenchidos</span>
        <span class="quota-tag">${pLabel}</span>
      `;
    }
    if (btnUma) {
      btnUma.textContent = '✅ Cota Completa (Limite Atingido)';
      btnUma.disabled = true;
    }
    if (btnQuota) {
      btnQuota.textContent = '✅ Todos os Jogos Sorteados';
      btnQuota.disabled = true;
    }
    if (pickerBoard) pickerBoard.style.opacity = '0.45';
    if (btnAdd) btnAdd.disabled = true;
    return;
  }

  if (pickerBoard) pickerBoard.style.opacity = '1';
  if (btnAdd) btnAdd.disabled = false;

  if (quotaBox) {
    quotaBox.style.display = 'block';
    const alertTag = st.cotas > 1 && st.restantes > 0
      ? `<span class="quota-tag alerta-incompleto">⚠️ Cota Incompleta: ${st.cotas} cotas (${st.maxJogos} jogos). Faltam ${st.restantes} jogos!</span>`
      : '';
    quotaBox.innerHTML = `
      ${alertTag}
      <span class="quota-tag active">Preenchendo Jogo <b>${st.proximoJogoIndex} de ${st.maxJogos}</b></span>
      <span class="quota-tag">Restam ${st.restantes} jogo${st.restantes > 1 ? 's' : ''}</span>
      <span class="quota-tag">${pLabel}</span>
    `;
  }

  if (btnUma) {
    btnUma.disabled = false;
    const selCount = state.bolaoPickerSelected.size;
    if (selCount > 0 && selCount < 6) {
      btnUma.textContent = `🎯 Completar no Cartão (+${6 - selCount} dezenas)`;
    } else if (selCount === 6) {
      btnUma.textContent = `🎲 Sortear 1 Jogo Novo Direto pro Bolão`;
    } else {
      btnUma.textContent = `🎲 Sortear 1 Jogo Direto pro Bolão (6 dezenas)`;
    }
  }

  if (btnQuota) {
    btnQuota.disabled = false;
    btnQuota.textContent = `⚡ Sortear ${st.restantes} Jogo${st.restantes > 1 ? 's' : ''} Direto pro Bolão (Cota Completa)`;
  }
}

// ===== TABELAS E RENDERIZAÇÃO DA UI =====

function renderBolaoSelect() {
  const sel = $('#bolao-select');
  if (!sel) return;
  sel.innerHTML = state.boloes
    .map(
      (b) =>
        `<option value="${b.id}" ${b.id === state.currentBolaoId ? 'selected' : ''}>${b.nome} (${(b.apostas || []).length} jogos)</option>`
    )
    .join('');
}

function renderBolaoRules(b) {
  if (!b) return;
  $('#bolao-cfg-dezenas').value = b.dezenas_por_jogo || 6;
  $('#bolao-cfg-jogos-cota').value = b.jogos_por_cota || 4;
  $('#bolao-cfg-valor-jogo').value = Number(b.valor_jogo || 6.0).toFixed(2);
  $('#bolao-cfg-valor-cota').value = Number(b.valor_cota || 24.0).toFixed(2);
  $('#bolao-rule-badge').textContent = `Regra ativa: ${b.dezenas_por_jogo || 6} dez. · ${b.jogos_por_cota || 4} jogos/cota`;
}

function renderKpis(b) {
  const el = $('#bolao-kpis');
  if (!el || !b) return;
  const parts = b.participantes || [];
  const apostas = b.apostas || [];
  const totalCotas = parts.reduce((acc, p) => acc + (p.cotas || 1), 0);
  const cotasPagas = parts.filter((p) => p.pago).reduce((acc, p) => acc + (p.cotas || 1), 0);
  const cotasPendentes = Math.max(0, totalCotas - cotasPagas);
  const pagos = parts.filter((p) => p.pago).length;
  const pendentes = parts.length - pagos;

  const valorCota = Number(b.valor_cota || 24.0);
  const arrecadacaoTotal = totalCotas * valorCota;
  const valorPago = cotasPagas * valorCota;
  const valorPendente = cotasPendentes * valorCota;
  const pctPago = arrecadacaoTotal > 0 ? Math.round((valorPago / arrecadacaoTotal) * 100) : 0;
  const metaJogos = totalCotas * (b.jogos_por_cota || 4);
  const totalJogos = apostas.length;
  const jogosFaltantes = Math.max(0, metaJogos - totalJogos);

  el.innerHTML = `
    <div class="kpi ${jogosFaltantes > 0 ? 'kpi-alerta' : ''}">
      <div class="label">Total de Jogos</div>
      <div class="value ${jogosFaltantes > 0 ? 'text-warn' : ''}">${totalJogos}</div>
      <div class="sub-label ${jogosFaltantes > 0 ? 'text-danger font-bold' : ''}">
        ${jogosFaltantes > 0 ? `⚠️ Faltam ${jogosFaltantes} jogos (${totalCotas} cotas)` : `Meta: ${metaJogos} jogos (${totalCotas} cotas)`}
      </div>
    </div>
    <div class="kpi">
      <div class="label">Participantes</div>
      <div class="value">${parts.length}</div>
      <div class="sub-label">${pagos} pago${pagos !== 1 ? 's' : ''} · ${pendentes} pendente${pendentes !== 1 ? 's' : ''}</div>
    </div>
    <div class="kpi">
      <div class="label">Total Pago (Recebido)</div>
      <div class="value" style="color:var(--accent)">R$ ${valorPago.toFixed(2)}</div>
      <div class="sub-label">${pctPago}% do total (R$ ${arrecadacaoTotal.toFixed(2)})</div>
    </div>
    <div class="kpi">
      <div class="label">Valor Faltante (Pendente)</div>
      <div class="value" style="color:${valorPendente > 0 ? 'var(--warn)' : 'var(--accent)'}">R$ ${valorPendente.toFixed(2)}</div>
      <div class="sub-label">${valorPendente > 0 ? `⚠️ Falta receber ${cotasPendentes} cota${cotasPendentes > 1 ? 's' : ''}` : '✅ 100% Quitado'}</div>
    </div>
  `;
}

function renderParticipantesTable(b) {
  const tbody = $('#part-tbody');
  if (!tbody || !b) return;
  const parts = (b.participantes || []).slice().reverse();
  const apostas = b.apostas || [];
  const jogosPorCota = b.jogos_por_cota || 4;

  if (parts.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" class="muted" style="text-align:center;padding:18px">Nenhum participante cadastrado.</td></tr>';
    return;
  }

  tbody.innerHTML = parts
    .map((p) => {
      const pApostas = apostas.filter((a) => (a.participante_nome || '').toUpperCase() === p.nome.toUpperCase());
      const pJogos = pApostas.length;
      const pValorReal = pApostas.reduce((acc, a) => acc + StatsEngine.getBetPrice((a.dezenas || []).length, 6.0), 0);
      const meta = (p.cotas || 1) * jogosPorCota;
      const valor = (p.cotas || 1) * (b.valor_cota || 24.0);
      const isPago = !!p.pago;
      const isMetaOk = pJogos >= meta || (pJogos > 0 && pValorReal >= valor);
      const faltam = Math.max(0, meta - pJogos);
      const rowClass = !isMetaOk ? 'row-cota-alerta' : '';

      return `
        <tr class="${rowClass}">
          <td>
            <b>${p.nome}</b>
            ${!isMetaOk ? `<span class="badge-incompleto-tag" title="Atenção: faltam ${faltam} jogo(s) para completar as ${p.cotas} cotas!">FALTAM ${faltam} JOGO(S)</span>` : ''}
          </td>
          <td style="text-align:center">
            <div class="cotas-control ${!isMetaOk ? 'alerta' : ''}" title="${!isMetaOk ? `Atenção: ${p.cotas} cota(s) exigem ${meta} jogos, mas há apenas ${pJogos} cadastrado(s)!` : ''}">
              <button class="btn-cota" onclick="alterarCotas(${p.id}, -1)">-</button>
              <span class="cota-val ${!isMetaOk ? 'cota-val-alerta' : ''}">${p.cotas || 1}</span>
              <button class="btn-cota" onclick="alterarCotas(${p.id}, 1)">+</button>
            </div>
            ${!isMetaOk ? `<div class="cota-aviso-txt">⚠️ ${p.cotas} cota${p.cotas > 1 ? 's' : ''} (${pJogos}/${meta})</div>` : ''}
          </td>
          <td style="text-align:center">
            ${isMetaOk
              ? `<span class="meta-badge completo" title="Meta preenchida: ${pJogos} de ${meta} jogos">✅ ${pJogos} / ${meta}</span>`
              : `<span class="meta-badge incompleto" title="Atenção: faltam ${faltam} jogo${faltam > 1 ? 's' : ''} para completar a meta!">⚠️ ${pJogos} / ${meta} (Falta${faltam > 1 ? 'm' : ''} ${faltam})</span>`
            }
          </td>
          <td style="text-align:center">
            <span class="btn-pago-toggle ${isPago ? 'pago' : 'pendente'}" onclick="togglePagamento(${p.id})">
              ${isPago ? 'PAGO' : 'PENDENTE'}
            </span>
          </td>
          <td style="text-align:right;font-weight:600">R$ ${valor.toFixed(2)}</td>
          <td style="text-align:center">
            <button class="btn-icon" onclick="excluirParticipante(${p.id})" title="Excluir Participante">✕</button>
          </td>
        </tr>
      `;
    })
    .join('');
}

function renderJogosTable(b) {
  const tbody = $('#jogos-tbody');
  if (!tbody || !b) return;
  const apostas = b.apostas || [];
  const filtro = ($('#filtro-jogos')?.value || '').toLowerCase();

  const filtered = apostas.filter((a) => {
    if (!filtro) return true;
    const nome = (a.participante_nome || '').toLowerCase();
    const dezenasStr = (a.dezenas || []).join(' ');
    return nome.includes(filtro) || dezenasStr.includes(filtro);
  });

  if (filtered.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" class="muted" style="text-align:center;padding:18px">Nenhum jogo encontrado.</td></tr>';
    return;
  }

  const confMap = state.confResultado ? new Map(state.confResultado.detalhes.map((d) => [d.aposta_id, d])) : null;

  tbody.innerHTML = filtered
    .map((a, idx) => {
      const conf = confMap ? confMap.get(a.id) : null;
      const hitsSet = conf ? new Set(conf.acertos) : null;

      let acertosTxt = '-';
      let rowCls = '';
      if (conf) {
        if (conf.faixa === 'SENA') {
          acertosTxt = '<span class="badge-premio sena">🎉 SENA! (6 Acertos)</span>';
          rowCls = 'tr-award-sena';
        } else if (conf.faixa === 'QUINA') {
          acertosTxt = '<span class="badge-premio quina">🥈 QUINA! (5 Acertos)</span>';
          rowCls = 'tr-award-quina';
        } else if (conf.faixa === 'QUADRA') {
          acertosTxt = '<span class="badge-premio quadra">🥉 QUADRA! (4 Acertos)</span>';
          rowCls = 'tr-award-quadra';
        } else if (conf.qtd_acertos > 0) {
          acertosTxt = `<span class="badge-acertos">🎯 ${conf.qtd_acertos} acerto${conf.qtd_acertos > 1 ? 's' : ''}</span>`;
        } else {
          acertosTxt = '<span class="muted" style="font-size:11px">0 acertos</span>';
        }
      }

      return `
        <tr class="${rowCls}">
          <td>${idx + 1}</td>
          <td><b>${a.participante_nome}</b></td>
          <td>${ballsHtml(a.dezenas, hitsSet)}</td>
          <td style="text-align:center">${acertosTxt}</td>
          <td style="text-align:center">
            <button class="btn-icon" onclick="excluirAposta(${a.id})" title="Excluir Jogo">✕</button>
          </td>
        </tr>
      `;
    })
    .join('');
}

function renderNomesDropdown() {
  const sel = $('#aposta-part-select');
  if (!sel) return;
  const currentVal = sel.value;
  const nomes = state.nomesCatalogo || [];

  let html = '<option value="">-- Selecione o Participante --</option>';
  nomes.forEach((n) => {
    html += `<option value="${n}" ${n === currentVal ? 'selected' : ''}>${n}</option>`;
  });
  html += '<option value="__NEW__">+ Digitar Novo Nome Manualmente...</option>';
  sel.innerHTML = html;
}

function renderHeatmap(b) {
  const el = $('#bolao-heatmap');
  if (!el || !b) return;

  const numFreq = new Array(61).fill(0);
  (b.apostas || []).forEach((a) => {
    (a.dezenas || []).forEach((n) => {
      if (n >= 1 && n <= 60) numFreq[n]++;
    });
  });

  const freqs = numFreq.slice(1);
  const minF = Math.min(...freqs);
  const maxF = Math.max(...freqs);

  const legendMax = $('#heatmap-max-legend');
  if (legendMax) legendMax.textContent = `Frequência Máxima (${maxF}x)`;

  const quadrants = {
    1: { title: 'Q1 (01–25)', nums: [] },
    2: { title: 'Q2 (06–30)', nums: [] },
    3: { title: 'Q3 (31–55)', nums: [] },
    4: { title: 'Q4 (36–60)', nums: [] },
  };

  for (let r = 0; r < 6; r++) {
    for (let c = 0; c < 10; c++) {
      const n = r * 10 + c + 1;
      quadrants[StatsEngine.getQuadrant(n)].nums.push(n);
    }
  }

  let html = '<div class="quadrants-board">';
  for (let q = 1; q <= 4; q++) {
    const qNums = quadrants[q].nums;
    const qTotalDezenas = qNums.reduce((acc, n) => acc + numFreq[n], 0);

    html += `
      <div class="quadrant-box q${q}">
        <div class="quadrant-head">
          <span>${quadrants[q].title}</span>
          <span class="badge" style="font-size:10px">${qTotalDezenas} marcadas</span>
        </div>
        <div class="quadrant-grid">
          ${qNums
            .map((n) => {
              const f = numFreq[n];
              const color = StatsEngine.getExcelHeatmapColor(f, minF, maxF);
              return `
                <div class="heatmap-cell" style="background:${color}" title="Dezena ${String(n).padStart(2, '0')}: saiu ${f} vezes neste bolão">
                  <span class="cell-num">${String(n).padStart(2, '0')}</span>
                  <span class="cell-freq">${f}x</span>
                </div>
              `;
            })
            .join('')}
        </div>
      </div>
    `;
  }
  html += '</div>';
  el.innerHTML = html;

  // Resumo Quadrantes & Paridade
  const qSummary = { 1: 0, 2: 0, 3: 0, 4: 0 };
  let totalPares = 0;
  let totalImpares = 0;

  (b.apostas || []).forEach((a) => {
    (a.dezenas || []).forEach((n) => {
      qSummary[StatsEngine.getQuadrant(n)]++;
      if (n % 2 === 0) totalPares++;
      else totalImpares++;
    });
  });

  const totalNums = (b.apostas || []).length * (b.dezenas_por_jogo || 6);

  $('#stats-quadrants-summary').innerHTML = `
    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:6px;font-size:12px;text-align:center">
      <div style="background:rgba(56,189,248,0.15);padding:8px;border-radius:6px;border:1px solid #38bdf8"><b>Q1 (01-25)</b><br/>${qSummary[1]} dezenas</div>
      <div style="background:rgba(52,211,153,0.15);padding:8px;border-radius:6px;border:1px solid #34d399"><b>Q2 (06-30)</b><br/>${qSummary[2]} dezenas</div>
      <div style="background:rgba(251,191,36,0.15);padding:8px;border-radius:6px;border:1px solid #fbbf24"><b>Q3 (31-55)</b><br/>${qSummary[3]} dezenas</div>
      <div style="background:rgba(248,113,113,0.15);padding:8px;border-radius:6px;border:1px solid #f87171"><b>Q4 (36-60)</b><br/>${qSummary[4]} dezenas</div>
    </div>
  `;

  $('#stats-parity-summary').innerHTML = `
    <div style="display:flex;gap:12px;font-size:13px">
      <div style="flex:1;background:var(--bg);padding:10px;border-radius:6px;border:1px solid var(--border)">
        <b>Dezenas Pares:</b> ${totalPares} (${totalNums ? Math.round((totalPares / totalNums) * 100) : 0}%)
      </div>
      <div style="flex:1;background:var(--bg);padding:10px;border-radius:6px;border:1px solid var(--border)">
        <b>Dezenas Ímpares:</b> ${totalImpares} (${totalNums ? Math.round((totalImpares / totalNums) * 100) : 0}%)
      </div>
    </div>
  `;
}

function renderAll() {
  const b = getCurrentBolao();
  renderBolaoSelect();
  renderBolaoRules(b);
  renderKpis(b);
  renderParticipantesTable(b);
  renderJogosTable(b);
  renderNomesDropdown();
  renderHeatmap(b);
  updateActionButtonsState(getParticipantStats(getSelectedParticipantName()));
  buildSlipsPreview();
}

// ===== QUADRANT PICKER =====

function initPicker() {
  const board = $('#bolao-volante-picker');
  if (!board) return;

  const quadrants = {
    1: { title: 'Q1 (01–25)', nums: [] },
    2: { title: 'Q2 (06–30)', nums: [] },
    3: { title: 'Q3 (31–55)', nums: [] },
    4: { title: 'Q4 (36–60)', nums: [] },
  };

  for (let r = 0; r < 6; r++) {
    for (let c = 0; c < 10; c++) {
      const n = r * 10 + c + 1;
      quadrants[StatsEngine.getQuadrant(n)].nums.push(n);
    }
  }

  let html = '';
  for (let q = 1; q <= 4; q++) {
    html += `
      <div class="quadrant-box q${q}">
        <div class="quadrant-head">
          <span>${quadrants[q].title}</span>
          <span id="q${q}-badge">0 sel.</span>
        </div>
        <div class="quadrant-grid">
          ${quadrants[q].nums.map((n) => `<button type="button" class="ball-pick" data-num="${n}">${String(n).padStart(2, '0')}</button>`).join('')}
        </div>
      </div>
    `;
  }
  board.innerHTML = html;

  board.addEventListener('click', (e) => {
    const btn = e.target.closest('.ball-pick');
    if (!btn) return;
    const n = parseInt(btn.dataset.num, 10);
    if (state.bolaoPickerSelected.has(n)) {
      state.bolaoPickerSelected.delete(n);
    } else {
      if (state.bolaoPickerSelected.size >= 6) {
        toast('Limite de 6 dezenas por jogo atingido.', true);
        return;
      }
      state.bolaoPickerSelected.add(n);
    }
    updatePickerUi();
  });
}

function updatePickerUi() {
  const drawnSet = state.confResultado ? new Set(state.confResultado.dezenas_sorteadas) : null;

  $$('.ball-pick').forEach((btn) => {
    const n = parseInt(btn.dataset.num, 10);
    btn.classList.toggle('selected', state.bolaoPickerSelected.has(n));
    btn.classList.toggle('draw-num', !!(drawnSet && drawnSet.has(n)));
  });

  const qCounts = { 1: 0, 2: 0, 3: 0, 4: 0 };
  state.bolaoPickerSelected.forEach((n) => qCounts[StatsEngine.getQuadrant(n)]++);
  for (let q = 1; q <= 4; q++) {
    const el = $(`#q${q}-badge`);
    if (el) el.textContent = `${qCounts[q]} sel.`;
  }

  $('#aposta-limit-badge').textContent = `Selecionadas: ${state.bolaoPickerSelected.size} / 6`;
  const sorted = Array.from(state.bolaoPickerSelected).sort((a, b) => a - b);
  $('#aposta-text').value = sorted.map((n) => String(n).padStart(2, '0')).join(' ');

  updateActionButtonsState(getParticipantStats(getSelectedParticipantName()));
}

// ===== AÇÕES DO BOLÃO =====

window.alterarCotas = function (partId, delta) {
  const b = getCurrentBolao();
  if (!b) return;
  const p = (b.participantes || []).find((x) => x.id === partId);
  if (!p) return;
  const novaCota = Math.max(1, (p.cotas || 1) + delta);
  p.cotas = novaCota;
  persistAndBroadcast();
  renderAll();
};

window.togglePagamento = function (partId) {
  const b = getCurrentBolao();
  if (!b) return;
  const p = (b.participantes || []).find((x) => x.id === partId);
  if (!p) return;
  p.pago = p.pago ? 0 : 1;
  persistAndBroadcast();
  renderAll();
  toast(`${p.nome}: status alterado para ${p.pago ? 'PAGO' : 'PENDENTE'}.`);
};

window.excluirParticipante = function (partId) {
  const b = getCurrentBolao();
  if (!b) return;
  const p = (b.participantes || []).find((x) => x.id === partId);
  if (!p) return;
  if (!confirm(`Deseja remover ${p.nome} e todas as suas apostas deste bolão?`)) return;

  b.participantes = (b.participantes || []).filter((x) => x.id !== partId);
  b.apostas = (b.apostas || []).filter((a) => (a.participante_nome || '').toUpperCase() !== p.nome.toUpperCase());
  persistAndBroadcast();
  renderAll();
  toast(`Participante ${p.nome} removido.`);
};

window.excluirAposta = function (apostaId) {
  const b = getCurrentBolao();
  if (!b) return;
  const aposta = (b.apostas || []).find((a) => a.id === apostaId);
  const partNome = aposta?.participante_nome || 'Participante';
  const dez = (aposta?.dezenas || []).map((n) => String(n).padStart(2, '0')).join(', ');
  if (!confirm(`Deseja realmente excluir este jogo de ${partNome}?\nDezenas: [ ${dez} ]`)) {
    return;
  }
  b.apostas = (b.apostas || []).filter((a) => a.id !== apostaId);

  // Recálculo automático de cotas se jogos forem reduzidos (por quantidade e por valor oficial)
  const jogosPorCota = Math.max(1, parseInt(b.jogos_por_cota, 10) || 4);
  const valorCota = Math.max(1, Number(b.valor_cota || 24.0));
  const p = (b.participantes || []).find((x) => (x.nome || '').toUpperCase() === partNome.toUpperCase());
  let msgCota = '';
  if (p && p.cotas > 1) {
    const remainingApostas = b.apostas.filter((a) => (a.participante_nome || '').toUpperCase() === partNome.toUpperCase());
    const remainingJogos = remainingApostas.length;
    const custoRestante = remainingApostas.reduce((acc, a) => acc + StatsEngine.getBetPrice((a.dezenas || []).length, 6.0), 0);
    const novasCotas = Math.max(1, Math.ceil(remainingJogos / jogosPorCota), Math.ceil(custoRestante / valorCota));
    if (novasCotas < p.cotas) {
      const antigasCotas = p.cotas;
      p.cotas = novasCotas;
      msgCota = ` Com a exclusão, restaram ${remainingJogos} jogos e a cota de ${p.nome} foi recalculada de ${antigasCotas} para ${p.cotas}.`;
    }
  }

  persistAndBroadcast();
  renderAll();
  toast(`Aposta removida.${msgCota}`);
};

// Adicionar aposta manual
function addApostaManual() {
  const b = getCurrentBolao();
  const nome = getSelectedParticipantName();
  if (!b || !nome) {
    toast('Selecione ou informe um participante.', true);
    return;
  }

  const st = getParticipantStats(nome);
  if (st.isComplete) {
    toast(`O participante ${nome} já preencheu todos os ${st.maxJogos} jogos da sua cota.`, true);
    return;
  }

  let dezenas = Array.from(state.bolaoPickerSelected);
  if (dezenas.length !== 6) {
    // Tenta ler do input text
    const txt = ($('#aposta-text')?.value || '').trim();
    const nums = txt.split(/[\s,.-]+/).map(Number).filter((n) => n >= 1 && n <= 60);
    if (nums.length === 6) {
      dezenas = Array.from(new Set(nums));
    }
  }

  if (dezenas.length !== 6) {
    toast('Selecione exatamente 6 dezenas.', true);
    return;
  }

  dezenas.sort((a, b) => a - b);
  const sig = dezenas.map((n) => String(n).padStart(2, '0')).join('-');

  // Validar duplicada no bolão
  const isDup = (b.apostas || []).some((a) => {
    const s = (a.dezenas || []).slice().sort((x, y) => x - y).map((n) => String(n).padStart(2, '0')).join('-');
    return s === sig;
  });

  if (isDup) {
    toast('Este jogo já foi registrado neste bolão. Não são permitidos jogos duplicados.', true);
    return;
  }

  // Garantir participante
  let p = (b.participantes || []).find((x) => x.nome.toUpperCase() === nome.toUpperCase());
  if (!p) {
    p = {
      id: Date.now(),
      nome: nome.toUpperCase(),
      cotas: 1,
      pago: 0,
      valor_pago: 0.0,
    };
    b.participantes = b.participantes || [];
    b.participantes.push(p);

    if (!state.nomesCatalogo.includes(p.nome)) {
      state.nomesCatalogo.push(p.nome);
      state.nomesCatalogo.sort();
    }
  }

  const novaAposta = {
    id: Date.now() + Math.floor(Math.random() * 1000),
    participante_id: p.id,
    participante_nome: p.nome,
    tipo_aposta: 6,
    dezenas: dezenas,
    origem: 'manual',
    criado_em: new Date().toISOString(),
  };

  b.apostas = b.apostas || [];
  b.apostas.push(novaAposta);

  state.bolaoPickerSelected.clear();
  updatePickerUi();
  persistAndBroadcast();
  renderAll();
  toast(`Aposta registrada para ${p.nome}!`);
}

// Sortear 1 aposta (ou completar)
function sortearUmaAposta() {
  const b = getCurrentBolao();
  const nome = getSelectedParticipantName();
  if (!b || !nome) {
    toast('Selecione um participante antes de sortear.', true);
    return;
  }

  const st = getParticipantStats(nome);
  if (st.isComplete) {
    toast(`O participante ${nome} já preencheu todos os ${st.maxJogos} jogos da sua cota.`, true);
    return;
  }

  const fixed = Array.from(state.bolaoPickerSelected);
  const modernW = StatsEngine.getModernEraBayesWeights(state.concursos || [], 1.5);

  // Se tiver de 1 a 5 dezenas marcadas no cartão: apenas completa no cartão para revisão do usuário
  if (fixed.length > 0 && fixed.length < 6) {
    const gen = StatsEngine.generatePotenzaGames({
      quantidade: 1,
      dezenas_por_jogo: 6,
      base_existing: b.apostas || [],
      fixed_nums: fixed,
      modern_bayes_weights: modernW,
    });

    if (!gen || !gen.jogos.length) {
      toast('Não foi possível completar a aposta com os filtros atuais.', true);
      return;
    }

    const sorteada = gen.jogos[0].dezenas;
    state.bolaoPickerSelected = new Set(sorteada);
    updatePickerUi();
    toast('Aposta completada no cartão! Revise as dezenas e clique em "Salvar Aposta" para enviar ao bolão.');
    return;
  }

  // Se tiver 0 ou 6 dezenas marcadas: sorteia jogo novo diretamente pro bolão
  const gen = StatsEngine.generatePotenzaGames({
    quantidade: 1,
    dezenas_por_jogo: 6,
    base_existing: b.apostas || [],
    fixed_nums: [],
    modern_bayes_weights: modernW,
  });

  if (!gen || !gen.jogos.length) {
    toast('Não foi possível gerar aposta com os filtros atuais.', true);
    return;
  }

  const sorteada = gen.jogos[0].dezenas;

  // Registrar aposta diretamente
  let p = (b.participantes || []).find((x) => x.nome.toUpperCase() === nome.toUpperCase());
  if (!p) {
    p = { id: Date.now(), nome: nome.toUpperCase(), cotas: 1, pago: 0 };
    b.participantes = b.participantes || [];
    b.participantes.push(p);
    if (!state.nomesCatalogo.includes(p.nome)) {
      state.nomesCatalogo.push(p.nome);
      state.nomesCatalogo.sort();
    }
  }

  const novaAposta = {
    id: Date.now() + Math.floor(Math.random() * 1000),
    participante_id: p.id,
    participante_nome: p.nome,
    tipo_aposta: 6,
    dezenas: sorteada,
    origem: 'sorteio_regra',
    criado_em: new Date().toISOString(),
  };

  b.apostas = b.apostas || [];
  b.apostas.push(novaAposta);

  state.bolaoPickerSelected.clear();
  updatePickerUi();
  persistAndBroadcast();
  renderAll();
  toast(`Jogo ${st.proximoJogoIndex}/${st.maxJogos} sorteado e salvo direto no bolão para ${p.nome}!`);
}

// Sortear cota inteira
function sortearCotaInteira() {
  const b = getCurrentBolao();
  const nome = getSelectedParticipantName();
  if (!b || !nome) {
    toast('Selecione um participante antes de sortear.', true);
    return;
  }

  const st = getParticipantStats(nome);
  if (st.isComplete) {
    toast(`O participante ${nome} já preencheu todos os ${st.maxJogos} jogos.`, true);
    return;
  }

  const qtd = st.restantes;
  const gen = StatsEngine.generatePotenzaGames({
    quantidade: qtd,
    dezenas_por_jogo: 6,
    base_existing: b.apostas || [],
    modern_bayes_weights: StatsEngine.getModernEraBayesWeights(state.concursos || [], 1.5),
  });

  if (!gen || gen.jogos.length < qtd) {
    toast('Erro ao gerar os jogos da cota.', true);
    return;
  }

  let p = (b.participantes || []).find((x) => x.nome.toUpperCase() === nome.toUpperCase());
  if (!p) {
    p = { id: Date.now(), nome: nome.toUpperCase(), cotas: 1, pago: 0 };
    b.participantes = b.participantes || [];
    b.participantes.push(p);
    if (!state.nomesCatalogo.includes(p.nome)) {
      state.nomesCatalogo.push(p.nome);
      state.nomesCatalogo.sort();
    }
  }

  b.apostas = b.apostas || [];
  gen.jogos.forEach((j, i) => {
    b.apostas.push({
      id: Date.now() + i * 10 + Math.floor(Math.random() * 10),
      participante_id: p.id,
      participante_nome: p.nome,
      tipo_aposta: 6,
      dezenas: j.dezenas,
      origem: 'sorteio_cota_regra',
      criado_em: new Date().toISOString(),
    });
  });

  state.bolaoPickerSelected.clear();
  updatePickerUi();
  persistAndBroadcast();
  renderAll();
  toast(`${qtd} jogos sorteados e salvos para ${p.nome}! Cota completa.`);
}

// ===== IMPRESSÃO ÓPTICA =====

function buildSlipsPreview() {
  const b = getCurrentBolao();
  const el = $('#slips-preview');
  if (!el || !b) return;

  const apostas = b.apostas || [];
  if (apostas.length === 0) {
    el.innerHTML = '<p class="muted" style="padding:20px;text-align:center">Nenhuma aposta cadastrada para gerar volantes.</p>';
    return;
  }

  const partMap = {};
  (b.participantes || []).forEach(p => { partMap[p.id] = p.nome; });

  const teimosinha = $('#print-teimosinha')?.checked;
  const payload = PrinterService.buildSlipsPayload(apostas, {
    teimosinha,
    participantesMap: partMap,
    concurso: b.concurso,
  });
  state.slipsPayload = payload;

  let html = '';
  payload.slips.forEach((s) => {
    html += `
      <div class="slip-preview-card">
        <div class="slip-preview-header">
          <span>Volante #${s.slip_index} de ${payload.total_slips}</span>
          <span class="slip-preview-meta">${s.total_jogos} jogo${s.total_jogos > 1 ? 's' : ''}</span>
        </div>
        ${PrinterService.renderSlipSvg(s, payload.profile, { showOutline: true, isPreview: true })}
      </div>
    `;
  });
  el.innerHTML = html;
}

function loadCalibrationInputs() {
  const p = PrinterService.getProfile();
  const setVal = (id, v) => { const el = $(id); if (el) el.value = v; };
  setVal('#cal-offset-x', p.offset_x_mm);
  setVal('#cal-offset-y', p.offset_y_mm);
  setVal('#cal-col-step', p.col_step_mm);
  setVal('#cal-row-step', p.row_step_mm);
  setVal('#cal-mark-w', p.mark_w_mm);
  setVal('#cal-mark-h', p.mark_h_mm);
  setVal('#cal-g2', p.game_offsets?.[1] ?? 48.0);
  setVal('#cal-g3', p.game_offsets?.[2] ?? 96.0);
  setVal('#cal-qty-y', p.qty_offset_y_mm);
  setVal('#cal-qty-x', p.qty_start_x_mm);
  setVal('#cal-qty-step', p.qty_step_x_mm);
  setVal('#cal-size', `${p.volante_w_mm}x${p.volante_h_mm}`);
}

function saveCalibrationInputs() {
  const p = PrinterService.getProfile();
  const numVal = (id, fallback) => {
    const v = parseFloat($(id)?.value);
    return Number.isFinite(v) ? v : fallback;
  };
  p.offset_x_mm = numVal('#cal-offset-x', p.offset_x_mm);
  p.offset_y_mm = numVal('#cal-offset-y', p.offset_y_mm);
  p.col_step_mm = numVal('#cal-col-step', p.col_step_mm);
  p.row_step_mm = numVal('#cal-row-step', p.row_step_mm);
  p.mark_w_mm = numVal('#cal-mark-w', p.mark_w_mm);
  p.mark_h_mm = numVal('#cal-mark-h', p.mark_h_mm);
  p.game_offsets = [0, numVal('#cal-g2', 48.0), numVal('#cal-g3', 96.0)];
  p.qty_offset_y_mm = numVal('#cal-qty-y', p.qty_offset_y_mm);
  p.qty_start_x_mm = numVal('#cal-qty-x', p.qty_start_x_mm);
  p.qty_step_x_mm = numVal('#cal-qty-step', p.qty_step_x_mm);

  const sizeRaw = ($('#cal-size')?.value || '').toLowerCase().split('x');
  if (sizeRaw.length === 2) {
    const w = parseFloat(sizeRaw[0]);
    const h = parseFloat(sizeRaw[1]);
    if (w > 40 && h > 80) {
      p.volante_w_mm = w;
      p.volante_h_mm = h;
    }
  }
  PrinterService.saveProfile(p);
  buildSlipsPreview();
  toast('Calibração milimétrica salva.');
}

function resetCalibrationInputs() {
  PrinterService.resetProfile();
  loadCalibrationInputs();
  buildSlipsPreview();
  toast('Calibração restaurada para o padrão oficial Caixa (83×185mm).');
}

function executeCleanPrint(orientation, htmlContent) {
  const printArea = $('#print-area');
  if (!printArea) return;

  setPrintOrientation(orientation);
  printArea.innerHTML = htmlContent;

  const hideNodes = Array.from(document.querySelectorAll('header.topbar, .topbar, main.container, #toast, .modal-overlay'));
  const prevStyles = hideNodes.map((el) => el.getAttribute('style'));
  hideNodes.forEach((el) => el.style.setProperty('display', 'none', 'important'));

  let restored = false;
  const restoreUi = () => {
    if (restored) return;
    restored = true;
    hideNodes.forEach((el, i) => {
      if (prevStyles[i] === null) el.removeAttribute('style');
      else el.setAttribute('style', prevStyles[i]);
    });
    window.removeEventListener('afterprint', restoreUi);
  };

  window.addEventListener('afterprint', restoreUi);
  window.print();
  setTimeout(restoreUi, 300);
}

function printAlignmentTest() {
  const payload = PrinterService.buildAlignmentTestPayload(PrinterService.getProfile());
  executeCleanPrint('landscape', PrinterService.renderPrintArea(payload));
}

function setPrintOrientation(mode) {
  let styleEl = document.getElementById('print-orientation-style');
  if (!styleEl) {
    styleEl = document.createElement('style');
    styleEl.id = 'print-orientation-style';
    document.head.appendChild(styleEl);
  }
  if (mode === 'landscape') {
    styleEl.textContent = `@page { size: A4 landscape; margin: 0; }`;
  } else {
    styleEl.textContent = `@page { size: A4 portrait; margin: 6mm; }`;
  }
}

function printSlips() {
  const b = getCurrentBolao();
  if (b) {
    const totalCotas = (b.participantes || []).reduce((acc, p) => acc + (p.cotas || 1), 0);
    const metaJogos = totalCotas * (b.jogos_por_cota || 4);
    const totalJogos = (b.apostas || []).length;
    if (totalJogos < metaJogos) {
      const faltam = metaJogos - totalJogos;
      if (!confirm(`⚠️ ATENÇÃO: O bolão possui ${totalCotas} cotas (${metaJogos} jogos esperados), mas apenas ${totalJogos} jogos foram registrados (faltam ${faltam} jogos).\n\nSe imprimir agora, faltarão volantes ou a marcação ficará incompleta.\n\nDeseja imprimir os volantes assim mesmo?`)) {
        return;
      }
    }
  }
  if (!state.slipsPayload || !state.slipsPayload.slips.length) {
    buildSlipsPreview();
  }
  if (!state.slipsPayload) return;

  executeCleanPrint('landscape', PrinterService.renderPrintArea(state.slipsPayload));
}

function imprimirListaJogos() {
  const b = getCurrentBolao();
  if (!b) {
    toast('Selecione um bolão primeiro.', true);
    return;
  }
  const apostas = b.apostas || [];
  if (!apostas.length) {
    toast('Nenhum jogo registrado para imprimir.', true);
    return;
  }

  const printArea = $('#print-area');
  if (!printArea) return;

  setPrintOrientation('portrait');

  const dataEmissao = new Date().toLocaleDateString('pt-BR');
  const horaEmissao = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  const totalCotas = (b.participantes || []).reduce((acc, p) => acc + (p.cotas || 1), 0);

  const cardsHtml = apostas.map((a, idx) => {
    const balls = (a.dezenas || []).map((d) => `<span class="pg-ball">${String(d).padStart(2, '0')}</span>`).join('');
    return `
      <div class="print-game-card">
        <div class="pg-header">
          <span class="pg-idx">#${idx + 1}</span>
          <span class="pg-name" title="${a.participante_nome || ''}">${a.participante_nome || 'PARTICIPANTE'}</span>
        </div>
        <div class="pg-balls">${balls}</div>
      </div>
    `;
  }).join('');

  const listHtml = `
    <div class="print-games-sheet">
      <div class="print-games-header">
        <div>
          <h2 style="margin:0;font-size:18px;color:#059669">Mega-Sena Potenza — Lista Oficial de Jogos</h2>
          <div style="font-size:12px;color:#475569;margin-top:2px">Bolão: <b>${b.nome}</b> · Regra: ${b.dezenas_por_jogo || 6} dezenas por jogo</div>
        </div>
        <div style="text-align:right;font-size:11px;color:#64748b">
          <div>Total de Jogos: <b>${apostas.length}</b> · Cotas: <b>${totalCotas}</b></div>
          <div>Emissão: ${dataEmissao} às ${horaEmissao}</div>
        </div>
      </div>
      <div class="print-games-grid">
        ${cardsHtml}
      </div>
    </div>
  `;

  executeCleanPrint('portrait', listHtml);
}

// ===== CONFERÊNCIA DE RESULTADOS (DIRETO NO REGISTRO) =====

function executarConferenciaVisual(nums, label = null) {
  const b = getCurrentBolao();
  if (!b) return;

  if (!nums || nums.length !== 6) {
    toast('Informe exatamente 6 dezenas para conferir.', true);
    return;
  }

  nums = nums.slice().sort((a, b) => a - b);
  const res = StatsEngine.conferirApostas(b.apostas || [], nums);
  state.confResultado = res;

  // Atualiza painel visual inline
  const board = $('#conf-visual-board');
  const ballsDisp = $('#conf-drawn-balls-display');
  const pillsDisp = $('#conf-awards-pills');
  const tagDisp = $('#conf-status-tag');
  const btnClear = $('#btn-clear-conf');
  const inputInline = $('#conf-dezenas-inline');

  if (inputInline) {
    inputInline.value = nums.map((n) => String(n).padStart(2, '0')).join(' ');
  }

  if (ballsDisp) {
    ballsDisp.innerHTML = ballsHtml(res.dezenas_sorteadas);
  }

  if (pillsDisp) {
    const totalHits = res.detalhes.reduce((acc, d) => acc + d.qtd_acertos, 0);
    pillsDisp.innerHTML = `
      <span class="badge-premio ${res.senas > 0 ? 'sena' : ''}" style="${res.senas === 0 ? 'opacity:0.4' : ''}">💰 ${res.senas} Sena${res.senas !== 1 ? 's' : ''}</span>
      <span class="badge-premio ${res.quinas > 0 ? 'quina' : ''}" style="${res.quinas === 0 ? 'opacity:0.4' : ''}">🥈 ${res.quinas} Quina${res.quinas !== 1 ? 's' : ''}</span>
      <span class="badge-premio ${res.quadras > 0 ? 'quadra' : ''}" style="${res.quadras === 0 ? 'opacity:0.4' : ''}">🥉 ${res.quadras} Quadra${res.quadras !== 1 ? 's' : ''}</span>
      <span class="badge" style="font-weight:700">${totalHits} Acertos no Total</span>
    `;
  }

  if (tagDisp) {
    tagDisp.textContent = label ? `✅ Concurso #${label} Conferido` : '✅ Conferência Ativa';
    tagDisp.className = 'badge badge-cloud-active';
  }

  if (board) board.style.display = 'block';
  if (btnClear) btnClear.style.display = 'inline-flex';

  renderJogosTable(b);
  updatePickerUi();

  const msg = res.senas > 0 || res.quinas > 0 || res.quadras > 0
    ? `🎉 Bolão Premiado! ${res.senas} Sena(s), ${res.quinas} Quina(s) e ${res.quadras} Quadra(s)!`
    : `Conferência realizada: nenhum prêmio de 4, 5 ou 6 acertos neste sorteio.`;
  toast(msg);
}

function limparConferenciaVisual() {
  state.confResultado = null;
  const board = $('#conf-visual-board');
  const btnClear = $('#btn-clear-conf');
  const tagDisp = $('#conf-status-tag');
  const inputInline = $('#conf-dezenas-inline');

  if (board) board.style.display = 'none';
  if (btnClear) btnClear.style.display = 'none';
  if (inputInline) inputInline.value = '';
  if (tagDisp) {
    tagDisp.textContent = 'Nenhum concurso ativo';
    tagDisp.className = 'badge';
  }

  const b = getCurrentBolao();
  if (b) renderJogosTable(b);
  updatePickerUi();
  toast('Conferência do bolão resetada.');
}

function navegarConcurso(delta) {
  if (!state.concursos || !state.concursos.length) {
    toast('Nenhum concurso histórico carregado.', true);
    return;
  }
  if (state.currentConcursoIndex === null || state.currentConcursoIndex === undefined) {
    state.currentConcursoIndex = state.concursos.length - 1;
  } else {
    state.currentConcursoIndex += delta;
    if (state.currentConcursoIndex < 0) {
      state.currentConcursoIndex = 0;
      toast('Primeiro concurso da história (#1) atingido.');
    } else if (state.currentConcursoIndex >= state.concursos.length) {
      state.currentConcursoIndex = state.concursos.length - 1;
      toast('Último concurso oficial Caixa atingido.');
    }
  }

  const c = state.concursos[state.currentConcursoIndex];
  if (!c) return;
  executarConferenciaVisual(c.dezenas, `${c.concurso} (${c.data})`);
}

function abrirModalConferencia() {
  const modal = $('#conferir-modal');
  if (!modal) return;
  modal.style.display = 'flex';

  // Pré-preenche com último concurso se disponível
  if (state.concursos && state.concursos.length) {
    const ultimo = state.concursos[state.concursos.length - 1];
    $('#conf-dezenas-input').value = ultimo.dezenas.map((n) => String(n).padStart(2, '0')).join(' ');
  }
}

function executarConferencia() {
  const b = getCurrentBolao();
  const txt = ($('#conf-dezenas-input')?.value || '').trim();
  const nums = txt.split(/[\s,.-]+/).map(Number).filter((n) => n >= 1 && n <= 60);

  if (nums.length !== 6) {
    toast('Informe exatamente 6 dezenas para conferir.', true);
    return;
  }

  const res = StatsEngine.conferirApostas(b.apostas || [], nums);
  state.confResultado = res;

  const box = $('#conf-results-box');
  box.innerHTML = `
    <div class="summary-strip" style="background:#064e3b;color:#a7f3d0;border-color:#059669;margin-bottom:12px">
      <span>Dezenas Sorteadas: ${ballsHtml(res.dezenas_sorteadas)}</span>
      <span><b>Senas:</b> ${res.senas}</span>
      <span><b>Quinas:</b> ${res.quinas}</span>
      <span><b>Quadras:</b> ${res.quadras}</span>
    </div>
    <div class="table-wrap max-360">
      <table>
        <thead>
          <tr>
            <th>#</th>
            <th>Participante</th>
            <th>Dezenas</th>
            <th>Acertos</th>
            <th>Premiação</th>
          </tr>
        </thead>
        <tbody>
          ${res.detalhes
            .map(
              (d, idx) => `
            <tr>
              <td>${idx + 1}</td>
              <td><b>${d.participante_nome}</b></td>
              <td>${ballsHtml(d.dezenas, new Set(d.acertos))}</td>
              <td><b>${d.qtd_acertos}</b> (${d.acertos.join(', ') || '-'})</td>
              <td>${d.faixa ? '<span class="badge" style="background:#22c55e;color:#000;font-weight:700">' + d.faixa + '</span>' : '-'}</td>
            </tr>
          `
            )
            .join('')}
        </tbody>
      </table>
    </div>
  `;

  renderJogosTable(b);
}

// ===== ATUALIZAR RESULTADO CAIXA (AUTO-SYNC + CORS FALLBACK + LACUNAS) =====

const CAIXA_EXTRAS_STORAGE_KEY = 'megasena_concursos_extras_v1';

function normalizeCaixaRecord(data) {
  if (!data || typeof data !== 'object') return null;
  const concNum = parseInt(data.numero || data.concurso, 10);
  const dezRaw = data.listaDezenas || data.dezenas || [];
  const dezenas = dezRaw.map(Number).filter((n) => n >= 1 && n <= 60).sort((a, b) => a - b);
  if (!concNum || dezenas.length !== 6) return null;
  return {
    concurso: concNum,
    data: data.dataApuracao || data.data || '',
    data_proximo: data.dataProximoConcurso || data.data_proximo || '',
    dezenas,
    acumulada: Boolean(data.acumulado !== undefined ? data.acumulado : (data.acumulou !== undefined ? data.acumulou : data.acumulada)),
    estimativa: Number(data.valorEstimadoProximoConcurso || data.estimativa || 0),
  };
}

async function fetchCaixaConcurso(num = null) {
  const urls = num
    ? [
        `https://loteriascaixa-api.herokuapp.com/api/megasena/${num}`,
        `https://servicebus2.caixa.gov.br/portaldeloterias/api/megasena/${num}`,
        `https://api.guidi.dev.br/loteria/megasena/${num}`,
      ]
    : [
        'https://loteriascaixa-api.herokuapp.com/api/megasena/latest',
        'https://servicebus2.caixa.gov.br/portaldeloterias/api/megasena',
        'https://api.guidi.dev.br/loteria/megasena/ultimo',
      ];
  for (const url of urls) {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 6500);
      const res = await fetch(url, { headers: { Accept: 'application/json' }, signal: ctrl.signal });
      clearTimeout(timer);
      if (!res.ok) continue;
      const rec = normalizeCaixaRecord(await res.json());
      if (rec) return rec;
    } catch (_) {}
  }
  return null;
}

function mergeConcursosAndCache(newRecords) {
  const byNum = new Map();
  (state.concursos || []).forEach((c) => byNum.set(c.concurso, c));
  let added = 0;
  let updated = false;
  (newRecords || []).forEach((rec) => {
    if (!rec || !rec.concurso) return;
    const prev = byNum.get(rec.concurso);
    if (!prev) {
      byNum.set(rec.concurso, rec);
      added++;
      updated = true;
    } else if ((!prev.data_proximo && rec.data_proximo) || (!prev.estimativa && rec.estimativa)) {
      byNum.set(rec.concurso, { ...prev, ...rec });
      updated = true;
    }
  });
  if (updated) {
    state.concursos = Array.from(byNum.values()).sort((a, b) => a.concurso - b.concurso);
    try {
      const extras = state.concursos.filter((c) => c.concurso > 3090);
      if (extras.length) {
        localStorage.setItem(CAIXA_EXTRAS_STORAGE_KEY, JSON.stringify(extras));
      }
    } catch (_) {}
  }
  return added;
}

function updateSyncBannerFromLatest() {
  if (!state.concursos || !state.concursos.length) return;
  const u = state.concursos[state.concursos.length - 1];
  const banner = $('#sync-banner');
  if (banner) {
    banner.textContent = `Concurso Mais Recente: #${u.concurso} (${u.data}) · Dezenas: ${u.dezenas.map((n) => String(n).padStart(2, '0')).join(', ')}`;
  }
}

async function atualizarResultadoCaixa(opts = {}) {
  const silent = !!(opts && opts.silent);
  const btn = $('#btn-sync');
  if (btn && !silent) {
    btn.disabled = true;
    btn.innerHTML = '<span class="btn-text-full">Buscando Caixa...</span><span class="btn-text-short">...</span>';
  }

  try {
    const latest = await fetchCaixaConcurso(null);
    if (!latest) throw new Error('Falha nas APIs da Caixa');

    const localMax = state.concursos.length ? state.concursos[state.concursos.length - 1].concurso : 0;
    const fetched = [latest];

    // Preenche automaticamente todos os concursos intermediários faltantes (até 30 atrás)
    if (localMax > 0 && latest.concurso > localMax + 1) {
      const startGap = Math.max(localMax + 1, latest.concurso - 29);
      const gapNums = [];
      for (let n = startGap; n < latest.concurso; n++) gapNums.push(n);
      const gapResults = await Promise.all(gapNums.map((n) => fetchCaixaConcurso(n)));
      gapResults.forEach((r) => { if (r) fetched.push(r); });
    }

    const added = mergeConcursosAndCache(fetched);
    updateSyncBannerFromLatest();
    renderTimingPanel();

    if (!silent) {
      if (added > 0) {
        toast(`Base atualizada (+${added} concurso${added > 1 ? 's' : ''}) até #${latest.concurso} (${latest.data})!`);
      } else {
        toast(`Concurso mais recente (#${latest.concurso} · ${latest.data}) já está sincronizado.`);
      }
      executarConferenciaVisual(latest.dezenas, `${latest.concurso} (${latest.data})`);
    } else if (added > 0) {
      toast(`Caixa sincronizada automaticamente até #${latest.concurso} (${latest.data}).`);
    }
  } catch (err) {
    console.warn('Erro ao consultar APIs da Caixa:', err);
    if (!silent) {
      toast('Não foi possível conectar à API da Caixa agora. Usando base local.', true);
    }
  } finally {
    if (btn && !silent) {
      btn.disabled = false;
      btn.innerHTML = '<span class="btn-text-full">Atualizar Resultado Caixa</span><span class="btn-text-short">Atualizar</span>';
    }
  }
}

// ===== INICIALIZAÇÃO =====

async function loadInitialData() {
  // 1. Concursos (base compactada + cache local de extras + auto-sync online em segundo plano)
  try {
    const resp = await fetch('data/concursos.json?v=2.41');
    if (resp.ok) {
      state.concursos = await resp.json();
    }
  } catch (e) {
    console.warn('Não foi possível carregar data/concursos.json:', e);
  }

  try {
    const cachedExtras = JSON.parse(localStorage.getItem(CAIXA_EXTRAS_STORAGE_KEY) || '[]');
    if (Array.isArray(cachedExtras) && cachedExtras.length) {
      mergeConcursosAndCache(cachedExtras);
    }
  } catch (_) {}

  updateSyncBannerFromLatest();
  renderTimingPanel();

  // Sincroniza automaticamente novos concursos oficiais da Caixa em segundo plano
  atualizarResultadoCaixa({ silent: true });

  // 2. Estado local ou initial_state.json
  const savedState = localStorage.getItem('megasena_local_bolao_data');
  if (savedState) {
    try {
      const d = JSON.parse(savedState);
      state.boloes = d.boloes || [];
      state.nomesCatalogo = d.nomes_catalogo || [];
      state.currentBolaoId = d.current_bolao_id || (state.boloes[0] ? state.boloes[0].id : null);
    } catch (e) {}
  } else {
    try {
      const respState = await fetch('data/initial_state.json');
      if (respState.ok) {
        const d = await respState.json();
        state.boloes = d.boloes || [];
        state.nomesCatalogo = d.nomes_catalogo || [];
        state.currentBolaoId = state.boloes[0] ? state.boloes[0].id : null;
        localStorage.setItem('megasena_local_bolao_data', JSON.stringify(d));
      }
    } catch (e) {}
  }

  // 3. Inicializa Firebase Sync
  FirebaseSync.init(onRemoteDataChanged);
}

function bindEvents() {
  // Tabs
  $$('.tab').forEach((tab) => {
    tab.addEventListener('click', (e) => {
      e.preventDefault();
      $$('.tab').forEach((t) => t.classList.remove('active'));
      tab.classList.add('active');
      const targetId = tab.getAttribute('href');
      $$('main section.card').forEach((sec) => {
        sec.style.display = 'block';
      });
      if (targetId && targetId !== '#sec-bolao') {
        const targetEl = $(targetId);
        if (targetEl) targetEl.scrollIntoView({ behavior: 'smooth' });
      }
    });
  });

  // Picker & Form
  $('#btn-add-aposta')?.addEventListener('click', addApostaManual);
  $('#btn-clear-picker')?.addEventListener('click', () => {
    state.bolaoPickerSelected.clear();
    updatePickerUi();
  });
  $('#btn-sortear-uma')?.addEventListener('click', sortearUmaAposta);
  $('#btn-sortear-quota')?.addEventListener('click', sortearCotaInteira);

  $('#aposta-part-select')?.addEventListener('change', () => {
    const sel = $('#aposta-part-select');
    if (sel.value === '__NEW__') {
      $('#aposta-novo-nome').style.display = 'block';
      $('#aposta-novo-nome').focus();
    } else {
      $('#aposta-novo-nome').style.display = 'none';
      $('#aposta-novo-nome').value = '';
    }
    updateActionButtonsState(getParticipantStats(getSelectedParticipantName()));
  });

  $('#aposta-novo-nome')?.addEventListener('input', () => {
    updateActionButtonsState(getParticipantStats(getSelectedParticipantName()));
  });

  // Bolão Seleção & Regras
  $('#bolao-select')?.addEventListener('change', (e) => {
    state.currentBolaoId = parseInt(e.target.value, 10);
    renderAll();
  });

  // Recálculo automático do valor oficial Caixa (6..20 dezenas) e valor da cota
  const syncBolaoCfgPrices = (updateGamePrice) => {
    const dez = Math.max(6, Math.min(20, parseInt($('#bolao-cfg-dezenas')?.value, 10) || 6));
    const jogosCota = Math.max(1, parseInt($('#bolao-cfg-jogos-cota')?.value, 10) || 1);
    const valJogoEl = $('#bolao-cfg-valor-jogo');
    const valCotaEl = $('#bolao-cfg-valor-cota');
    let valJogo = parseFloat(valJogoEl?.value) || 6.0;
    if (updateGamePrice) {
      valJogo = StatsEngine.getBetPrice(dez, 6.0);
      if (valJogoEl) valJogoEl.value = valJogo.toFixed(2);
    }
    if (valCotaEl) valCotaEl.value = (valJogo * jogosCota).toFixed(2);
  };
  $('#bolao-cfg-dezenas')?.addEventListener('input', () => syncBolaoCfgPrices(true));
  $('#bolao-cfg-dezenas')?.addEventListener('change', () => syncBolaoCfgPrices(true));
  $('#bolao-cfg-jogos-cota')?.addEventListener('input', () => syncBolaoCfgPrices(false));
  $('#bolao-cfg-jogos-cota')?.addEventListener('change', () => syncBolaoCfgPrices(false));
  $('#bolao-cfg-valor-jogo')?.addEventListener('input', () => syncBolaoCfgPrices(false));

  $('#btn-save-bolao-cfg')?.addEventListener('click', () => {
    const b = getCurrentBolao();
    if (!b) return;
    b.dezenas_por_jogo = Math.max(6, Math.min(20, parseInt($('#bolao-cfg-dezenas').value, 10) || 6));
    b.jogos_por_cota = Math.max(1, parseInt($('#bolao-cfg-jogos-cota').value, 10) || 4);
    b.valor_jogo = parseFloat($('#bolao-cfg-valor-jogo').value) || StatsEngine.getBetPrice(b.dezenas_por_jogo, 6.0);
    b.valor_cota = parseFloat($('#bolao-cfg-valor-cota').value) || (b.valor_jogo * b.jogos_por_cota);
    persistAndBroadcast();
    renderAll();
    toast('Regras do bolão atualizadas.');
  });

  $('#btn-new-bolao')?.addEventListener('click', () => {
    const nome = prompt('Nome do novo bolão:', 'Bolão Mega-Sena Potenza');
    if (!nome) return;
    const novo = {
      id: Date.now(),
      nome: nome.trim(),
      dezenas_por_jogo: 6,
      jogos_por_cota: 4,
      valor_jogo: 6.0,
      valor_cota: 24.0,
      criado_em: new Date().toISOString(),
      participantes: [],
      apostas: [],
    };
    state.boloes.push(novo);
    state.currentBolaoId = novo.id;
    persistAndBroadcast();
    renderAll();
    toast(`Bolão "${novo.nome}" criado.`);
  });

  $('#btn-delete-bolao')?.addEventListener('click', () => {
    const b = getCurrentBolao();
    if (!b) return;
    if (state.boloes.length <= 1) {
      toast('Não é possível excluir o único bolão cadastrado.', true);
      return;
    }
    if (!confirm(`Tem certeza que deseja EXCLUIR o bolão "${b.nome}"?\n\nEsta ação excluirá todos os seus jogos e participantes.`)) return;

    state.boloes = state.boloes.filter((x) => x.id !== b.id);
    state.currentBolaoId = state.boloes[0].id;
    persistAndBroadcast();
    renderAll();
    toast(`Bolão "${b.nome}" excluído.`);
  });

  // Impressão
  loadCalibrationInputs();
  $('#btn-build-slips')?.addEventListener('click', buildSlipsPreview);
  $('#btn-print-slips')?.addEventListener('click', printSlips);
  $('#btn-print-test')?.addEventListener('click', printAlignmentTest);
  $('#btn-save-profile')?.addEventListener('click', saveCalibrationInputs);
  $('#btn-reset-profile')?.addEventListener('click', resetCalibrationInputs);
  $('#print-teimosinha')?.addEventListener('change', buildSlipsPreview);
  $('#btn-print-bolao-list')?.addEventListener('click', imprimirListaJogos);
  $('#btn-print-jogos-list')?.addEventListener('click', imprimirListaJogos);

  // Conferência Visual Direta no Registro
  $('#btn-conf-prev')?.addEventListener('click', () => navegarConcurso(-1));
  $('#btn-conf-next')?.addEventListener('click', () => navegarConcurso(1));
  $('#btn-quick-conf-ultimo')?.addEventListener('click', () => {
    if (state.concursos && state.concursos.length) {
      state.currentConcursoIndex = state.concursos.length - 1;
      const ultimo = state.concursos[state.currentConcursoIndex];
      executarConferenciaVisual(ultimo.dezenas, `${ultimo.concurso} (${ultimo.data})`);
    } else {
      toast('Nenhum concurso histórico carregado.', true);
    }
  });

  // Atalhos de teclado: setas para esquerda e direita para mudar de concurso rapidamente
  document.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable) {
      return;
    }
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      navegarConcurso(-1);
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      navegarConcurso(1);
    }
  });

  $('#btn-exec-conf-inline')?.addEventListener('click', () => {
    const txt = ($('#conf-dezenas-inline')?.value || '').trim();
    const nums = txt.split(/[\s,.-]+/).map(Number).filter((n) => n >= 1 && n <= 60);
    if (nums.length !== 6) {
      toast('Informe exatamente 6 dezenas para conferir.', true);
      return;
    }
    executarConferenciaVisual(nums, 'Manual');
  });

  $('#btn-clear-conf')?.addEventListener('click', limparConferenciaVisual);
  $('#btn-backtesting-bolao')?.addEventListener('click', runBolaoBacktesting);

  // Montador por Orçamento & Fechamento Manual (6, 7 ou 8 dezenas)
  renderFechamentoPicker();
  $('#fech-bet-size')?.addEventListener('change', updateFechamentoGerarState);
  $('#btn-fech-limpar')?.addEventListener('click', () => {
    state.fechamentoSelected.clear();
    state.fechamentoResult = null;
    renderFechamentoPicker();
    const box = $('#fech-results-box');
    if (box) box.style.display = 'none';
  });
  $('#btn-fech-budget')?.addEventListener('click', gerarPorOrcamentoUi);
  $('#btn-fech-gerar')?.addEventListener('click', gerarFechamentoUi);
  $('#btn-fech-add-bolao')?.addEventListener('click', adicionarFechamentoAoBolao);
  $('#btn-fech-backtest')?.addEventListener('click', testarFechamentoBacktesting);

  // Conferência Modal (Legado)
  $('#btn-conferir-modal')?.addEventListener('click', abrirModalConferencia);
  $('#btn-close-conferir-modal')?.addEventListener('click', () => {
    $('#conferir-modal').style.display = 'none';
  });
  $('#btn-conf-executar')?.addEventListener('click', executarConferencia);
  $('#btn-conf-print')?.addEventListener('click', () => {
    window.print();
  });

  // Atualizar Caixa
  $('#btn-sync')?.addEventListener('click', () => atualizarResultadoCaixa({ silent: false }));

  // Filtro de jogos
  $('#filtro-jogos')?.addEventListener('input', () => {
    renderJogosTable(getCurrentBolao());
  });
}

// ===== GERENCIAMENTO DE TEMA (CLARO / ESCURO) =====
function initTheme() {
  const savedTheme = localStorage.getItem('megasena_theme') || 'dark';
  applyTheme(savedTheme);

  $('#btn-theme-toggle')?.addEventListener('click', () => {
    const isLight = document.documentElement.getAttribute('data-theme') === 'light';
    const nextTheme = isLight ? 'dark' : 'light';
    applyTheme(nextTheme);
    localStorage.setItem('megasena_theme', nextTheme);
  });
}

function applyTheme(theme) {
  if (theme === 'light') {
    document.documentElement.setAttribute('data-theme', 'light');
    const icon = $('#theme-icon');
    const label = $('#theme-label');
    const btn = $('#btn-theme-toggle');
    if (icon) icon.textContent = '☀️';
    if (label) label.textContent = 'Claro';
    if (btn) btn.title = 'Alternar para tema escuro';
  } else {
    document.documentElement.removeAttribute('data-theme');
    const icon = $('#theme-icon');
    const label = $('#theme-label');
    const btn = $('#btn-theme-toggle');
    if (icon) icon.textContent = '🌙';
    if (label) label.textContent = 'Escuro';
    if (btn) btn.title = 'Alternar para tema claro';
  }
}

// ===== BACKTESTING HISTÓRICO (TODOS OS CONCURSOS) =====

function renderBacktestingResult(containerEl, bt, titulo) {
  if (!containerEl || !bt) return;
  const multNote = bt.has_multipla
    ? `<div style="font-size:11px;color:var(--muted);margin-bottom:8px">Inclui prêmios múltiplos oficiais Caixa para jogos de 7+ dezenas.</div>`
    : '';

  const rowsHtml = bt.top_hits.length
    ? bt.top_hits
        .map((h) => {
          const drawSet = new Set(h.sorteadas || []);
          const balls = (h.dezenas || [])
            .map((d) => `<span class="ball ${drawSet.has(d) ? 'hit' : 'dim'}">${String(d).padStart(2, '0')}</span>`)
            .join('');
          const badgeClass = h.qtd_acertos === 6 ? 'sena' : h.qtd_acertos === 5 ? 'quina' : 'quadra';
          const multTxt = h.premios_mult
            ? ` <small style="color:var(--muted)">(${h.premios_mult.senas ? h.premios_mult.senas + 'S ' : ''}${h.premios_mult.quinas ? h.premios_mult.quinas + 'Q5 ' : ''}${h.premios_mult.quadras ? h.premios_mult.quadras + 'Q4' : ''})</small>`
            : '';
          return `
            <tr>
              <td><b>#${h.concurso}</b><br><small class="muted">${h.data}</small></td>
              <td>${h.participante_nome} <small class="muted">(Jogo #${h.jogo_idx})</small></td>
              <td><div style="display:flex;flex-wrap:wrap;gap:3px">${balls}</div></td>
              <td style="text-align:center"><span class="award-badge ${badgeClass}">${h.faixa} (${h.qtd_acertos})</span>${multTxt}</td>
            </tr>
          `;
        })
        .join('')
    : `<tr><td colspan="4" class="muted" style="text-align:center;padding:14px">Nenhuma Quadra, Quina ou Sena encontrada nestes jogos nos ${bt.total_concursos} concursos analisados.</td></tr>`;

  containerEl.style.display = 'block';
  containerEl.innerHTML = `
    <div class="bt-header">
      <div>
        <strong style="font-size:13.5px;color:#38bdf8">📊 ${titulo}</strong>
        <span class="muted" style="font-size:11.5px;margin-left:6px">${bt.total_jogos} jogo(s) × ${bt.total_concursos.toLocaleString('pt-BR')} concursos</span>
      </div>
      <button class="btn btn-sm btn-ghost" onclick="this.closest('.backtesting-panel').style.display='none'">✕ Fechar</button>
    </div>
    ${multNote}
    <div class="bt-kpis">
      <div class="bt-kpi sena">
        <div class="bt-lbl">Senas (6)</div>
        <div class="bt-val">${bt.senas}</div>
        ${bt.has_multipla ? `<div class="bt-sub">Caixa: ${bt.senas_mult}</div>` : ''}
      </div>
      <div class="bt-kpi quina">
        <div class="bt-lbl">Quinas (5)</div>
        <div class="bt-val">${bt.quinas}</div>
        ${bt.has_multipla ? `<div class="bt-sub">Caixa: ${bt.quinas_mult}</div>` : ''}
      </div>
      <div class="bt-kpi quadra">
        <div class="bt-lbl">Quadras (4)</div>
        <div class="bt-val">${bt.quadras}</div>
        ${bt.has_multipla ? `<div class="bt-sub">Caixa: ${bt.quadras_mult}</div>` : ''}
      </div>
      <div class="bt-kpi">
        <div class="bt-lbl">Concursos Premiados</div>
        <div class="bt-val">${bt.concursos_premiados}</div>
        <div class="bt-sub">Ternos: ${bt.ternos}</div>
      </div>
    </div>
    <div class="table-wrap" style="max-height:260px;overflow-y:auto">
      <table>
        <thead>
          <tr>
            <th>Concurso</th>
            <th>Jogo / Participante</th>
            <th>Dezenas (Acertos em destaque)</th>
            <th style="text-align:center">Premiação</th>
          </tr>
        </thead>
        <tbody>${rowsHtml}</tbody>
      </table>
    </div>
  `;
}

function runBolaoBacktesting() {
  const b = getCurrentBolao();
  if (!b || !(b.apostas || []).length) {
    toast('Nenhum jogo registrado no bolão para testar.', true);
    return;
  }
  if (!state.concursos || !state.concursos.length) {
    toast('Base histórica de concursos ainda não carregada.', true);
    return;
  }
  const bt = StatsEngine.runBacktesting(b.apostas, state.concursos);
  renderBacktestingResult($('#backtesting-panel'), bt, `Backtesting Histórico — ${b.nome}`);
  toast(`Backtesting concluído em ${bt.total_concursos} concursos!`);
}

// ===== FECHAMENTOS MATEMÁTICOS (6, 7 OU 8 DEZENAS POR JOGO) =====

function renderFechamentoPicker() {
  const container = $('#fech-volante-picker');
  if (!container) return;

  const qDefs = [
    { key: 'q1', label: 'Q1 (01–25)', rows: [[1,2,3,4,5],[11,12,13,14,15],[21,22,23,24,25]] },
    { key: 'q2', label: 'Q2 (06–30)', rows: [[6,7,8,9,10],[16,17,18,19,20],[26,27,28,29,30]] },
    { key: 'q3', label: 'Q3 (31–55)', rows: [[31,32,33,34,35],[41,42,43,44,45],[51,52,53,54,55]] },
    { key: 'q4', label: 'Q4 (36–60)', rows: [[36,37,38,39,40],[46,47,48,49,50],[56,57,58,59,60]] },
  ];

  const html = qDefs
    .map((q) => {
      const nums = q.rows.flat();
      const selInQ = nums.filter((n) => state.fechamentoSelected.has(n)).length;
      const btns = nums
        .map((n) => {
          const isSel = state.fechamentoSelected.has(n);
          return `<button type="button" class="ball-pick ${isSel ? 'selected' : ''}" data-fech-num="${n}">${String(n).padStart(2, '0')}</button>`;
        })
        .join('');
      return `
        <div class="quadrant-box ${q.key}">
          <div class="quadrant-head">
            <span>${q.label}</span>
            <span class="q-count">${selInQ} sel.</span>
          </div>
          <div class="quadrant-grid">${btns}</div>
        </div>
      `;
    })
    .join('');

  container.innerHTML = `<div class="quadrants-board">${html}</div>`;
  const countEl = $('#fech-sel-count');
  if (countEl) countEl.textContent = `Selecionadas: ${state.fechamentoSelected.size} / 20`;

  container.querySelectorAll('[data-fech-num]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const n = parseInt(btn.getAttribute('data-fech-num'), 10);
      if (state.fechamentoSelected.has(n)) {
        state.fechamentoSelected.delete(n);
      } else {
        if (state.fechamentoSelected.size >= 20) {
          toast('Máximo de 20 dezenas para o fechamento matemático.', true);
          return;
        }
        state.fechamentoSelected.add(n);
      }
      renderFechamentoPicker();
    });
  });

  updateFechamentoGerarState();
}

function updateFechamentoGerarState() {
  const btn = $('#btn-fech-gerar');
  if (!btn) return;
  const k = parseInt($('#fech-bet-size')?.value, 10) || 6;
  const minNeeded = k + 1;
  const sel = state.fechamentoSelected.size;
  const ready = sel >= minNeeded;
  btn.disabled = !ready;
  btn.textContent = ready
    ? `⚡ Gerar Fechamento (${sel} dez.)`
    : `⚡ Gerar Fechamento (marque ≥${minNeeded} dez.)`;
  btn.title = ready
    ? `Gerar fechamento manual com as ${sel} dezenas selecionadas`
    : `Selecione manualmente ao menos ${minNeeded} dezenas no volante abaixo para liberar`;
}

function garantiaLabel(g) {
  return g === 6 ? 'Sena' : g === 5 ? 'Quina' : 'Quadra';
}

function renderFechamentoOutput(res) {
  state.fechamentoResult = res;

  const box = $('#fech-results-box');
  const kpis = $('#fech-kpis');
  const list = $('#fech-games-list');
  const btBox = $('#fech-backtesting-box');
  const cmpBox = $('#fech-auto-compare');
  if (btBox) btBox.style.display = 'none';
  if (box) box.style.display = 'block';
  if (cmpBox) {
    cmpBox.style.display = 'none';
    cmpBox.innerHTML = '';
  }

  if (kpis) {
    kpis.innerHTML = `
      <div class="kpi">
        <div class="label">Jogos Gerados (${res.k} dez.)</div>
        <div class="value">${res.total_jogos}</div>
        <div class="sub-label">vs ${res.comb_total.toLocaleString('pt-BR')} combinações totais</div>
      </div>
      <div class="kpi">
        <div class="label">Custo do Fechamento</div>
        <div class="value" style="color:var(--accent)">R$ ${res.custo_total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</div>
        <div class="sub-label">R$ ${res.custo_unitario.toFixed(2)} por jogo de ${res.k} dez.</div>
      </div>
      <div class="kpi">
        <div class="label">Economia vs Múltipla (${res.v} dez.)</div>
        <div class="value" style="color:var(--warn)">${res.economia_pct}%</div>
        <div class="sub-label">Múltipla direta: R$ ${res.custo_multipla_direta.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</div>
      </div>
      <div class="kpi">
        <div class="label">Garantia (${garantiaLabel(res.garantia)})</div>
        <div class="value" style="color:var(--accent)">${res.cobertura_pct}%</div>
        <div class="sub-label">${res.cobertura_m5_pct != null ? `Acerto 5→Q4: ${res.cobertura_m5_pct}% · 4→Q4: ${res.cobertura_m4_pct}%` : (res.verificacao_exata ? `${res.cenarios_testados.toLocaleString('pt-BR')} cenários verificados` : 'Amostra 4.000 cenários')}</div>
      </div>
    `;
  }

  if (list) {
    list.innerHTML = res.jogos
      .map((j, idx) => {
        const balls = j.map((d) => `<span class="ball">${String(d).padStart(2, '0')}</span>`).join('');
        return `
          <div class="fech-game-item">
            <span class="fech-game-idx">#${idx + 1}</span>
            <div class="fech-game-balls">${balls}</div>
          </div>
        `;
      })
      .join('');
  }
}

function renderTimingPanel() {
  const el = $('#timing-ev-panel');
  if (!el || typeof StatsEngine.evaluateDrawTiming !== 'function') return;
  const t = StatsEngine.evaluateDrawTiming(state.concursos || []);
  const tagFinal = t.is_final_05
    ? `<span class="badge" style="border-color:var(--accent);color:var(--accent)">⭐ Final 0/5 (+22% bônus Caixa)</span>`
    : (t.falta_final_05 > 0 ? `<span class="badge" title="A cada 5 concursos (final 0 ou 5), 22% da reserva acumulada dos 4 sorteios anteriores entra na Sena">Final 0/5 em ${t.falta_final_05} conc.</span>` : '');
  const tagStreak = t.streak_acumulada > 0
    ? `<span class="badge">🔥 Acumulada ${t.streak_acumulada}× seguidas</span>`
    : `<span class="badge">Sem acúmulo anterior</span>`;

  el.className = `timing-ev-box timing-${t.nivel}`;
  el.innerHTML = `
    <div class="timing-ev-head">
      <div>
        <strong style="font-size:13.5px">${t.icone} ${t.titulo}</strong>
        <div class="muted" style="font-size:11.5px;margin-top:2px">
          Próximo Concurso #${t.prox_concurso}${t.prox_data ? ` (${t.prox_data})` : ''} · Prêmio estimado: <b>R$ ${t.premio_milhoes.toLocaleString('pt-BR')} milhões</b>
        </div>
      </div>
      <div style="display:flex;flex-wrap:wrap;gap:6px;align-items:center">
        ${tagStreak}
        ${tagFinal}
      </div>
    </div>
    <p class="timing-ev-rec">${t.recomendacao}</p>
  `;
}

function gerarPorOrcamentoUi() {
  const budget = parseFloat($('#fech-budget-val')?.value) || 650;
  const perfil = $('#fech-budget-profile')?.value || 'misto';
  const lastDraw = state.concursos && state.concursos.length ? state.concursos[state.concursos.length - 1] : null;
  try {
    const res = StatsEngine.generateByBudget(budget, perfil, lastDraw, {
      concursos: state.concursos || [],
    });
    // Compatível com botão Adicionar ao Bolão e Backtesting
    state.fechamentoResult = {
      origem_orcamento: true,
      perfil,
      v: res.dezenas_cobertas,
      k: res.jogos[0]?.length || 6,
      garantia: 4,
      jogos: res.jogos,
      total_jogos: res.total_jogos,
      custo_total: res.custo_total,
      descricao: res.descricao,
    };

    const box = $('#fech-results-box');
    const kpis = $('#fech-kpis');
    const list = $('#fech-games-list');
    const btBox = $('#fech-backtesting-box');
    const cmpBox = $('#fech-auto-compare');
    if (btBox) btBox.style.display = 'none';
    if (box) box.style.display = 'block';
    if (cmpBox) {
      cmpBox.style.display = 'block';
      cmpBox.innerHTML = `<div class="backtesting-panel" style="margin-top:0"><strong>💰 ${res.descricao}</strong> · <span class="muted">Dezenas cobertas: ${res.dezenas_cobertas}/60 · Pares únicos: ${res.pares_unicos_pct}% · Média &gt;31: ${res.media_over31}</span></div>`;
    }
    if (kpis) {
      kpis.innerHTML = `
        <div class="kpi">
          <div class="label">Cartelas Geradas</div>
          <div class="value">${res.total_jogos}</div>
          <div class="sub-label">${res.combinacoes_eq6} combinações eq. de 6 dez.</div>
        </div>
        <div class="kpi">
          <div class="label">Custo Total</div>
          <div class="value" style="color:var(--accent)">R$ ${res.custo_total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</div>
          <div class="sub-label">Orçamento: R$ ${res.orcamento.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</div>
        </div>
        <div class="kpi">
          <div class="label">Chance Real (Sena)</div>
          <div class="value" style="color:var(--warn)">1 em ${(res.chance_sena_1_em / 1000).toFixed(0)}k</div>
          <div class="sub-label">Quadra: ~1 em ${res.chance_quadra_1_em} concursos</div>
        </div>
        <div class="kpi">
          <div class="label">Pares Únicos (Steiner)</div>
          <div class="value" style="color:var(--accent)">${res.pares_unicos_pct}%</div>
          <div class="sub-label">Cobertura: ${res.dezenas_cobertas}/60 dezenas</div>
        </div>
      `;
    }
    if (list) {
      list.innerHTML = res.jogos
        .map((j, idx) => {
          const balls = j.map((d) => `<span class="ball">${String(d).padStart(2, '0')}</span>`).join('');
          return `
            <div class="fech-game-item">
              <span class="fech-game-idx">#${idx + 1}</span>
              <div class="fech-game-balls">${balls}</div>
            </div>
          `;
        })
        .join('');
    }
    toast(`Carteira montada: ${res.total_jogos} jogos (R$ ${res.custo_total.toFixed(2)}) — ${res.pares_unicos_pct}% pares únicos!`);
  } catch (err) {
    toast(err.message || 'Erro ao montar por orçamento.', true);
  }
}

function gerarFechamentoUi() {
  const k = parseInt($('#fech-bet-size')?.value, 10) || 6;
  const garantia = parseInt($('#fech-garantia')?.value, 10) || 4;
  if (state.fechamentoSelected.size <= k) {
    toast(`Selecione manualmente pelo menos ${k + 1} dezenas no volante.`, true);
    return;
  }
  const nums = Array.from(state.fechamentoSelected).sort((a, b) => a - b);

  try {
    const res = StatsEngine.generateFechamento(nums, k, garantia, 6.0);
    renderFechamentoOutput(res);
    toast(`Fechamento manual gerado: ${res.total_jogos} jogos de ${res.k} dezenas (${garantiaLabel(res.garantia)} ${res.cobertura_pct}%).`);
  } catch (err) {
    toast(err.message || 'Erro ao gerar fechamento.', true);
  }
}

function testarFechamentoBacktesting() {
  if (!state.fechamentoResult || !state.fechamentoResult.jogos.length) {
    toast('Gere os jogos primeiro.', true);
    return;
  }
  const res = state.fechamentoResult;
  const bt = StatsEngine.runBacktesting(res.jogos, state.concursos || []);
  const titulo = res.origem_orcamento && res.descricao
    ? `Backtesting — ${res.descricao}`
    : `Backtesting do Fechamento (${res.v}→${res.k} dez., garantia ${garantiaLabel(res.garantia)})`;
  renderBacktestingResult($('#fech-backtesting-box'), bt, titulo);
}

function adicionarFechamentoAoBolao() {
  const b = getCurrentBolao();
  const res = state.fechamentoResult;
  if (!b || !res || !res.jogos.length) {
    toast('Gere os jogos primeiro.', true);
    return;
  }

  const nomeSelecionado = getSelectedParticipantName();
  const defaultNome = res.origem_orcamento ? 'CARTEIRA ORÇAMENTO' : `FECHAMENTO ${res.v}→${res.k}`;
  const partNome = (nomeSelecionado || defaultNome).toUpperCase();
  const resumoConfirm = res.origem_orcamento && res.descricao
    ? `${res.total_jogos} jogo(s) (${res.descricao})`
    : `${res.total_jogos} jogo(s) de ${res.k} dezenas`;

  if (!confirm(`Adicionar ${resumoConfirm} ao bolão "${b.nome}" para "${partNome}"?`)) {
    return;
  }

  b.participantes = b.participantes || [];
  b.apostas = b.apostas || [];

  let p = b.participantes.find((x) => (x.nome || '').toUpperCase() === partNome);
  if (!p) {
    const newId = b.participantes.reduce((m, x) => Math.max(m, x.id || 0), 0) + 1;
    p = {
      id: newId,
      nome: partNome,
      cotas: 1,
      pago: 0,
      valor_pago: 0,
    };
    b.participantes.push(p);
  }

  const seen = new Set(
    b.apostas.map((a) => [...(a.dezenas || [])].sort((x, y) => x - y).join('-'))
  );
  let nextApostaId = b.apostas.reduce((m, a) => Math.max(m, a.id || 0), 0) + 1;
  let adicionados = 0;

  res.jogos.forEach((dez) => {
    const sig = [...dez].sort((x, y) => x - y).join('-');
    if (seen.has(sig)) return;
    seen.add(sig);
    b.apostas.push({
      id: nextApostaId++,
      participante_id: p.id,
      participante_nome: p.nome,
      dezenas: [...dez],
      origem: res.origem_orcamento ? `orcamento_${res.perfil || 'misto'}` : `fechamento_${res.v}_${res.k}_g${res.garantia}`,
    });
    adicionados++;
  });

  if (adicionados > 0) {
    // Recalcula automaticamente a quantidade de cotas do participante considerando jogos e valor oficial Caixa
    const jogosPorCota = Math.max(1, parseInt(b.jogos_por_cota, 10) || 4);
    const valorCota = Math.max(1, Number(b.valor_cota || 24.0));
    const pApostas = b.apostas.filter((a) => (a.participante_nome || '').toUpperCase() === p.nome.toUpperCase());
    const custoTotalPart = pApostas.reduce((acc, a) => acc + StatsEngine.getBetPrice((a.dezenas || []).length, 6.0), 0);
    const cotasNecessarias = Math.max(
      1,
      Math.ceil(pApostas.length / jogosPorCota),
      Math.ceil(custoTotalPart / valorCota)
    );
    p.cotas = Math.max(p.cotas || 1, cotasNecessarias);

    persistAndBroadcast();
    renderAll();
    toast(`${adicionados} jogo(s) adicionados para ${p.nome} (${p.cotas} cota${p.cotas > 1 ? 's' : ''})!`);
  } else {
    toast('Todos os jogos gerados já existem no bolão.');
  }
}

// Inicializar aplicação
(async function init() {
  initTheme();
  initPicker();
  bindEvents();
  await loadInitialData();
  renderAll();
})();
