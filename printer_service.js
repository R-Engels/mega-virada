// -*- coding: utf-8 -*-
/**
 * Mega-Sena Potenza — V. 2.46 (Nuvem 24h Padrão)
 * Serviço de Impressão Óptica dos Volantes Oficiais Caixa (Tradicional 81,5×140mm vs Mega da Virada)
 * Perfis independentes por tipo de folha + prévia visual fiel + impressão óptica limpa para leitora
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
      volante_w_mm: 81.5,
      volante_h_mm: 140.0,
      jogos_por_volante: 2,
      offset_x_mm: 11.8,
      offset_y_mm: 22.1,
      col_step_mm: 6.37,
      row_step_mm: 3.28,
      mark_w_mm: 4.2,
      mark_h_mm: 1.8,
      game_offsets: [0, 25.0, 50.0],
      qty_unico: true,
      qty_offset_y_mm: 73.4,
      qty_start_x_mm: 11.8,
      qty_step_x_mm: 6.37,
      permite_teimosinha: true,
      teimosinha_pos: { x: 11.8, y: 93.1, w: 4.2, h: 1.8 },
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
      qty_unico: false,
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
    return `megasena_print_profile_v2_${normalizeType(tipo)}`;
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
    localStorage.removeItem(`megasena_print_profile_${t}`);
    if (t === 'tradicional') localStorage.removeItem('megasena_print_profile');
    return { ...DEFAULT_PROFILES[t] };
  }

  function getPageLayout(profile) {
    const w = Number(profile?.volante_w_mm) || 81.5;
    const h = Number(profile?.volante_h_mm) || 140.0;
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
    const jogosPorVolante = Math.min(3, Math.max(1, parseInt(options.jogosPorVolante || prof.jogos_por_volante, 10) || 2));
    const qtyUnico = prof.qty_unico !== false;
    const partMap = options.participantesMap || {};
    const concurso = options.concurso || '';
    const layout = getPageLayout(prof);

    // Agrupa jogos respeitando jogosPorVolante; em volantes com barra única "Quantos números" (padrão Caixa),
    // nunca mistura jogos com quantidades diferentes de dezenas (ex: 7 dez. e 6 dez.) na mesma folha física
    const slips = [];
    let i = 0;
    while (i < games.length) {
      const chunk = [];
      const firstQtd = (games[i]?.dezenas || []).length;
      while (i < games.length && chunk.length < jogosPorVolante) {
        const curQtd = (games[i]?.dezenas || []).length;
        if (qtyUnico && chunk.length > 0 && curQtd !== firstQtd) break;
        const gIdx = chunk.length;
        const globalIdx = i + 1;
        const cloned = {
          ...games[i],
          global_index: globalIdx,
          game_idx_in_slip: gIdx + 1,
        };
        if (!cloned.participante_nome && cloned.participante_id && partMap[cloned.participante_id]) {
          cloned.participante_nome = partMap[cloned.participante_id];
        }
        chunk.push(cloned);
        i++;
      }

      const marks = [];
      const defaultStepY = prof.game_offsets?.[1] ?? 25.0;

      chunk.forEach((jogo, gIdx) => {
        const offsetY = prof.game_offsets[gIdx] ?? (gIdx * defaultStepY);
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

        // Modo legado (barra Qtd repetida por jogo)
        if (!qtyUnico) {
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
        }
      });

      // Barra única "Assinale quantos números você está marcando" (padrão físico real Caixa)
      if (qtyUnico && chunk.length > 0) {
        const slipQtd = (chunk[0].dezenas || []).length;
        if (slipQtd >= 6 && slipQtd <= 15) {
          const qIdx = slipQtd - 6;
          const qx = prof.qty_start_x_mm + qIdx * prof.qty_step_x_mm;
          const qy = prof.qty_offset_y_mm;
          marks.push({
            type: 'quantity',
            game_index: 0,
            qty: slipQtd,
            x_mm: Math.round(qx * 100) / 100,
            y_mm: Math.round(qy * 100) / 100,
            w_mm: prof.mark_w_mm,
            h_mm: prof.mark_h_mm,
          });
        }
      }

      // Marca única de Teimosinha (somente quando permitido pelo tipo de volante)
      if (marcarTeimosinha && prof.teimosinha_pos) {
        marks.push({
          type: 'teimosinha',
          game_index: 0,
          x_mm: prof.teimosinha_pos.x,
          y_mm: prof.teimosinha_pos.y,
          w_mm: prof.teimosinha_pos.w,
          h_mm: prof.teimosinha_pos.h,
        });
      }

      slips.push({
        slip_index: slips.length + 1,
        total_jogos: chunk.length,
        jogos: chunk,
        marks: marks,
        concurso: concurso,
        tipo: prof.tipo,
        qtd_dezenas: (chunk[0]?.dezenas || []).length,
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
    const maxJ = Math.min(3, Math.max(1, parseInt(prof.jogos_por_volante, 10) || 2));
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
    const qtyUnico = profile.qty_unico !== false;

    const w = Number(profile.volante_w_mm) || 81.5;
    const h = Number(profile.volante_h_mm) || 140.0;
    const maxJ = Math.min(3, Math.max(1, parseInt(profile.jogos_por_volante, 10) || 2));
    const defaultStepY = profile.game_offsets?.[1] ?? 25.0;
    const styleAttr = isPreview
      ? 'width:100%;height:auto;display:block;'
      : `width:${w}mm;height:${h}mm;display:block;`;

    let svg = `<svg viewBox="0 0 ${w} ${h}" class="slip-svg" style="${styleAttr}" xmlns="http://www.w3.org/2000/svg">`;

    // Fundo branco do volante e contorno de corte
    svg += `<rect x="0" y="0" width="${w}" height="${h}" fill="#ffffff"${showOutline ? ' stroke="#cbd5e1" stroke-dasharray="1.8,1.8" stroke-width="0.3"' : ''}/>`;

    // Cabeçalho exclusivo no topo (área segura acima da barra óptica em y~19mm)
    if (isPreview) {
      const hdrFill = isVirada ? '#fefce8' : '#ecfdf5';
      const hdrStroke = isVirada ? '#fde047' : '#a7f3d0';
      const hdrH = maxJ <= 2 ? 12.0 : 14.5;
      svg += `<rect x="2.5" y="2" width="${(w - 5).toFixed(1)}" height="${hdrH}" rx="1.2" fill="${hdrFill}" stroke="${hdrStroke}" stroke-width="0.25"/>`;
      svg += `<text x="${(w - 4).toFixed(1)}" y="4.8" font-size="1.75" font-weight="800" text-anchor="end" fill="${isVirada ? '#a16207' : '#047857'}" font-family="Arial, sans-serif">${isVirada ? 'MEGA DA VIRADA' : 'MEGA-SENA'}</text>`;
    }
    slip.jogos.forEach((jogo, idx) => {
      const rawNome = (jogo.participante_nome || 'PARTICIPANTE').toUpperCase().trim();
      const nomeCurto = rawNome.length > 22 ? rawNome.substring(0, 20) + '..' : rawNome;
      const dezenasStr = (jogo.dezenas || []).map((n) => String(n).padStart(2, '0')).join(' ');
      const gameNum = jogo.global_index || (idx + 1);
      const lineY = 5.2 + idx * 4.0;

      svg += `<text x="4" y="${lineY.toFixed(1)}" font-size="2.15" font-weight="700" fill="#0f172a" font-family="Arial, Helvetica, sans-serif">${gameNum}: ${escapeXml(nomeCurto)}: ${dezenasStr}</text>`;
    });

    // Grade guia visual (APENAS na prévia na tela — nunca impressa no volante óptico)
    if (isPreview) {
      const gridW = 9 * profile.col_step_mm + profile.mark_w_mm + 2.0;
      const gridH = 5 * profile.row_step_mm + profile.mark_h_mm + 1.8;
      const titleColor = isVirada ? '#b45309' : '#059669';
      const boxFill = isVirada ? '#fefce8' : '#f7fee7';
      const boxStroke = isVirada ? '#fcd34d' : '#bef264';

      for (let gIdx = 0; gIdx < maxJ; gIdx++) {
        const offsetY = profile.game_offsets[gIdx] ?? (gIdx * defaultStepY);
        const isUsed = gIdx < slip.jogos.length;
        const opacity = isUsed ? 1 : 0.35;

        svg += `<g opacity="${opacity}">`;
        if (!qtyUnico) {
          const qtyY = profile.qty_offset_y_mm + offsetY;
          svg += `<text x="${profile.offset_x_mm}" y="${(qtyY - 1.2).toFixed(1)}" font-size="2.0" font-weight="700" fill="${titleColor}" font-family="Arial, sans-serif">JOGO ${gIdx + 1}</text>`;
          svg += `<text x="${(profile.qty_start_x_mm - 5.2).toFixed(1)}" y="${(qtyY + 1.5).toFixed(1)}" font-size="1.6" fill="#64748b" font-family="Arial, sans-serif">Qtd</text>`;
          for (let q = 6; q <= 15; q++) {
            const qx = profile.qty_start_x_mm + (q - 6) * profile.qty_step_x_mm;
            svg += `<rect x="${qx.toFixed(2)}" y="${qtyY.toFixed(2)}" width="${profile.mark_w_mm}" height="${profile.mark_h_mm}" fill="none" stroke="#cbd5e1" stroke-width="0.2" rx="0.2"/>`;
            svg += `<text x="${(qx + profile.mark_w_mm / 2).toFixed(2)}" y="${(qtyY + profile.mark_h_mm * 0.78).toFixed(2)}" font-size="1.45" text-anchor="middle" fill="#94a3b8" font-family="Arial, sans-serif">${q}</text>`;
          }
        } else {
          // Marca óptica lateral esquerda guia (apenas prévia) + rótulo discreto do quadro
          svg += `<text x="${profile.offset_x_mm}" y="${(profile.offset_y_mm + offsetY - 1.4).toFixed(1)}" font-size="1.75" font-weight="700" fill="${titleColor}" font-family="Arial, sans-serif">JOGO ${gIdx + 1}</text>`;
          for (let r = 0; r < 6; r++) {
            const ry = profile.offset_y_mm + offsetY + r * profile.row_step_mm;
            svg += `<rect x="2.2" y="${(ry + 0.2).toFixed(2)}" width="3.0" height="1.3" fill="#94a3b8" opacity="0.55"/>`;
          }
        }

        // Moldura suave do volante (60 dezenas)
        svg += `<rect x="${(profile.offset_x_mm - 1.0).toFixed(2)}" y="${(profile.offset_y_mm + offsetY - 0.9).toFixed(2)}" width="${gridW.toFixed(2)}" height="${gridH.toFixed(2)}" rx="0.8" fill="${boxFill}" fill-opacity="0.55" stroke="${boxStroke}" stroke-width="0.28"/>`;

        // 60 dezenas guia (01..60)
        for (let n = 1; n <= 60; n++) {
          const col = (n - 1) % 10;
          const row = Math.floor((n - 1) / 10);
          const nx = profile.offset_x_mm + col * profile.col_step_mm;
          const ny = profile.offset_y_mm + offsetY + row * profile.row_step_mm;
          const label = String(n).padStart(2, '0');
          svg += `<rect x="${nx.toFixed(2)}" y="${ny.toFixed(2)}" width="${profile.mark_w_mm}" height="${profile.mark_h_mm}" fill="#ffffff" stroke="#cbd5e1" stroke-width="0.16" rx="0.2"/>`;
          svg += `<text x="${(nx + profile.mark_w_mm / 2).toFixed(2)}" y="${(ny + profile.mark_h_mm * 0.78).toFixed(2)}" font-size="1.45" text-anchor="middle" fill="#64748b" font-family="Arial, sans-serif">${label}</text>`;
        }
        svg += `</g>`;
      }

      // Barra única inferior "Assinale quantos números (6..15)" e Teimosinha na prévia
      if (qtyUnico) {
        const qy = profile.qty_offset_y_mm;
        svg += `<rect x="2.2" y="${(qy + 0.2).toFixed(2)}" width="3.0" height="1.3" fill="#94a3b8" opacity="0.55"/>`;
        svg += `<text x="${profile.qty_start_x_mm}" y="${(qy - 1.5).toFixed(1)}" font-size="1.7" font-weight="700" fill="#475569" font-family="Arial, sans-serif">Quantos números (6 a 15):</text>`;
        for (let q = 6; q <= 15; q++) {
          const qx = profile.qty_start_x_mm + (q - 6) * profile.qty_step_x_mm;
          svg += `<rect x="${qx.toFixed(2)}" y="${qy.toFixed(2)}" width="${profile.mark_w_mm}" height="${profile.mark_h_mm}" fill="#ffffff" stroke="#cbd5e1" stroke-width="0.18" rx="0.2"/>`;
          svg += `<text x="${(qx + profile.mark_w_mm / 2).toFixed(2)}" y="${(qy + profile.mark_h_mm * 0.78).toFixed(2)}" font-size="1.45" text-anchor="middle" fill="#64748b" font-family="Arial, sans-serif">${q}</text>`;
        }
        if (profile.permite_teimosinha && profile.teimosinha_pos) {
          const ty = profile.teimosinha_pos.y;
          svg += `<rect x="2.2" y="${(ty + 0.2).toFixed(2)}" width="3.0" height="1.3" fill="#94a3b8" opacity="0.55"/>`;
          svg += `<text x="${profile.teimosinha_pos.x}" y="${(ty - 1.5).toFixed(1)}" font-size="1.65" font-weight="700" fill="#475569" font-family="Arial, sans-serif">Teimosinha (2 / 4 / 8):</text>`;
          [0, 2, 4].forEach((colOff, ti) => {
            const tx = profile.teimosinha_pos.x + colOff * profile.col_step_mm;
            const tLbl = [2, 4, 8][ti];
            svg += `<rect x="${tx.toFixed(2)}" y="${ty.toFixed(2)}" width="${profile.teimosinha_pos.w}" height="${profile.teimosinha_pos.h}" fill="#ffffff" stroke="#cbd5e1" stroke-width="0.18" rx="0.2"/>`;
            svg += `<text x="${(tx + profile.teimosinha_pos.w / 2).toFixed(2)}" y="${(ty + profile.teimosinha_pos.h * 0.78).toFixed(2)}" font-size="1.45" text-anchor="middle" fill="#64748b" font-family="Arial, sans-serif">${tLbl}</text>`;
          });
        }
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
