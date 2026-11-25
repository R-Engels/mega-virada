// -*- coding: utf-8 -*-
/**
 * Mega-Sena Potenza — V. 2.27 (Nuvem 24h Padrão)
 * Serviço de Impressão Óptica dos Volantes Oficiais Caixa (83x185mm)
 * Prévia visual com grade de conferência + impressão óptica limpa para leitora
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
      if (saved) return { ...DEFAULT_PROFILE, ...JSON.parse(saved) };
    } catch (e) {}
    return { ...DEFAULT_PROFILE };
  }

  function saveProfile(prof) {
    localStorage.setItem('megasena_print_profile', JSON.stringify(prof));
  }

  function resetProfile() {
    localStorage.removeItem('megasena_print_profile');
    return { ...DEFAULT_PROFILE };
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

  function buildAlignmentTestPayload(profile) {
    const prof = profile || getProfile();
    const testGames = [
      { global_index: 1, participante_nome: 'TESTE ALINHAMENTO J1', dezenas: [1, 10, 25, 36, 51, 60] },
      { global_index: 2, participante_nome: 'TESTE ALINHAMENTO J2', dezenas: [1, 10, 25, 36, 51, 60] },
      { global_index: 3, participante_nome: 'TESTE ALINHAMENTO J3', dezenas: [1, 10, 25, 36, 51, 60] },
    ];
    return buildSlipsPayload(testGames, { profile: prof, teimosinha: false });
  }

  // Gera HTML/SVG de 1 volante óptico oficial (83x185mm)
  // opts: boolean (showOutline) ou { showOutline, isPreview }
  function renderSlipSvg(slip, profile, opts = true) {
    const isPreview = typeof opts === 'object' ? !!opts.isPreview : false;
    const showOutline = typeof opts === 'object' ? opts.showOutline !== false : !!opts;

    const w = profile.volante_w_mm;
    const h = profile.volante_h_mm;
    const styleAttr = isPreview
      ? 'width:100%;height:auto;display:block;'
      : `width:${w}mm;height:${h}mm;display:block;`;

    let svg = `<svg viewBox="0 0 ${w} ${h}" class="slip-svg" style="${styleAttr}" xmlns="http://www.w3.org/2000/svg">`;

    // Fundo branco do volante e contorno de corte
    svg += `<rect x="0" y="0" width="${w}" height="${h}" fill="#ffffff"${showOutline ? ' stroke="#cbd5e1" stroke-dasharray="1.8,1.8" stroke-width="0.3"' : ''}/>`;

    // Cabeçalho exclusivo no topo (área livre do sensor óptico)
    if (isPreview) {
      svg += `<rect x="2.5" y="2" width="${(w - 5).toFixed(1)}" height="14.5" rx="1.2" fill="#f8fafc" stroke="#e2e8f0" stroke-width="0.25"/>`;
    }
    slip.jogos.forEach((jogo, idx) => {
      const rawNome = (jogo.participante_nome || 'PARTICIPANTE').toUpperCase().trim();
      const nomeCurto = rawNome.length > 24 ? rawNome.substring(0, 22) + '..' : rawNome;
      const dezenasStr = (jogo.dezenas || []).map((n) => String(n).padStart(2, '0')).join(' ');
      const gameNum = jogo.global_index || (idx + 1);
      const lineY = 5.4 + idx * 4.2;

      svg += `<text x="4" y="${lineY.toFixed(1)}" font-size="2.25" font-weight="700" fill="#0f172a" font-family="Arial, Helvetica, sans-serif">${gameNum}: ${escapeXml(nomeCurto)}: ${dezenasStr}</text>`;
    });

    // Grade guia visual (APENAS na prévia na tela — nunca impressa no volante óptico)
    if (isPreview) {
      const gridW = 9 * profile.col_step_mm + profile.mark_w_mm + 2.4;
      const gridH = 5 * profile.row_step_mm + profile.mark_h_mm + 2.4;

      [0, 1, 2].forEach((gIdx) => {
        const offsetY = profile.game_offsets[gIdx] || (gIdx * 48.0);
        const isUsed = gIdx < slip.jogos.length;
        const opacity = isUsed ? 1 : 0.35;

        svg += `<g opacity="${opacity}">`;
        // Faixa de título e Qtd do bloco
        const qtyY = profile.qty_offset_y_mm + offsetY;
        svg += `<text x="${profile.offset_x_mm}" y="${(qtyY - 1.2).toFixed(1)}" font-size="2.1" font-weight="700" fill="#059669" font-family="Arial, sans-serif">JOGO ${gIdx + 1}</text>`;
        svg += `<text x="${(profile.qty_start_x_mm - 5.5).toFixed(1)}" y="${(qtyY + 1.6).toFixed(1)}" font-size="1.7" fill="#64748b" font-family="Arial, sans-serif">Qtd</text>`;

        // Caixinhas de quantidade (6..15)
        for (let q = 6; q <= 15; q++) {
          const qx = profile.qty_start_x_mm + (q - 6) * profile.qty_step_x_mm;
          svg += `<rect x="${qx.toFixed(2)}" y="${qtyY.toFixed(2)}" width="${profile.mark_w_mm}" height="${profile.mark_h_mm}" fill="none" stroke="#cbd5e1" stroke-width="0.2" rx="0.2"/>`;
          svg += `<text x="${(qx + profile.mark_w_mm / 2).toFixed(2)}" y="${(qtyY + 1.55).toFixed(2)}" font-size="1.5" text-anchor="middle" fill="#94a3b8" font-family="Arial, sans-serif">${q}</text>`;
        }

        // Moldura suave do volante (60 dezenas)
        svg += `<rect x="${(profile.offset_x_mm - 1.2).toFixed(2)}" y="${(profile.offset_y_mm + offsetY - 1.2).toFixed(2)}" width="${gridW.toFixed(2)}" height="${gridH.toFixed(2)}" rx="1" fill="#f0fdf4" fill-opacity="0.45" stroke="#bbf7d0" stroke-width="0.3"/>`;

        // 60 dezenas guia (01..60)
        for (let n = 1; n <= 60; n++) {
          const col = (n - 1) % 10;
          const row = Math.floor((n - 1) / 10);
          const nx = profile.offset_x_mm + col * profile.col_step_mm;
          const ny = profile.offset_y_mm + offsetY + row * profile.row_step_mm;
          const label = String(n).padStart(2, '0');
          svg += `<rect x="${nx.toFixed(2)}" y="${ny.toFixed(2)}" width="${profile.mark_w_mm}" height="${profile.mark_h_mm}" fill="#ffffff" stroke="#cbd5e1" stroke-width="0.18" rx="0.2"/>`;
          svg += `<text x="${(nx + profile.mark_w_mm / 2).toFixed(2)}" y="${(ny + 1.55).toFixed(2)}" font-size="1.55" text-anchor="middle" fill="#64748b" font-family="Arial, sans-serif">${label}</text>`;
        }
        svg += `</g>`;
      });

      // Legenda dimensional discreta no rodapé da prévia
      svg += `<text x="${(w / 2).toFixed(1)}" y="${(h - 3).toFixed(1)}" font-size="2" text-anchor="middle" fill="#94a3b8" font-family="Arial, sans-serif">Volante Caixa ${w} × ${h} mm (Escala 1:1 na impressão)</text>`;
    }

    // Marcas ópticas pretas reais (retângulos preenchidos em preto puro #000000)
    slip.marks.forEach((m) => {
      svg += `<rect x="${m.x_mm}" y="${m.y_mm}" width="${m.w_mm}" height="${m.h_mm}" fill="#000000" rx="0.2"/>`;
    });

    svg += `</svg>`;
    return svg;
  }

  // Gera o layout de página de impressão A4 Paisagem com até 3 volantes por folha (100% limpo p/ leitora)
  function renderPrintArea(slipsPayload) {
    const prof = slipsPayload.profile;
    const slips = slipsPayload.slips;
    let html = '';

    for (let p = 0; p < slips.length; p += 3) {
      const pageSlips = slips.slice(p, p + 3);
      html += `<div class="slip-page a4-grid-page">`;
      html += `<div class="a4-slips-row">`;
      pageSlips.forEach((s) => {
        html += `<div class="slip-card">`;
        html += renderSlipSvg(s, prof, { showOutline: true, isPreview: false });
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
    resetProfile,
    buildSlipsPayload,
    buildAlignmentTestPayload,
    renderSlipSvg,
    renderPrintArea,
    DEFAULT_PROFILE,
  };
})();

window.PrinterService = PrinterService;
