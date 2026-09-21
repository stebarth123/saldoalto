/* Saldo Alto — cliente compartilhado da área da empresa.
   Fala com a API (Google Apps Script), guarda a sessão, monta o cabeçalho e traz utilitários.
   Não guarda senha em lugar nenhum: só o token de sessão devolvido pelo servidor. */
(function () {
  'use strict';

  var API_URL = 'https://script.google.com/macros/s/AKfycbzrsPxkZ62kq-V6MgDhrv1d209InW-6NMGrcXSEjR-f4CWyATA8521BYZegTN6pyBG_/exec';
  var SESSION_KEY = 'sa.sessao.v1';
  var API_OK_KEY = 'sa.api.ok';
  var API_MIN = 2;
  var PUBLIC = { register: 1, login: 1, 'reset.request': 1, 'reset.confirm': 1 };

  /* ---------- armazenamento seguro (pode falhar em modo privado) ---------- */
  function get(store, k) { try { return window[store].getItem(k); } catch (e) { return null; } }
  function set(store, k, v) { try { window[store].setItem(k, v); } catch (e) { /* ignora */ } }
  function del(store, k) { try { window[store].removeItem(k); } catch (e) { /* ignora */ } }

  function session() {
    var raw = get('sessionStorage', SESSION_KEY) || get('localStorage', SESSION_KEY);
    if (!raw) return null;
    try {
      var s = JSON.parse(raw);
      if (!s || !s.token) return null;
      if (s.expiraEm && new Date(s.expiraEm).getTime() < Date.now()) { clearSession(); return null; }
      return s;
    } catch (e) { return null; }
  }
  function saveSession(s, remember) {
    if (s.demo) {   // demonstração: só nesta aba, sem apagar uma sessão real guardada no navegador
      set('sessionStorage', SESSION_KEY, JSON.stringify({ token: 'demo', expiraEm: s.expiraEm, user: s.user, account: s.account, local: false, demo: true }));
      return;
    }
    var prev = get('localStorage', SESSION_KEY) ? true : false;
    var useLocal = remember === undefined ? prev : !!remember;
    var raw = JSON.stringify({ token: s.token, expiraEm: s.expiraEm, user: s.user, account: s.account, local: useLocal });
    del('sessionStorage', SESSION_KEY); del('localStorage', SESSION_KEY);
    set(useLocal ? 'localStorage' : 'sessionStorage', SESSION_KEY, raw);
  }
  function clearSession() { del('sessionStorage', SESSION_KEY); del('localStorage', SESSION_KEY); }
  function refreshSession(payload) {   // atualiza user/account mantendo o token atual
    var cur = session(); if (!cur) return;
    saveSession({ token: cur.token, expiraEm: payload.expiraEm || cur.expiraEm, user: payload.user || cur.user, account: payload.account || cur.account, demo: cur.demo }, cur.local);
  }

  /* ---------- erros e chamadas ---------- */
  function SAError(code, message, fields) { var e = new Error(message); e.code = code; e.fields = fields || null; return e; }

  function fetchWithTimeout(url, opts, ms) {
    var ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var t = setTimeout(function () { if (ctl) ctl.abort(); }, ms || 30000);
    opts = opts || {}; if (ctl) opts.signal = ctl.signal;
    return fetch(url, opts).then(function (r) { clearTimeout(t); return r; }, function (e) { clearTimeout(t); throw e; });
  }

  var pingPromise = null;
  function ensureApi() {
    var ok = get('sessionStorage', API_OK_KEY);
    if (ok && Date.now() - Number(ok) < 30 * 60 * 1000) return Promise.resolve();
    if (pingPromise) return pingPromise;
    pingPromise = fetchWithTimeout(API_URL + '?action=ping', { method: 'GET' }, 20000).then(function (r) { return r.text(); }).then(function (txt) {
      var j; try { j = JSON.parse(txt); } catch (e) { j = null; }
      if (!j || j.status !== 'ok' || Number(j.api) < API_MIN) {
        throw SAError('desatualizado', 'O sistema da área da empresa está sendo atualizado. Tente de novo em alguns minutos.');
      }
      set('sessionStorage', API_OK_KEY, String(Date.now()));
    }, function () { throw SAError('rede', 'Não conseguimos conectar agora. Confira sua internet e tente de novo.'); })
      .then(function (v) { pingPromise = null; return v; }, function (e) { pingPromise = null; throw e; });
    return pingPromise;
  }

  function isDemo() { var s = session(); return !!(s && s.demo); }
  function demoApi(action, payload) {   // a demonstração nunca fala com o servidor
    return new Promise(function (resolve, reject) {
      setTimeout(function () {
        try {
          if (!window.SADemo) throw SAError('demo', 'A demonstração não pôde ser carregada. Recarregue a página.');
          resolve(window.SADemo.handle(action, payload));
        } catch (e) { reject(e); }
      }, 90 + Math.round(Math.random() * 110));
    });
  }
  function api(action, payload) {
    payload = payload || {};
    if (isDemo()) return demoApi(action, payload);
    return ensureApi().then(function () {
      var body = { action: action }, k;
      for (k in payload) body[k] = payload[k];
      if (!PUBLIC[action]) {
        var s = session();
        if (!s) throw SAError('sessao', 'Sua sessão expirou. Entre novamente.');
        body.token = s.token;
      }
      return fetchWithTimeout(API_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(body) }, 40000)
        .then(function (r) { return r.text(); }, function () { throw SAError('rede', 'Não conseguimos conectar agora. Confira sua internet e tente de novo.'); })
        .then(function (txt) {
          var j; try { j = JSON.parse(txt); } catch (e) { throw SAError('resposta', 'Recebemos uma resposta inesperada. Tente de novo em instantes.'); }
          if (j.status === 'ok') return j.data;
          if (j.code === 'sessao' && !PUBLIC[action]) { clearSession(); goLogin({ expirou: 1 }); }
          throw SAError(j.code || 'erro', j.message || 'Não foi possível concluir agora.', j.fields);
        });
    });
  }

  /* ---------- navegação e proteção de páginas ---------- */
  function safeNext(n) {
    n = String(n || '');
    return /^[a-z0-9_\-]+\.html([?#][^\s]*)?$/i.test(n) ? n : '';
  }
  function here() { return location.pathname.split('/').pop() + location.search + location.hash; }
  function goLogin(opts) {
    opts = opts || {};
    var q = [];
    var next = safeNext(opts.next === undefined ? here() : opts.next);
    if (next && next.indexOf('entrar.html') !== 0) q.push('next=' + encodeURIComponent(next));
    if (opts.expirou) q.push('expirou=1');
    location.replace('entrar.html' + (q.length ? '?' + q.join('&') : ''));
  }

  /* Exige sessão. Confirma com o servidor e devolve { user, account }. */
  function guard(opts) {
    opts = opts || {};
    var s = session();
    if (!s) { goLogin(); return new Promise(function () {}); }
    return api('me').then(function (data) {
      refreshSession(data);
      if (opts.perm && (data.user.perms || []).indexOf(opts.perm) < 0) throw SAError('permissao', 'Você não tem acesso a esta área.');
      return data;
    });
  }
  function enterDemo() {   // entra na empresa fictícia, sem cadastro e sem senha
    if (!window.SADemo) return false;
    saveSession(window.SADemo.start(), false);
    location.href = 'painel.html#pesquisas';
    return true;
  }
  function resetDemo() {
    if (window.SADemo) window.SADemo.reset();
    if (/painel\.html$/.test(location.pathname)) { history.replaceState(null, '', 'painel.html#pesquisas'); location.reload(); }   // mesma página: recarrega para voltar aos dados iniciais
    else location.href = 'painel.html#pesquisas';
  }
  function exitDemo() { if (window.SADemo) window.SADemo.reset(); del('sessionStorage', SESSION_KEY); location.replace('entrar.html?saiu=1'); }
  function signOut() {
    if (isDemo()) return exitDemo();
    var done = function () { clearSession(); location.replace('entrar.html?saiu=1'); };
    if (!session()) return done();
    api('logout').then(done, done);
  }
  function can(perm) { var s = session(); return !!(s && s.user && (s.user.perms || []).indexOf(perm) >= 0); }

  /* ---------- utilitários ---------- */
  function esc(s) { return String(s === undefined || s === null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function digits(v) { return String(v || '').replace(/\D/g, ''); }
  function maskCnpj(v) {
    var d = digits(v).slice(0, 14), o = d;
    if (d.length > 12) o = d.slice(0, 2) + '.' + d.slice(2, 5) + '.' + d.slice(5, 8) + '/' + d.slice(8, 12) + '-' + d.slice(12);
    else if (d.length > 8) o = d.slice(0, 2) + '.' + d.slice(2, 5) + '.' + d.slice(5, 8) + '/' + d.slice(8);
    else if (d.length > 5) o = d.slice(0, 2) + '.' + d.slice(2, 5) + '.' + d.slice(5);
    else if (d.length > 2) o = d.slice(0, 2) + '.' + d.slice(2);
    return o;
  }
  function maskPhone(v) {
    var d = digits(v).slice(0, 11);
    if (d.length > 10) return '(' + d.slice(0, 2) + ') ' + d.slice(2, 7) + '-' + d.slice(7);
    if (d.length > 6) return '(' + d.slice(0, 2) + ') ' + d.slice(2, 6) + '-' + d.slice(6);
    if (d.length > 2) return '(' + d.slice(0, 2) + ') ' + d.slice(2);
    return d;
  }
  function maskCep(v) { var d = digits(v).slice(0, 8); return d.length > 5 ? d.slice(0, 5) + '-' + d.slice(5) : d; }
  function validCnpj(raw) {
    var c = digits(raw);
    if (c.length !== 14 || /^(\d)\1+$/.test(c)) return false;
    function dv(len) {
      var sum = 0, pos = len - 7;
      for (var i = len; i >= 1; i--) { sum += Number(c.charAt(len - i)) * pos--; if (pos < 2) pos = 9; }
      var r = sum % 11; return r < 2 ? 0 : 11 - r;
    }
    return dv(12) === Number(c.charAt(12)) && dv(13) === Number(c.charAt(13));
  }
  function isEmail(v) { return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(v || '').trim()); }
  function passwordChecks(p) {
    p = String(p || '');
    return [
      { ok: p.length >= 8, label: 'Pelo menos 8 caracteres' },
      { ok: /[A-Za-z]/.test(p), label: 'Uma letra' },
      { ok: /[0-9]/.test(p), label: 'Um número' }
    ];
  }
  function fmtDate(iso) {
    var d = new Date(iso); if (!iso || isNaN(d.getTime())) return '—';
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  }
  function fmtDateTime(iso) {
    var d = new Date(iso); if (!iso || isNaN(d.getTime())) return '—';
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' }) + ' às ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  }
  function fmtInt(n) { return Math.round(Number(n) || 0).toLocaleString('pt-BR'); }
  function fmtBRL(n) { return 'R$ ' + (Number(n) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 }); }
  function initials(name) {
    var p = String(name || '').trim().split(/\s+/).filter(Boolean);
    if (!p.length) return '?';
    return (p[0].charAt(0) + (p.length > 1 ? p[p.length - 1].charAt(0) : '')).toUpperCase();
  }
  function firstName(name) { return String(name || '').trim().split(/\s+/)[0] || ''; }

  var STATUS = {
    rascunho: { label: 'Rascunho', cls: 'st-rascunho' },
    em_revisao: { label: 'Em revisão', cls: 'st-revisao' },
    ativa: { label: 'Ativa', cls: 'st-ativa' },
    encerrada: { label: 'Encerrada', cls: 'st-encerrada' }
  };
  var PERM_LABELS = {
    pesquisas_ver: 'Ver pesquisas',
    pesquisas_criar: 'Criar e editar pesquisas',
    dashboard: 'Ver Inteligência da Base',
    financeiro: 'Contratação, pagamentos e financeiro'
  };
  var ROLE_LABELS = { titular: 'Titular', financeiro: 'Financeiro', gestor: 'Gestor de pesquisas', leitor: 'Somente leitura', personalizado: 'Personalizado' };

  /* ---------- avisos ---------- */
  function toast(msg, kind) {
    var wrap = document.getElementById('saToasts');
    if (!wrap) { wrap = document.createElement('div'); wrap.id = 'saToasts'; wrap.className = 'sa-toast-wrap'; wrap.setAttribute('role', 'status'); wrap.setAttribute('aria-live', 'polite'); document.body.appendChild(wrap); }
    while (wrap.children.length >= 2) wrap.removeChild(wrap.firstChild);
    var t = document.createElement('div'); t.className = 'sa-toast ' + (kind || 'ok'); t.textContent = msg; wrap.appendChild(t);
    setTimeout(function () { if (t.parentNode) t.parentNode.removeChild(t); }, kind === 'err' ? 6000 : 3800);
  }

  /* ---------- cabeçalho e menu do usuário ---------- */
  var IC = {
    user: '<path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
    gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>',
    out: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5"/><path d="M21 12H9"/>'
  };
  function svg(name) { return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + IC[name] + '</svg>'; }

  function userMenuHTML() {
    var s = session(), u = (s && s.user) || {}, a = (s && s.account) || {};
    return '<div class="sa-user">' +
      '<button type="button" class="sa-avatar" id="saAvatar" aria-haspopup="menu" aria-expanded="false" aria-label="Menu da conta">' +
      '<span class="sa-ini">' + esc(initials(u.nome)) + '</span><span class="sa-uname">' + esc(firstName(u.nome)) + '</span>' + (isDemo() ? '<span class="sa-demo-tag">Demo</span>' : '') +
      '<svg class="sa-chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg></button>' +
      '<div class="sa-menu" id="saMenu" role="menu">' +
      '<div class="sa-menu-head"><b>' + esc(u.nome || '') + '</b><span>' + esc(a.empresa || '') + '</span><span>' + esc(u.email || '') + '</span></div>' +
      '<a href="painel.html#perfil" role="menuitem">' + svg('user') + 'Meu perfil</a>' +
      '<a href="painel.html#config" role="menuitem">' + svg('gear') + 'Configurações</a>' +
      '<hr>' + (isDemo() ? '<button type="button" role="menuitem" data-sa-demo-reset>' + svg('out') + 'Reiniciar demonstração</button>' : '') +
      '<button type="button" role="menuitem" data-sa-signout>' + svg('out') + (isDemo() ? 'Sair da demonstração' : 'Sair') + '</button>' +
      '</div></div>';
  }
  function bindUserMenu(root) {
    root = root || document;
    var btn = root.querySelector('#saAvatar'), menu = root.querySelector('#saMenu');
    if (!btn || !menu) return;
    function close() { menu.classList.remove('open'); btn.setAttribute('aria-expanded', 'false'); }
    btn.addEventListener('click', function (e) { e.stopPropagation(); var o = menu.classList.toggle('open'); btn.setAttribute('aria-expanded', String(o)); });
    document.addEventListener('click', function (e) { if (!menu.contains(e.target)) close(); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') { close(); btn.focus(); } });
    menu.addEventListener('click', function (e) {
      if (e.target.closest('[data-sa-signout]')) { close(); signOut(); }
      else if (e.target.closest('a')) close();
    });
  }

  /* Faixa fixa no topo: deixa claro que é um ambiente de demonstração com dados fictícios */
  function mountDemoBar() {
    if (!isDemo() || document.getElementById('saDemoBar')) return;
    var bar = document.createElement('div');
    bar.id = 'saDemoBar'; bar.className = 'sa-demo-bar'; bar.setAttribute('role', 'status');
    bar.innerHTML = '<span class="sa-demo-dot" aria-hidden="true"></span><span class="sa-demo-txt"><b>Ambiente de demonstração</b><span> · empresa fictícia “Demo Saldo Alto” · nada aqui é real e nada afeta contas cadastradas</span></span>' +
      '<span class="sa-demo-actions"><button type="button" data-sa-demo-reset>Reiniciar demo</button><button type="button" data-sa-demo-exit>Sair da demo</button></span>';
    document.body.insertBefore(bar, document.body.firstChild);
    var fit = function () { document.documentElement.style.setProperty('--demo-h', bar.offsetHeight + 'px'); };
    fit(); window.addEventListener('resize', fit);
  }
  document.addEventListener('click', function (e) {
    if (e.target.closest('[data-sa-demo-reset]')) { e.preventDefault(); resetDemo(); }
    else if (e.target.closest('[data-sa-demo-exit]')) { e.preventDefault(); exitDemo(); }
  });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mountDemoBar); else mountDemoBar();

  /* Barra lateral do painel (no celular vira uma faixa no topo) */
  var NAVIC = {
    pesquisas: '<rect x="6" y="4" width="12" height="17" rx="2"/><path d="M9 4h6v3H9z"/><path d="M9 12h6M9 16h4"/>',
    base: '<path d="M4 19V9M10 19V5M16 19v-8M22 19H2"/>',
    config: IC.gear,
    plus: '<path d="M12 5v14M5 12h14"/>'
  };
  function nsvg(n) { return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + NAVIC[n] + '</svg>'; }
  function mountHeader(target, active) {
    var s = session();
    var links = [{ r: 'pesquisas', t: 'Minhas pesquisas', href: 'painel.html#pesquisas' }];
    if (can('dashboard')) links.push({ r: 'base', t: 'Inteligência da Base', href: 'painel.html#base' });
    links.push({ r: 'config', t: 'Configurações', href: 'painel.html#config' });
    document.body.classList.add('sa-has-side');
    var html = '<aside class="sa-side">' +
      '<a class="sa-logo" href="painel.html#pesquisas" aria-label="Saldo Alto — Minhas pesquisas"><img src="logo-saldo-alto.png" alt="Saldo Alto"></a>' +
      '<nav class="sa-nav" aria-label="Navegação principal">' +
      links.map(function (l) { return '<a data-route="' + l.r + '" href="' + l.href + '"' + (l.r === active ? ' class="on" aria-current="page"' : '') + '>' + nsvg(l.r) + '<span>' + l.t + '</span></a>'; }).join('') +
      (can('pesquisas_criar') ? '<a class="sa-nav-cta" href="criar-pesquisa.html">' + nsvg('plus') + '<span>Criar pesquisa</span></a>' : '') +
      '</nav><div class="sa-side-foot">' + userMenuHTML() + '</div></aside>';
    target.innerHTML = html;
    bindUserMenu(target);
    return s;
  }
  function setActiveRoute(route) {
    var links = document.querySelectorAll('.sa-nav a[data-route]');
    for (var i = 0; i < links.length; i++) {
      var on = links[i].getAttribute('data-route') === route;
      links[i].classList.toggle('on', on);
      if (on) links[i].setAttribute('aria-current', 'page'); else links[i].removeAttribute('aria-current');
    }
  }

  window.SA = {
    API_URL: API_URL, api: api, session: session, saveSession: saveSession, clearSession: clearSession, refreshSession: refreshSession,
    guard: guard, signOut: signOut, isDemo: isDemo, enterDemo: enterDemo, resetDemo: resetDemo, exitDemo: exitDemo, mountDemoBar: mountDemoBar, Err: SAError, goLogin: goLogin, safeNext: safeNext, can: can,
    esc: esc, digits: digits, maskCnpj: maskCnpj, maskPhone: maskPhone, maskCep: maskCep, validCnpj: validCnpj, isEmail: isEmail,
    passwordChecks: passwordChecks, fmtDate: fmtDate, fmtDateTime: fmtDateTime, fmtInt: fmtInt, fmtBRL: fmtBRL, initials: initials, firstName: firstName,
    STATUS: STATUS, PERM_LABELS: PERM_LABELS, ROLE_LABELS: ROLE_LABELS, toast: toast,
    userMenuHTML: userMenuHTML, bindUserMenu: bindUserMenu, mountHeader: mountHeader, setActiveRoute: setActiveRoute
  };
})();
