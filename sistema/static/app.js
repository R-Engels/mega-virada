const state = {
  boloes: [],
  nomesCatalogo: [],
  currentBolao: null,
  bolaoPickerSelected: new Set(),
  profiles: [],
  currentProfile: null,
  slipsPayload: null,
};

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

function toast(msg, isError = false) {
  const el = $('#toast');
  el.textContent = msg;
  el.style.borderColor = isError ? 'var(--danger)' : 'var(--accent)';
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), 3600);
}

function setFeedback(elId, msg, isError = false) {
  const el = $(elId);
  if (!el) return;
  el.textContent = msg;
  el.className = `inline-feedback ${msg ? (isError ? 'err' : 'ok') : ''}`;
}

const API_BASE = window.location.protocol === 'file:' ? 'http://127.0.0.1:8080' : '';

async function api(path, opts = {}) {
  let res;
  const url = path.startsWith('http') ? path : `${API_BASE}${path}`;
  try {
    res = await fetch(url, {
      headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) },
      ...opts,
    });
    const off = $('#offline-banner');
    if (off) off.style.display = 'none';
  } catch (netErr) {
    const off = $('#offline-banner');
    if (off) off.style.display = 'flex';
    throw new Error('Sem conexão com o servidor local (porta 8080). Execute iniciar_sistema.bat.');
  }
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Erro na requisição');
  return data;
}

function money(v) {
  return Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function ballsHtml(nums, hitsSet = null) {
  return `<span class="balls">${nums
    .map((n) => {
      const cls = hitsSet && hitsSet.has(n) ? 'ball hit' : 'ball';
      return `<span class="${cls}">${String(n).padStart(2, '0')}</span>`;
    })
    .join('')}</span>`;
}

function parseNumsList(str) {
  return (str || '')
    .split(/[\s,;.-]+/)
    .map((x) => parseInt(x, 10))
    .filter((x) => !isNaN(x) && x >= 1 && x <= 60);
}

// ===== SYNC CAIXA (RESULTADO PARA CONFERÊNCIA) =====
async function loadSyncStatus() {
  const st = await api('/api/sync/status');
  const last = st.ultimo_sorteio;
  if (last) {
    $('#sync-banner').textContent =
      `Último sorteio Caixa: #${last.concurso} (${last.data_apuracao}) — ${last.dezenas.map((x) => String(x).padStart(2, '0')).join(' ')}`;
  } else {
    $('#sync-banner').textContent = 'Sincronizando resultado oficial Caixa...';
  }
}

async function triggerSync() {
  const btn = $('#btn-sync');
  btn.disabled = true;
  btn.textContent = 'Atualizando...';
  try {
    const res = await api('/api/sync', { method: 'POST' });
    await loadSyncStatus();
    toast(`Resultado Caixa atualizado até o concurso #${res.ultimo_concurso}.`);
  } catch (err) {
    toast(err.message, true);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Atualizar Resultado Caixa';
  }
}

const QUADRANTS = [
  { id: 1, cls: 'q1', label: 'Q1 (01–25)', nums: [1,2,3,4,5, 11,12,13,14,15, 21,22,23,24,25] },
  { id: 2, cls: 'q2', label: 'Q2 (06–30)', nums: [6,7,8,9,10, 16,17,18,19,20, 26,27,28,29,30] },
  { id: 3, cls: 'q3', label: 'Q3 (31–55)', nums: [31,32,33,34,35, 41,42,43,44,45, 51,52,53,54,55] },
  { id: 4, cls: 'q4', label: 'Q4 (36–60)', nums: [36,37,38,39,40, 46,47,48,49,50, 56,57,58,59,60] },
];

function renderQuadrantBoard(containerEl, cellRenderer, badgeRenderer) {
  containerEl.innerHTML = QUADRANTS.map((q) => `
    <div class="quadrant-box ${q.cls}" data-q="${q.id}">
      <div class="quadrant-head">
        <span>${q.label}</span>
        <span class="q-count" data-q-badge="${q.id}">${badgeRenderer(q)}</span>
      </div>
      <div class="quadrant-cells">${q.nums.map((n) => cellRenderer(n)).join('')}</div>
    </div>
  `).join('');
}

function updatePickerQuadrantCounts() {
  QUADRANTS.forEach((q) => {
    const cnt = q.nums.filter((n) => state.bolaoPickerSelected.has(n)).length;
    const badge = $(`#bolao-volante-picker [data-q-badge="${q.id}"]`);
    if (badge) badge.textContent = `${cnt} sel.`;
  });
}

// ===== VOLANTE CLICÁVEL DO BOLÃO =====
function updateApostaLimitBadge() {
  const limit = state.currentBolao ? Number(state.currentBolao.dezenas_por_jogo || 6) : 6;
  const cnt = state.bolaoPickerSelected.size;
  const badge = $('#aposta-limit-badge');
  if (badge) {
    badge.textContent = `Selecionadas: ${cnt} / ${limit}`;
    badge.style.background = cnt === limit ? 'var(--accent)' : (cnt > limit ? 'var(--danger)' : 'var(--surface-2)');
    badge.style.color = cnt === limit ? '#052e16' : 'var(--text)';
  }
  const preview = $('#step-preview-nums');
  if (preview) {
    const arr = Array.from(state.bolaoPickerSelected).sort((a, b) => a - b);
    preview.textContent = arr.length ? arr.map((x) => String(x).padStart(2, '0')).join(' ') : 'Preenchendo agora...';
  }
  updatePickerQuadrantCounts();
  updateAutoApostaButtonLabel();
}

function initPicker() {
  const el = $('#bolao-volante-picker');
  renderQuadrantBoard(
    el,
    (n) => `<div class="cell" data-n="${n}"><span class="num">${String(n).padStart(2, '0')}</span></div>`,
    () => '0 sel.'
  );
  el.addEventListener('click', (e) => {
    const cell = e.target.closest('.cell');
    if (!cell) return;
    const n = Number(cell.dataset.n);
    const maxCount = state.currentBolao ? Number(state.currentBolao.dezenas_por_jogo || 6) : 6;
    if (state.bolaoPickerSelected.has(n)) {
      state.bolaoPickerSelected.delete(n);
      cell.classList.remove('selected');
    } else {
      if (state.bolaoPickerSelected.size >= maxCount) {
        const msg = `Limite máximo atingido: ${maxCount} dezenas permitidas neste bolão.`;
        setFeedback('#aposta-feedback', msg, true);
        return toast(msg, true);
      }
      state.bolaoPickerSelected.add(n);
      cell.classList.add('selected');
    }
    const arr = Array.from(state.bolaoPickerSelected).sort((a, b) => a - b);
    $('#aposta-text').value = arr.map((x) => String(x).padStart(2, '0')).join(' ');
    updateApostaLimitBadge();
  });
}

// ===== MAPA DE CALOR ESTILO EXCEL (VERDE -> AMARELO -> VERMELHO) =====
function heatColor(freq, minF, maxF) {
  if (maxF <= 0) {
    return { bg: '#1e293b', color: '#64748b', subColor: '#475569' };
  }
  const span = Math.max(1, maxF - minF);
  const t = Math.max(0, Math.min(1, (freq - minF) / span));

  // Escala oficial tri-color do Excel:
  // Verde (#63BE7B: 99, 190, 123) -> Amarelo (#FFEB84: 255, 235, 132) -> Vermelho (#F8696B: 248, 105, 107)
  let r, g, b;
  if (t <= 0.5) {
    const factor = t / 0.5;
    r = Math.round(99 + (255 - 99) * factor);
    g = Math.round(190 + (235 - 190) * factor);
    b = Math.round(123 + (132 - 123) * factor);
  } else {
    const factor = (t - 0.5) / 0.5;
    r = Math.round(255 + (248 - 255) * factor);
    g = Math.round(235 + (105 - 235) * factor);
    b = Math.round(132 + (107 - 132) * factor);
  }

  return {
    bg: `rgb(${r}, ${g}, ${b})`,
    color: '#0f172a',
    subColor: '#334155',
  };
}

function renderBolaoStats(bolao) {
  const st = bolao.estatisticas;
  if (!st) return;

  $('#bolao-stats-summary').textContent = `${st.total_jogos} jogos analisados neste bolão`;
  $('#bolao-stats-kpis').innerHTML = `
    <div class="kpi"><div class="label">Jogos no Bolão</div><div class="value">${st.total_jogos}</div></div>
    <div class="kpi"><div class="label">Cobertura do Volante</div><div class="value">${st.cobertura_volante_pct}%</div></div>
    <div class="kpi"><div class="label">Média da Soma</div><div class="value">${st.media_soma}</div></div>
    <div class="kpi"><div class="label">Dezenas Zeradas (0x)</div><div class="value">${st.dezenas_nao_jogadas.length}</div></div>
  `;

  const freqs = st.dezenas.map((d) => d.freq);
  const minF = Math.min(...freqs);
  const maxF = Math.max(...freqs);

  $('#bolao-heatmap-legend').innerHTML = `
    <span>Menos jogada / Frio (<b>${minF}x</b>)</span>
    <span class="heatmap-bar"></span>
    <span>Mais jogada / Quente (<b>${maxF}x</b>)</span>
  `;

  const freqMap = new Map(st.dezenas.map((d) => [d.dezena, d.freq]));
  renderQuadrantBoard(
    $('#bolao-heatmap-grid'),
    (n) => {
      const f = freqMap.get(n) || 0;
      const c = heatColor(f, minF, maxF);
      return `<div class="cell heat-cell" style="background:${c.bg};color:${c.color}" title="Dezena ${String(n).padStart(2, '0')}: ${f}x neste bolão">
        <span class="num">${String(n).padStart(2, '0')}</span>
        <span class="sub" style="color:${c.subColor}">${f}x</span>
      </div>`;
    },
    (q) => `${q.nums.reduce((acc, n) => acc + (freqMap.get(n) || 0), 0)}x`
  );

  $('#bolao-top-nums').innerHTML = st.mais_jogadas.length
    ? st.mais_jogadas.map((d) => `<span class="chip"><b>${String(d.dezena).padStart(2, '0')}</b> · ${d.freq}x</span>`).join('')
    : '<span class="muted">Nenhum jogo registrado ainda.</span>';

  $('#bolao-zero-nums').innerHTML = st.dezenas_nao_jogadas.length
    ? st.dezenas_nao_jogadas.map((n) => `<span class="chip">${String(n).padStart(2, '0')}</span>`).join('')
    : '<span class="chip">Todas as 60 dezenas foram jogadas!</span>';

  const parEntries = Object.entries(st.dist_paridade || {});
  $('#bolao-parity-dist').innerHTML = parEntries.length
    ? parEntries.map(([k, v]) => `<span class="chip"><b>${k}</b> · ${v} jogos</span>`).join('')
    : '<span class="muted">-</span>';
}

// ===== BOLÃO POTENZA =====
async function loadNomesCatalogo() {
  const data = await api('/api/nomes');
  state.nomesCatalogo = data.nomes || [];
}

function renderPartDropdown(bolao, prevSelectedName = '') {
  const sel = $('#aposta-part-select');
  const existingNames = (bolao?.participantes || []).map((p) => p.nome);
  const catalogNames = state.nomesCatalogo.map((n) => n.nome);
  const allNames = Array.from(new Set([...existingNames, ...catalogNames])).sort((a, b) => a.localeCompare(b, 'pt-BR'));

  sel.innerHTML =
    `<option value="">-- Selecione na lista ou digite ao lado --</option>` +
    allNames.map((nome) => `<option value="${nome}">${nome}</option>`).join('');

  if (prevSelectedName && allNames.includes(prevSelectedName)) {
    sel.value = prevSelectedName;
  }
}

async function loadBoloes(selectId = null) {
  const data = await api('/api/boloes');
  state.boloes = data.boloes;

  const sel = $('#bolao-select');
  sel.innerHTML = data.boloes.length
    ? data.boloes.map((b) => `<option value="${b.id}">${b.nome} (${b.total_apostas} jogos)</option>`).join('')
    : '<option value="">Nenhum bolão criado</option>';

  const targetId = selectId || (data.boloes[0] ? data.boloes[0].id : null);
  if (targetId) {
    sel.value = String(targetId);
    await selectBolao(targetId);
  } else {
    state.currentBolao = null;
    $('#bolao-kpis').innerHTML = '';
    $('#part-tbody').innerHTML = '';
    $('#apostas-tbody').innerHTML = '';
    $('#bolao-rule-badge').textContent = 'Nenhum bolão ativo';
    $('#bolao-stats-kpis').innerHTML = '';
    $('#bolao-heatmap-grid').innerHTML = '';
    $('#bolao-top-nums').innerHTML = '<span class="muted">Nenhum bolão ativo.</span>';
    $('#bolao-zero-nums').innerHTML = '<span class="muted">Nenhum bolão ativo.</span>';
    renderParticipantQuotaBox();
  }
}

async function selectBolao(id) {
  if (!id) return;
  if (!state.nomesCatalogo.length) await loadNomesCatalogo();
  const prevName = $('#aposta-part-select').value;
  const b = await api(`/api/boloes/${id}`);
  state.currentBolao = b;
  const r = b.resumo;
  const jogosPorCota = Number(b.jogos_por_cota || 4);

  const locked = b.apostas.length > 0;
  $('#bolao-cfg-dezenas').value = b.dezenas_por_jogo;
  $('#bolao-cfg-jogos-cota').value = jogosPorCota;
  $('#bolao-cfg-valor-jogo').value = Number(b.valor_jogo).toFixed(2);
  $('#bolao-cfg-valor-cota').value = Number(b.valor_cota).toFixed(2);
  ['#bolao-cfg-dezenas', '#bolao-cfg-jogos-cota', '#bolao-cfg-valor-jogo', '#bolao-cfg-valor-cota', '#btn-save-bolao-cfg'].forEach((id) => {
    $(id).disabled = locked;
  });
  const genQtyEl = $('#gen-qty'); if (genQtyEl) genQtyEl.value = jogosPorCota;
  $('#bolao-rule-badge').textContent = locked
    ? `Regra travada (bolão iniciado): ${b.dezenas_por_jogo} dez./jogo · ${jogosPorCota} jogos/cota`
    : `Regra editável (antes da 1ª aposta): ${b.dezenas_por_jogo} dez./jogo · ${jogosPorCota} jogos/cota`;
  $('#aposta-rule-hint').textContent = `Limite: exatamente ${b.dezenas_por_jogo} dezenas por jogo · Jogos duplicados proibidos.`;
  updateApostaLimitBadge();

  $('#bolao-kpis').innerHTML = `
    <div class="kpi"><div class="label">Participantes com Jogo (Pagos)</div><div class="value">${r.participantes_pagos} / ${r.total_participantes}</div></div>
    <div class="kpi"><div class="label">Jogos (${r.jogos_duplicados} dup.)</div><div class="value">${r.total_apostas}</div></div>
    <div class="kpi"><div class="label">Custo Total Jogos</div><div class="value">${money(r.custo_total_apostas)}</div></div>
    <div class="kpi"><div class="label">Arrecadado / Faltante</div><div class="value">${money(r.total_arrecadado)} <small style="font-size:12px;color:var(--muted)">/ -${money(r.saldo_faltante)}</small></div></div>
  `;

  $('#part-tbody').innerHTML = b.participantes.length
    ? b.participantes
        .map(
          (p) => `<tr>
            <td><b>${p.nome}</b></td>
            <td>
              <div class="cotas-control">
                <button class="btn btn-sm btn-ghost" onclick="updatePartCotas(${p.id}, ${p.cotas - 1})" ${p.cotas <= 1 ? 'disabled' : ''} title="Diminuir cota">-</button>
                <b>${p.cotas}</b>
                <button class="btn btn-sm btn-ghost" onclick="updatePartCotas(${p.id}, ${p.cotas + 1})" title="Aumentar cota">+</button>
              </div>
            </td>
            <td><b>${p.total_jogos}</b> / ${p.cotas * jogosPorCota}</td>
            <td>
              <button class="btn-pago-toggle ${p.pago ? 'pago' : 'pendente'}" onclick="togglePago(${p.id}, ${p.pago ? 0 : 1})" title="${p.pago ? 'Clique para desmarcar e voltar para Pendente' : 'Clique para registrar pagamento'}">
                ${p.pago ? 'PAGO' : 'PENDENTE'}
              </button>
            </td>
            <td>${money(p.pago ? p.valor_pago : p.cotas * b.valor_cota)}</td>
            <td><button class="btn btn-sm btn-danger" onclick="removeParticipante(${p.id})">x</button></td>
          </tr>`
        )
        .join('')
    : '<tr><td colspan="6" class="muted">Nenhum participante nesta lista ainda. Ele entra automaticamente ao registrar sua aposta.</td></tr>';

  renderPartDropdown(b, prevName);
  renderApostasTable(b.apostas);
  renderBolaoStats(b);
  renderParticipantQuotaBox();
  await buildSlipsPreview();
}

function renderApostasTable(apostas, confMap = null) {
  $('#apostas-tbody').innerHTML = apostas
    .map((a, idx) => {
      const conf = confMap ? confMap.get(a.id) : null;
      const hitsSet = conf ? new Set(conf.acertos) : null;
      const acertosTxt = conf ? `<b>${conf.qtd_acertos}</b> ${conf.faixa ? '<span class="badge">' + conf.faixa + '</span>' : ''}` : '-';
      return `<tr class="${a.duplicada_no_bolao ? 'dup-row' : ''}">
        <td>${idx + 1}</td>
        <td>${a.participante_nome}${a.duplicada_no_bolao ? ' <span class="badge">DUPLICADA</span>' : ''}</td>
        <td>${a.tipo_aposta} dez.</td>
        <td>${ballsHtml(a.dezenas, hitsSet)}</td>
        <td>${acertosTxt}</td>
        <td><span class="muted">${a.origem}</span></td>
        <td><button class="btn btn-sm btn-danger" onclick="removeAposta(${a.id})">x</button></td>
      </tr>`;
    })
    .join('');
}

window.updatePartCotas = async (id, cotas) => {
  if (cotas < 1) return;
  await api(`/api/participantes/${id}`, { method: 'PUT', body: JSON.stringify({ cotas }) });
  await selectBolao(state.currentBolao.id);
};

$('#btn-mobile-modal').addEventListener('click', openMobileModal);
$('#btn-close-mobile-modal').addEventListener('click', closeMobileModal);
$('#mobile-modal').addEventListener('click', (e) => {
  if (e.target.id === 'mobile-modal') closeMobileModal();
});
$('#btn-copy-tunnel').addEventListener('click', () => copyToClipboard('#tunnel-url-input', 'Link da Internet copiado para o WhatsApp!'));
$('#btn-copy-local').addEventListener('click', () => copyToClipboard('#local-url-input', 'Link do Wi-Fi Local copiado!'));

window.togglePago = async (id, pago) => {
  await api(`/api/participantes/${id}`, { method: 'PUT', body: JSON.stringify({ pago: Boolean(pago) }) });
  await selectBolao(state.currentBolao.id);
};

window.removeParticipante = async (id) => {
  if (!confirm('Excluir participante e todos os jogos dele neste bolão?')) return;
  await api(`/api/participantes/${id}`, { method: 'DELETE' });
  await selectBolao(state.currentBolao.id);
};

window.removeAposta = async (id) => {
  await api(`/api/apostas/${id}`, { method: 'DELETE' });
  await selectBolao(state.currentBolao.id);
};

function getSelectedParticipantName() {
  const manualName = ($('#aposta-novo-nome').value || '').trim();
  const selectedName = $('#aposta-part-select').value || '';
  return manualName || selectedName || null;
}

function getParticipantStats(name) {
  if (!state.currentBolao) return null;
  const clean = (name || '').trim().toUpperCase();
  const bolao = state.currentBolao;
  const jogosPorCota = Number(bolao.jogos_por_cota || 4);
  if (!clean) {
    return {
      nome: '',
      cotas: 1,
      maxJogos: jogosPorCota,
      totalJogos: 0,
      restantes: jogosPorCota,
      proximoJogoIndex: 1,
      isComplete: false,
      jogos: [],
      hasParticipant: false,
    };
  }
  const part = (bolao.participantes || []).find((p) => (p.nome || '').toUpperCase() === clean);
  const cotas = part ? Number(part.cotas || 1) : 1;
  const maxJogos = cotas * jogosPorCota;
  const jogosDoParticipante = (bolao.apostas || [])
    .filter((a) => (a.participante_nome || '').toUpperCase() === clean)
    .sort((a, b) => a.id - b.id);
  const totalJogos = jogosDoParticipante.length;
  const restantes = Math.max(0, maxJogos - totalJogos);
  const proximoJogoIndex = Math.min(maxJogos, totalJogos + 1);
  return {
    nome: clean,
    partId: part ? part.id : null,
    cotas,
    maxJogos,
    totalJogos,
    restantes,
    proximoJogoIndex,
    isComplete: totalJogos >= maxJogos,
    jogos: jogosDoParticipante,
    hasParticipant: true,
  };
}

function updateAutoApostaButtonLabel() {
  const btn = $('#btn-auto-aposta');
  if (!btn) return;
  const pName = getSelectedParticipantName();
  const st = getParticipantStats(pName);
  const limit = state.currentBolao ? Number(state.currentBolao.dezenas_por_jogo || 6) : 6;
  const cnt = state.bolaoPickerSelected ? state.bolaoPickerSelected.size : 0;

  if (st && st.isComplete) {
    btn.disabled = true;
    btn.textContent = `✓ Cota Completa (${st.maxJogos}/${st.maxJogos})`;
    btn.title = `${st.nome} já completou todos os jogos da cota.`;
    return;
  }

  btn.disabled = false;
  if (cnt === 0) {
    btn.textContent = `🎲 Sortear 1 Aposta (${limit} dezenas)`;
    btn.title = `Sortear jogo inteiro de ${limit} dezenas usando a Regra Recomendada Oficial`;
  } else if (cnt < limit) {
    const restam = limit - cnt;
    btn.textContent = `🎲 Completar Aposta (Sortear +${restam} ${restam === 1 ? 'dezena' : 'dezenas'})`;
    btn.title = `Manter as ${cnt} dezenas selecionadas e sortear mais ${restam} pela Regra Recomendada`;
  } else if (cnt === limit) {
    btn.textContent = `✓ Aposta Completa (${limit}/${limit} dez.)`;
    btn.title = `As ${limit} dezenas já foram preenchidas. Clique em "Salvar Aposta".`;
  } else {
    btn.textContent = `⚠️ Excesso (${cnt}/${limit} dez.)`;
    btn.title = `Remova ${cnt - limit} dezena(s) antes de salvar.`;
  }
}

function updateActionButtonsState(st) {
  const btnAdd = $('#btn-add-aposta');
  const btnDirect = $('#btn-sortear-direto');
  const defaultMeta = state.currentBolao ? Number(state.currentBolao.jogos_por_cota || 4) : 4;

  if (!st || !st.hasParticipant) {
    if (btnAdd) {
      btnAdd.disabled = false;
      btnAdd.textContent = 'Salvar Aposta';
      btnAdd.title = '';
    }
    if (btnDirect) {
      btnDirect.disabled = false;
      btnDirect.textContent = `⚡ Sortear ${defaultMeta} Jogos Inteiros (Regra Recomendada)`;
      btnDirect.title = 'Selecione um participante para sortear seus jogos';
    }
    updateAutoApostaButtonLabel();
    return;
  }

  if (st.isComplete) {
    if (btnAdd) {
      btnAdd.disabled = true;
      btnAdd.textContent = `Cota Completa (${st.maxJogos}/${st.maxJogos})`;
      btnAdd.title = `${st.nome} já atingiu a cota máxima de ${st.maxJogos} jogos.`;
    }
    if (btnDirect) {
      btnDirect.disabled = true;
      btnDirect.textContent = `✓ Cota Completa (${st.maxJogos}/${st.maxJogos} jogos)`;
      btnDirect.title = `${st.nome} já completou todos os jogos da sua cota.`;
    }
  } else {
    if (btnAdd) {
      btnAdd.disabled = false;
      btnAdd.textContent = `Salvar Jogo ${st.proximoJogoIndex} de ${st.maxJogos}`;
      btnAdd.title = `Salvar o jogo ${st.proximoJogoIndex} para ${st.nome}`;
    }
    if (btnDirect) {
      btnDirect.disabled = false;
      if (st.totalJogos === 0) {
        btnDirect.textContent = `⚡ Sortear ${st.maxJogos} Jogos Inteiros para ${st.nome}`;
        btnDirect.title = `Sortear todos os ${st.maxJogos} jogos inteiros para ${st.nome} pela Regra Recomendada`;
      } else {
        btnDirect.textContent = `⚡ Completar Cota: Sortear +${st.restantes} ${st.restantes === 1 ? 'Jogo' : 'Jogos'} para ${st.nome}`;
        btnDirect.title = `Sortear os ${st.restantes} jogos restantes para atingir a meta de ${st.maxJogos} jogos de ${st.nome}`;
      }
    }
  }
  updateAutoApostaButtonLabel();
}

function renderParticipantQuotaBox() {
  const box = $('#part-quota-box');
  if (!box) return;
  const pName = getSelectedParticipantName();
  const st = getParticipantStats(pName);
  if (!st || !st.hasParticipant) {
    const defaultMeta = state.currentBolao ? Number(state.currentBolao.jogos_por_cota || 4) : 4;
    box.className = 'part-quota-box';
    box.innerHTML = `
      <div class="part-quota-header">
        <span class="part-quota-title">
          <span>Acompanhamento da Cota</span>
          <span class="muted" style="font-weight:normal">Selecione ou digite o participante acima</span>
        </span>
        <span class="part-quota-badge empty">Meta: ${defaultMeta} jogos / participante</span>
      </div>
    `;
    updateActionButtonsState(null);
    return;
  }

  const isComplete = st.isComplete;
  box.className = `part-quota-box ${isComplete ? 'complete' : ''}`;

  let headerHtml = '';
  if (isComplete) {
    headerHtml = `
      <span class="part-quota-title" style="color:#4ade80">
        <span>✓ Cota Completa: <b>${st.nome}</b></span>
      </span>
      <span class="part-quota-badge complete">✓ ${st.totalJogos} de ${st.maxJogos} jogos cadastrados</span>
    `;
  } else {
    headerHtml = `
      <span class="part-quota-title">
        <span>Participante: <b>${st.nome}</b></span>
        <span class="part-quota-badge active">Preenchendo Jogo ${st.proximoJogoIndex} de ${st.maxJogos}</span>
      </span>
      <span class="part-quota-badge empty">${st.totalJogos} de ${st.maxJogos} salvos (Faltam ${st.restantes})</span>
    `;
  }

  const pills = [];
  for (let i = 1; i <= st.maxJogos; i++) {
    const apostaExistente = st.jogos[i - 1];
    if (apostaExistente) {
      const dezenasStr = apostaExistente.dezenas.map((x) => String(x).padStart(2, '0')).join(' ');
      pills.push(`
        <div class="part-step-pill done" title="Jogo ${i}: ${dezenasStr}">
          <div class="step-head"><span>Jogo ${i}/${st.maxJogos}</span><span>✓</span></div>
          <div class="step-nums">${dezenasStr}</div>
        </div>
      `);
    } else if (i === st.proximoJogoIndex) {
      const curNums = Array.from(state.bolaoPickerSelected || []).sort((a, b) => a - b);
      const curTxt = curNums.length ? curNums.map((x) => String(x).padStart(2, '0')).join(' ') : 'Preenchendo agora...';
      pills.push(`
        <div class="part-step-pill current" title="Em preenchimento atual">
          <div class="step-head"><span>Jogo ${i}/${st.maxJogos}</span><span>✎ Atual</span></div>
          <div class="step-nums" id="step-preview-nums">${curTxt}</div>
        </div>
      `);
    } else {
      pills.push(`
        <div class="part-step-pill pending">
          <div class="step-head"><span>Jogo ${i}/${st.maxJogos}</span><span>○</span></div>
          <div class="step-nums">Pendente</div>
        </div>
      `);
    }
  }

  box.innerHTML = `
    <div class="part-quota-header">${headerHtml}</div>
    <div class="part-steps-row">${pills.join('')}</div>
  `;

  updateActionButtonsState(st);
}

function getGeneratorRules() {
  return {
    apply_filters: true,
    parity_mode: 'balanced',
    sum_min: 140,
    sum_max: 225,
    max_per_col: 1,
    max_per_quadrant: 2,
    min_above_31: 2,
  };
}

async function saveBolaoAposta() {
  if (!state.currentBolao) {
    const msg = 'Crie ou selecione um bolão acima antes de salvar apostas.';
    setFeedback('#aposta-feedback', msg, true);
    return toast(msg, true);
  }
  const limit = Number(state.currentBolao.dezenas_por_jogo || 6);
  const nums = parseNumsList($('#aposta-text').value);
  const uniqueNums = Array.from(new Set(nums));
  if (uniqueNums.length !== nums.length) {
    const msg = 'Existem dezenas repetidas na aposta.';
    setFeedback('#aposta-feedback', msg, true);
    return toast(msg, true);
  }
  if (nums.length !== limit) {
    const msg = `Este bolão permite exatamente ${limit} dezenas por jogo (você informou ${nums.length}).`;
    setFeedback('#aposta-feedback', msg, true);
    return toast(msg, true);
  }

  const participanteNome = getSelectedParticipantName();
  if (!participanteNome) {
    const msg = 'Selecione um nome na lista suspensa ou digite um novo nome manualmente.';
    setFeedback('#aposta-feedback', msg, true);
    return toast(msg, true);
  }

  const pStats = getParticipantStats(participanteNome);
  if (pStats && pStats.isComplete) {
    const msg = `Limite atingido: ${participanteNome.toUpperCase()} já completou sua cota de ${pStats.maxJogos} jogos neste bolão.`;
    setFeedback('#aposta-feedback', msg, true);
    return toast(msg, true);
  }

  const sig = nums.slice().sort((a, b) => a - b).map((n) => String(n).padStart(2, '0')).join('-');
  const exists = (state.currentBolao.apostas || []).some((a) => a.assinatura === sig);
  if (exists) {
    const msg = `Jogo já cadastrado neste bolão: ${sig}. Jogos duplicados não são permitidos.`;
    setFeedback('#aposta-feedback', msg, true);
    return toast(msg, true);
  }

  const btn = $('#btn-add-aposta');
  btn.disabled = true;
  try {
    const saved = await api(`/api/boloes/${state.currentBolao.id}/apostas`, {
      method: 'POST',
      body: JSON.stringify({ participante_nome: participanteNome, dezenas: nums, origem: 'manual', allow_duplicate: false }),
    });
    $('#aposta-text').value = '';
    $('#aposta-novo-nome').value = '';
    state.bolaoPickerSelected.clear();
    $$('#bolao-volante-picker .cell').forEach((c) => c.classList.remove('selected'));
    updateApostaLimitBadge();
    await loadNomesCatalogo();
    await selectBolao(state.currentBolao.id);
    $('#aposta-part-select').value = participanteNome.toUpperCase();
    renderParticipantQuotaBox();
    const curIdx = pStats ? pStats.proximoJogoIndex : 1;
    const maxIdx = pStats ? pStats.maxJogos : limit;
    const msg = `Jogo ${curIdx} de ${maxIdx} (${saved.assinatura}) salvo para ${participanteNome.toUpperCase()}!`;
    setFeedback('#aposta-feedback', msg);
    toast(msg);
  } catch (err) {
    setFeedback('#aposta-feedback', err.message, true);
    toast(err.message, true);
  } finally {
    btn.disabled = false;
  }
}

// ===== IMPRESSÃO ÓPTICA =====
async function loadProfiles() {
  const data = await api('/api/printer/profiles');
  state.profiles = data.profiles;
  const sel = $('#print-profile-select');
  if (sel) {
    sel.innerHTML = data.profiles.map((p) => `<option value="${p.id}">${p.nome}</option>`).join('');
  }
  if (data.profiles.length) applyProfileToForm(data.profiles[0]);
}

function applyProfileToForm(p) {
  state.currentProfile = p;
  $('#cal-offset-x').value = p.offset_x_mm;
  $('#cal-offset-y').value = p.offset_y_mm;
  $('#cal-col-step').value = p.col_step_mm;
  $('#cal-row-step').value = p.row_step_mm;
  $('#cal-mark-w').value = p.mark_w_mm;
  $('#cal-mark-h').value = p.mark_h_mm;
  $('#cal-g2').value = p.game_offsets[1] ?? 41.5;
  $('#cal-g3').value = p.game_offsets[2] ?? 83.0;
  $('#cal-qty-y').value = p.qty_offset_y_mm;
  $('#cal-qty-x').value = p.qty_start_x_mm;
  $('#cal-qty-step').value = p.qty_step_x_mm;
  $('#cal-size').value = `${p.volante_w_mm}x${p.volante_h_mm}`;
}

function readCalibratedProfile() {
  const base = state.currentProfile || state.profiles[0];
  const [vw, vh] = ($('#cal-size').value || '83x185').split('x').map(Number);
  return {
    ...base,
    offset_x_mm: Number($('#cal-offset-x').value),
    offset_y_mm: Number($('#cal-offset-y').value),
    col_step_mm: Number($('#cal-col-step').value),
    row_step_mm: Number($('#cal-row-step').value),
    mark_w_mm: Number($('#cal-mark-w').value),
    mark_h_mm: Number($('#cal-mark-h').value),
    game_offsets: [0.0, Number($('#cal-g2').value), Number($('#cal-g3').value)],
    qty_offset_y_mm: Number($('#cal-qty-y').value),
    qty_start_x_mm: Number($('#cal-qty-x').value),
    qty_step_x_mm: Number($('#cal-qty-step').value),
    volante_w_mm: vw || 83,
    volante_h_mm: vh || 185,
  };
}

function escSvg(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function fitLabel(s, maxLen) {
  const txt = String(s || '').trim();
  return txt.length > maxLen ? txt.slice(0, maxLen - 1) + '…' : txt;
}

function renderSlipSvg(volante, p, marksOnly, showTeimosinha, calibrationMode = false) {
  const w = p.volante_w_mm;
  const h = p.volante_h_mm;
  const maxTextW = Math.max(20, w - p.offset_x_mm - 2.5);
  const elements = [];

  if (!marksOnly || calibrationMode) {
    elements.push(`<rect x="0.2" y="0.2" width="${w - 0.4}" height="${h - 0.4}" fill="none" stroke="#94a3b8" stroke-dasharray="2,2" stroke-width="0.3" />`);
    elements.push(`<text x="4" y="8" font-size="2.7" font-weight="700" font-family="sans-serif" fill="#334155">MEGA-SENA · VOLANTE #${volante.volante_num} (${volante.tipo_aposta} DEZ.)</text>`);
  }

  (volante.jogos || []).forEach((jogo, gIdx) => {
    const gy = p.offset_y_mm + (p.game_offsets[gIdx] || gIdx * 41.5);
    if (!marksOnly || calibrationMode) {
      const nome = escSvg(fitLabel(jogo.participante || 'Bolão', 30));
      const numsTxt = jogo.dezenas.map((d) => String(d).padStart(2, '0')).join(' ');
      const numsFont = jogo.dezenas.length > 12 ? 1.55 : 1.95;
      elements.push(`<text x="${p.offset_x_mm}" y="${gy - 4.0}" font-size="2.0" font-weight="700" font-family="sans-serif" fill="#1e293b">J${gIdx + 1}: ${nome}</text>`);
      elements.push(`<text x="${p.offset_x_mm}" y="${gy - 1.5}" font-size="${numsFont}" font-family="monospace" fill="#475569" textLength="${Math.min(maxTextW, numsTxt.length * numsFont * 0.62).toFixed(1)}" lengthAdjust="spacingAndGlyphs">${numsTxt}</text>`);
      for (let n = 1; n <= 60; n++) {
        const r = Math.floor((n - 1) / 10);
        const c = (n - 1) % 10;
        const x = p.offset_x_mm + c * p.col_step_mm;
        const y = gy + r * p.row_step_mm;
        elements.push(`<rect x="${x}" y="${y}" width="${p.mark_w_mm}" height="${p.mark_h_mm}" fill="none" stroke="#cbd5e1" stroke-width="0.2" />`);
        elements.push(`<text x="${x + p.mark_w_mm / 2}" y="${y + p.mark_h_mm - 0.6}" text-anchor="middle" font-size="1.9" fill="#94a3b8">${String(n).padStart(2, '0')}</text>`);
      }
    }

    jogo.dezenas.forEach((n) => {
      const r = Math.floor((n - 1) / 10);
      const c = (n - 1) % 10;
      const x = p.offset_x_mm + c * p.col_step_mm;
      const y = gy + r * p.row_step_mm;
      elements.push(`<rect x="${x}" y="${y}" width="${p.mark_w_mm}" height="${p.mark_h_mm}" fill="#000000" />`);
    });
  });

  const qtyIdx = Math.max(0, volante.tipo_aposta - 6);
  const qx = p.qty_start_x_mm + qtyIdx * p.qty_step_x_mm;
  const qy = p.qty_offset_y_mm;
  if (!marksOnly || calibrationMode) {
    elements.push(`<text x="${p.qty_start_x_mm}" y="${qy - 1.8}" font-size="2.1" font-family="sans-serif" fill="#475569">QTD DEZENAS (${volante.tipo_aposta})</text>`);
    for (let k = 6; k <= 20; k++) {
      const kx = p.qty_start_x_mm + (k - 6) * p.qty_step_x_mm;
      elements.push(`<rect x="${kx}" y="${qy}" width="${p.mark_w_mm}" height="${p.mark_h_mm}" fill="none" stroke="#cbd5e1" stroke-width="0.2" />`);
      elements.push(`<text x="${kx + p.mark_w_mm / 2}" y="${qy + p.mark_h_mm - 0.5}" text-anchor="middle" font-size="1.8" fill="#94a3b8">${k}</text>`);
    }
  }
  elements.push(`<rect x="${qx}" y="${qy}" width="${p.mark_w_mm}" height="${p.mark_h_mm}" fill="#000000" />`);

  if (showTeimosinha && p.teimosinha_pos) {
    elements.push(`<rect x="${p.teimosinha_pos.x}" y="${p.teimosinha_pos.y}" width="${p.mark_w_mm}" height="${p.mark_h_mm}" fill="#000000" />`);
  }

  return `<svg width="${w}mm" height="${h}mm" viewBox="0 0 ${w} ${h}" overflow="hidden" xmlns="http://www.w3.org/2000/svg">${elements.join('')}</svg>`;
}

async function buildSlipsPreview() {
  if (!state.currentBolao || !state.profiles.length) return;
  const tipoEl = $('#print-tipo-aposta');
  const tipo = tipoEl && tipoEl.value ? Number(tipoEl.value) : (state.currentBolao ? state.currentBolao.dezenas_por_jogo : 6);
  const perSlipEl = $('#print-per-slip');
  const perSlip = perSlipEl ? Number(perSlipEl.value || 3) : 3;

  try {
    const res = await api('/api/printer/build-slips', {
      method: 'POST',
      body: JSON.stringify({ tipo_aposta: tipo, jogos_por_volante: perSlip, bolao_id: state.currentBolao.id }),
    });
    state.slipsPayload = res;
    $('#slips-summary').textContent = `${res.total_jogos} jogos em ${res.total_volantes} volantes`;
    const p = readCalibratedProfile();
    const marksOnlyEl = $('#print-marks-only');
    const marksOnly = marksOnlyEl ? marksOnlyEl.checked : false;
    const teimEl = $('#print-teimosinha');
    const teim = teimEl ? teimEl.checked : false;

    $('#slips-preview').innerHTML = res.volantes.slice(0, 12).map((v) =>
      `<div class="slip-card" style="width:${p.volante_w_mm}mm;height:${p.volante_h_mm}mm">${renderSlipSvg(v, p, marksOnly, teim, true)}</div>`
    ).join('') || '<p class="muted">Nenhum jogo cadastrado neste bolão para imprimir.</p>';
  } catch (err) {
    toast(err.message, true);
  }
}

function printSlips(calibrationTest = false) {
  const p = readCalibratedProfile();
  const teimEl = $('#print-teimosinha');
  const teim = teimEl ? teimEl.checked : false;

  // Imprime no formato A4 Paisagem para acomodar o máximo de volantes (3 volantes / 9 jogos por folha) no tamanho real óptico (83x185mm)
  $('#dynamic-page-style').textContent = '@page { size: A4 landscape; margin: 0; }';

  let volantes = state.slipsPayload ? state.slipsPayload.volantes : [];
  if (calibrationTest) {
    volantes = [{
      volante_num: 'TESTE',
      tipo_aposta: state.currentBolao ? state.currentBolao.dezenas_por_jogo : 6,
      jogos: [
        { dezenas: [1, 10, 25, 36, 51, 60], participante: 'CALIBRACAO 1' },
        { dezenas: [1, 10, 25, 36, 51, 60], participante: 'CALIBRACAO 2' },
        { dezenas: [1, 10, 25, 36, 51, 60], participante: 'CALIBRACAO 3' },
      ],
    }];
  }
  if (!volantes.length) return toast('Sem volantes para imprimir.', true);

  const area = $('#print-area');
  const pages = [];
  // Agrupa de 3 em 3 volantes por folha A4 paisagem
  for (let i = 0; i < volantes.length; i += 3) {
    const trio = volantes.slice(i, i + 3);
    pages.push(`
      <div class="slip-page a4-landscape-page">
        <div class="a4-slips-trio">
          ${trio.map((v) => `<div class="slip-card-print">${renderSlipSvg(v, p, false, teim, calibrationTest)}</div>`).join('')}
        </div>
      </div>
    `);
  }
  area.innerHTML = pages.join('');
  window.print();
}


async function printConferenciaReportA4() {
  const b = state.currentBolao;
  if (!b) return toast('Selecione um bolão.', true);

  let res = state.lastConferencia;
  if (!res) {
    const raw = ($('#conf-concurso').value || '').trim();
    const nums = parseNumsList(raw);
    let qs = '';
    if (nums.length === 6) {
      qs = '?dezenas=' + nums.join(',');
    } else if (raw) {
      qs = '?concurso=' + encodeURIComponent(raw);
    }
    try {
      res = await api(`/api/boloes/${b.id}/conferir${qs}`);
      state.lastConferencia = res;
      const map = new Map(res.resultados.map((r) => [r.aposta_id, r]));
      renderApostasTable(b.apostas, map);
      $('#conferencia-result').innerHTML = `
        <span>Concurso <b>#${res.concurso}</b> (${res.data_apuracao})</span>
        <span>Sorteadas: ${ballsHtml(res.dezenas_sorteadas)}</span>
        <span>Sena: <b>${res.contagem_acertos[6]}</b> · Quina: <b>${res.contagem_acertos[5]}</b> · Quadra: <b>${res.contagem_acertos[4]}</b></span>
        <span>Prêmio Total Est.: <b>${money(res.premio_total_estimado)}</b> (${money(res.premio_por_cota)}/cota)</span>
      `;
    } catch (err) {
      return toast('Não foi possível obter resultado para conferência: ' + err.message, true);
    }
  }

  $('#dynamic-page-style').textContent = '@page { size: A4 portrait; margin: 8mm; }';
  const hitsMap = new Map((res.resultados || []).map((r) => [r.aposta_id, r]));

  const rows = b.apostas.map((a, idx) => {
    const conf = hitsMap.get(a.id);
    const qtdAcertos = conf ? conf.qtd_acertos : 0;
    const faixa = conf && conf.faixa ? conf.faixa : '';
    const hits = conf ? new Set(conf.acertos) : new Set();

    const balls = a.dezenas.map((n) => {
      const isHit = hits.has(n);
      const str = String(n).padStart(2, '0');
      if (isHit) {
        return `<span style="display:inline-block;padding:2px 5px;margin:1px;border-radius:4px;background:#15803d;color:#ffffff;font-weight:700;font-family:monospace;font-size:9.5pt;">${str}✓</span>`;
      } else {
        return `<span style="display:inline-block;padding:2px 5px;margin:1px;border-radius:4px;background:#f3f4f6;color:#6b7280;font-family:monospace;font-size:9.5pt;">${str}</span>`;
      }
    }).join(' ');

    const rowBg = qtdAcertos >= 4 ? 'background-color:#f0fdf4;' : (idx % 2 === 1 ? 'background-color:#fafafa;' : 'background-color:#ffffff;');
    const badgeFaixa = faixa ? `<span style="background:#15803d;color:#fff;padding:2px 6px;border-radius:99px;font-weight:700;font-size:8pt;margin-left:4px">${faixa}</span>` : '';

    return `
      <tr style="${rowBg}">
        <td style="text-align:center;font-weight:bold;width:35px;border:1px solid #e2e8f0;padding:5px">${idx + 1}</td>
        <td style="font-weight:bold;color:#111827;border:1px solid #e2e8f0;padding:5px">${a.participante_nome}</td>
        <td style="text-align:center;border:1px solid #e2e8f0;padding:5px">${balls}</td>
        <td style="text-align:center;font-weight:bold;font-size:10pt;color:${qtdAcertos >= 4 ? '#15803d' : '#111827'};border:1px solid #e2e8f0;padding:5px">${qtdAcertos} acerto${qtdAcertos !== 1 ? 's' : ''} ${badgeFaixa}</td>
      </tr>
    `;
  }).join('');

  const sorteadasHtml = (res.dezenas_sorteadas || []).map((n) =>
    `<span style="display:inline-block;width:28px;height:28px;line-height:28px;text-align:center;border-radius:50%;background:#15803d;color:#ffffff;font-weight:bold;font-size:11pt;margin:0 3px">${String(n).padStart(2, '0')}</span>`
  ).join('');

  $('#print-area').innerHTML = `
    <div style="font-family:system-ui,-apple-system,sans-serif;color:#111827;background:#ffffff;padding:0;max-width:100%">
      <div style="border-bottom:2px solid #0f172a;padding-bottom:8px;margin-bottom:12px;display:flex;justify-content:space-between;align-items:flex-end">
        <div>
          <h1 style="margin:0;font-size:16pt;color:#0f172a">${b.nome} — Relatório de Conferência</h1>
          <p style="margin:3px 0 0;font-size:9pt;color:#4b5563">Concurso Oficial Caixa: <b>#${res.concurso}</b> (${res.data_apuracao || 'Data Oficial'}) · Total de Jogos: <b>${b.apostas.length}</b></p>
        </div>
        <div style="text-align:right">
          <span style="font-size:8pt;color:#6b7280">Emitido em ${new Date().toLocaleDateString('pt-BR')} às ${new Date().toLocaleTimeString('pt-BR', {hour:'2-digit',minute:'2-digit'})}</span>
        </div>
      </div>

      <div style="background:#f8fafc;border:1px solid #cbd5e1;border-radius:6px;padding:8px 12px;margin-bottom:10px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px">
        <div>
          <div style="font-size:8pt;font-weight:bold;color:#475569;margin-bottom:4px;text-transform:uppercase">Dezenas Sorteadas na Caixa</div>
          <div>${sorteadasHtml}</div>
        </div>
        <div style="display:flex;gap:12px;align-items:center">
          <div style="text-align:center;padding:4px 8px;background:#ffffff;border:1px solid #cbd5e1;border-radius:4px">
            <div style="font-size:7.5pt;color:#64748b;font-weight:600">SENA (6)</div>
            <div style="font-size:11pt;font-weight:bold;color:${res.contagem_acertos[6] > 0 ? '#15803d' : '#0f172a'}">${res.contagem_acertos[6]}</div>
          </div>
          <div style="text-align:center;padding:4px 8px;background:#ffffff;border:1px solid #cbd5e1;border-radius:4px">
            <div style="font-size:7.5pt;color:#64748b;font-weight:600">QUINA (5)</div>
            <div style="font-size:11pt;font-weight:bold;color:${res.contagem_acertos[5] > 0 ? '#15803d' : '#0f172a'}">${res.contagem_acertos[5]}</div>
          </div>
          <div style="text-align:center;padding:4px 8px;background:#ffffff;border:1px solid #cbd5e1;border-radius:4px">
            <div style="font-size:7.5pt;color:#64748b;font-weight:600">QUADRA (4)</div>
            <div style="font-size:11pt;font-weight:bold;color:${res.contagem_acertos[4] > 0 ? '#15803d' : '#0f172a'}">${res.contagem_acertos[4]}</div>
          </div>
          <div style="text-align:right">
            <div style="font-size:7.5pt;color:#64748b">Prêmio Estimado</div>
            <div style="font-size:11pt;font-weight:bold;color:#15803d">${money(res.premio_total_estimado)}</div>
          </div>
        </div>
      </div>

      <div style="font-size:8pt;color:#475569;margin-bottom:6px;display:flex;gap:12px;align-items:center">
        <span><b>Legenda do Relatório:</b></span>
        <span><span style="display:inline-block;padding:1px 5px;border-radius:3px;background:#15803d;color:#fff;font-weight:bold;font-size:8pt">00✓</span> Acerto (Dezena Sorteada)</span>
        <span><span style="display:inline-block;padding:1px 5px;border-radius:3px;background:#f3f4f6;color:#6b7280;font-size:8pt">00</span> Erro (Não Sorteada)</span>
      </div>

      <table style="width:100%;border-collapse:collapse;font-size:9pt;border:1px solid #cbd5e1">
        <thead>
          <tr style="background:#f1f5f9;color:#334155;border-bottom:2px solid #cbd5e1">
            <th style="padding:6px;text-align:center;width:35px;border:1px solid #cbd5e1">#</th>
            <th style="padding:6px;text-align:left;border:1px solid #cbd5e1">Participante</th>
            <th style="padding:6px;text-align:center;border:1px solid #cbd5e1">Dezenas Marcadas no Jogo</th>
            <th style="padding:6px;text-align:center;width:130px;border:1px solid #cbd5e1">Acertos / Faixa</th>
          </tr>
        </thead>
        <tbody>
          ${rows}
        </tbody>
      </table>
    </div>
  `;
  window.print();
}


function printBolaoSummaryA4() {
  const b = state.currentBolao;
  if (!b) return toast('Selecione um bolão.', true);
  $('#dynamic-page-style').textContent = '@page { size: A4 portrait; margin: 10mm; }';
  const rows = b.apostas
    .map((a, i) => `<tr><td style="text-align:center;width:45px"><b>${i + 1}</b></td><td><b>${a.participante_nome}</b></td><td style="letter-spacing:1px;font-family:monospace;font-size:11pt">${a.dezenas.map((x)=>String(x).padStart(2,'0')).join(' · ')}</td></tr>`)
    .join('');
  $('#print-area').innerHTML = `
    <h2>${b.nome} — Relatório de Jogos do Bolão</h2>
    <p>Participantes: ${b.resumo.total_participantes} | Total de Jogos: ${b.resumo.total_apostas} | Custo Total: ${money(b.resumo.custo_total_apostas)} | Arrecadado: ${money(b.resumo.total_arrecadado)}</p>
    <table class="bolao-print-table">
      <thead><tr><th style="text-align:center;width:45px">#</th><th>Participante</th><th>Dezenas Marcadas / Sorteadas</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
  window.print();
}

// ===== EVENT LISTENERS =====
$('#btn-sync').addEventListener('click', triggerSync);
$('#bolao-select').addEventListener('change', (e) => selectBolao(Number(e.target.value)));

// Recalcula valor da cota automaticamente ao alterar jogos/cota ou valor do jogo
function recalcValorCotaInput() {
  const jc = Number($('#bolao-cfg-jogos-cota').value || 1);
  const vj = Number($('#bolao-cfg-valor-jogo').value || 0);
  $('#bolao-cfg-valor-cota').value = (jc * vj).toFixed(2);
}
$('#bolao-cfg-jogos-cota').addEventListener('input', recalcValorCotaInput);
$('#bolao-cfg-valor-jogo').addEventListener('input', recalcValorCotaInput);

$('#btn-delete-bolao').addEventListener('click', async () => {
  const b = state.currentBolao;
  if (!b) return toast('Selecione um bolão para excluir.', true);
  const totalJogos = (b.apostas || []).length;
  const totalParts = (b.participantes || []).length;
  const ok = confirm(
    `Confirmação para Excluir Bolão:\n\n` +
    `Tem certeza que deseja EXCLUIR o bolão "${b.nome}"?\n\n` +
    `Atenção: Esta ação é irreversível e excluirá todos os ${totalJogos} jogos e ${totalParts} participantes cadastrados nele.\n\n` +
    `Deseja prosseguir? (OK = Sim, Cancelar = Não)`
  );
  if (!ok) return;

  try {
    await api(`/api/boloes/${b.id}`, { method: 'DELETE' });
    toast(`Bolão "${b.nome}" excluído com sucesso.`);
    await loadBoloes();
  initRealtimeSync();
  } catch (err) {
    toast(`Erro ao excluir bolão: ${err.message}`, true);
  }
});

$('#btn-new-bolao').addEventListener('click', async () => {
  const nome = prompt('Nome do novo Bolão (ex: Mega da Virada 2026 - POTENZA):');
  if (!nome) return;
  const dezenasPorJogo = Math.max(6, Math.min(20, Number(prompt('Quantos números por jogo (6 a 20)?', '6') || 6)));
  const jogosPorCota = Math.max(1, Number(prompt('Quantos jogos por participante/cota?', '4') || 4));
  const valorJogo = Number((prompt('Valor por jogo (R$):', '6.00') || '6.00').replace(',', '.')) || 6.0;
  const b = await api('/api/boloes', {
    method: 'POST',
    body: JSON.stringify({
      nome,
      dezenas_por_jogo: dezenasPorJogo,
      jogos_por_cota: jogosPorCota,
      valor_jogo: valorJogo,
      valor_cota: valorJogo * jogosPorCota,
    }),
  });
  await loadBoloes(b.id);
  toast(`Bolão "${b.nome}" criado (${dezenasPorJogo} dez. · ${jogosPorCota} jogos/cota).`);
});

$('#btn-save-bolao-cfg').addEventListener('click', async () => {
  if (!state.currentBolao) return toast('Selecione um bolão.', true);
  const dez = Number($('#bolao-cfg-dezenas').value);
  const jc = Number($('#bolao-cfg-jogos-cota').value);
  if (dez < 6 || dez > 20) return toast('Números por jogo deve ser entre 6 e 20.', true);
  if (jc < 1) return toast('Jogos por cota deve ser pelo menos 1.', true);
  const vj = Number($('#bolao-cfg-valor-jogo').value || 6.0);
  const vc = Number($('#bolao-cfg-valor-cota').value || vj * jc);
  try {
    await api(`/api/boloes/${state.currentBolao.id}`, {
      method: 'PUT',
      body: JSON.stringify({ dezenas_por_jogo: dez, jogos_por_cota: jc, valor_jogo: vj, valor_cota: vc }),
    });
    state.bolaoPickerSelected.clear();
    $$('#bolao-volante-picker .cell').forEach((c) => c.classList.remove('selected'));
    $('#aposta-text').value = '';
    await selectBolao(state.currentBolao.id);
    toast(`Regras aplicadas: ${dez} dezenas/jogo · ${jc} jogos/cota.`);
  } catch (err) {
    toast(err.message, true);
  }
});

$('#aposta-text').addEventListener('input', () => {
  const limit = state.currentBolao ? Number(state.currentBolao.dezenas_por_jogo || 6) : 6;
  const nums = new Set(parseNumsList($('#aposta-text').value));
  state.bolaoPickerSelected = nums;
  $$('#bolao-volante-picker .cell').forEach((c) => c.classList.toggle('selected', nums.has(Number(c.dataset.n))));
  updateApostaLimitBadge();
  if (nums.size > limit) {
    setFeedback('#aposta-feedback', `Atenção: máximo permitido neste bolão é ${limit} dezenas (digitadas: ${nums.size}).`, true);
  } else {
    setFeedback('#aposta-feedback', '');
  }
});

$('#aposta-text').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    saveBolaoAposta();
  }
});

$('#btn-aposta-clear').addEventListener('click', () => {
  $('#aposta-text').value = '';
  state.bolaoPickerSelected.clear();
  $$('#bolao-volante-picker .cell').forEach((c) => c.classList.remove('selected'));
  updateApostaLimitBadge();
  setFeedback('#aposta-feedback', '');
});

$('#btn-add-aposta').addEventListener('click', saveBolaoAposta);

$('#aposta-part-select').addEventListener('change', () => {
  renderParticipantQuotaBox();
  updateApostaLimitBadge();
});
$('#aposta-novo-nome').addEventListener('input', () => {
  renderParticipantQuotaBox();
  updateApostaLimitBadge();
});

$('#btn-auto-aposta').addEventListener('click', async () => {
  if (!state.currentBolao) return toast('Selecione um bolão.', true);
  const pnome = getSelectedParticipantName();
  const st = getParticipantStats(pnome);
  if (st && st.isComplete) {
    const msg = `Limite atingido: ${st.nome} já completou a cota máxima de ${st.maxJogos} jogos.`;
    setFeedback('#aposta-feedback', msg, true);
    return toast(msg, true);
  }
  const limit = state.currentBolao ? Number(state.currentBolao.dezenas_por_jogo || 6) : 6;
  const currentNums = Array.from(state.bolaoPickerSelected || []).sort((a, b) => a - b);
  if (currentNums.length >= limit) {
    const msg = `O volante já possui todas as ${limit} dezenas preenchidas. Clique em "Salvar Aposta".`;
    setFeedback('#aposta-feedback', msg, true);
    return toast(msg, true);
  }

  const btn = $('#btn-auto-aposta');
  btn.disabled = true;
  btn.textContent = currentNums.length > 0 ? 'Completando dezenas...' : 'Sorteando aposta...';

  try {
    const res = await api('/api/gerador', {
      method: 'POST',
      body: JSON.stringify({
        bolao_id: state.currentBolao.id,
        quantidade: 1,
        dezenas_por_jogo: limit,
        estrategia: 'cobertura_bolao',
        fixed_numbers: currentNums,
        rules: getGeneratorRules(),
      }),
    });
    if (res.jogos && res.jogos.length) {
      const g = res.jogos[0];
      const nums = g.dezenas;
      state.bolaoPickerSelected = new Set(nums);
      $$('#bolao-volante-picker .cell').forEach((c) => c.classList.toggle('selected', state.bolaoPickerSelected.has(Number(c.dataset.n))));
      $('#aposta-text').value = nums.map((x) => String(x).padStart(2, '0')).join(' ');
      updateApostaLimitBadge();
      const extra = g.dezenas_zeradas_cobertas !== undefined
        ? ` (+${g.dezenas_zeradas_cobertas} dezenas zeradas e ${g.pares_ineditos} pares inéditos)`
        : '';
      const stepTxt = st && st.hasParticipant ? ` para o Jogo ${st.proximoJogoIndex} de ${st.maxJogos}` : '';
      const msgCompleto = currentNums.length > 0
        ? `Aposta completada (+${limit - currentNums.length} dezenas)${stepTxt}${extra} pela Regra Recomendada! Clique em "Salvar Aposta".`
        : `Aposta de ${limit} dezenas gerada${stepTxt}${extra} pela Regra Recomendada! Clique em "Salvar Aposta".`;
      setFeedback('#aposta-feedback', msgCompleto);
      toast(msgCompleto);
    }
  } catch (err) {
    setFeedback('#aposta-feedback', err.message, true);
    toast(err.message, true);
  } finally {
    updateAutoApostaButtonLabel();
  }
});

$('#btn-sortear-direto').addEventListener('click', async () => {
  if (!state.currentBolao) return toast('Selecione um bolão.', true);
  const pnome = getSelectedParticipantName();
  if (!pnome) {
    const msg = 'Selecione um participante (ou digite um novo nome) para sortear seus jogos.';
    setFeedback('#aposta-feedback', msg, true);
    return toast(msg, true);
  }
  const st = getParticipantStats(pnome);
  if (st && st.isComplete) {
    const msg = `Limite atingido: ${st.nome} já completou sua cota de ${st.maxJogos} jogos neste bolão.`;
    setFeedback('#aposta-feedback', msg, true);
    return toast(msg, true);
  }
  const qty = st ? st.restantes : Math.max(1, Number(state.currentBolao.jogos_por_cota || 4));
  if (qty <= 0) {
    const msg = `Limite atingido: ${st ? st.nome : pnome} já completou todos os jogos da sua cota.`;
    setFeedback('#aposta-feedback', msg, true);
    return toast(msg, true);
  }
  const btn = $('#btn-sortear-direto');
  btn.disabled = true;
  btn.textContent = `Sorteando ${qty} ${qty === 1 ? 'jogo' : 'jogos'}...`;
  try {
    const gen = await api('/api/gerador', {
      method: 'POST',
      body: JSON.stringify({
        bolao_id: state.currentBolao.id,
        quantidade: qty,
        dezenas_por_jogo: state.currentBolao.dezenas_por_jogo || 6,
        estrategia: 'cobertura_bolao',
        rules: getGeneratorRules(),
      }),
    });
    if (!gen.jogos || !gen.jogos.length) throw new Error('Nenhum jogo gerado pelas regras.');
    const saved = await api(`/api/boloes/${state.currentBolao.id}/apostas`, {
      method: 'POST',
      body: JSON.stringify({
        participante_nome: pnome,
        jogos: gen.jogos.map((g) => g.dezenas),
        origem: 'sorteio_regras',
      }),
    });
    $('#aposta-novo-nome').value = '';
    await loadNomesCatalogo();
    await selectBolao(state.currentBolao.id);
    $('#aposta-part-select').value = pnome.toUpperCase();
    renderParticipantQuotaBox();
    const metaTxt = st ? st.maxJogos : qty;
    const msg = `${saved.inseridas} jogos sorteados para completar a cota de ${pnome.toUpperCase()} (${metaTxt}/${metaTxt})!`;
    setFeedback('#aposta-feedback', msg);
    toast(msg);
  } catch (err) {
    setFeedback('#aposta-feedback', err.message, true);
    toast(err.message, true);
  } finally {
    renderParticipantQuotaBox();
  }
});

$('#btn-conferir').addEventListener('click', async () => {
  if (!state.currentBolao) return;
  const raw = ($('#conf-concurso').value || '').trim();
  const nums = parseNumsList(raw);
  let qs = '';
  if (nums.length === 6) {
    qs = '?dezenas=' + nums.join(',');
  } else if (raw) {
    qs = '?concurso=' + encodeURIComponent(raw);
  }
  try {
    const res = await api(`/api/boloes/${state.currentBolao.id}/conferir${qs}`);
    state.lastConferencia = res;
    const map = new Map(res.resultados.map((r) => [r.aposta_id, r]));
    renderApostasTable(state.currentBolao.apostas, map);
    $('#conferencia-result').innerHTML = `
      <span>Concurso <b>#${res.concurso}</b> (${res.data_apuracao})</span>
      <span>Sorteadas: ${ballsHtml(res.dezenas_sorteadas)}</span>
      <span>Sena: <b>${res.contagem_acertos[6]}</b> · Quina: <b>${res.contagem_acertos[5]}</b> · Quadra: <b>${res.contagem_acertos[4]}</b></span>
      <span>Prêmio Total Est.: <b>${money(res.premio_total_estimado)}</b> (${money(res.premio_por_cota)}/cota)</span>
    `;
  } catch (err) {
    toast(err.message, true);
  }
});

$('#btn-print-bolao-list').addEventListener('click', printBolaoSummaryA4);

const printProfileSel = $('#print-profile-select');
if (printProfileSel) {
  printProfileSel.addEventListener('change', (e) => {
    const found = state.profiles.find((p) => String(p.id) === e.target.value);
    if (found) {
      applyProfileToForm(found);
      buildSlipsPreview();
    }
  });
}

const btnSaveProf = $('#btn-save-profile');
if (btnSaveProf) {
  btnSaveProf.addEventListener('click', async () => {
    const p = readCalibratedProfile();
    const saved = await api('/api/printer/profiles', { method: 'POST', body: JSON.stringify(p) });
    toast(`Calibração "${saved.nome}" salva.`);
    await loadProfiles();
    if ($('#print-profile-select')) $('#print-profile-select').value = String(saved.id);
    buildSlipsPreview();
  });
}

$('#btn-print-conferencia').addEventListener('click', printConferenciaReportA4);
$('#btn-build-slips').addEventListener('click', buildSlipsPreview);
$('#btn-print-test').addEventListener('click', () => printSlips(true));
$('#btn-print-slips').addEventListener('click', () => printSlips(false));
['#print-tipo-aposta', '#print-per-slip', '#print-marks-only', '#print-teimosinha'].forEach((id) => {
  const el = $(id);
  if (el) el.addEventListener('change', buildSlipsPreview);
});


// ===== SINCRONIZAÇÃO EM TEMPO REAL (DESKTOP <-> CELULAR) =====
state.lastRevision = 0;
state.isRefreshingSilently = false;

async function refreshCurrentBolaoSilently() {
  if (!state.currentBolao || state.isRefreshingSilently) return;
  state.isRefreshingSilently = true;
  try {
    const prevName = $('#aposta-part-select') ? $('#aposta-part-select').value : '';
    const b = await api(`/api/boloes/${state.currentBolao.id}`);
    state.currentBolao = b;
    const r = b.resumo;
    const jogosPorCota = Number(b.jogos_por_cota || 4);

    $('#bolao-kpis').innerHTML = `
      <div class="kpi"><div class="label">Participantes com Jogo (Pagos)</div><div class="value">${r.participantes_pagos} / ${r.total_participantes}</div></div>
      <div class="kpi"><div class="label">Jogos (${r.jogos_duplicados} dup.)</div><div class="value">${r.total_apostas}</div></div>
      <div class="kpi"><div class="label">Custo Total Jogos</div><div class="value">${money(r.custo_total_apostas)}</div></div>
      <div class="kpi"><div class="label">Arrecadado / Faltante</div><div class="value">${money(r.total_arrecadado)} <small style="font-size:12px;color:var(--muted)">/ -${money(r.saldo_faltante)}</small></div></div>
    `;

    $('#part-tbody').innerHTML = b.participantes.length
      ? b.participantes
          .map(
            (p) => `<tr>
              <td><b>${p.nome}</b></td>
              <td>
                <div class="cotas-control">
                  <button class="btn btn-sm btn-ghost" onclick="updatePartCotas(${p.id}, ${p.cotas - 1})" ${p.cotas <= 1 ? 'disabled' : ''} title="Diminuir cota">-</button>
                  <b>${p.cotas}</b>
                  <button class="btn btn-sm btn-ghost" onclick="updatePartCotas(${p.id}, ${p.cotas + 1})" title="Aumentar cota">+</button>
                </div>
              </td>
              <td><b>${p.total_jogos}</b> / ${p.cotas * jogosPorCota}</td>
              <td>
                <button class="btn-pago-toggle ${p.pago ? 'pago' : 'pendente'}" onclick="togglePago(${p.id}, ${p.pago ? 0 : 1})" title="${p.pago ? 'Clique para voltar para Pendente' : 'Clique para marcar como Pago'}">
                  ${p.pago ? 'PAGO' : 'PENDENTE'}
                </button>
              </td>
              <td>${money(p.pago ? p.valor_pago : p.cotas * b.valor_cota)}</td>
              <td><button class="btn btn-sm btn-danger" onclick="removeParticipante(${p.id})">x</button></td>
            </tr>`
          )
          .join('')
      : '<tr><td colspan="6" class="muted">Nenhum participante nesta lista ainda. Ele entra automaticamente ao registrar sua aposta.</td></tr>';

    renderPartDropdown(b, prevName);
    renderApostasTable(b.apostas);
    renderBolaoStats(b);
    renderParticipantQuotaBox();
    await buildSlipsPreview();

    const pill = $('#realtime-status-pill');
    if (pill) {
      pill.textContent = '🟢 Sincronizado agora';
      pill.style.background = '#047857';
      setTimeout(() => {
        pill.textContent = '🟢 Tempo Real Ativo';
        pill.style.background = '#064e3b';
      }, 2000);
    }
  } catch (err) {
    console.warn('Silent refresh error:', err);
  } finally {
    state.isRefreshingSilently = false;
  }
}

function initRealtimeSync() {
  let sse = null;
  function connectSSE() {
    try {
      const streamUrl = (window.location.protocol === 'file:') ? `${API_BASE}/api/realtime/stream` : '/api/realtime/stream';
      sse = new EventSource(streamUrl);
      sse.onmessage = (e) => {
        try {
          const data = JSON.parse(e.data);
          if (data.revision && data.revision > state.lastRevision) {
            state.lastRevision = data.revision;
            refreshCurrentBolaoSilently();
          }
        } catch (err) {}
      };
      sse.onerror = () => {
        if (sse) sse.close();
        setTimeout(connectSSE, 4000);
      };
    } catch (err) {
      setTimeout(connectSSE, 4000);
    }
  }
  connectSSE();

  // Heartbeat fallback a cada 2.5s para conexões mobile
  setInterval(async () => {
    try {
      const v = await api('/api/realtime/version');
      if (v && v.revision > state.lastRevision) {
        state.lastRevision = v.revision;
        refreshCurrentBolaoSilently();
      }
    } catch (err) {}
  }, 2500);

  // Ao alternar para a aba do navegador no celular, sincroniza imediatamente
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      api('/api/realtime/version').then((v) => {
        if (v && v.revision > state.lastRevision) {
          state.lastRevision = v.revision;
          refreshCurrentBolaoSilently();
        }
      }).catch(() => {});
    }
  });
}

// ===== MODAL DE ACESSO PELO CELULAR & INTERNET =====
async function openMobileModal() {
  const modal = $('#mobile-modal');
  if (!modal) return;
  modal.style.display = 'flex';

  try {
    const net = await api('/api/network/info');
    const localUrl = net.local_url;
    $('#local-url-input').value = localUrl;
    $('#qr-local-img').src = `https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${encodeURIComponent(localUrl)}`;

    if (net.tunnel_url) {
      $('#tunnel-url-input').value = net.tunnel_url;
      $('#qr-tunnel-img').src = `https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${encodeURIComponent(net.tunnel_url)}`;
    } else {
      $('#tunnel-url-input').value = 'Gerando link público na internet...';
      const pollTunnel = setInterval(async () => {
        const update = await api('/api/network/info');
        if (update.tunnel_url) {
          clearInterval(pollTunnel);
          $('#tunnel-url-input').value = update.tunnel_url;
          $('#qr-tunnel-img').src = `https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${encodeURIComponent(update.tunnel_url)}`;
        }
      }, 1500);
    }
  } catch (err) {
    toast('Erro ao obter informações de rede: ' + err.message, true);
  }
}

function closeMobileModal() {
  const modal = $('#mobile-modal');
  if (modal) modal.style.display = 'none';
}

function copyToClipboard(inputSelector, successMsg) {
  const el = $(inputSelector);
  if (!el || !el.value) return;
  navigator.clipboard.writeText(el.value).then(() => {
    toast(successMsg);
  }).catch(() => {
    el.select();
    document.execCommand('copy');
    toast(successMsg);
  });
}


(async function initApp() {
  initPicker();
  await Promise.all([loadSyncStatus(), loadNomesCatalogo(), loadProfiles()]);
  await loadBoloes();
  initRealtimeSync();
})();
