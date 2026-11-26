// -*- coding: utf-8 -*-
/**
 * Mega-Sena Potenza — V. 2.44 (Nuvem 24h Padrão)
 * Serviço de Impressão Óptica dos Volantes Oficiais Caixa (Tradicional vs Mega da Virada)
 * Perfis independentes por tipo de folha + prévia visual + impressão óptica limpa para leitora
 */

const PrinterService = (() => {
  const DEFAULT_PROFILES = {
    tradicional: {
      id: 1,
      tipo: 'tradicional',
      nome: 'Mega-Sena Tradicional (Dia a Dia)',
      modo: 'a4_multiplos',
      papel_w_mm: 210.0,
      papel_h_mm: 297.0,
      volante_w_mm: 83.0,
      volante_h_mm: 185.0,
      jogos_por_volante: 3,
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
      permite_teimosinha: true,
      teimosinha_pos: { x: 62.5, y: 21.5, w: 4.2, h: 2.0 },
      padrao: true,
    },
    virada: {
      id: 2,
      tipo: 'virada',
      nome: 'Mega da Virada (Folha Especial)',
      modo: 'a4_multiplos',
      papel_w_mm: 210.0,
      papel_h_mm: 297.0,
      volante_w_mm: 83.0,
      volante_h_mm: 200.0,
      jogos_por_volante: 3,
      offset_x_mm: 8.0,
      offset_y_mm: 42.0,
      col_step_mm: 6.45,
      row_step_mm: 5.3,
      mark_w_mm: 4.2,
      mark_h_mm: 2.0,
      game_offsets: [0, 48.0, 96.0],
      qty_offset_y_mm: 32.5,
      qty_start_x_mm: 14.5,
      qty_step_x_mm: 4.5,
      permite_teimosinha: false,
      teimosinha_pos: null,
      padrao: true,
    },
  };

  const DEFAULT_PROFILE = DEFAULT_PROFILES.tradicional;
  const TYPE_STORAGE_KEY = 'megasena_print_volante_tipo';

  function normalizeType(tipo) {
    return tipo === 'virada' ? 'virada' : 'tradicional';
  }

  function getActiveType() {
    try {
      return normalizeType(localStorage.getItem(TYPE_STORAGE_KEY));
    } catch (e) {
      return 'tradicional';
    }
  }

  function setActiveType(tipo) {
    const clean = normalizeType(tipo);
    try {
      localStorage.setItem(TYPE_STORAGE_KEY, clean);
    } catch (e) {}
    return clean;
  }

  function profileStorageKey(tipo) {
    return `megasena_print_profile_${normalizeType(tipo)}`;
  }

  function escapeXml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  function getProfile(tipo = null) {
    const t = normalizeType(tipo || getActiveType());
    const base = DEFAULT_PROFILES[t];
    try {
      const saved = localStorage.getItem(profileStorageKey(t));
      if (saved) return { ...base, ...JSON.parse(saved), tipo: t };
      // Migração transparente da calibração legada para o perfil tradicional
      if (t === 'tradicional') {
        const legacy = localStorage.getItem('megasena_print_profile');
        if (legacy) return { ...base, ...JSON.parse(legacy), tipo: t };
      }
    } catch (e) {}
    return { ...base };
  }

  function saveProfile(prof, tipo = null) {
    const t = normalizeType(tipo || prof?.tipo || getActiveType());
    const merged = { ...DEFAULT_PROFILES[t], ...prof, tipo: t };
    localStorage.setItem(profileStorageKey(t), JSON.stringify(merged));
  }

  function resetProfile(tipo = null) {
    const t = normalizeType(tipo || getActiveType());
    localStorage.removeItem(profileStorageKey(t));
    if (t === 'tradicional') localStorage.removeItem('megasena_print_profile');
    return { ...DEFAULT_PROFILES[t] };
  }

  function getPageLayout(profile) {
    const w = Number(profile?.volante_w_mm) || 83.0;
    const h = Number(profile?.volante_h_mm) || 185.0;
    // Se a folha couber em A4 Paisagem (altura <= 204mm), imprime em paisagem; caso contrário usa A4 Retrato sem cortar
    const orientation = h <= 204.0 ? 'landscape' : 'portrait';
    const usableW = orientation === 'landscape' ? 285.0 : 198.0;
    const slipsPerPage = Math.max(1, Math.min(3, Math.floor((usableW + 6.0) / (w + 6.0))));
    return { orientation, slipsPerPage, w, h };
  }

  function buildSlipsPayload(games, options = {}) {
    const tipo = normalizeType(options.tipo || options.profile?.tipo || getActiveType());
    const prof = options.profile || getProfile(tipo);
    const marcarTeimosinha = !!options.teimosinha && prof.permite_teimosinha !== false;
    const jogosPorVolante = Math.min(3, Math.max(1, parseInt(options.jogosPorVolante || prof.jogos_por_volante, 10) || 3));
    const partMap = options.participantesMap || {};
    const concurso = options.concurso || '';
    const layout = getPageLayout(prof);

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

        const offsetY = prof.game_offsets[gIdx] ?? (gIdx * 48.0);
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

        // Marca de quantidade de dezenas (6..15)
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

        // Marca Teimosinha (somente quando permitido pelo tipo de volante)
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
        tipo: prof.tipo,
      });
    }

    return {
      profile: prof,
      layout: layout,
      total_slips: slips.length,
      jogos_por_volante: jogosPorVolante,
      slips: slips,
    };
  }

  function buildAlignmentTestPayload(profile) {
    const prof = profile || getProfile();
    const maxJ = Math.min(3, Math.max(1, parseInt(prof.jogos_por_volante, 10) || 3));
    const tag = prof.tipo === 'virada' ? 'VIRADA' : 'TRADICIONAL';
    const testGames = [];
    for (let i = 1; i <= maxJ; i++) {
      testGames.push({
        global_index: i,
        participante_nome: `TESTE ${tag} J${i}`,
        dezenas: [1, 10, 25, 36, 51, 60],
      });
    }
    return buildSlipsPayload(testGames, { profile: prof, teimosinha: false, jogosPorVolante: maxJ });
  }

  // Gera HTML/SVG de 1 volante óptico oficial (dimensões dinâmicas do perfil ativo)
  function renderSlipSvg(slip, profile, opts = true) {
    const isPreview = typeof opts === 'object' ? !!opts.isPreview : false;
    const showOutline = typeof opts === 'object' ? opts.showOutline !== false : !!opts;
    const isVirada = profile.tipo === 'virada';

    const w = Number(profile.volante_w_mm) || 83.0;
    const h = Number(profile.volante_h_mm) || 185.0;
    const maxJ = Math.min(3, Math.max(1, parseInt(profile.jogos_por_volante, 10) || 3));
    const styleAttr = isPreview
      ? 'width:100%;height:auto;display:block;'
      : `width:${w}mm;height:${h}mm;display:block;`;

    let svg = `<svg viewBox="0 0 ${w} ${h}" class="slip-svg" style="${styleAttr}" xmlns="http://www.w3.org/2000/svg">`;

    // Fundo branco do volante e contorno de corte
    svg += `<rect x="0" y="0" width="${w}" height="${h}" fill="#ffffff"${showOutline ? ' stroke="#cbd5e1" stroke-dasharray="1.8,1.8" stroke-width="0.3"' : ''}/>`;

    // Cabeçalho exclusivo no topo (área livre do sensor óptico)
    if (isPreview) {
      const hdrFill = isVirada ? '#fefce8' : '#f8fafc';
      const hdrStroke = isVirada ? '#fde047' : '#e2e8f0';
      svg += `<rect x="2.5" y="2" width="${(w - 5).toFixed(1)}" height="14.5" rx="1.2" fill="${hdrFill}" stroke="${hdrStroke}" stroke-width="0.25"/>`;
      if (isVirada) {
        svg += `<text x="${(w - 4).toFixed(1)}" y="4.8" font-size="1.8" font-weight="800" text-anchor="end" fill="#a16207" font-family="Arial, sans-serif">MEGA DA VIRADA</text>`;
      }
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
      const titleColor = isVirada ? '#b45309' : '#059669';
      const boxFill = isVirada ? '#fefce8' : '#f0fdf4';
      const boxStroke = isVirada ? '#fcd34d' : '#bbf7d0';

      for (let gIdx = 0; gIdx < maxJ; gIdx++) {
        const offsetY = profile.game_offsets[gIdx] ?? (gIdx * 48.0);
        const isUsed = gIdx < slip.jogos.length;
        const opacity = isUsed ? 1 : 0.35;

        svg += `<g opacity="${opacity}">`;
        // Faixa de título e Qtd do bloco
        const qtyY = profile.qty_offset_y_mm + offsetY;
        svg += `<text x="${profile.offset_x_mm}" y="${(qtyY - 1.2).toFixed(1)}" font-size="2.1" font-weight="700" fill="${titleColor}" font-family="Arial, sans-serif">JOGO ${gIdx + 1}</text>`;
        svg += `<text x="${(profile.qty_start_x_mm - 5.5).toFixed(1)}" y="${(qtyY + 1.6).toFixed(1)}" font-size="1.7" fill="#64748b" font-family="Arial, sans-serif">Qtd</text>`;

        // Caixinhas de quantidade (6..15)
        for (let q = 6; q <= 15; q++) {
          const qx = profile.qty_start_x_mm + (q - 6) * profile.qty_step_x_mm;
          svg += `<rect x="${qx.toFixed(2)}" y="${qtyY.toFixed(2)}" width="${profile.mark_w_mm}" height="${profile.mark_h_mm}" fill="none" stroke="#cbd5e1" stroke-width="0.2" rx="0.2"/>`;
          svg += `<text x="${(qx + profile.mark_w_mm / 2).toFixed(2)}" y="${(qtyY + 1.55).toFixed(2)}" font-size="1.5" text-anchor="middle" fill="#94a3b8" font-family="Arial, sans-serif">${q}</text>`;
        }

        // Moldura suave do volante (60 dezenas)
        svg += `<rect x="${(profile.offset_x_mm - 1.2).toFixed(2)}" y="${(profile.offset_y_mm + offsetY - 1.2).toFixed(2)}" width="${gridW.toFixed(2)}" height="${gridH.toFixed(2)}" rx="1" fill="${boxFill}" fill-opacity="0.5" stroke="${boxStroke}" stroke-width="0.3"/>`;

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
      }

      // Legenda dimensional discreta no rodapé da prévia
      const tipoLbl = isVirada ? 'Mega da Virada' : 'Mega-Sena Tradicional';
      svg += `<text x="${(w / 2).toFixed(1)}" y="${(h - 3).toFixed(1)}" font-size="1.95" text-anchor="middle" fill="#94a3b8" font-family="Arial, sans-serif">${tipoLbl} · ${w} × ${h} mm (${maxJ} jogos/folha)</text>`;
    }

    // Marcas ópticas pretas reais (retângulos preenchidos em preto puro #000000)
    slip.marks.forEach((m) => {
      svg += `<rect x="${m.x_mm}" y="${m.y_mm}" width="${m.w_mm}" height="${m.h_mm}" fill="#000000" rx="0.2"/>`;
    });

    svg += `</svg>`;
    return svg;
  }

  // Gera o layout de página de impressão A4 respeitando exatamente as medidas em mm do tipo de volante
  function renderPrintArea(slipsPayload) {
    const prof = slipsPayload.profile;
    const slips = slipsPayload.slips;
    const layout = slipsPayload.layout || getPageLayout(prof);
    const pageClass = layout.orientation === 'portrait' ? 'slip-page a4-grid-page a4-portrait-slips' : 'slip-page a4-grid-page';
    const cardStyle = `--slip-w:${layout.w}mm;--slip-h:${layout.h}mm;`;
    let html = '';

    for (let p = 0; p < slips.length; p += layout.slipsPerPage) {
      const pageSlips = slips.slice(p, p + layout.slipsPerPage);
      html += `<div class="${pageClass}">`;
      html += `<div class="a4-slips-row">`;
      pageSlips.forEach((s) => {
        html += `<div class="slip-card" style="${cardStyle}">`;
        html += renderSlipSvg(s, prof, { showOutline: true, isPreview: false });
        html += `</div>`;
      });
      html += `</div>`;
      html += `</div>`;
    }

    return html;
  }

  return {
    getActiveType,
    setActiveType,
    getProfile,
    saveProfile,
    resetProfile,
    getPageLayout,
    buildSlipsPayload,
    buildAlignmentTestPayload,
    renderSlipSvg,
    renderPrintArea,
    DEFAULT_PROFILE,
    DEFAULT_PROFILES,
  };
})();

window.PrinterService = PrinterService;
