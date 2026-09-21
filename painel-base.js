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

  function head(d) {
    var acts = d && !d.insuficiente ? '<div class="head-acts"><button class="btn-ghost" type="button" id="btn-brief">Radar do mês (PDF)</button><button class="btn-ghost" type="button" id="btn-csv">Planilha (CSV)</button></div>' : '';
    return '<div class="page-head"><div><h1>Inteligência da Base</h1><p>Como são as empreendedoras que participam do Saldo Alto. Números agregados, sem identificar ninguém.</p></div>' + acts + '</div>';
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

  /* ---------- filtros: Nicho + Região → Estado → Cidade (dependentes) ---------- */
  function sel(id, opts, cur, disabled) {
    return '<select id="' + id + '"' + (disabled ? ' disabled' : '') + '>' + opts.map(function (o) { return '<option value="' + esc(o.v) + '"' + (o.v === cur ? ' selected' : '') + '>' + esc(o.l) + '</option>'; }).join('') + '</select>';
  }
  function filterBar(px, F, o, title) {
    var nichos = [{ v: '', l: 'Todos os nichos' }].concat((o.nichos || []).map(function (n) { return { v: n, l: n }; }));
    var regioes = [{ v: '', l: 'Todo o Brasil' }].concat(Object.keys(REGIOES).filter(function (k) { return (o.regioes || []).indexOf(k) >= 0; }).map(function (k) { return { v: k, l: REGIOES[k] }; }));
    var estados = [{ v: '', l: F.regiao ? 'Todos os estados' : 'Escolha a região' }].concat((o.estados || []).filter(function (u) { return F.regiao && REGIAO_UF[F.regiao].indexOf(u) >= 0; }).map(function (u) { return { v: u, l: ufLabel(u) }; }));
    var cidades = [{ v: '', l: F.estado ? 'Todas as cidades' : 'Escolha o estado' }].concat((o.cidades || []).filter(function (c) { return c.uf === F.estado; }).map(function (c) { return { v: c.v, l: c.k }; }));
    return '<div class="fbar">' + (title ? '<div class="fb-title">' + title + '</div>' : '') +
      '<div class="field" style="min-width:220px"><label for="' + px + '-nicho">Nicho</label>' + sel(px + '-nicho', nichos, F.nicho) + '</div>' +
      '<div class="field"><label for="' + px + '-regiao">Região</label>' + sel(px + '-regiao', regioes, F.regiao) + '</div>' +
      '<div class="field"><label for="' + px + '-estado">Estado</label>' + sel(px + '-estado', estados, F.estado, !F.regiao) + '</div>' +
      '<div class="field"><label for="' + px + '-cidade">Cidade</label>' + sel(px + '-cidade', cidades, F.cidade, !F.estado) + '</div>' +
      (isEmpty(F) ? '' : '<button class="btn-quiet" type="button" data-clear="' + px + '">Limpar</button>') + '</div>';
  }
  function widen(F) { if (F.cidade) F.cidade = ''; else if (F.estado) F.estado = ''; else if (F.regiao) F.regiao = ''; else F.nicho = ''; }
  function widenLabel(F) { return F.cidade ? 'Ampliar para o estado' : F.estado ? 'Ampliar para a região' : F.regiao ? 'Ampliar para todo o Brasil' : 'Ver todos os nichos'; }

  /* ---------- blocos ---------- */
  function metaStrip(d) {
    var de = d.periodo && d.periodo.desde ? 'Cadastros de ' + dataBr(d.periodo.desde) + ' a ' + dataBr(d.periodo.ate) : 'Cadastros até ' + dataBr(d.periodo && d.periodo.ate);
    return '<div class="meta-strip"><span><b>n = ' + SA.fmtInt(d.total) + '</b> empreendedoras nesta leitura</span><span>' + esc(de) + '</span><span>Base voluntária</span>' +
      '<span class="info-wrap"><button type="button" class="info-btn" id="info-btn" aria-label="Como ler estes números" aria-expanded="' + INFO + '" aria-haspopup="dialog">i</button>' +
      (INFO ? '<div class="info-pop" role="dialog" aria-label="Como ler estes números">' + esc(NOTA) + '</div>' : '') + '</span></div>';
  }

  function mudancaTexto(it) {
    var quem = it.tema === 'Estado' ? 'das novas cadastradas são de ' + ufLabel(it.rotulo) : it.tema === 'Presença digital' ? 'das novas cadastradas ' + it.rotulo.toLowerCase().replace('têm ', 'têm ') : it.tema === 'Maturidade' ? 'das novas cadastradas estão em “' + it.rotulo + '”' : 'das novas cadastradas atuam em ' + it.rotulo;
    return it.pNovas + '% ' + quem + ', contra ' + it.pAnteriores + '% das anteriores';
  }
  function changed(d) {
    var m = d.mudancas || {}, body;
    if (m.insuficiente) body = '<p class="muted">Ainda não há cadastros suficientes para comparar períodos: precisamos de pelo menos ' + m.minN + ' em cada um (agora: ' + m.nNovas + ' nos últimos 30 dias e ' + m.nAnteriores + ' antes). ' + (isEmpty(FILT) ? '' : 'Tente um recorte mais amplo.') + '</p>';
    else if (!m.itens || !m.itens.length) body = '<p class="muted">Nenhuma mudança relevante neste período. Isso também é informação: o perfil de quem chegou nos últimos 30 dias é parecido com o das anteriores.</p>';
    else body = '<ul class="chg">' + m.itens.map(function (it) {
      var up = it.dpp > 0;
      return '<li><span class="arr ' + (up ? 'up' : 'dn') + '" aria-hidden="true">' + (up ? '↑' : '↓') + '</span><div><div class="tg">' + esc(it.tema) + '</div><b>' + esc(it.tema === 'Estado' ? ufLabel(it.rotulo) : it.rotulo) + '</b>' +
        '<p>' + esc(mudancaTexto(it)) + '.</p></div><span class="dpp ' + (up ? 'up' : 'dn') + '">' + (up ? '+' : '') + it.dpp + ' p.p.</span></li>';
    }).join('') + '</ul>';
    var foot = m.insuficiente ? '' : '<p class="cs foot">Compara as ' + SA.fmtInt(m.nNovas) + ' cadastradas nos últimos 30 dias com as ' + SA.fmtInt(m.nAnteriores) + ' anteriores. Só aparecem diferenças de pelo menos 5 p.p. e com significância estatística de 99%.</p>';
    return '<section class="card chart changed"><h3>O que mudou</h3><p class="cs">As mudanças mais relevantes no perfil de quem chegou recentemente</p>' + body + foot + '</section>';
  }

  function kpi(l, v, s) { return '<div class="card kpi"><div class="l">' + l + '</div><div class="v">' + v + '</div><div class="s">' + s + '</div></div>'; }

  function hbars(items, total) {
    var max = Math.max.apply(null, items.map(function (i) { return i.n; }).concat([1]));
    return '<div class="hb">' + items.map(function (i) {
      var p = pct(i.n, total);
      return '<div class="hb-row" data-tip="' + esc(i.k) + ': ' + SA.fmtInt(i.n) + ' (' + p + '%)"><span class="lb">' + esc(i.k) + '</span><span class="hb-track"><span class="hb-fill" style="width:' + Math.max(2, i.n / max * 100) + '%;' + (i.agrupado ? 'background:var(--s1)' : '') + '"></span></span><span class="vl">' + SA.fmtInt(i.n) + ' <span class="muted">' + p + '%</span></span></div>';
    }).join('') + '</div>';
  }
  function chart(title, sub, body, cls) {
    return '<section class="card chart ' + (cls || '') + '"><h3>' + title + '</h3><p class="cs">' + sub + '</p>' + body + '</section>';
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
    var t = d.total, mg = 'n = ' + SA.fmtInt(t) + ' · margem de referência ' + fmtMargem(t);
    return '<div class="charts">' +
      chart('Nichos de atuação', 'Onde as empreendedoras trabalham · n = ' + SA.fmtInt(t), hbars(d.nichos, t)) +
      chart('Estados', 'Distribuição geográfica (estados com 5+ pessoas)', tilemap(d)) +
      chart('Cidades com mais empreendedoras', 'As 10 maiores neste recorte', d.cidades.length ? hbars(d.cidades, t) : '<p class="muted">Ainda não há cidades com 5 ou mais pessoas.</p>') +
      chart('Presença digital do negócio', 'Percentual que informou cada canal · ' + mg, presence(d)) +
      chart('Maturidade do negócio', 'Indicador derivado da presença digital: básica (só um canal), em estruturação (site ou e-mail corporativo) e estruturada (os três canais) · ' + mg, maturity(d)) +
      chart('Crescimento da base', 'Novos cadastros por mês nos últimos 12 meses', growth(d), 'wide') + '</div>';
  }

  function tbl(cols, rows) {
    return '<table class="dt"><thead><tr>' + cols.map(function (c) { return '<th>' + c + '</th>'; }).join('') + '</tr></thead><tbody>' + rows.map(function (r) { return '<tr>' + r.map(function (c) { return '<td>' + c + '</td>'; }).join('') + '</tr>'; }).join('') + '</tbody></table>';
  }
  function tables(d) {
    var t = d.total, mg = 'n = ' + SA.fmtInt(t) + ' · margem de referência ' + fmtMargem(t);
    function list(items) { return tbl(['Grupo', 'Pessoas', '%'], items.map(function (i) { return [esc(i.k), SA.fmtInt(i.n), pct(i.n, t) + '%']; })); }
    return '<div class="charts">' +
      chart('Nichos de atuação', 'Pessoas por nicho · n = ' + SA.fmtInt(t), list(d.nichos)) +
      chart('Estados', 'Estados com 5+ pessoas', d.estados.length ? list(d.estados.map(function (e) { return { k: ufLabel(e.k), n: e.n }; })) : '<p class="muted">Sem estados com 5+ pessoas.</p>') +
      chart('Cidades', 'As 10 maiores neste recorte', d.cidades.length ? list(d.cidades) : '<p class="muted">Sem cidades com 5+ pessoas.</p>') +
      chart('Maturidade e presença digital', 'Indicadores derivados do cadastro · ' + mg, tbl(['Indicador', 'Valor'], d.maturidade.map(function (m) { return [esc(m.k), SA.fmtInt(m.n) + ' (' + pct(m.n, d.maturidade.reduce(function (a, x) { return a + x.n; }, 0)) + '%)']; })
        .concat([['Instagram do negócio', d.presenca.instagram + '%'], ['Site', d.presenca.site + '%'], ['E-mail corporativo', d.presenca.emailCorp + '%']]))) +
      chart('Crescimento da base', 'Novos cadastros por mês', tbl(['Mês', 'Novas'], d.crescimento.map(function (m) { return [MONTHS[Number(m.k.slice(5)) - 1] + '/' + m.k.slice(2, 4), SA.fmtInt(m.n)]; }))) + '</div>';
  }

  /* ---------- comparação de recortes ---------- */
  function metrics(d) {
    if (!d || d.insuficiente) return null;
    var mat = d.maturidade.reduce(function (a, x) { return a + x.n; }, 0) || 1, topN = d.nichos.filter(function (x) { return !x.agrupado; })[0], topU = d.estados[0];
    return { n: d.total, novos: pct(d.novos30, d.total), insta: d.presenca.instagram, site: d.presenca.site, corp: d.presenca.emailCorp, estr: pct(d.maturidade[2].n, mat),
      nicho: topN ? topN.k + ' (' + pct(topN.n, d.total) + '%)' : '—', estado: topU ? ufLabel(topU.k) + ' (' + pct(topU.n, d.total) + '%)' : '—' };
  }
  function compare() {
    var a = metrics(LAST), b = metrics(LAST_B);
    var rows = [['Respondentes (n)', 'n'], ['Novas nos últimos 30 dias', 'novos', true], ['Têm Instagram do negócio', 'insta', true], ['Têm site', 'site', true], ['Têm e-mail corporativo', 'corp', true], ['Presença estruturada (3 canais)', 'estr', true], ['Nicho mais comum', 'nicho'], ['Estado mais comum', 'estado']];
    function cell(m, k, isP) { return m ? (k === 'n' ? SA.fmtInt(m.n) : isP ? m[k] + '%' : esc(m[k])) : '<span class="muted">Poucos dados (n &lt; ' + (LAST.minGrupo || 5) + ')</span>'; }
    function diff(k, isP) { if (!a || !b || !isP) return ''; var x = a[k] - b[k]; return '<span class="dpp ' + (x > 0 ? 'up' : x < 0 ? 'dn' : '') + '">' + (x > 0 ? '+' : '') + x + ' p.p.</span>'; }
    var head = '<tr><th>Indicador</th><th>A · ' + esc(recorteTxt(LAST, FILT)) + '</th><th>B · ' + esc(recorteTxt(LAST_B, FILT_B)) + '</th><th>A menos B</th></tr>';
    var body = rows.map(function (r) { return '<tr><td>' + r[0] + '</td><td>' + cell(a, r[1], r[2]) + '</td><td>' + cell(b, r[1], r[2]) + '</td><td>' + diff(r[1], r[2]) + '</td></tr>'; }).join('');
    var note = a && b ? 'Margem de referência dos percentuais: A ' + fmtMargem(a.n) + ' · B ' + fmtMargem(b.n) + '. Diferenças pequenas (abaixo de 5 p.p.) ou com n baixo podem ser só oscilação.' : 'Quando um recorte tem menos de ' + (LAST.minGrupo || 5) + ' pessoas, ele não aparece. Amplie o recorte para comparar.';
    return '<section class="card chart cmp"><h3>Comparação de recortes</h3><p class="cs">Os dois recortes lado a lado, com as mesmas regras de privacidade</p><div class="tscroll"><table class="dt cmpt"><thead>' + head + '</thead><tbody>' + body + '</tbody></table></div><p class="cs foot">' + esc(note) + '</p></section>';
  }

  /* ---------- tela ---------- */
  function draw() {
    var d = LAST, v = view(), o = d.opcoes || {};
    var toggle = '<button class="btn-quiet" type="button" id="cmp-toggle" aria-pressed="' + CMP + '">' + (CMP ? 'Sair da comparação' : 'Comparar recortes') + '</button>';
    var seg = '<div class="seg" role="group" aria-label="Forma de exibição"><button type="button" data-m="graficos" aria-pressed="' + (MODE === 'graficos') + '">Gráficos</button><button type="button" data-m="tabelas" aria-pressed="' + (MODE === 'tabelas') + '">Tabelas</button></div>';
    var html = head(d) + (d.insuficiente ? '' : metaStrip(d)) + '<div class="fwrap">' + filterBar('fa', FILT, o, CMP ? 'Recorte A' : '') + (CMP ? filterBar('fb', FILT_B, o, 'Recorte B') : '') + '<div class="fact">' + toggle + seg + '</div></div>';
    if (d.insuficiente) {
      html += '<div class="card empty"><div class="art">' + P.svg('shield') + '</div><h2>' + (isEmpty(FILT) ? 'A base ainda está começando' : 'Poucas pessoas neste recorte') + '</h2>' +
        '<p>Para proteger a privacidade das empreendedoras, só mostramos dados de grupos com pelo menos ' + d.minGrupo + ' pessoas. ' + (isEmpty(FILT) ? 'Volte em breve: a base cresce a cada cadastro.' : 'Tente um recorte mais amplo.') + '</p>' +
        (isEmpty(FILT) ? '' : '<p><button class="btn-ghost" type="button" id="btn-widen">' + widenLabel(FILT) + '</button></p>') + '</div>';
      v.innerHTML = html; bind(); return;
    }
    var total = d.total;
    if (CMP) html += compare();
    html += changed(d);
    html += '<div class="kpis">' +
      kpi('Empreendedoras nesta leitura (n)', SA.fmtInt(total), esc(recorteTxt(d, FILT))) +
      kpi('Novas nos últimos 30 dias', SA.fmtInt(d.novos30), pct(d.novos30, total) + '% do recorte') +
      kpi('Estados representados', SA.fmtInt(d.estadosDistintos), 'com 5+ pessoas') +
      kpi('Cidades representadas', SA.fmtInt(d.cidadesDistintas), 'com 5+ pessoas') + '</div>';
    html += MODE === 'graficos' ? charts(d) : tables(d);
    html += '<p class="privacy">' + P.svg('shield') + '<span>Privacidade em primeiro lugar: nenhum dado individual é exibido e grupos com menos de ' + d.minGrupo + ' pessoas ficam de fora ou são reunidos em “Demais”. Como a base é voluntária, use os números como direção, não como retrato oficial. Idade e renda entram quando forem coletadas no cadastro.</span></p>';
    v.innerHTML = html; bind();
  }

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
  function bind() {
    var v = view();
    bindFilters('fa', FILT); if (CMP) bindFilters('fb', FILT_B);
    $$('.seg button', v).forEach(function (b) { b.addEventListener('click', function () { MODE = b.getAttribute('data-m'); draw(); }); });
    var t = $('#cmp-toggle', v); if (t) t.addEventListener('click', function () { CMP = !CMP; if (CMP) { var z = EMPTY(); FILT_B = z; } reload(); });
    var w = $('#btn-widen', v); if (w) w.addEventListener('click', function () { widen(FILT); reload(); });
    var b1 = $('#btn-brief', v); if (b1) b1.addEventListener('click', brief);
    var b2 = $('#btn-csv', v); if (b2) b2.addEventListener('click', exportCsv);
    var i = $('#info-btn', v); if (i) i.addEventListener('click', function (ev) { ev.stopPropagation(); INFO = !INFO; draw(); var nb = $('#info-btn'); if (nb) nb.focus(); });
  }
  document.addEventListener('click', function (ev) { if (INFO && !ev.target.closest('.info-wrap')) { INFO = false; if (P.view && P.view.querySelector('.meta-strip')) draw(); } });
  document.addEventListener('keydown', function (ev) { if (ev.key === 'Escape' && INFO) { INFO = false; if (P.view && P.view.querySelector('.meta-strip')) draw(); } });
})();
