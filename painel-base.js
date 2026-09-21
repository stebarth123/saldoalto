/* Saldo Alto — Inteligência da Base (leitura agregada da base de empreendedoras).
   Só números agregados: grupos com menos de 5 pessoas não aparecem (regra aplicada no servidor).
   Toda leitura mostra o n, o período e o aviso de que a base é voluntária. */
(function () {
  'use strict';
  var P = window.P, esc = SA.esc, $ = P.$, $$ = P.$$;
  var EMPTY = function () { return { nicho: '', regiao: '', estado: '', cidade: '' }; };
  var FILT = EMPTY(), FILT_B = EMPTY(), CMP = false, MODE = 'graficos', LAST = null, LAST_B = null, INFO = false;

  var REGIOES = { norte: 'Norte', nordeste: 'Nordeste', centrooeste: 'Centro-Oeste', sudeste: 'Sudeste', sul: 'Sul' };
  var REGIAO_UF = { norte: ['AC', 'AM', 'AP', 'PA', 'RO', 'RR', 'TO'], nordeste: ['AL', 'BA', 'CE', 'MA', 'PB', 'PE', 'PI', 'RN', 'SE'], centrooeste: ['DF', 'GO', 'MS', 'MT'], sudeste: ['ES', 'MG', 'RJ', 'SP'], sul: ['PR', 'RS', 'SC'] };
  var UF_NOME = { AC: 'Acre', AL: 'Alagoas', AP: 'Amapá', AM: 'Amazonas', BA: 'Bahia', CE: 'Ceará', DF: 'Distrito Federal', ES: 'Espírito Santo', GO: 'Goiás', MA: 'Maranhão', MT: 'Mato Grosso', MS: 'Mato Grosso do Sul', MG: 'Minas Gerais', PA: 'Pará', PB: 'Paraíba', PR: 'Paraná', PE: 'Pernambuco', PI: 'Piauí', RJ: 'Rio de Janeiro', RN: 'Rio Grande do Norte', RS: 'Rio Grande do Sul', RO: 'Rondônia', RR: 'Roraima', SC: 'Santa Catarina', SP: 'São Paulo', SE: 'Sergipe', TO: 'Tocantins' };
  var NOTA = 'A base do Saldo Alto é formada por empreendedoras que aceitaram participar; elas não são sorteadas. Por isso os números mostram a direção e o perfil de quem participa, não o retrato oficial de todas as empreendedoras do Brasil. A margem de referência (±) supõe uma amostra aleatória e serve apenas como guia. Nenhum dado individual é exibido e grupos com menos de 5 pessoas ficam de fora.';

  // Grade de estados (tile map): [linha, coluna]
  var TILES = {
    RR: [0, 2], AP: [0, 3],
    AM: [1, 1], PA: [1, 2], MA: [1, 3], PI: [1, 4], CE: [1, 5], RN: [1, 6],
    AC: [2, 0], RO: [2, 1], MT: [2, 2], TO: [2, 3], BA: [2, 4], PE: [2, 5], PB: [2, 6],
    MS: [3, 2], GO: [3, 3], DF: [3, 4], MG: [3, 5], SE: [3, 6], AL: [3, 7],
    PR: [4, 2], SP: [4, 3], RJ: [4, 4], ES: [4, 5],
    SC: [5, 2], RS: [6, 2]
  };
  var RAMP = ['#F9C9DE', '#F08DB7', '#E8156A', '#C4104F', '#8E0C3B'];
  var MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  var MESES_LONGO = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

  function pct(n, t) { return t ? Math.round(n / t * 100) : 0; }
  function margem(n) { return n > 0 ? Math.round(1.96 * Math.sqrt(0.25 / n) * 1000) / 10 : 0; }         // p = 50%, 95%, em p.p.
  function fmtMargem(n) { return '±' + String(margem(n)).replace('.', ',') + ' p.p.'; }
  function dataBr(iso) { return iso ? iso.slice(8, 10) + '/' + iso.slice(5, 7) + '/' + iso.slice(0, 4) : ''; }
  function ufLabel(k) { return UF_NOME[k] || k; }
  function isEmpty(F) { return !F.nicho && !F.regiao && !F.estado && !F.cidade; }
  function cityName(d, F) { var c = ((d && d.opcoes && d.opcoes.cidades) || []).filter(function (x) { return x.v === F.cidade; })[0]; return c ? c.k : ''; }
  function recorteTxt(d, F) {
    var loc = [F.regiao ? REGIOES[F.regiao] : '', F.estado ? ufLabel(F.estado) : '', F.cidade ? cityName(d, F) : ''].filter(Boolean).join(' → ');
    var parts = [loc, F.nicho].filter(Boolean);
    return parts.length ? parts.join(' · ') : 'Todas as empreendedoras da base';
  }

  P.routes.base = function (args, nav) {
    P.setTitle('Inteligência da Base');
    if (!SA.can('dashboard')) { P.noAccess('a Inteligência da Base'); return; }
    view().innerHTML = head() + '<div class="card pad"><div class="skeleton" style="margin:0"><i></i></div></div>';
    load(nav);
  };
  function view() { return P.view; }

  /* ---------- ícones locais ---------- */
  var ICO = {
    tag: '<path d="M3 12V4h8l10 10-8 8z"/><circle cx="7.5" cy="8.5" r="1.3"/>',
    pin: '<path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/>',
    chev: '<path d="m6 9 6 6 6-6"/>',
    dl: '<path d="M12 4v11M7 11l5 5 5-5M5 20h14"/>',
    file: '<path d="M7 3h7l5 5v13H7z"/><path d="M14 3v5h5M10 13h6M10 17h6"/>',
    users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.6-3.6 3.2-5.5 6.5-5.5s5.9 1.9 6.5 5.5"/><path d="M16 4.7a3.5 3.5 0 0 1 0 6.6M18.5 14.8c1.6.8 2.7 2.4 3 5.2"/>',
    globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18"/>',
    cmp: '<path d="M7 4v16M17 4v16M4 8l3-4 3 4M14 16l3 4 3-4"/>',
    up: '<path d="M12 19V5M6 11l6-6 6 6"/>', dn: '<path d="M12 5v14M6 13l6 6 6-6"/>'
  };
  function ic(n, s) { return '<svg class="ic" ' + (s ? 'style="width:' + s + 'px;height:' + s + 'px" ' : '') + 'viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + ICO[n] + '</svg>'; }
  var TAB = 'geral';
  var TABS = [['geral', 'Visão geral'], ['territorio', 'Território'], ['negocios', 'Negócios'], ['comparar', 'Comparar']];
  function isMobile() { return window.innerWidth <= 820; }

  /* ---------- blocos ---------- */
  function metaStrip(d) {
    var de = d.periodo && d.periodo.desde ? 'Cadastros de ' + dataBr(d.periodo.desde) + ' a ' + dataBr(d.periodo.ate) : 'Cadastros até ' + dataBr(d.periodo && d.periodo.ate);
    return '<div class="meta-strip"><span><b>n = ' + SA.fmtInt(d.total) + '</b> empreendedoras nesta leitura</span><span class="dot" aria-hidden="true">·</span><span>' + esc(de) + '</span><span class="dot" aria-hidden="true">·</span><span>Base voluntária</span>' +
      '<span class="info-wrap"><button type="button" class="info-btn" id="info-btn" aria-label="Como ler estes números" aria-expanded="' + INFO + '" aria-haspopup="dialog">i</button>' +
      (INFO ? '<div class="info-pop" role="dialog" aria-label="Como ler estes números">' + esc(NOTA) + '</div>' : '') + '</span></div>';
  }

  function mudancaTexto(it) {
    var quem = it.tema === 'Estado' ? 'das novas cadastradas são de ' + ufLabel(it.rotulo) : it.tema === 'Presença digital' ? 'das novas cadastradas ' + it.rotulo.toLowerCase().replace('têm ', 'têm ') : it.tema === 'Maturidade' ? 'das novas cadastradas estão em “' + it.rotulo + '”' : 'das novas cadastradas atuam em ' + it.rotulo;
    return it.pNovas + '% ' + quem + ', contra ' + it.pAnteriores + '% das anteriores';
  }
  function changed(d, cls) {
    var m = d.mudancas || {}, body, n = 0;
    if (m.insuficiente) body = '<p class="msg">Ainda não há cadastros suficientes para comparar períodos: precisamos de pelo menos ' + m.minN + ' em cada um (agora: ' + m.nNovas + ' nos últimos 30 dias e ' + m.nAnteriores + ' antes). ' + (isEmpty(FILT) ? '' : 'Tente um recorte mais amplo.') + '</p>';
    else if (!m.itens || !m.itens.length) body = '<p class="msg">Nenhuma mudança relevante neste período. Isso também é informação: o perfil de quem chegou nos últimos 30 dias é parecido com o das anteriores.</p>';
    else { n = m.itens.length; body = '<ul class="chg">' + m.itens.map(function (it) {
      var up = it.dpp > 0;
      return '<li data-tip="' + esc(mudancaTexto(it)) + '"><span class="arr ' + (up ? 'up' : 'dn') + '" aria-hidden="true">' + ic(up ? 'up' : 'dn', 16) + '</span><div><div class="tg">' + esc(it.tema) + '</div><b>' + esc(it.tema === 'Estado' ? ufLabel(it.rotulo) : it.rotulo) + '</b>' +
        '<p>' + it.pNovas + '% das novas, contra ' + it.pAnteriores + '% das anteriores</p></div><span class="dpp ' + (up ? 'up' : 'dn') + '">' + (up ? '+' : '−') + Math.abs(it.dpp) + ' p.p.</span></li>';
    }).join('') + '</ul>'; }
    var foot = m.insuficiente ? '' : '<p class="foot">Compara as ' + SA.fmtInt(m.nNovas) + ' cadastradas nos últimos 30 dias com as ' + SA.fmtInt(m.nAnteriores) + ' anteriores. Só aparecem diferenças de pelo menos 5 p.p. e com significância estatística de 99%.</p>';
    return '<section class="changed ' + (cls || '') + '"><div class="hd"><div><h3>O que mudou</h3><p class="cs">Últimos 30 dias vs. período anterior</p></div>' + (n ? '<span class="badge-n">' + n + (n === 1 ? ' sinal' : ' sinais') + '</span>' : '') + '</div>' + body + foot + '</section>';
  }

  function chip(t, up) { return '<span class="dchip ' + (up === true ? 'up' : up === false ? 'dn' : 'nt') + '">' + (up === true ? ic('up', 12) : up === false ? ic('dn', 12) : '') + t + '</span>'; }
  function kpi(icon, l, v, s, chipHtml) { return '<div class="card kpi"><div class="top"><span class="ico">' + ic(icon) + '</span>' + (chipHtml || '') + '</div><div class="l">' + l + '</div><div class="v">' + v + '</div><div class="s">' + s + '</div></div>'; }
  function kpis(d) {
    var t = d.total, m = (d.mudancas && d.mudancas.itens) || [], ns = d.nichos.filter(function (x) { return !x.agrupado; }), top = ns[0];
    var siteCh = m.filter(function (i) { return i.tema === 'Presença digital' && /site/i.test(i.rotulo); })[0];
    return '<div class="bg kpis">' +
      kpi('users', 'Empreendedoras na base', SA.fmtInt(t), esc(recorteTxt(d, FILT)), d.novos30 ? chip('+' + SA.fmtInt(d.novos30) + ' em 30 dias', true) : chip('sem novas em 30 dias')) +
      kpi('pin', 'Estados representados', SA.fmtInt(d.estadosDistintos), SA.fmtInt(d.cidadesDistintas) + ' cidades com 5+ pessoas', chip('de 27 UFs')) +
      kpi('tag', 'Nichos', SA.fmtInt(ns.length), top ? esc(top.k) + ' lidera com ' + pct(top.n, t) + '%' : 'Sem nichos com 5+ pessoas', '') +
      kpi('globe', 'Têm site próprio', d.presenca.site + '%', 'Instagram ' + d.presenca.instagram + '% · e-mail corporativo ' + d.presenca.emailCorp + '%', siteCh ? chip((siteCh.dpp > 0 ? '+' : '−') + Math.abs(siteCh.dpp) + ' p.p.', siteCh.dpp > 0) : '') + '</div>';
  }

  function card(title, sub, body, cls) { return '<section class="card bc ' + (cls || '') + '"><div><h3>' + title + '</h3>' + (sub ? '<p class="cs">' + sub + '</p>' : '') + '</div>' + body + '</section>'; }
  function brows(items, total) {
    var max = Math.max.apply(null, items.map(function (i) { return i.n; }).concat([1]));
    return '<div class="grow">' + items.map(function (i) {
      var p = pct(i.n, total);
      return '<div class="brow" data-tip="' + esc(i.k) + ': ' + SA.fmtInt(i.n) + ' (' + p + '%)"><div class="top"><span>' + esc(i.k) + '</span><span>' + SA.fmtInt(i.n) + '<span class="muted">' + p + '%</span></span></div><div class="trk"><i class="' + (i.agrupado ? 'soft' : '') + '" style="width:' + Math.max(2, i.n / max * 100) + '%"></i></div></div>';
    }).join('') + '</div>';
  }
  function pbars(items) {
    return '<div class="grow">' + items.map(function (i) {
      return '<div class="brow" data-tip="' + esc(i.k) + ': ' + i.n + '%"><div class="top"><span>' + esc(i.k) + '</span><span>' + i.n + '%</span></div><div class="trk"><i style="width:' + Math.max(2, i.n) + '%"></i></div></div>';
    }).join('') + '</div>';
  }
  function ranks(items, total, cols2) {
    return '<div class="' + (cols2 ? 'cols2' : 'grow') + '">' + items.map(function (i, x) {
      return '<div class="rank" data-tip="' + esc(i.k) + ': ' + SA.fmtInt(i.n) + ' (' + pct(i.n, total) + '%)"><span class="nn">' + (x + 1) + '</span><span class="nm">' + esc(i.k) + '</span><span class="vl">' + SA.fmtInt(i.n) + '<span class="muted">' + pct(i.n, total) + '%</span></span></div>';
    }).join('') + '</div>';
  }

  function tilemap(d) {
    var byUf = {}, max = 1; (d.estados || []).forEach(function (e) { byUf[e.k] = e.n; if (e.n > max) max = e.n; });
    var cells = '';
    for (var r = 0; r <= 6; r++) for (var c = 0; c <= 7; c++) {
      var uf = null; Object.keys(TILES).forEach(function (k) { if (TILES[k][0] === r && TILES[k][1] === c) uf = k; });
      if (!uf) { cells += '<div class="tile void"></div>'; continue; }
      var n = byUf[uf];
      if (!n) cells += '<div class="tile off" data-tip="' + uf + ': sem dados suficientes (menos de ' + d.minGrupo + ' pessoas)">' + uf + '</div>';
      else {
        var lvl = Math.min(4, Math.floor(n / max * 4.999)), dark = lvl >= 2;
        cells += '<div class="tile" style="background:' + RAMP[lvl] + ';color:' + (dark ? '#fff' : '#171512') + '" data-tip="' + ufLabel(uf) + ': ' + SA.fmtInt(n) + ' empreendedoras (' + pct(n, d.total) + '%)">' + uf + '<small>' + SA.fmtInt(n) + '</small></div>';
      }
    }
    return '<div class="tilemap" role="img" aria-label="Mapa de estados com o número de empreendedoras">' + cells + '</div>';
  }
  function maplegend() { return '<div class="maplegend"><i></i><div class="lg"><span>menos</span><span>mais empreendedoras</span></div><span style="font-weight:600">Estados em cinza têm menos de 5 pessoas e não aparecem.</span></div>'; }
  function mapCard(d, cls, withSide) {
    var top = (d.estados || []).slice(0, 5), side = '';
    if (withSide) side = '<div class="mapside"><div class="sub">Maiores concentrações</div>' + (top.length ? top.map(function (e) {
      var p = pct(e.n, d.total), mx = pct(top[0].n, d.total) || 1;
      return '<div class="brow" data-tip="' + ufLabel(e.k) + ': ' + SA.fmtInt(e.n) + '"><div class="top"><span>' + e.k + '</span><span>' + p + '%</span></div><div class="trk"><i style="width:' + Math.max(3, p / mx * 100) + '%"></i></div></div>';
    }).join('') : '<p class="muted">Sem estados com 5+ pessoas.</p>') + maplegend() + '</div>';
    else side = '';
    return card('Onde estão', 'Empreendedoras por estado (estados com 5+ pessoas)', '<div class="mapwrap"><div class="mapcol' + (withSide ? '' : ' wide') + '">' + tilemap(d) + (withSide ? '' : '<div style="margin-top:14px">' + maplegend() + '</div>') + '</div>' + side + '</div>', cls);
  }

  /* crescimento acumulado (área) */
  function niceStep(raw) { var pw = Math.pow(10, Math.floor(Math.log(raw) / Math.LN10)), c = [1, 2, 2.5, 5, 10]; for (var i = 0; i < c.length; i++) if (c[i] * pw >= raw) return c[i] * pw; return 10 * pw; }
  function growth(d) { return '<div class="gchart" data-g></div>'; }
  function growthSvg(d, W, H) {
    var c = d.crescimento || [], sum = c.reduce(function (a, m) { return a + m.n; }, 0), acc = Math.max(0, d.total - sum), vals = c.map(function (m) { acc += m.n; return acc; });
    if (!vals.length) return '<p class="muted">Ainda não há cadastros para mostrar.</p>';
    var mob = W < 480, pl = mob ? 36 : 44, pr = 14, top = 12, bot = 30, pw = W - pl - pr, ph = H - top - bot;
    var step = niceStep(Math.max(1, d.total) / 5), ymax = Math.max(step, Math.ceil(d.total / step) * step);
    var xs = vals.map(function (v, i) { return pl + (vals.length > 1 ? pw * i / (vals.length - 1) : pw / 2); }), ys = vals.map(function (v) { return top + ph * (1 - v / ymax); });
    var path = 'M' + xs[0].toFixed(1) + ' ' + ys[0].toFixed(1);
    for (var i = 0; i < xs.length - 1; i++) { var mx = (xs[i] + xs[i + 1]) / 2; path += ' C' + mx.toFixed(1) + ' ' + ys[i].toFixed(1) + ' ' + mx.toFixed(1) + ' ' + ys[i + 1].toFixed(1) + ' ' + xs[i + 1].toFixed(1) + ' ' + ys[i + 1].toFixed(1); }
    var area = path + ' L' + xs[xs.length - 1].toFixed(1) + ' ' + (top + ph) + ' L' + xs[0].toFixed(1) + ' ' + (top + ph) + ' Z';
    var o = '<svg width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Crescimento acumulado da base nos últimos 12 meses, chegando a ' + SA.fmtInt(d.total) + ' cadastros">';
    for (var g = 0; g <= ymax + 0.001; g += step) { var y = top + ph * (1 - g / ymax); o += '<line x1="' + pl + '" y1="' + y.toFixed(1) + '" x2="' + (W - pr) + '" y2="' + y.toFixed(1) + '" stroke="#EFE9DD"/><text x="' + (pl - 8) + '" y="' + (y + 4).toFixed(1) + '" text-anchor="end" font-size="12" font-weight="600" fill="#6B655B">' + SA.fmtInt(g) + '</text>'; }
    o += '<path d="' + area + '" fill="#E8156A" fill-opacity=".12"/><path d="' + path + '" fill="none" stroke="#E8156A" stroke-width="2.5" stroke-linecap="round"/>';
    c.forEach(function (m, i) {
      var mm = Number(m.k.slice(5)) - 1, lbl = MONTHS[mm] + '/' + m.k.slice(2, 4);
      if (!mob || i % 2 === (c.length - 1) % 2) o += '<text x="' + xs[i].toFixed(1) + '" y="' + (H - 8) + '" text-anchor="middle" font-size="12" font-weight="600" fill="#6B655B">' + MONTHS[mm] + '</text>';
      var bw = pw / Math.max(1, c.length - 1);
      o += '<rect x="' + (xs[i] - bw / 2).toFixed(1) + '" y="' + top + '" width="' + bw.toFixed(1) + '" height="' + ph + '" fill="transparent" data-tip="' + lbl + ': ' + SA.fmtInt(vals[i]) + ' na base (' + (m.n ? '+' : '') + SA.fmtInt(m.n) + ' no mês)"/>';
    });
    var lx = xs[xs.length - 1], ly = ys[ys.length - 1], last = c[c.length - 1], lm = Number(last.k.slice(5)) - 1, tw = 138, th = 50, tx = Math.max(pl, lx - tw - 14), ty = Math.min(ly + 2, top + ph - th);
    o += '<line x1="' + lx.toFixed(1) + '" y1="' + ly.toFixed(1) + '" x2="' + lx.toFixed(1) + '" y2="' + (top + ph) + '" stroke="#171512" stroke-dasharray="3 4" pointer-events="none"/><circle cx="' + lx.toFixed(1) + '" cy="' + ly.toFixed(1) + '" r="6" fill="#E8156A" stroke="#fff" stroke-width="2" pointer-events="none"/>' +
      '<g pointer-events="none"><rect x="' + tx.toFixed(1) + '" y="' + ty.toFixed(1) + '" width="' + tw + '" height="' + th + '" rx="12" fill="#171512"/><text x="' + (tx + 14).toFixed(1) + '" y="' + (ty + 20).toFixed(1) + '" font-size="12" font-weight="600" fill="#CFC8BA">' + MONTHS[lm] + '/' + last.k.slice(2, 4) + '</text><text x="' + (tx + 14).toFixed(1) + '" y="' + (ty + 39).toFixed(1) + '" font-size="15" font-weight="800" fill="#fff">' + SA.fmtInt(d.total) + ' cadastros</text></g></svg>';
    return o;
  }

  function fitGrowth() {
    var el = P.view && P.view.querySelector('[data-g]'); if (!el || !LAST) return;
    var W = Math.floor(el.clientWidth), H = Math.floor(el.clientHeight);
    if (W < 200) return;
    el.innerHTML = growthSvg(LAST, W, Math.max(200, H));
  }
  function donut(d) {
    var tot = d.maturidade.reduce(function (a, x) { return a + x.n; }, 0) || 1, cols = ['#F7B4CF', '#E8156A', '#171512'], r = 54, C = 2 * Math.PI * r, off = 0, segs = '';
    d.maturidade.forEach(function (m, i) { var L = C * m.n / tot; if (m.n) segs += '<circle cx="75" cy="75" r="' + r + '" fill="none" stroke="' + cols[i] + '" stroke-width="20" stroke-dasharray="' + Math.max(0, L - 3).toFixed(2) + ' ' + (C - Math.max(0, L - 3)).toFixed(2) + '" stroke-dashoffset="' + (-off).toFixed(2) + '" data-tip="' + esc(m.k) + ': ' + SA.fmtInt(m.n) + ' (' + pct(m.n, tot) + '%)"/>'; off += L; });
    var svg = '<svg class="donut" width="150" height="150" viewBox="0 0 150 150" role="img" aria-label="Maturidade do negócio: ' + d.maturidade.map(function (m) { return pct(m.n, tot) + '% ' + m.k; }).join(', ') + '"><g transform="rotate(-90 75 75)">' + segs + '</g><text x="75" y="76" text-anchor="middle" font-size="26" font-weight="800" fill="#171512" style="font-family:var(--display)">' + SA.fmtInt(tot) + '</text><text x="75" y="95" text-anchor="middle" font-size="12" font-weight="600" fill="#6B655B">empreend.</text></svg>';
    var leg = '<div class="dleg">' + d.maturidade.map(function (m, i) { return '<div><i style="background:' + cols[i] + '"></i><span>' + esc(m.k) + '</span><b>' + pct(m.n, tot) + '%</b></div>'; }).join('') + '</div>';
    return '<div class="mid">' + svg + leg + '</div>';
  }
  function presItems(d) { return [{ k: 'Têm Instagram do negócio', n: d.presenca.instagram }, { k: 'Têm site', n: d.presenca.site }, { k: 'Têm e-mail corporativo', n: d.presenca.emailCorp }]; }

  function tbl(cols, rows) {
    return '<table class="dt"><thead><tr>' + cols.map(function (c) { return '<th>' + c + '</th>'; }).join('') + '</tr></thead><tbody>' + rows.map(function (r) { return '<tr>' + r.map(function (c) { return '<td>' + c + '</td>'; }).join('') + '</tr>'; }).join('') + '</tbody></table>';
  }
  function mgTxt(d) { return 'n = ' + SA.fmtInt(d.total) + ' · margem de referência ' + fmtMargem(d.total); }

  /* ---------- abas ---------- */
  function tabGeral(d) {
    var t = d.total, ns = d.nichos;
    return kpis(d) + '<div class="bg">' +
      card('Crescimento da base', 'Cadastros acumulados, mês a mês · últimos 12 meses', growth(d), 's8') + changed(d, 's4') + '</div>' +
      '<div class="bg">' + mapCard(d, 's7', true) + card('Por nicho', 'Onde as empreendedoras trabalham · ' + mgTxt(d), brows(ns, t), 's5') + '</div>' +
      '<div class="bg">' + card('Principais cidades', 'Nº de empreendedoras · 5+ pessoas', d.cidades.length ? ranks(d.cidades.slice(0, 6), t) + '<p class="foot">Cidades com menos de 5 cadastros ficam de fora.</p>' : '<p class="muted">Ainda não há cidades com 5 ou mais pessoas.</p>', 's4') +
      card('Maturidade do negócio', 'Por número de canais digitais', donut(d) + '<p class="foot">Básica: 1 canal · estruturada: os 3 canais.</p>', 's4') +
      card('Presença digital', 'Quem informou cada canal · ' + mgTxt(d), pbars(presItems(d)), 's4') + '</div>';
  }
  function tabTerritorio(d) {
    var t = d.total, est = (d.estados || []).map(function (e) { return { k: ufLabel(e.k), n: e.n }; }), extra = est.length > 10 ? '<p class="foot">Mais ' + (est.length - 10) + ' estados com 5+ pessoas na tabela.</p>' : '';
    return '<div class="bg">' + mapCard(d, 's6', false) +
      card('Estados com mais empreendedoras', 'As 10 maiores neste recorte', est.length ? brows(est.slice(0, 10), t) + extra : '<p class="muted">Sem estados com 5+ pessoas.</p>', 's6') + '</div>' +
      '<div class="bg">' + card('Cidades com mais empreendedoras', 'As 10 maiores neste recorte · ' + SA.fmtInt(d.cidadesDistintas) + ' cidades com 5+ pessoas', d.cidades.length ? ranks(d.cidades, t, true) : '<p class="muted">Ainda não há cidades com 5 ou mais pessoas.</p>', 's12') + '</div>';
  }
  function tabNegocios(d) {
    var t = d.total;
    return '<div class="bg">' + card('Nichos de atuação', 'Onde as empreendedoras trabalham · ' + mgTxt(d), brows(d.nichos, t), 's7') +
      '<div class="col-stack s5">' + card('Presença digital do negócio', 'Quem informou cada canal · ' + mgTxt(d), pbars(presItems(d))) +
      card('Maturidade do negócio', 'Por número de canais digitais', donut(d) + '<p class="foot">Básica: 1 canal · estruturada: os 3 canais.</p>') + '</div></div>';
  }
  function tables(d) {
    var t = d.total;
    function list(items) { return tbl(['Grupo', 'Pessoas', '%'], items.map(function (i) { return [esc(i.k), SA.fmtInt(i.n), pct(i.n, t) + '%']; })); }
    return '<div class="bg">' +
      card('Nichos de atuação', 'Pessoas por nicho · n = ' + SA.fmtInt(t), list(d.nichos), 's6') +
      card('Estados', 'Estados com 5+ pessoas', d.estados.length ? list(d.estados.map(function (e) { return { k: ufLabel(e.k), n: e.n }; })) : '<p class="muted">Sem estados com 5+ pessoas.</p>', 's6') +
      card('Cidades', 'As 10 maiores neste recorte', d.cidades.length ? list(d.cidades) : '<p class="muted">Sem cidades com 5+ pessoas.</p>', 's6') +
      card('Maturidade e presença digital', 'Indicadores derivados do cadastro · ' + mgTxt(d), tbl(['Indicador', 'Valor'], d.maturidade.map(function (m) { return [esc(m.k), SA.fmtInt(m.n) + ' (' + pct(m.n, d.maturidade.reduce(function (a, x) { return a + x.n; }, 0)) + '%)']; })
        .concat([['Instagram do negócio', d.presenca.instagram + '%'], ['Site', d.presenca.site + '%'], ['E-mail corporativo', d.presenca.emailCorp + '%']])), 's6') +
      card('Crescimento da base', 'Novos cadastros por mês', tbl(['Mês', 'Novas'], d.crescimento.map(function (m) { return [MONTHS[Number(m.k.slice(5)) - 1] + '/' + m.k.slice(2, 4), SA.fmtInt(m.n)]; })), 's6') +
      changed(d, 's6') + '</div>';
  }

  /* ---------- comparação de recortes ---------- */
  function metrics(d) {
    if (!d || d.insuficiente) return null;
    var mat = d.maturidade.reduce(function (a, x) { return a + x.n; }, 0) || 1, topN = d.nichos.filter(function (x) { return !x.agrupado; })[0], topU = d.estados[0];
    return { n: d.total, novos: pct(d.novos30, d.total), insta: d.presenca.instagram, site: d.presenca.site, corp: d.presenca.emailCorp, estr: pct(d.maturidade[2].n, mat),
      nicho: topN ? topN.k + ' (' + pct(topN.n, d.total) + '%)' : '—', estado: topU ? ufLabel(topU.k) + ' (' + pct(topU.n, d.total) + '%)' : '—' };
  }
  function radar(a, b) {
    var ax = [['novos', 'Novas em 30 dias'], ['insta', 'Instagram'], ['site', 'Site'], ['corp', 'E-mail corp.'], ['estr', 'Estruturada']], SW = 440, SH = 350, cx = SW / 2, cy = SH / 2 + 4, R = 112, N = ax.length;
    function pt(i, v) { var ang = -Math.PI / 2 + i * 2 * Math.PI / N; return [cx + Math.cos(ang) * R * v / 100, cy + Math.sin(ang) * R * v / 100]; }
    function poly(m) { return ax.map(function (x, i) { var p = pt(i, Math.min(100, m[x[0]])); return p[0].toFixed(1) + ',' + p[1].toFixed(1); }).join(' '); }
    var o = '<svg viewBox="0 0 ' + SW + ' ' + SH + '" role="img" aria-label="Radar comparando os recortes A e B em cinco indicadores" style="width:100%;max-width:460px;height:auto">';
    [25, 50, 75, 100].forEach(function (g) { o += '<polygon points="' + ax.map(function (x, i) { var p = pt(i, g); return p[0].toFixed(1) + ',' + p[1].toFixed(1); }).join(' ') + '" fill="none" stroke="#E6DFD0"/>'; });
    ax.forEach(function (x, i) {
      var e = pt(i, 100), l = pt(i, 122); o += '<line x1="' + cx + '" y1="' + cy + '" x2="' + e[0].toFixed(1) + '" y2="' + e[1].toFixed(1) + '" stroke="#E6DFD0"/><text x="' + l[0].toFixed(1) + '" y="' + (l[1] + 4).toFixed(1) + '" text-anchor="' + (Math.abs(l[0] - cx) < 6 ? 'middle' : l[0] > cx ? 'start' : 'end') + '" font-size="12" font-weight="700" fill="#4A453D">' + x[1] + '</text>';
    });
    o += '<polygon points="' + poly(b) + '" fill="#171512" fill-opacity=".12" stroke="#171512" stroke-width="2.2"/><polygon points="' + poly(a) + '" fill="#E8156A" fill-opacity=".18" stroke="#E8156A" stroke-width="2.4"/>';
    ax.forEach(function (x, i) { var pa = pt(i, Math.min(100, a[x[0]])), pb = pt(i, Math.min(100, b[x[0]]));
      o += '<circle cx="' + pb[0].toFixed(1) + '" cy="' + pb[1].toFixed(1) + '" r="4" fill="#171512" data-tip="B · ' + x[1] + ': ' + b[x[0]] + '%"/><circle cx="' + pa[0].toFixed(1) + '" cy="' + pa[1].toFixed(1) + '" r="4" fill="#E8156A" data-tip="A · ' + x[1] + ': ' + a[x[0]] + '%"/>'; });
    return o + '</svg>';
  }
  function insight(a, b) {
    var nomes = { novos: 'Novas em 30 dias', insta: 'Instagram do negócio', site: 'Site', corp: 'E-mail corporativo', estr: 'Presença estruturada' }, best = null;
    Object.keys(nomes).forEach(function (k) { var x = a[k] - b[k]; if (!best || Math.abs(x) > Math.abs(best.x)) best = { k: k, x: x }; });
    if (!best || Math.abs(best.x) < 5) return '<p class="foot" style="text-align:center">Os dois recortes têm perfis parecidos: nenhuma diferença chega a 5 p.p.</p>';
    return '<p class="foot" style="text-align:center"><b>Maior diferença:</b> ' + nomes[best.k] + ', ' + (best.x > 0 ? '+' : '−') + Math.abs(best.x) + ' p.p. no recorte ' + (best.x > 0 ? 'A' : 'B') + '.</p>';
  }
  function tabComparar() {
    var a = metrics(LAST), b = metrics(LAST_B);
    var rows = [['Respondentes (n)', 'n'], ['Novas nos últimos 30 dias', 'novos', true], ['Têm Instagram do negócio', 'insta', true], ['Têm site', 'site', true], ['Têm e-mail corporativo', 'corp', true], ['Presença estruturada (3 canais)', 'estr', true], ['Nicho mais comum', 'nicho'], ['Estado mais comum', 'estado']];
    function cell(m, k, isP) { return m ? (k === 'n' ? SA.fmtInt(m.n) : isP ? m[k] + '%' : esc(m[k])) : '<span class="muted">Poucos dados (n &lt; ' + (LAST.minGrupo || 5) + ')</span>'; }
    function diff(k, isP) { if (!a || !b || !isP) return ''; var x = a[k] - b[k]; return '<span class="dpp ' + (x > 0 ? 'up' : x < 0 ? 'dn' : '') + '">' + (x > 0 ? '+' : x < 0 ? '−' : '') + Math.abs(x) + ' p.p.</span>'; }
    var head = '<tr><th>Indicador</th><th>A · ' + esc(recorteTxt(LAST, FILT)) + '</th><th>B · ' + esc(recorteTxt(LAST_B, FILT_B)) + '</th><th>A menos B</th></tr>';
    var body = rows.map(function (r) { return '<tr><td>' + r[0] + '</td><td>' + cell(a, r[1], r[2]) + '</td><td>' + cell(b, r[1], r[2]) + '</td><td>' + diff(r[1], r[2]) + '</td></tr>'; }).join('');
    var note = a && b ? 'Margem de referência dos percentuais: A ' + fmtMargem(a.n) + ' · B ' + fmtMargem(b.n) + '. Diferenças pequenas (abaixo de 5 p.p.) ou com n baixo podem ser só oscilação.' : 'Quando um recorte tem menos de ' + (LAST.minGrupo || 5) + ' pessoas, ele não aparece. Amplie o recorte para comparar.';
    var tb = card('Comparação de recortes', 'Os dois recortes lado a lado, com as mesmas regras de privacidade', '<div class="tscroll grow" style="justify-content:flex-start"><table class="dt cmpt"><thead>' + head + '</thead><tbody>' + body + '</tbody></table></div><p class="foot">' + esc(note) + '</p>', 's7 cmp');
    var rd = card('Perfil em cinco indicadores', 'Percentual de cada recorte · quanto maior a área, mais forte o perfil digital',
      a && b ? '<div class="mid" style="flex-direction:column; justify-content:center; gap:14px">' + radar(a, b) + '<div class="radar-key"><span><i style="background:#E8156A"></i>A</span><span><i style="background:#171512"></i>B</span></div>' + insight(a, b) + '</div>' : '<p class="muted">Precisamos de pelo menos ' + (LAST.minGrupo || 5) + ' pessoas em cada recorte para desenhar o radar.</p>', 's5');
    return '<div class="bg">' + tb + rd + '</div>';
  }

  /* ---------- tela ---------- */
  function fpill(id, icon, label, opts, cur, disabled) {
    return '<span class="fpill' + (disabled ? ' dis' : '') + '"' + (disabled ? ' title="' + (id.slice(-6) === 'estado' ? 'Escolha a região primeiro' : 'Escolha o estado primeiro') + '"' : '') + '>' + ic(icon) + '<label for="' + id + '">' + label + '</label><select id="' + id + '"' + (disabled ? ' disabled' : '') + '>' +
      opts.map(function (o) { return '<option value="' + esc(o.v) + '"' + (o.v === cur ? ' selected' : '') + '>' + esc(o.l) + '</option>'; }).join('') + '</select>' + ic('chev').replace('class="ic"', 'class="ic chev"') + '</span>';
  }
  function filterRow(px, F, o, title, tcls, extra) {
    var nichos = [{ v: '', l: 'Todos' }].concat((o.nichos || []).map(function (n) { return { v: n, l: n }; }));
    var regioes = [{ v: '', l: 'Todo o Brasil' }].concat(Object.keys(REGIOES).filter(function (k) { return (o.regioes || []).indexOf(k) >= 0; }).map(function (k) { return { v: k, l: REGIOES[k] }; }));
    var estados = [{ v: '', l: 'Todos' }].concat((o.estados || []).filter(function (u) { return F.regiao && REGIAO_UF[F.regiao].indexOf(u) >= 0; }).map(function (u) { return { v: u, l: ufLabel(u) }; }));
    var cidades = [{ v: '', l: 'Todas' }].concat((o.cidades || []).filter(function (c) { return c.uf === F.estado; }).map(function (c) { return { v: c.v, l: c.k }; }));
    return '<div class="b-frow' + (title ? ' tight' : '') + '">' + (title ? '<span class="fb-title ' + (tcls || '') + '">' + title + '</span>' : '') +
      fpill(px + '-nicho', 'tag', 'Nicho', nichos, F.nicho) + fpill(px + '-regiao', 'pin', 'Região', regioes, F.regiao) +
      fpill(px + '-estado', 'pin', 'Estado', estados, F.estado, !F.regiao) + fpill(px + '-cidade', 'pin', 'Cidade', cidades, F.cidade, !F.estado) +
      (isEmpty(F) ? '' : '<button class="btn-quiet" type="button" data-clear="' + px + '">Limpar</button>') + (extra || '') + '</div>';
  }
  function widen(F) { if (F.cidade) F.cidade = ''; else if (F.estado) F.estado = ''; else if (F.regiao) F.regiao = ''; else F.nicho = ''; }
  function widenLabel(F) { return F.cidade ? 'Ampliar para o estado' : F.estado ? 'Ampliar para a região' : F.regiao ? 'Ampliar para todo o Brasil' : 'Ver todos os nichos'; }

  function head(d) {
    var me = (P.me && P.me.user) || {}, hello = me.nome ? 'Olá, ' + esc(SA.firstName(me.nome)) : 'Olá';
    var acts = d && !d.insuficiente ? '<div class="head-acts"><button class="btn-white" type="button" id="btn-csv">' + ic('dl') + 'Planilha (CSV)</button><button class="btn-ink" type="button" id="btn-brief">' + ic('file') + 'Radar do mês (PDF)</button></div>' : '';
    return '<div class="b-head"><div><div class="b-hello">' + hello + '</div><h1>Inteligência da Base</h1><p>Como são as empreendedoras que participam do Saldo Alto. Números agregados, sem identificar ninguém.</p></div>' + acts + '</div>';
  }
  function draw() {
    var d = LAST, v = view(), o = d.opcoes || {}, cmp = TAB === 'comparar';
    var filters = '<div class="b-filters">' + filterRow('fa', FILT, o, cmp ? 'Recorte A' : '') + (cmp ? filterRow('fb', FILT_B, o, 'Recorte B', 'b') : '') + '</div>';
    var tabs = '<div class="b-tabrow"><div class="b-tabs" role="tablist" aria-label="Seções da Inteligência da Base">' + TABS.map(function (t) { return '<button type="button" role="tab" id="tab-' + t[0] + '" data-tab="' + t[0] + '" aria-selected="' + (t[0] === TAB) + '">' + t[1] + '</button>'; }).join('') + '</div>' +
      (cmp ? '' : '<div class="seg" role="group" aria-label="Forma de exibição"><button type="button" data-m="graficos" aria-pressed="' + (MODE === 'graficos') + '">Gráficos</button><button type="button" data-m="tabelas" aria-pressed="' + (MODE === 'tabelas') + '">Tabelas</button></div>') + '</div>';
    var html = head(d) + (d.insuficiente ? '' : metaStrip(d));
    html += filters;
    if (d.insuficiente) {
      html += '<div class="card empty"><div class="art">' + P.svg('shield') + '</div><h2>' + (isEmpty(FILT) ? 'A base ainda está começando' : 'Poucas pessoas neste recorte') + '</h2>' +
        '<p>Para proteger a privacidade das empreendedoras, só mostramos dados de grupos com pelo menos ' + d.minGrupo + ' pessoas. ' + (isEmpty(FILT) ? 'Volte em breve: a base cresce a cada cadastro.' : 'Tente um recorte mais amplo.') + '</p>' +
        (isEmpty(FILT) ? '' : '<p><button class="btn-ghost" type="button" id="btn-widen">' + widenLabel(FILT) + '</button></p>') + '</div>';
      v.innerHTML = html; bind(); return;
    }
    html += tabs + '<div role="tabpanel" aria-labelledby="tab-' + TAB + '">';
    if (cmp) html += tabComparar();
    else if (MODE === 'tabelas') html += kpis(d) + tables(d);
    else html += TAB === 'territorio' ? tabTerritorio(d) : TAB === 'negocios' ? tabNegocios(d) : tabGeral(d);
    html += '</div><p class="privacy">' + P.svg('shield') + '<span>Privacidade em primeiro lugar: nenhum dado individual é exibido e grupos com menos de ' + d.minGrupo + ' pessoas ficam de fora ou são reunidos em “Demais”. Como a base é voluntária, use os números como direção, não como retrato oficial. Idade e renda entram quando forem coletadas no cadastro.</span></p>';
    v.innerHTML = html; bind(); fitGrowth();
  }

  function load(nav) {
    var calls = [SA.api('base.insights', { filtros: FILT })];
    if (CMP) calls.push(SA.api('base.insights', { filtros: FILT_B }));
    Promise.all(calls).then(function (r) {
      if (P.stale(nav)) return;
      LAST = r[0]; LAST_B = r[1] || null; draw();
    }).catch(function (err) { if (!P.stale(nav)) P.errorState(err, function () { load(nav); }); });
  }
  function reload() { P.nav++; var id = P.nav; view().innerHTML = head() + '<div class="card pad"><div class="skeleton" style="margin:0"><i></i></div></div>'; load(id); }

  /* ---------- exportações ---------- */
  function hoje() { return new Date().toISOString().slice(0, 10); }
  function csvEscape(x) { x = String(x == null ? '' : x); return /[;"\n]/.test(x) ? '"' + x.replace(/"/g, '""') + '"' : x; }
  function exportCsv() {
    var d = LAST, t = d.total, L = [];
    function row() { L.push(Array.prototype.slice.call(arguments).map(csvEscape).join(';')); }
    row('Saldo Alto - Inteligência da Base'); row('Recorte', recorteTxt(d, FILT)); row('Gerado em', dataBr(hoje())); row('Respondentes (n)', t);
    row('Cadastros de', dataBr(d.periodo && d.periodo.desde), 'a', dataBr(d.periodo && d.periodo.ate)); row('Margem de referência (95%, p = 50%)', fmtMargem(t)); row('Nota metodológica', NOTA); row();
    row('Nichos'); row('Grupo', 'Pessoas', '%'); d.nichos.forEach(function (i) { row(i.k, i.n, pct(i.n, t) + '%'); }); row();
    row('Estados (5+ pessoas)'); row('Estado', 'Pessoas', '%'); d.estados.forEach(function (i) { row(ufLabel(i.k), i.n, pct(i.n, t) + '%'); }); row();
    row('Cidades (5+ pessoas, 10 maiores)'); row('Cidade', 'Pessoas', '%'); d.cidades.forEach(function (i) { row(i.k, i.n, pct(i.n, t) + '%'); }); row();
    row('Presença digital'); row('Canal', '%'); row('Instagram do negócio', d.presenca.instagram + '%'); row('Site', d.presenca.site + '%'); row('E-mail corporativo', d.presenca.emailCorp + '%'); row();
    row('Maturidade'); row('Nível', 'Pessoas'); d.maturidade.forEach(function (m) { row(m.k, m.n); }); row();
    row('Novos cadastros por mês'); row('Mês', 'Novas'); d.crescimento.forEach(function (m) { row(m.k, m.n); }); row();
    row('O que mudou (novas 30 dias x anteriores)'); row('Tema', 'Item', '% novas', '% anteriores', 'Diferença (p.p.)');
    ((d.mudancas && d.mudancas.itens) || []).forEach(function (it) { row(it.tema, it.tema === 'Estado' ? ufLabel(it.rotulo) : it.rotulo, it.pNovas, it.pAnteriores, it.dpp); });
    var blob = new Blob(['﻿' + L.join('\r\n')], { type: 'text/csv;charset=utf-8' }), a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = 'saldo-alto-inteligencia-da-base-' + hoje() + '.csv'; document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500); SA.toast('Planilha gerada.');
  }
  function brief() {
    var d = LAST, t = d.total, now = new Date(), mes = MESES_LONGO[now.getMonth()] + ' de ' + now.getFullYear(), m = d.mudancas || {};
    var topN = d.nichos.filter(function (x) { return !x.agrupado; })[0], topU = d.estados[0], topC = d.cidades[0];
    var destaques = [];
    if (topN) destaques.push('Nicho mais comum: ' + topN.k + ' (' + pct(topN.n, t) + '%).');
    if (topU) destaques.push('Estado com mais empreendedoras: ' + ufLabel(topU.k) + ' (' + pct(topU.n, t) + '%).');
    if (topC) destaques.push('Cidade com mais empreendedoras: ' + topC.k + ' (' + pct(topC.n, t) + '%).');
    destaques.push('Presença digital: ' + d.presenca.instagram + '% têm Instagram do negócio, ' + d.presenca.site + '% têm site e ' + d.presenca.emailCorp + '% têm e-mail corporativo.');
    destaques.push('Maturidade: ' + pct(d.maturidade[2].n, t) + '% estão com presença digital estruturada.');
    destaques.push(SA.fmtInt(d.novos30) + ' novas empreendedoras nos últimos 30 dias (' + pct(d.novos30, t) + '% do recorte).');
    var mud = m.insuficiente ? '<p>Ainda não há cadastros suficientes para comparar períodos.</p>' : (m.itens && m.itens.length ? '<ol>' + m.itens.map(function (it) { return '<li><b>' + esc(it.tema === 'Estado' ? ufLabel(it.rotulo) : it.rotulo) + '</b>: ' + esc(mudancaTexto(it)) + ' (' + (it.dpp > 0 ? '+' : '') + it.dpp + ' p.p.).</li>'; }).join('') + '</ol>' : '<p>Nenhuma mudança relevante neste período.</p>');
    var el = document.getElementById('brief') || document.createElement('div'); el.id = 'brief';
    el.innerHTML = '<div class="bf-head"><div class="bf-brand">Saldo Alto</div><div><h1>Radar do mês</h1><p>' + esc(mes) + ' · ' + esc(recorteTxt(d, FILT)) + '</p></div></div>' +
      '<h2>O que mudou</h2>' + mud + (m.insuficiente ? '' : '<p class="bf-small">Compara as ' + SA.fmtInt(m.nNovas) + ' cadastradas nos últimos 30 dias com as ' + SA.fmtInt(m.nAnteriores) + ' anteriores; só diferenças de 5 p.p. ou mais e com significância de 99%.</p>') +
      '<h2>Destaques</h2><ul>' + destaques.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul>' +
      '<h2>Nichos</h2>' + tbl(['Grupo', 'Pessoas', '%'], d.nichos.map(function (i) { return [esc(i.k), SA.fmtInt(i.n), pct(i.n, t) + '%']; })) +
      '<p class="bf-note"><b>Nota metodológica.</b> n = ' + SA.fmtInt(t) + ' empreendedoras · cadastros de ' + esc(dataBr(d.periodo && d.periodo.desde)) + ' a ' + esc(dataBr(d.periodo && d.periodo.ate)) + ' · margem de referência ' + esc(fmtMargem(t)) + '. ' + esc(NOTA) + '</p>';
    document.body.appendChild(el);
    document.body.classList.add('print-brief');
    var done = function () { document.body.classList.remove('print-brief'); window.removeEventListener('afterprint', done); };
    window.addEventListener('afterprint', done);
    setTimeout(function () { window.print(); setTimeout(done, 1500); }, 60);
  }

  /* ---------- eventos ---------- */
  function bindFilters(px, F) {
    var n = $('#' + px + '-nicho'), r = $('#' + px + '-regiao'), e = $('#' + px + '-estado'), c = $('#' + px + '-cidade'), x = $('[data-clear="' + px + '"]');
    if (n) n.addEventListener('change', function () { F.nicho = n.value; reload(); });
    if (r) r.addEventListener('change', function () { F.regiao = r.value; F.estado = ''; F.cidade = ''; reload(); });
    if (e) e.addEventListener('change', function () { F.estado = e.value; F.cidade = ''; reload(); });
    if (c) c.addEventListener('change', function () { F.cidade = c.value; reload(); });
    if (x) x.addEventListener('click', function () { var z = EMPTY(); F.nicho = z.nicho; F.regiao = z.regiao; F.estado = z.estado; F.cidade = z.cidade; reload(); });
  }
  function setTab(t) {
    var wasCmp = TAB === 'comparar'; TAB = t; CMP = t === 'comparar';
    if (CMP && !wasCmp) { FILT_B = EMPTY(); reload(); }
    else if (!CMP && wasCmp) reload();
    else draw();
  }
  function bind() {
    var v = view();
    bindFilters('fa', FILT); if (CMP) bindFilters('fb', FILT_B);
    $$('.seg button', v).forEach(function (b) { b.addEventListener('click', function () { MODE = b.getAttribute('data-m'); draw(); }); });
    $$('[data-tab]', v).forEach(function (b) { b.addEventListener('click', function () { setTab(b.getAttribute('data-tab')); var nb = $('#tab-' + TAB); if (nb) nb.focus(); }); });
    var w = $('#btn-widen', v); if (w) w.addEventListener('click', function () { widen(FILT); reload(); });
    var b1 = $('#btn-brief', v); if (b1) b1.addEventListener('click', brief);
    var b2 = $('#btn-csv', v); if (b2) b2.addEventListener('click', exportCsv);
    var i = $('#info-btn', v); if (i) i.addEventListener('click', function (ev) { ev.stopPropagation(); INFO = !INFO; draw(); var nb = $('#info-btn'); if (nb) nb.focus(); });
  }
  document.addEventListener('click', function (ev) { if (INFO && !ev.target.closest('.info-wrap')) { INFO = false; if (P.view && P.view.querySelector('.meta-strip')) draw(); } });
  document.addEventListener('keydown', function (ev) { if (ev.key === 'Escape' && INFO) { INFO = false; if (P.view && P.view.querySelector('.meta-strip')) draw(); } });
  var rz = null;
  window.addEventListener('resize', function () { clearTimeout(rz); rz = setTimeout(fitGrowth, 120); });
})();
