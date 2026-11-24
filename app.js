// -*- coding: utf-8 -*-
/**
 * Mega-Sena Potenza — V. 2.13 (Nuvem 24h Padrão)
 * Aplicação Principal 100% Client-Side (GitHub Pages + Firebase Realtime)
 */

const state = {
  concursos: [],
  boloes: [],
  nomesCatalogo: [],
  currentBolaoId: null,
  bolaoPickerSelected: new Set(),
  printerProfiles: [],
  currentProfile: null,
  slipsPayload: null,
  confResultado: null,
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
    quotaBox.innerHTML = `
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
  const pagos = parts.filter((p) => p.pago).length;
  const totalCotas = parts.reduce((acc, p) => acc + (p.cotas || 1), 0);
  const totalArrecadado = totalCotas * (b.valor_cota || 24.0);

  el.innerHTML = `
    <div class="kpi-card"><span class="kpi-val">${apostas.length}</span><span class="kpi-lbl">Total de Jogos</span></div>
    <div class="kpi-card"><span class="kpi-val">${parts.length}</span><span class="kpi-lbl">Participantes (${pagos} Pagos)</span></div>
    <div class="kpi-card"><span class="kpi-val">${totalCotas}</span><span class="kpi-lbl">Total de Cotas</span></div>
    <div class="kpi-card"><span class="kpi-val">R$ ${totalArrecadado.toFixed(2)}</span><span class="kpi-lbl">Arrecadação Estimada</span></div>
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
      const pJogos = apostas.filter((a) => (a.participante_nome || '').toUpperCase() === p.nome.toUpperCase()).length;
      const meta = (p.cotas || 1) * jogosPorCota;
      const valor = (p.cotas || 1) * (b.valor_cota || 24.0);
      const isPago = !!p.pago;
      const isMetaOk = pJogos >= meta;
      const faltam = meta - pJogos;

      return `
        <tr>
          <td><b>${p.nome}</b></td>
          <td style="text-align:center">
            <div class="cotas-control">
              <button class="btn-cota" onclick="alterarCotas(${p.id}, -1)">-</button>
              <span class="cota-val">${p.cotas || 1}</span>
              <button class="btn-cota" onclick="alterarCotas(${p.id}, 1)">+</button>
            </div>
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
  b.apostas = (b.apostas || []).filter((a) => a.id !== apostaId);
  persistAndBroadcast();
  renderAll();
  toast('Aposta removida.');
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

  // Se tiver de 1 a 5 dezenas marcadas no cartão: apenas completa no cartão para revisão do usuário
  if (fixed.length > 0 && fixed.length < 6) {
    const gen = StatsEngine.generatePotenzaGames({
      quantidade: 1,
      dezenas_por_jogo: 6,
      base_existing: b.apostas || [],
      fixed_nums: fixed,
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

  const teimosinha = $('#print-teimosinha')?.checked;
  const payload = PrinterService.buildSlipsPayload(apostas, { teimosinha });
  state.slipsPayload = payload;

  let html = `<div style="display:flex;flex-wrap:wrap;gap:12px;justify-content:center">`;
  payload.slips.forEach((s) => {
    html += `
      <div style="background:#fff;padding:8px;border-radius:6px;box-shadow:0 2px 6px rgba(0,0,0,0.3)">
        <div style="font-size:11px;color:#333;margin-bottom:4px;font-weight:700">Volante ${s.slip_index} (${s.total_jogos} jogos)</div>
        ${PrinterService.renderSlipSvg(s, payload.profile, true)}
      </div>
    `;
  });
  html += `</div>`;
  el.innerHTML = html;
}

function printSlips() {
  if (!state.slipsPayload || !state.slipsPayload.slips.length) {
    buildSlipsPreview();
  }
  const printArea = $('#print-area');
  if (!printArea || !state.slipsPayload) return;

  printArea.innerHTML = PrinterService.renderPrintArea(state.slipsPayload);
  window.print();
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

// ===== ATUALIZAR RESULTADO CAIXA (CORS MIRROR) =====

async function atualizarResultadoCaixa() {
  const btn = $('#btn-sync');
  btn.disabled = true;
  btn.textContent = 'Buscando Caixa...';

  try {
    // Espelho público oficial com CORS liberado
    const res = await fetch('https://api.guidi.dev.br/loteria/megasena/ultimo');
    if (!res.ok) throw new Error('Falha na resposta da API');
    const data = await res.json();

    const dezenas = (data.dezenas || data.listaDezenas || []).map(Number);
    const concNum = parseInt(data.numero || data.concurso, 10);

    if (concNum && dezenas.length === 6) {
      // Verifica se já existe
      const exists = state.concursos.some((c) => c.concurso === concNum);
      if (!exists) {
        state.concursos.push({
          concurso: concNum,
          data: data.dataApuracao || data.data || '',
          dezenas: dezenas,
          acumulada: !!data.acumulado,
          estimativa: data.valorEstimadoProximoConcurso || 0.0,
        });
        state.concursos.sort((a, b) => a.concurso - b.concurso);
        toast(`Concurso ${concNum} atualizado com sucesso: ${dezenas.join(', ')}`);
      } else {
        toast(`Concurso mais recente (${concNum}) já está sincronizado.`);
      }

      $('#sync-banner').textContent = `Concurso Mais Recente: #${concNum} (${data.dataApuracao || ''}) · Dezenas: ${dezenas.join(', ')}`;
      executarConferenciaVisual(dezenas, concNum);
    }
  } catch (err) {
    console.warn('Erro ao consultar espelho Caixa:', err);
    toast('Não foi possível conectar à API da Caixa agora. Usando dados locais.', true);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Atualizar Resultado Caixa';
  }
}

// ===== INICIALIZAÇÃO =====

async function loadInitialData() {
  // 1. Concursos
  try {
    const resp = await fetch('data/concursos.json');
    if (resp.ok) {
      state.concursos = await resp.json();
      if (state.concursos.length) {
        const u = state.concursos[state.concursos.length - 1];
        $('#sync-banner').textContent = `Concurso Mais Recente: #${u.concurso} (${u.data}) · Dezenas: ${u.dezenas.join(', ')}`;
      }
    }
  } catch (e) {
    console.warn('Não foi possível carregar data/concursos.json:', e);
  }

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

  $('#btn-save-bolao-cfg')?.addEventListener('click', () => {
    const b = getCurrentBolao();
    if (!b) return;
    b.dezenas_por_jogo = parseInt($('#bolao-cfg-dezenas').value, 10) || 6;
    b.jogos_por_cota = parseInt($('#bolao-cfg-jogos-cota').value, 10) || 4;
    b.valor_jogo = parseFloat($('#bolao-cfg-valor-jogo').value) || 6.0;
    b.valor_cota = parseFloat($('#bolao-cfg-valor-cota').value) || 24.0;
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
  $('#btn-build-slips')?.addEventListener('click', buildSlipsPreview);
  $('#btn-print-slips')?.addEventListener('click', printSlips);
  $('#print-teimosinha')?.addEventListener('change', buildSlipsPreview);
  $('#btn-print-bolao-list')?.addEventListener('click', () => window.print());

  // Conferência Visual Direta no Registro
  $('#btn-quick-conf-ultimo')?.addEventListener('click', () => {
    if (state.concursos && state.concursos.length) {
      const ultimo = state.concursos[state.concursos.length - 1];
      executarConferenciaVisual(ultimo.dezenas, ultimo.concurso);
    } else {
      toast('Nenhum concurso histórico carregado.', true);
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
  $('#btn-sync')?.addEventListener('click', atualizarResultadoCaixa);

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

// Inicializar aplicação
(async function init() {
  initTheme();
  initPicker();
  bindEvents();
  await loadInitialData();
  renderAll();
})();
