/* Saldo Alto — painel da empresa: núcleo (rotas, modais, formulários) + Minhas pesquisas + detalhe da pesquisa.
   Outras telas: painel-base.js (Inteligência da Base) e painel-conta.js (perfil e configurações). */
(function () {
  'use strict';
  var esc = SA.esc;
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var P = window.P = { routes: {}, me: null, nav: 0 };
  var view = $('#view');
  P.view = view; P.$ = $; P.$$ = $$;

  /* ---------- ícones ---------- */
  var IC = {
    plus: '<path d="M5 12h14"/><path d="M12 5v14"/>', search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
    dots: '<circle cx="12" cy="5" r="1.3" fill="currentColor"/><circle cx="12" cy="12" r="1.3" fill="currentColor"/><circle cx="12" cy="19" r="1.3" fill="currentColor"/>',
    edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/>', copy: '<rect width="14" height="14" x="8" y="8" rx="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>',
    trash: '<path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>',
    open: '<path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>',
    doc: '<path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5z"/><path d="M14 2v6h6"/><path d="M8 13h8"/><path d="M8 17h5"/>',
    shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/>',
    key: '<circle cx="7.5" cy="15.5" r="4.5"/><path d="m10.7 12.3 8.3-8.3"/><path d="m15 8 3 3"/>',
    x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>'
  };
  P.svg = function (n, cls) { return '<svg class="ic ' + (cls || '') + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + IC[n] + '</svg>'; };

  /* ---------- utilidades de tela ---------- */
  P.busy = function (btn, on, label) {
    if (!btn) return;
    if (on) { btn.dataset.label = btn.innerHTML; btn.disabled = true; btn.innerHTML = '<span class="spin"></span>' + label; }
    else { btn.disabled = false; if (btn.dataset.label) btn.innerHTML = btn.dataset.label; }
  };
  P.errorState = function (err, retry) {
    view.innerHTML = '<div class="card errbox"><b>Não foi possível carregar</b><p>' + esc(err.message || 'Tente novamente em instantes.') + '</p><button class="btn-primary" id="retry">Tentar de novo</button></div>';
    $('#retry').addEventListener('click', retry);
  };
  P.stale = function (id) { return id !== P.nav; };
  P.setTitle = function (t) { document.title = t + ' — Saldo Alto para Empresas'; };

  /* campo de formulário: { id, label, value, type, ph, opt, full, ro, hint, max, options } */
  P.field = function (o) {
    var v = o.value === undefined || o.value === null ? '' : o.value;
    var label = '<label for="f-' + o.id + '">' + esc(o.label) + (o.opt ? ' <span class="opt">(opcional)</span>' : '') + '</label>';
    var ctl;
    if (o.options) {
      ctl = '<select id="f-' + o.id + '"' + (o.ro ? ' disabled' : '') + '>' + o.options.map(function (x) {
        var val = typeof x === 'string' ? x : x.v, lab = typeof x === 'string' ? x : x.l;
        return '<option value="' + esc(val) + '"' + (String(val) === String(v) ? ' selected' : '') + '>' + esc(lab) + '</option>';
      }).join('') + '</select>';
    } else {
      ctl = '<input id="f-' + o.id + '" type="' + (o.type || 'text') + '" value="' + esc(v) + '"' + (o.ph ? ' placeholder="' + esc(o.ph) + '"' : '') + (o.ro ? ' readonly' : '') +
        (o.max ? ' maxlength="' + o.max + '"' : '') + (o.auto ? ' autocomplete="' + o.auto + '"' : '') + (o.mode ? ' inputmode="' + o.mode + '"' : '') + '>';
    }
    return '<div class="field' + (o.full ? ' full' : '') + '">' + label + ctl + (o.hint ? '<div class="hint">' + o.hint + '</div>' : '') + '<div class="err" id="e-' + o.id + '"></div></div>';
  };
  P.setErr = function (scope, id, msg) {
    var el = $('#f-' + id, scope); if (!el) return false;
    var f = el.closest('.field'); f.classList.toggle('invalid', !!msg);
    var e = $('#e-' + id, scope); if (e) e.textContent = msg || '';
    el.setAttribute('aria-invalid', msg ? 'true' : 'false');
    return true;
  };
  P.clearErrs = function (scope) {
    $$('.field.invalid', scope).forEach(function (f) { f.classList.remove('invalid'); });
    var a = $('.form-alert', scope); if (a) a.remove();
  };
  P.formAlert = function (scope, msg) {
    var a = $('.form-alert', scope); if (a) a.remove();
    a = document.createElement('div'); a.className = 'form-alert'; a.setAttribute('role', 'alert'); a.textContent = msg;
    scope.insertBefore(a, scope.firstChild);
  };
  /* Valida no cliente (rules: {id: fn(value) -> msg}) e devolve true se tudo certo */
  P.validate = function (scope, rules) {
    var first = null;
    Object.keys(rules).forEach(function (id) {
      var el = $('#f-' + id, scope); if (!el) return;
      var msg = rules[id](el.value);
      P.setErr(scope, id, msg || '');
      if (msg && !first) first = el;
    });
    if (first) first.focus();
    return !first;
  };
  P.serverError = function (scope, err) {
    var shown = false;
    if (err.fields) Object.keys(err.fields).forEach(function (k) { if (P.setErr(scope, k, err.fields[k])) shown = true; });
    if (!shown) P.formAlert(scope, err.message);
    else { var bad = $('.field.invalid input, .field.invalid select', scope); if (bad) bad.focus(); }
  };
  P.reqs = function (input, ul) {
    ul.innerHTML = SA.passwordChecks(input.value).map(function (c) { return '<li class="' + (c.ok ? 'ok' : '') + '">' + c.label + '</li>'; }).join('');
  };
  P.pwdError = function (v) { return SA.passwordChecks(v).every(function (c) { return c.ok; }) ? '' : 'A senha precisa cumprir os requisitos abaixo.'; };

  /* ---------- modal ---------- */
  var lastFocus = null;
  P.modal = function (html, onMount) {
    P.closeModal();
    lastFocus = document.activeElement;
    var root = $('#modalRoot');
    root.innerHTML = '<div class="overlay" id="ovl"><div class="modal" role="dialog" aria-modal="true">' + '<button class="x" type="button" data-close aria-label="Fechar">✕</button>' + html + '</div></div>';
    var ovl = $('#ovl'), box = $('.modal', ovl);
    ovl.addEventListener('mousedown', function (e) { if (e.target === ovl && !ovl.hasAttribute('data-locked')) P.closeModal(); });
    box.addEventListener('click', function (e) { if (e.target.closest('[data-close]')) P.closeModal(); });
    document.addEventListener('keydown', escClose);
    document.body.style.overflow = 'hidden';
    var f = $('input:not([type=checkbox]):not([type=radio]), select, textarea, button.btn-primary', box); if (f) f.focus();
    if (onMount) onMount(box);
    return box;
  };
  function escClose(e) { if (e.key === 'Escape' && !$('#ovl[data-locked]')) P.closeModal(); }
  P.closeModal = function () {
    var root = $('#modalRoot'); if (!root.firstChild) return;
    root.innerHTML = ''; document.body.style.overflow = ''; document.removeEventListener('keydown', escClose);
    if (lastFocus && lastFocus.focus) { try { lastFocus.focus(); } catch (e) { /* ignora */ } }
  };
  P.confirm = function (o) {
    return new Promise(function (resolve) {
      var box = P.modal('<h3>' + esc(o.title) + '</h3><p class="sub">' + esc(o.text) + '</p><div class="modal-actions"><button class="btn-ghost" data-close type="button">Cancelar</button><button class="' + (o.danger ? 'btn-danger' : 'btn-primary') + '" type="button" id="cfOk">' + esc(o.ok) + '</button></div>');
      $('#cfOk', box).addEventListener('click', function () { P.closeModal(); resolve(true); });
      box.addEventListener('click', function (e) { if (e.target.closest('[data-close]')) resolve(false); });
      $('#ovl').addEventListener('mousedown', function (e) { if (e.target.id === 'ovl') resolve(false); });
    });
  };

  /* ---------- dica flutuante (tooltip) dos gráficos ---------- */
  var tip = $('#tip');
  function showTip(e) {
    var t = e.target.closest('[data-tip]');
    if (!t) { tip.classList.remove('on'); return; }
    tip.textContent = t.getAttribute('data-tip'); tip.classList.add('on');
    var x = e.clientX + 14, y = e.clientY + 16, w = tip.offsetWidth;
    if (x + w > window.innerWidth - 8) x = e.clientX - w - 14;
    tip.style.left = Math.max(8, x) + 'px'; tip.style.top = y + 'px';
  }
  document.addEventListener('mousemove', showTip);
  document.addEventListener('mouseleave', function () { tip.classList.remove('on'); });
  document.addEventListener('scroll', function () { tip.classList.remove('on'); }, true);

  /* ---------- troca obrigatória de senha (convite / senha provisória) ---------- */
  function forcePassword() {
    var box = P.modal('<h3>Crie sua senha</h3><p class="sub">Você entrou com uma senha provisória. Escolha uma senha só sua para continuar.</p><form id="ffp" novalidate>' +
      P.field({ id: 'fp1', label: 'Nova senha', type: 'password', auto: 'new-password' }) + '<ul class="reqs" id="fpr" style="margin:-8px 0 14px"></ul>' +
      P.field({ id: 'fp2', label: 'Confirmar nova senha', type: 'password', auto: 'new-password' }) +
      '<div class="modal-actions"><button class="btn-primary" type="submit">Salvar e continuar</button></div></form>');
    $('#ovl').setAttribute('data-locked', '1'); $('.x', box).remove();
    var f = $('#ffp', box); P.reqs($('#f-fp1', box), $('#fpr', box));
    $('#f-fp1', box).addEventListener('input', function (e) { P.reqs(e.target, $('#fpr', box)); });
    f.addEventListener('submit', function (e) {
      e.preventDefault(); P.clearErrs(f);
      if (!P.validate(f, { fp1: P.pwdError, fp2: function (v) { return v === $('#f-fp1', f).value ? '' : 'As senhas não são iguais.'; } })) return;
      var b = $('button[type=submit]', f); P.busy(b, true, 'Salvando…');
      SA.api('security.setInitialPassword', { nova: $('#f-fp1', f).value }).then(function (d) {
        SA.refreshSession(d); P.me = d; $('#ovl').removeAttribute('data-locked'); P.closeModal(); SA.toast('Senha criada. Tudo pronto!');
      }).catch(function (err) { P.busy(b, false); if (err.fields && err.fields.nova) P.setErr(f, 'fp1', err.fields.nova); else P.formAlert(f, err.message); });
    });
  }

  /* ---------- roteador ---------- */
  function router() {
    var h = (location.hash || '#pesquisas').slice(1), parts = h.split('/'), r = parts[0] || 'pesquisas';
    var fn = P.routes[r];
    if (!fn) { location.hash = '#pesquisas'; return; }
    P.nav++; var id = P.nav;
    P.closeModal();
    SA.setActiveRoute(r === 'pesquisa' ? 'pesquisas' : r);
    view.scrollTop = 0; window.scrollTo(0, 0);
    fn(parts.slice(1), id);
  }

  function noAccess(what) {
    view.innerHTML = '<div class="card empty"><div class="art">' + P.svg('shield') + '</div><h2>Sem acesso a ' + esc(what) + '</h2><p>Seu perfil não inclui esta área. Peça ao titular da conta para liberar o acesso.</p><a class="btn-primary" href="#perfil">Ir para meu perfil</a></div>';
  }
  P.noAccess = noAccess;

  /* =====================================================================
     MINHAS PESQUISAS
     ===================================================================== */
  var F = { status: 'todas', q: '' };
  var SURVEYS = [];
  var ORDER = ['todas', 'rascunho', 'em_revisao', 'ativa', 'encerrada'];
  var FLABEL = { todas: 'Todas', rascunho: 'Rascunhos', em_revisao: 'Em revisão', ativa: 'Ativas', encerrada: 'Encerradas' };

  P.routes.pesquisas = function (args, nav) {
    P.setTitle('Minhas pesquisas');
    if (!SA.can('pesquisas_ver')) { noAccess('pesquisas'); return; }
    var qs = new URLSearchParams(location.search), me = SA.session().user;
    var welcome = qs.get('nova') ? '<div class="welcome" id="welcome"><div><b>Conta criada. Bem-vinda, ' + esc(SA.firstName(me.nome)) + '!</b><p>Sua empresa já está cadastrada. O próximo passo é criar a primeira pesquisa.</p></div><button class="x" type="button" id="wx" aria-label="Fechar aviso">✕</button></div>' : '';
    view.innerHTML = welcome + '<div class="page-head"><div><h1>Minhas pesquisas</h1><p>Acompanhe o que a sua empresa já perguntou para as empreendedoras da base.</p></div>' +
      (SA.can('pesquisas_criar') ? '<a class="btn-primary big" href="criar-pesquisa.html">' + P.svg('plus') + 'Criar nova pesquisa</a>' : '') + '</div>' +
      '<div class="card slist" id="slist"><div class="skeleton"><i></i></div><div class="skeleton"><i style="width:55%"></i></div><div class="skeleton"><i style="width:30%"></i></div></div>';
    var wx = $('#wx'); if (wx) wx.addEventListener('click', function () { $('#welcome').remove(); history.replaceState(null, '', 'painel.html' + location.hash); });
    SA.api('surveys.list').then(function (d) {
      if (P.stale(nav)) return;
      SURVEYS = d.pesquisas; drawSurveys();
    }).catch(function (err) { if (!P.stale(nav)) P.errorState(err, function () { P.routes.pesquisas(args, nav); }); });
  };

  function counts() { var c = { todas: SURVEYS.length, rascunho: 0, em_revisao: 0, ativa: 0, encerrada: 0 }; SURVEYS.forEach(function (s) { c[s.status]++; }); return c; }

  function drawSurveys() {
    var host = $('#slist');
    if (!SURVEYS.length) {
      host.innerHTML = '<div class="empty"><div class="art">' + P.svg('doc') + '</div><h2>Você ainda não criou nenhuma pesquisa</h2><p>Defina o objetivo, escolha o público e monte as perguntas. A gente cuida do resto e mostra o andamento aqui.</p>' +
        (SA.can('pesquisas_criar') ? '<a class="btn-primary big" href="criar-pesquisa.html">' + P.svg('plus') + 'Criar minha primeira pesquisa</a>' : '<p class="tiny">Seu perfil não permite criar pesquisas.</p>') + '</div>';
      return;
    }
    var c = counts();
    var head = '<div style="padding:18px 22px 0"><div class="toolbar"><div class="chips" role="group" aria-label="Filtrar por status">' +
      ORDER.map(function (k) { return '<button type="button" class="chip" data-f="' + k + '" aria-pressed="' + (F.status === k) + '">' + FLABEL[k] + ' <span class="n">' + c[k] + '</span></button>'; }).join('') +
      '</div><label class="search">' + P.svg('search') + '<input type="search" id="sq" placeholder="Buscar por nome ou código" value="' + esc(F.q) + '" aria-label="Buscar pesquisas"></label></div></div>';
    host.innerHTML = head + '<div id="rows"></div>';
    drawRows();
    $$('[data-f]', host).forEach(function (b) { b.addEventListener('click', function () { F.status = b.getAttribute('data-f'); drawSurveys(); }); });
    $('#sq').addEventListener('input', function (e) { F.q = e.target.value; drawRows(); });
  }

  function drawRows() {
    var q = F.q.trim().toLowerCase();
    var list = SURVEYS.filter(function (s) { return (F.status === 'todas' || s.status === F.status) && (!q || (s.nome + ' ' + (s.codigo || '')).toLowerCase().indexOf(q) >= 0); });
    var host = $('#rows');
    if (!list.length) { host.innerHTML = '<div class="empty" style="padding:36px 24px"><h2 style="font-size:1.2rem">Nenhuma pesquisa encontrada</h2><p style="margin-bottom:0">Ajuste o filtro ou a busca.</p></div>'; return; }
    host.innerHTML = '<div class="shead"><span>Pesquisa</span><span>Criada em</span><span>Status</span><span>Respostas</span><span>Progresso</span><span></span></div>' + list.map(rowHTML).join('');
  }

  function progressCell(s) {
    if (s.status === 'rascunho') return '<div class="bar"><i style="width:' + s.progresso + '%"></i></div><small>' + s.progresso + '% preenchida</small>';
    if (s.status === 'em_revisao') return '<div class="bar"><i style="width:0"></i></div><small>Aguardando revisão</small>';
    return '<div class="bar' + (s.status === 'encerrada' ? '' : '') + '"><i style="width:' + s.progresso + '%"></i></div><small>' + s.progresso + '% da amostra</small>';
  }
  function rowHTML(s) {
    var st = SA.STATUS[s.status], canEdit = SA.can('pesquisas_criar');
    var href = s.status === 'rascunho' && canEdit ? 'criar-pesquisa.html?id=' + encodeURIComponent(s.id) : '#pesquisa/' + encodeURIComponent(s.id);
    var resp = s.status === 'rascunho' || s.status === 'em_revisao' ? '<span class="muted">—</span>' : '<b>' + SA.fmtInt(s.respostas) + '</b> <span class="muted tiny">/ ' + SA.fmtInt(s.amostra) + '</span>';
    return '<div class="srow" data-id="' + esc(s.id) + '">' +
      '<div class="sname"><a href="' + href + '">' + esc(s.nome) + '</a><small>' + (s.codigo ? esc(s.codigo) + ' · ' : '') + 'por ' + esc(s.criadoPorNome || '—') + '</small></div>' +
      '<div class="c-date"><span class="cell-l">Criada em</span><span>' + SA.fmtDate(s.criadaEm) + '</span></div>' +
      '<div class="c-status"><span class="cell-l">Status</span><span class="badge ' + st.cls + '">' + st.label + '</span></div>' +
      '<div class="c-resp"><span class="cell-l">Respostas</span><span>' + resp + '</span></div>' +
      '<div class="c-prog"><span class="cell-l">Progresso</span><div class="pcell">' + progressCell(s) + '</div></div>' +
      '<div class="kebab-wrap"><button class="kebab" type="button" data-menu="' + esc(s.id) + '" aria-haspopup="menu" aria-expanded="false" aria-label="Ações da pesquisa ' + esc(s.nome) + '">' + P.svg('dots') + '</button></div></div>';
  }

  function closeMenus() { $$('.menu').forEach(function (m) { m.remove(); }); $$('.kebab[aria-expanded="true"]').forEach(function (b) { b.setAttribute('aria-expanded', 'false'); }); }
  document.addEventListener('click', function (e) {
    var kb = e.target.closest('[data-menu]');
    var act = e.target.closest('[data-act]');
    if (!kb && !act) { closeMenus(); return; }
    if (kb) {
      var wasOpen = kb.getAttribute('aria-expanded') === 'true'; closeMenus(); if (wasOpen) return;
      var s = SURVEYS.filter(function (x) { return x.id === kb.getAttribute('data-menu'); })[0]; if (!s) return;
      var canEdit = SA.can('pesquisas_criar'), items = [];
      if (s.status === 'rascunho' && canEdit) items.push('<a href="criar-pesquisa.html?id=' + esc(s.id) + '">' + P.svg('edit') + 'Continuar editando</a>');
      else items.push('<a href="#pesquisa/' + esc(s.id) + '">' + P.svg('open') + 'Ver detalhes</a>');
      if (canEdit) {
        items.push('<button type="button" data-act="rename" data-id="' + esc(s.id) + '">' + P.svg('edit') + 'Renomear</button>');
        items.push('<button type="button" data-act="dup" data-id="' + esc(s.id) + '">' + P.svg('copy') + 'Duplicar como rascunho</button>');
        if (s.status === 'rascunho') items.push('<button type="button" class="danger" data-act="del" data-id="' + esc(s.id) + '">' + P.svg('trash') + 'Excluir rascunho</button>');
      }
      var m = document.createElement('div'); m.className = 'menu'; m.setAttribute('role', 'menu'); m.innerHTML = items.join('');
      kb.parentNode.appendChild(m); kb.setAttribute('aria-expanded', 'true');
      return;
    }
    if (act) { closeMenus(); surveyAction(act.getAttribute('data-act'), act.getAttribute('data-id')); }
  });

  function surveyAction(act, id) {
    var s = SURVEYS.filter(function (x) { return x.id === id; })[0]; if (!s) return;
    if (act === 'dup') {
      SA.api('surveys.duplicate', { id: id }).then(function (d) { SURVEYS.unshift(d.pesquisa); drawSurveys(); SA.toast('Cópia criada como rascunho.'); }).catch(function (e) { SA.toast(e.message, 'err'); });
    } else if (act === 'del') {
      P.confirm({ title: 'Excluir este rascunho?', text: '“' + s.nome + '” será removido da sua conta. Essa ação não pode ser desfeita.', ok: 'Excluir', danger: true }).then(function (yes) {
        if (!yes) return;
        SA.api('surveys.delete', { id: id }).then(function () { SURVEYS = SURVEYS.filter(function (x) { return x.id !== id; }); drawSurveys(); SA.toast('Rascunho excluído.'); }).catch(function (e) { SA.toast(e.message, 'err'); });
      });
    } else if (act === 'rename') {
      var box = P.modal('<h3>Renomear pesquisa</h3><p class="sub">O nome aparece só para a sua equipe.</p><form id="frn" novalidate>' + P.field({ id: 'nome', label: 'Nome da pesquisa', value: s.nome, max: 80 }) +
        '<div class="modal-actions"><button type="button" class="btn-ghost" data-close>Cancelar</button><button class="btn-primary" type="submit">Salvar</button></div></form>');
      var f = $('#frn', box); $('#f-nome', box).select();
      f.addEventListener('submit', function (e) {
        e.preventDefault(); P.clearErrs(f);
        if (!P.validate(f, { nome: function (v) { return v.trim().length >= 2 ? '' : 'Informe um nome.'; } })) return;
        var b = $('button[type=submit]', f); P.busy(b, true, 'Salvando…');
        SA.api('surveys.rename', { id: id, nome: $('#f-nome', f).value.trim() }).then(function (d) {
          SURVEYS = SURVEYS.map(function (x) { return x.id === id ? d.pesquisa : x; }); P.closeModal(); drawSurveys(); SA.toast('Nome atualizado.');
        }).catch(function (err) { P.busy(b, false); P.serverError(f, err); });
      });
    }
  }

  /* =====================================================================
     DETALHE DA PESQUISA
     ===================================================================== */
  var QT = { single: 'Escolha única', multiple: 'Múltipla escolha', scale: 'Escala', yesno: 'Sim / Não', open: 'Texto aberto', range: 'Faixa de valores', ranking: 'Ranking' };
  P.routes.pesquisa = function (args, nav) {
    P.setTitle('Pesquisa');
    if (!SA.can('pesquisas_ver')) { noAccess('pesquisas'); return; }
    var id = decodeURIComponent(args[0] || '');
    view.innerHTML = '<a class="back" href="#pesquisas">← Minhas pesquisas</a><div class="card pad"><div class="skeleton" style="margin:0"><i></i></div></div>';
    SA.api('surveys.get', { id: id }).then(function (d) {
      if (P.stale(nav)) return;
      var s = d.pesquisa;
      if (s.status === 'rascunho' && SA.can('pesquisas_criar')) { location.replace('criar-pesquisa.html?id=' + encodeURIComponent(s.id)); return; }
      drawDetail(s);
    }).catch(function (err) { if (!P.stale(nav)) P.errorState(err, function () { P.routes.pesquisa(args, nav); }); });
  };

  function drawDetail(s) {
    P.setTitle(s.nome);
    var st = SA.STATUS[s.status], dados = s.dados || {}, qs = dados.questions || [], idx = { rascunho: 0, em_revisao: 1, ativa: 2, encerrada: 3 }[s.status];
    function tl(i, label, when) { return '<li class="' + (idx > i ? 'done' : idx === i ? 'now' : '') + '">' + label + (when ? '<small>' + when + '</small>' : '') + '</li>'; }
    var timeline = '<ol class="timeline">' + '<li class="done">Pesquisa criada<small>' + SA.fmtDateTime(s.criadaEm) + '</small></li>' +
      (s.enviadaEm ? '<li class="done">Enviada para o time<small>' + SA.fmtDateTime(s.enviadaEm) + '</small></li>' : '') +
      tl(1, 'Em revisão pelo time', idx === 1 ? 'Estamos validando perguntas e público' : '') + tl(2, 'No ar, coletando respostas', idx === 2 ? SA.fmtInt(s.respostas) + ' de ' + SA.fmtInt(s.amostra) + ' respostas' : '') + tl(3, 'Encerrada', '') + '</ol>';
    var note = s.status === 'em_revisao' ? '<div class="note">Nosso time está revisando a sua pesquisa. Assim que ela entrar no ar, o status muda aqui automaticamente.</div>'
      : s.status === 'ativa' ? '<div class="note lime">A pesquisa está no ar. O progresso mostra as respostas coletadas em relação à amostra contratada.</div>' : '';
    var contact = s.contato ? '<dt>Contato</dt><dd>' + esc(s.contato.name) + '<br><span class="muted">' + esc(s.contato.email) + '</span></dd>' : '';
    view.innerHTML = '<a class="back" href="#pesquisas">← Minhas pesquisas</a>' +
      '<div class="page-head"><div><h1>' + esc(s.nome) + '</h1><p>' + (s.codigo ? 'Código ' + esc(s.codigo) + ' · ' : '') + 'criada por ' + esc(s.criadoPorNome || '—') + '</p></div><span class="badge ' + st.cls + '" style="font-size:.95rem">' + st.label + '</span></div>' +
      '<div class="detail-grid"><div class="stack">' +
      '<section class="card pad"><h2 class="sec">Resumo</h2><dl class="kv" style="margin-top:14px"><dt>Objetivo</dt><dd>' + esc(s.objetivo || '—') + '</dd><dt>Público (nichos)</dt><dd>' + esc(s.nichos || '—') + '</dd>' +
      '<dt>Amostra</dt><dd>' + SA.fmtInt(s.amostra) + ' respostas</dd><dt>Perguntas</dt><dd>' + SA.fmtInt(s.perguntas) + '</dd>' + (SA.can('financeiro') ? '<dt>Investimento</dt><dd>' + SA.fmtBRL(s.preco) + '</dd>' : '') + contact + '</dl></section>' +
      '<section class="card pad"><h2 class="sec">Perguntas</h2>' + (qs.length ? '<ol class="qlist" style="margin-top:14px">' + qs.map(function (q) { return '<li><div>' + esc(q.text || 'Pergunta sem texto') + '<small>' + esc(QT[q.type] || 'Pergunta') + (q.options && q.options.length ? ' · ' + q.options.length + ' opções' : '') + '</small></div></li>'; }).join('') + '</ol>' : '<p class="muted" style="margin-top:8px">Sem detalhes das perguntas neste registro.</p>') + '</section>' +
      '</div><aside class="stack"><section class="card pad"><h2 class="sec">Andamento</h2><div style="margin:12px 0 18px"><div class="bar"><i style="width:' + s.progresso + '%"></i></div><p class="tiny muted" style="margin-top:6px;font-weight:700">' +
      (s.status === 'em_revisao' ? 'Aguardando revisão' : SA.fmtInt(s.respostas) + ' de ' + SA.fmtInt(s.amostra) + ' respostas (' + s.progresso + '%)') + '</p></div>' + timeline + note + '</section>' +
      (SA.can('pesquisas_criar') ? '<button class="btn-ghost" type="button" id="dupBtn" style="align-self:flex-start">' + P.svg('copy') + 'Duplicar como rascunho</button>' : '') + '</aside></div>';
    var dup = $('#dupBtn');
    if (dup) dup.addEventListener('click', function () {
      P.busy(dup, true, 'Duplicando…');
      SA.api('surveys.duplicate', { id: s.id }).then(function (d) { location.href = 'criar-pesquisa.html?id=' + encodeURIComponent(d.pesquisa.id); }).catch(function (e) { P.busy(dup, false); SA.toast(e.message, 'err'); });
    });
  }

  /* ---------- início ---------- */
  SA.guard().then(function (me) {
    P.me = me;
    SA.mountHeader($('#shell'), '');
    window.addEventListener('hashchange', router);
    router();
    if (me.user.mustChange) forcePassword();
  }).catch(function (err) {
    $('#shell').innerHTML = '';
    view.innerHTML = '<div class="card errbox"><b>Não foi possível abrir a área da empresa</b><p>' + esc(err.message) + '</p><a class="btn-primary" href="entrar.html">Ir para o login</a></div>';
  });
})();
