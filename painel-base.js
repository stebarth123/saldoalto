/* Saldo Alto — Inteligência da Base (indicadores agregados da base de empreendedoras).
   Só números agregados: grupos com menos de 5 pessoas não aparecem (regra aplicada no servidor). */
(function () {
  'use strict';
  var P = window.P, esc = SA.esc, $ = P.$, $$ = P.$$;
  var FILT = { nicho: '', estado: '' }, MODE = 'graficos', LAST = null;

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
  // Ilustração: ainda não coletamos idade no cadastro. Valores fixos, sempre rotulados como demonstração.
  var AGE_DEMO = [{ k: '18 a 24 anos', p: 9 }, { k: '25 a 34 anos', p: 34 }, { k: '35 a 44 anos', p: 30 }, { k: '45 a 54 anos', p: 19 }, { k: '55 anos ou mais', p: 8 }];

  function pct(n, t) { return t ? Math.round(n / t * 100) : 0; }

  P.routes.base = function (args, nav) {
    P.setTitle('Inteligência da Base');
    if (!SA.can('dashboard')) { P.noAccess('a Inteligência da Base'); return; }
    view().innerHTML = head('') + '<div class="card pad"><div class="skeleton" style="margin:0"><i></i></div></div>';
    load(nav);
  };
  function view() { return P.view; }

  function head(extra) {
    return '<div class="page-head"><div><h1>Inteligência da Base</h1><p>Como são as empreendedoras que respondem as pesquisas do Saldo Alto. Números agregados, sem identificar ninguém.</p></div></div>' + extra;
  }

  function load(nav) {
    SA.api('base.insights', { filtros: { nicho: FILT.nicho, estado: FILT.estado } }).then(function (d) {
      if (P.stale(nav)) return;
      LAST = d; draw();
    }).catch(function (err) { if (!P.stale(nav)) P.errorState(err, function () { load(nav); }); });
  }

  function filters(d) {
    var nichos = [{ v: '', l: 'Todos os nichos' }].concat((d.opcoes.nichos || []).map(function (n) { return { v: n, l: n }; }));
    var estados = [{ v: '', l: 'Todos os estados' }].concat((d.opcoes.estados || []).map(function (n) { return { v: n, l: n }; }));
    return '<div class="fbar"><div class="field" style="min-width:230px">' + '<label for="f-nicho">Nicho</label>' + sel('f-nicho', nichos, FILT.nicho) + '</div>' +
      '<div class="field">' + '<label for="f-estado">Estado</label>' + sel('f-estado', estados, FILT.estado) + '</div>' +
      (FILT.nicho || FILT.estado ? '<button class="btn-quiet" type="button" id="clr">Limpar filtros</button>' : '') +
      '<div class="seg" role="group" aria-label="Forma de exibição"><button type="button" data-m="graficos" aria-pressed="' + (MODE === 'graficos') + '">Gráficos</button><button type="button" data-m="tabelas" aria-pressed="' + (MODE === 'tabelas') + '">Tabelas</button></div></div>';
  }
  function sel(id, opts, cur) {
    return '<select id="' + id + '">' + opts.map(function (o) { return '<option value="' + esc(o.v) + '"' + (o.v === cur ? ' selected' : '') + '>' + esc(o.l) + '</option>'; }).join('') + '</select>';
  }

  function draw() {
    var d = LAST, v = view();
    var html = head(filters(d));
    if (d.insuficiente) {
      html += '<div class="card empty"><div class="art">' + P.svg('shield') + '</div><h2>' + (FILT.nicho || FILT.estado ? 'Poucas pessoas neste filtro' : 'A base ainda está começando') + '</h2>' +
        '<p>Para proteger a privacidade das empreendedoras, só mostramos dados de grupos com pelo menos ' + d.minGrupo + ' pessoas. ' + (FILT.nicho || FILT.estado ? 'Tente um filtro mais amplo.' : 'Volte em breve: a base cresce a cada cadastro.') + '</p></div>';
      v.innerHTML = html; bind(); return;
    }
    var total = d.total;
    html += '<div class="kpis">' +
      kpi('Empreendedoras na base', SA.fmtInt(total), FILT.nicho || FILT.estado ? 'neste filtro' : 'cadastradas') +
      kpi('Novas nos últimos 30 dias', SA.fmtInt(d.novos30), pct(d.novos30, total) + '% da base') +
      kpi('Estados representados', SA.fmtInt(d.estadosDistintos), 'com 5+ pessoas') +
      kpi('Cidades representadas', SA.fmtInt(d.cidadesDistintas), 'com 5+ pessoas') + '</div>';
    html += MODE === 'graficos' ? charts(d) : tables(d);
    html += '<p class="privacy">' + P.svg('shield') + '<span>Privacidade em primeiro lugar: nenhum dado individual é exibido e grupos com menos de ' + d.minGrupo + ' pessoas ficam de fora ou são reunidos em “Demais”. Idade e renda ainda não fazem parte do cadastro; os cards marcados como ilustrativo mostram apenas como esses indicadores vão aparecer.</span></p>';
    v.innerHTML = html; bind();
  }

  function kpi(l, v, s) { return '<div class="card kpi"><div class="l">' + l + '</div><div class="v">' + v + '</div><div class="s">' + s + '</div></div>'; }

  function hbars(items, total, opts) {
    opts = opts || {};
    var max = Math.max.apply(null, items.map(function (i) { return i.n; }).concat([1]));
    return '<div class="hb">' + items.map(function (i) {
      var p = pct(i.n, total);
      return '<div class="hb-row" data-tip="' + esc(i.k) + ': ' + SA.fmtInt(i.n) + ' (' + p + '%)"><span class="lb">' + esc(i.k) + '</span><span class="hb-track"><span class="hb-fill" style="width:' + Math.max(2, i.n / max * 100) + '%;' + (i.agrupado ? 'background:var(--s1)' : '') + '"></span></span><span class="vl">' + SA.fmtInt(i.n) + '</span></div>';
    }).join('') + '</div>';
  }
  function chart(title, sub, body, cls, demo) {
    return '<section class="card chart ' + (cls || '') + '"><h3>' + title + (demo ? '<span class="demo-tag">Ilustrativo</span>' : '') + '</h3><p class="cs">' + sub + '</p>' + body + '</section>';
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
        cells += '<div class="tile" style="background:' + RAMP[lvl] + ';color:' + (dark ? '#fff' : '#171512') + '" data-tip="' + uf + ': ' + SA.fmtInt(n) + ' empreendedoras (' + pct(n, d.total) + '%)">' + uf + '<small>' + SA.fmtInt(n) + '</small></div>';
      }
    }
    return '<div class="tilemap" role="img" aria-label="Mapa de estados com o número de empreendedoras">' + cells + '</div><div class="maplegend"><span>menos</span><i></i><span>mais</span></div>';
  }

  function growth(d) {
    var max = Math.max.apply(null, d.crescimento.map(function (m) { return m.n; }).concat([1]));
    return '<div class="cols" role="img" aria-label="Novas empreendedoras por mês">' + d.crescimento.map(function (m) {
      var mm = Number(m.k.slice(5)) - 1;
      return '<div class="col" data-tip="' + MONTHS[mm] + '/' + m.k.slice(2, 4) + ': ' + SA.fmtInt(m.n) + ' novas"><div class="cb" style="height:' + (m.n / max * 82) + '%"></div><span class="cl">' + MONTHS[mm] + '</span></div>';
    }).join('') + '</div>';
  }

  function maturity(d) {
    var tot = d.maturidade.reduce(function (a, x) { return a + x.n; }, 0) || 1, cols = ['#F9C9DE', '#E8156A', '#8E0C3B'];
    var bar = '<div class="stackbar" role="img" aria-label="Maturidade digital">' + d.maturidade.map(function (m, i) {
      return '<i style="width:' + (m.n / tot * 100) + '%;background:' + cols[i] + '" data-tip="' + esc(m.k) + ': ' + SA.fmtInt(m.n) + ' (' + pct(m.n, tot) + '%)"></i>';
    }).join('') + '</div>';
    var legend = '<div class="legend">' + d.maturidade.map(function (m, i) { return '<span><b style="background:' + cols[i] + '"></b>' + esc(m.k) + ' <span class="muted">' + pct(m.n, tot) + '%</span></span>'; }).join('') + '</div>';
    return bar + legend;
  }

  function presence(d) {
    var items = [{ k: 'Têm Instagram do negócio', n: d.presenca.instagram }, { k: 'Têm site', n: d.presenca.site }, { k: 'Têm e-mail corporativo', n: d.presenca.emailCorp }];
    return '<div class="hb">' + items.map(function (i) {
      return '<div class="hb-row" data-tip="' + i.k + ': ' + i.n + '%"><span class="lb">' + i.k + '</span><span class="hb-track"><span class="hb-fill" style="width:' + Math.max(2, i.n) + '%"></span></span><span class="vl">' + i.n + '%</span></div>';
    }).join('') + '</div>';
  }

  function charts(d) {
    var t = d.total;
    return '<div class="charts">' +
      chart('Nichos de atuação', 'Onde as empreendedoras trabalham', hbars(d.nichos, t)) +
      chart('Estados', 'Distribuição geográfica (estados com 5+ pessoas)', tilemap(d)) +
      chart('Cidades com mais empreendedoras', 'As 10 maiores da base', d.cidades.length ? hbars(d.cidades, t) : '<p class="muted">Ainda não há cidades com 5 ou mais pessoas.</p>') +
      chart('Presença digital do negócio', 'Percentual da base que informou cada canal', presence(d)) +
      chart('Maturidade do negócio', 'Indicador derivado da presença digital: básica (só um canal), em estruturação (site ou e-mail corporativo) e estruturada (os três canais)', maturity(d)) +
      chart('Idade das empreendedoras', 'Faixas etárias da base (dado ainda não coletado no cadastro)', hbarsPct(AGE_DEMO), '', true) +
      chart('Crescimento da base', 'Novos cadastros por mês nos últimos 12 meses', growth(d), 'wide') + '</div>';
  }
  function hbarsPct(items) {
    return '<div class="hb">' + items.map(function (i) { return '<div class="hb-row" data-tip="' + esc(i.k) + ': ' + i.p + '% (exemplo)"><span class="lb">' + esc(i.k) + '</span><span class="hb-track"><span class="hb-fill" style="width:' + (i.p / 34 * 100) + '%;background:var(--s2)"></span></span><span class="vl">' + i.p + '%</span></div>'; }).join('') + '</div>';
  }

  function tbl(cols, rows) {
    return '<table class="dt"><thead><tr>' + cols.map(function (c) { return '<th>' + c + '</th>'; }).join('') + '</tr></thead><tbody>' + rows.map(function (r) { return '<tr>' + r.map(function (c) { return '<td>' + c + '</td>'; }).join('') + '</tr>'; }).join('') + '</tbody></table>';
  }
  function tables(d) {
    var t = d.total;
    function list(items) { return tbl(['Grupo', 'Pessoas', '%'], items.map(function (i) { return [esc(i.k), SA.fmtInt(i.n), pct(i.n, t) + '%']; })); }
    return '<div class="charts">' +
      chart('Nichos de atuação', 'Pessoas por nicho', list(d.nichos)) +
      chart('Estados', 'Estados com 5+ pessoas', d.estados.length ? list(d.estados) : '<p class="muted">Sem estados com 5+ pessoas.</p>') +
      chart('Cidades', 'As 10 maiores da base', d.cidades.length ? list(d.cidades) : '<p class="muted">Sem cidades com 5+ pessoas.</p>') +
      chart('Maturidade e presença digital', 'Indicadores derivados do cadastro', tbl(['Indicador', 'Valor'], d.maturidade.map(function (m) { return [esc(m.k), SA.fmtInt(m.n) + ' (' + pct(m.n, d.maturidade.reduce(function (a, x) { return a + x.n; }, 0)) + '%)']; })
        .concat([['Instagram do negócio', d.presenca.instagram + '%'], ['Site', d.presenca.site + '%'], ['E-mail corporativo', d.presenca.emailCorp + '%']]))) +
      chart('Crescimento da base', 'Novos cadastros por mês', tbl(['Mês', 'Novas'], d.crescimento.map(function (m) { return [MONTHS[Number(m.k.slice(5)) - 1] + '/' + m.k.slice(2, 4), SA.fmtInt(m.n)]; }))) +
      chart('Idade das empreendedoras', 'Dado ainda não coletado no cadastro', tbl(['Faixa', '%'], AGE_DEMO.map(function (a) { return [esc(a.k), a.p + '%']; })), '', true) + '</div>';
  }

  function bind() {
    var v = view();
    var n = $('#f-nicho', v), e = $('#f-estado', v), c = $('#clr', v);
    function reload() { P.nav++; var id = P.nav; v.innerHTML = head('') + '<div class="card pad"><div class="skeleton" style="margin:0"><i></i></div></div>'; load(id); }
    if (n) n.addEventListener('change', function () { FILT.nicho = n.value; reload(); });
    if (e) e.addEventListener('change', function () { FILT.estado = e.value; reload(); });
    if (c) c.addEventListener('click', function () { FILT.nicho = ''; FILT.estado = ''; reload(); });
    $$('.seg button', v).forEach(function (b) { b.addEventListener('click', function () { MODE = b.getAttribute('data-m'); draw(); }); });
  }
})();
