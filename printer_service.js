// -*- coding: utf-8 -*-
/**
 * Mega-Sena Potenza — V. 2.19 (Nuvem 24h Padrão)
 * Serviço de Impressão Óptica dos Volantes Oficiais Caixa (83x185mm)
 * Cabeçalho exclusivo com identificação de jogos e participantes (área livre do sensor)
 */

const PrinterService = (() => {
  const DEFAULT_PROFILE = {
    id: 1,
    nome: 'Volante Oficial Caixa (3 Jogos)',
    modo: 'a4_multiplos',
    papel_w_mm: 210.0,
    papel_h_mm: 297.0,
    volante_w_mm: 83.0,
    volante_h_mm: 185.0,
    offset_x_mm: 8.0,
    offset_y_mm: 31.0,
    col_step_mm: 6.45,
    row_step_mm: 5.3,
    mark_w_mm: 4.2,
    mark_h_mm: 2.0,
    game_offsets: [0, 48.0, 96.0],
    qty_offset_y_mm: 21.5,
    qty_start_x_mm: 14.5,
    qty_step_x_mm: 4.5,
    teimosinha_pos: { x: 62.5, y: 21.5, w: 4.2, h: 2.0 },
    padrao: true,
  };

  function escapeXml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  function getProfile() {
    try {
      const saved = localStorage.getItem('megasena_print_profile');
      if (saved) return JSON.parse(saved);
    } catch (e) {}
    return { ...DEFAULT_PROFILE };
  }

  function saveProfile(prof) {
    localStorage.setItem('megasena_print_profile', JSON.stringify(prof));
  }

  function buildSlipsPayload(games, options = {}) {
    const prof = options.profile || getProfile();
    const marcarTeimosinha = !!options.teimosinha;
    const jogosPorVolante = Math.min(3, Math.max(1, options.jogosPorVolante || 3));
    const partMap = options.participantesMap || {};
    const concurso = options.concurso || '';

    const slips = [];
    for (let i = 0; i < games.length; i += jogosPorVolante) {
      const chunk = games.slice(i, i + jogosPorVolante);
      const marks = [];

      chunk.forEach((jogo, gIdx) => {
        const globalIdx = i + gIdx + 1;
        jogo.global_index = jogo.global_index || globalIdx;
        jogo.game_idx_in_slip = gIdx + 1;
        if (!jogo.participante_nome && jogo.participante_id && partMap[jogo.participante_id]) {
          jogo.participante_nome = partMap[jogo.participante_id];
        }

        const offsetY = prof.game_offsets[gIdx] || (gIdx * 48.0);
        const nums = jogo.dezenas || [];

        // Marcas dos números sorteados
        nums.forEach((num) => {
          if (num < 1 || num > 60) return;
          const col = (num - 1) % 10;
          const row = Math.floor((num - 1) / 10);
          const x = prof.offset_x_mm + col * prof.col_step_mm;
          const y = prof.offset_y_mm + offsetY + row * prof.row_step_mm;
          marks.push({
            type: 'number',
            game_index: gIdx + 1,
            num: num,
            x_mm: Math.round(x * 100) / 100,
            y_mm: Math.round(y * 100) / 100,
            w_mm: prof.mark_w_mm,
            h_mm: prof.mark_h_mm,
          });
        });

        // Marca de quantidade de dezenas (padrão 6)
        const qtd = nums.length;
        if (qtd >= 6 && qtd <= 15) {
          const qIdx = qtd - 6;
          const qx = prof.qty_start_x_mm + qIdx * prof.qty_step_x_mm;
          const qy = prof.qty_offset_y_mm + offsetY;
          marks.push({
            type: 'quantity',
            game_index: gIdx + 1,
            qty: qtd,
            x_mm: Math.round(qx * 100) / 100,
            y_mm: Math.round(qy * 100) / 100,
            w_mm: prof.mark_w_mm,
            h_mm: prof.mark_h_mm,
          });
        }

        // Marca Teimosinha (se marcada)
        if (marcarTeimosinha && prof.teimosinha_pos) {
          marks.push({
            type: 'teimosinha',
            game_index: gIdx + 1,
            x_mm: prof.teimosinha_pos.x,
            y_mm: prof.teimosinha_pos.y + offsetY,
            w_mm: prof.teimosinha_pos.w,
            h_mm: prof.teimosinha_pos.h,
          });
        }
      });

      slips.push({
        slip_index: slips.length + 1,
        total_jogos: chunk.length,
        jogos: chunk,
        marks: marks,
        concurso: concurso,
      });
    }

    return {
      profile: prof,
      total_slips: slips.length,
      jogos_por_volante: jogosPorVolante,
      slips: slips,
    };
  }

  // Gera HTML/SVG de 1 volante óptico oficial com identificação visual clara
  function renderSlipSvg(slip, profile, showOutline = true) {
    const w = profile.volante_w_mm;
    const h = profile.volante_h_mm;

    let svg = `<svg viewBox="0 0 ${w} ${h}" class="slip-svg" style="width:${w}mm;height:${h}mm;display:block;" xmlns="http://www.w3.org/2000/svg">`;

    // Fundo do volante e contorno de corte
    if (showOutline) {
      svg += `<rect x="0" y="0" width="${w}" height="${h}" fill="#ffffff" stroke="#94a3b8" stroke-dasharray="2,2" stroke-width="0.35"/>`;
    }

    // Cabeçalho exclusivo com identificação dos jogos e participantes (área livre do sensor óptico)
    slip.jogos.forEach((jogo, idx) => {
      const rawNome = (jogo.participante_nome || 'PARTICIPANTE').toUpperCase().trim();
      const nomeCurto = rawNome.length > 28 ? rawNome.substring(0, 26) + '..' : rawNome;
      const dezenasStr = (jogo.dezenas || []).map(n => String(n).padStart(2, '0')).join(' ');
      const lineY = 5.5 + idx * 4.4;

      svg += `<text x="4" y="${lineY.toFixed(1)}" font-size="2.4" font-weight="bold" fill="#000000" font-family="Arial, sans-serif">${idx + 1}: ${escapeXml(nomeCurto)}:  ${dezenasStr}</text>`;
    });

    // Desenhar cada marca óptica preta (retângulo preenchido de preto)
    slip.marks.forEach((m) => {
      svg += `<rect x="${m.x_mm}" y="${m.y_mm}" width="${m.w_mm}" height="${m.h_mm}" fill="#000000" rx="0.2"/>`;
    });

    svg += `</svg>`;
    return svg;
  }

  // Gera o layout de página de impressão com 3 volantes por folha A4
  function renderPrintArea(slipsPayload) {
    const prof = slipsPayload.profile;
    const slips = slipsPayload.slips;
    let html = '';

    // Agrupa de 3 em 3 volantes por página A4
    for (let p = 0; p < slips.length; p += 3) {
      const pageSlips = slips.slice(p, p + 3);
      html += `<div class="slip-page a4-grid-page">`;
      html += `<div class="a4-slips-row">`;
      pageSlips.forEach((s) => {
        html += `<div class="slip-card">`;
        html += renderSlipSvg(s, prof, true);
        html += `</div>`;
      });
      html += `</div>`;
      html += `</div>`;
    }

    return html;
  }

  return {
    getProfile,
    saveProfile,
    buildSlipsPayload,
    renderSlipSvg,
    renderPrintArea,
    DEFAULT_PROFILE,
  };
})();

// Export global
window.PrinterService = PrinterService;
