/* Saldo Alto — Meu perfil e Configurações (dados da empresa, segurança, usuários e acessos, financeiro). */
(function () {
  'use strict';
  var P = window.P, esc = SA.esc, $ = P.$, $$ = P.$$;
  var UFS = ['AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO'];
  var SETORES = ['', 'Varejo / E-commerce', 'Moda e beleza', 'Alimentação e bebidas', 'Educação', 'Saúde e bem-estar', 'Finanças / Fintech', 'Tecnologia', 'Agências de marketing e publicidade', 'Outro'];
  var uf = [{ v: '', l: 'Selecione' }].concat(UFS.map(function (u) { return { v: u, l: u }; }));
  var ROLE_INFO = {
    financeiro: ['Financeiro', 'Cria pesquisas, vê a Inteligência da Base e cuida de contratação, pagamentos e dados financeiros.'],
    gestor: ['Gestor de pesquisas', 'Cria e edita pesquisas e vê a Inteligência da Base. Não contrata nem vê o financeiro.'],
    leitor: ['Somente leitura', 'Vê as pesquisas e a Inteligência da Base, sem alterar nada.'],
    personalizado: ['Personalizado', 'Você escolhe exatamente o que a pessoa pode fazer.']
  };

  function me() { return SA.session(); }
  function isOwner() { var s = me(); return !!(s && s.user.papel === 'titular'); }
  function remountHeader() { var act = (location.hash.slice(1).split('/')[0]) || 'pesquisas'; SA.mountHeader(P.$('#shell'), act === 'pesquisa' ? 'pesquisas' : act); }
  function applyPayload(d) { SA.refreshSession(d); P.me = d; remountHeader(); }

  /* Envia um formulário: valida, chama a API, mostra erros por campo e avisa o resultado */
  function wire(form, o) {
    form.addEventListener('submit', function (e) {
      e.preventDefault(); P.clearErrs(form);
      if (o.rules && !P.validate(form, o.rules(form))) return;
      var b = $('button[type=submit]', form); P.busy(b, true, o.busy || 'Salvando…');
      SA.api(o.action, o.payload(form)).then(function (d) {
        P.busy(b, false); if (o.ok) o.ok(d, form); SA.toast(o.msg || 'Alterações salvas.');
      }).catch(function (err) { P.busy(b, false); P.serverError(form, err); });
    });
  }
  function bindMasks(scope) {
    var m = { 'f-telefone': SA.maskPhone, 'f-cep': SA.maskCep, 'f-cnpj': SA.maskCnpj };
    Object.keys(m).forEach(function (id) { var el = $('#' + id, scope); if (el && !el.readOnly) el.addEventListener('input', function () { el.value = m[id](el.value); }); });
  }
  var phoneRule = function (v) { var d = SA.digits(v); return !d || (d.length >= 10 && d.length <= 13) ? '' : 'Informe um telefone com DDD.'; };
  var emailRule = function (v) { return SA.isEmail(v) ? '' : 'Informe um e-mail válido.'; };
  var optEmail = function (v) { return !v.trim() || SA.isEmail(v) ? '' : 'Informe um e-mail válido.'; };
  var cepRule = function (v) { var d = SA.digits(v); return !d || d.length === 8 ? '' : 'CEP com 8 números.'; };

  /* =====================================================================
     MEU PERFIL
     ===================================================================== */
  P.routes.perfil = function () {
    P.setTitle('Meu perfil');
    var s = me(), u = s.user, a = s.account;
    var perms = (u.perms || []).map(function (p) { return '<span class="tag pink">' + esc(SA.PERM_LABELS[p] || p) + '</span>'; }).join('');
    P.view.innerHTML = '<div class="page-head"><div><h1>Meu perfil</h1><p>Seus dados de acesso e o que você pode fazer na conta de ' + esc(a.empresa) + '.</p></div></div>' +
      '<div class="detail-grid"><section class="card pad"><h2 class="sec">Dados pessoais</h2><p class="sec-sub">Aparecem para os outros usuários da conta.</p><form id="fperfil" novalidate><div class="fgrid">' +
      P.field({ id: 'nome', label: 'Nome completo', value: u.nome, max: 100, auto: 'name' }) + P.field({ id: 'cargo', label: 'Cargo', value: u.cargo, opt: true, max: 80, auto: 'organization-title' }) +
      P.field({ id: 'telefone', label: 'Telefone / WhatsApp', value: SA.maskPhone(u.telefone), opt: true, auto: 'tel-national', mode: 'tel', max: 15 }) +
      P.field({ id: 'email', label: 'E-mail de acesso', value: u.email, ro: true, hint: 'Para trocar o e-mail, vá em <a href="#config/seguranca" style="color:var(--pink);font-weight:800">Configurações › Segurança</a>.' }) +
      '</div><div class="form-actions"><button class="btn-primary" type="submit">Salvar alterações</button></div></form></section>' +
      '<aside class="stack"><section class="card pad"><h2 class="sec">Seu acesso</h2><p style="margin:8px 0 10px;font-weight:700">' + esc(SA.ROLE_LABELS[u.papel] || u.papel) + (a.financeiroUserId === u.id ? ' · <span class="tag fin">Titular financeiro</span>' : '') + '</p>' +
      '<div>' + perms + '</div><p class="tiny muted" style="margin-top:12px;font-weight:600">Empresa: <b>' + esc(a.empresa) + '</b><br>Conta criada em ' + SA.fmtDate(a.criadoEm) + '</p></section>' +
      '<a class="btn-ghost" href="#config" style="align-self:flex-start">Ir para Configurações</a></aside></div>';
    var f = $('#fperfil'); bindMasks(f);
    wire(f, {
      action: 'profile.update',
      rules: function () { return { nome: function (v) { return v.trim().length >= 2 ? '' : 'Informe seu nome.'; }, telefone: phoneRule }; },
      payload: function () { return { nome: $('#f-nome', f).value, cargo: $('#f-cargo', f).value, telefone: SA.digits($('#f-telefone', f).value) }; },
      ok: applyPayload, msg: 'Perfil atualizado.'
    });
  };

  /* =====================================================================
     CONFIGURAÇÕES
     ===================================================================== */
  function tabsFor() {
    var t = [{ k: 'empresa', l: 'Dados da empresa' }, { k: 'seguranca', l: 'Segurança' }];
    if (isOwner()) t.push({ k: 'usuarios', l: 'Usuários e acessos' });
    if (SA.can('financeiro')) t.push({ k: 'financeiro', l: 'Financeiro' });
    return t;
  }
  P.routes.config = function (args, nav) {
    var tabs = tabsFor(), cur = args[0] || 'empresa';
    if (!tabs.some(function (t) { return t.k === cur; })) cur = 'empresa';
    P.setTitle('Configurações');
    P.view.innerHTML = '<div class="page-head"><div><h1>Configurações</h1><p>Dados da empresa, segurança da conta e quem tem acesso.</p></div></div>' +
      '<nav class="tabs" aria-label="Seções de configuração">' + tabs.map(function (t) { return '<a href="#config/' + t.k + '"' + (t.k === cur ? ' class="on" aria-current="page"' : '') + '>' + t.l + '</a>'; }).join('') + '</nav><div id="cfg"></div>';
    ({ empresa: tabEmpresa, seguranca: tabSeguranca, usuarios: tabUsuarios, financeiro: tabFinanceiro })[cur](nav);
  };

  /* ----- Dados da empresa ----- */
  function tabEmpresa() {
    var a = me().account, ro = !isOwner();
    $('#cfg').innerHTML = '<section class="card pad"><h2 class="sec">Dados da empresa</h2><p class="sec-sub">' + (ro ? 'Só o titular da conta pode alterar estes dados.' : 'Usados nas propostas, na comunicação e no cadastro da conta.') + '</p><form id="femp" novalidate><div class="fgrid">' +
      P.field({ id: 'empresa', label: 'Nome da empresa', value: a.empresa, ro: ro, max: 120, auto: 'organization' }) + P.field({ id: 'razaoSocial', label: 'Razão social', value: a.razaoSocial, ro: ro, opt: true, max: 140 }) +
      P.field({ id: 'cnpj', label: 'CNPJ', value: SA.maskCnpj(a.cnpj), ro: true, hint: 'O CNPJ identifica a conta e não pode ser editado aqui. Para corrigir, fale com o time do Saldo Alto.' }) +
      P.field({ id: 'setor', label: 'Setor de atuação', value: a.setor, ro: ro, options: SETORES.map(function (s) { return { v: s, l: s || 'Selecione' }; }).concat(SETORES.indexOf(a.setor) < 0 && a.setor ? [{ v: a.setor, l: a.setor }] : []) }) +
      P.field({ id: 'email', label: 'E-mail da empresa', value: a.email, ro: ro, type: 'email', max: 120 }) + P.field({ id: 'telefone', label: 'Telefone', value: SA.maskPhone(a.telefone), ro: ro, opt: true, mode: 'tel', max: 15 }) +
      P.field({ id: 'site', label: 'Site', value: a.site, ro: ro, opt: true, max: 120, ph: 'www.suaempresa.com.br' }) + P.field({ id: 'cep', label: 'CEP', value: SA.maskCep(a.cep), ro: ro, opt: true, mode: 'numeric', max: 9 }) +
      P.field({ id: 'cidade', label: 'Cidade', value: a.cidade, ro: ro, opt: true, max: 80 }) + P.field({ id: 'uf', label: 'Estado (UF)', value: a.uf, ro: ro, opt: true, options: uf }) +
      '</div>' + (ro ? '' : '<div class="form-actions"><button class="btn-primary" type="submit">Salvar dados da empresa</button></div>') + '</form></section>';
    var f = $('#femp'); bindMasks(f);
    if (ro) return;
    wire(f, {
      action: 'account.update',
      rules: function () { return { empresa: function (v) { return v.trim().length >= 2 ? '' : 'Informe o nome da empresa.'; }, email: emailRule, telefone: phoneRule, cep: cepRule }; },
      payload: function () {
        var g = function (id) { return $('#f-' + id, f).value; };
        return { empresa: g('empresa'), razaoSocial: g('razaoSocial'), setor: g('setor'), email: g('email'), telefone: SA.digits(g('telefone')), site: g('site'), cep: SA.digits(g('cep')), cidade: g('cidade'), uf: g('uf') };
      }, ok: applyPayload, msg: 'Dados da empresa atualizados.'
    });
  }

  /* ----- Segurança ----- */
  function tabSeguranca(nav) {
    var u = me().user;
    $('#cfg').innerHTML = '<div class="stack">' +
      '<section class="card pad"><h2 class="sec">Alterar senha</h2><p class="sec-sub">Ao trocar a senha, os outros dispositivos conectados são desconectados.</p><form id="fsenha" novalidate><div class="fgrid">' +
      P.field({ id: 'atual', label: 'Senha atual', type: 'password', auto: 'current-password', full: true }) + P.field({ id: 'nova', label: 'Nova senha', type: 'password', auto: 'new-password' }) + P.field({ id: 'nova2', label: 'Confirmar nova senha', type: 'password', auto: 'new-password' }) +
      '</div><ul class="reqs" id="rq" style="margin:-6px 0 14px"></ul><div class="form-actions"><button class="btn-primary" type="submit">Alterar senha</button></div></form></section>' +
      '<section class="card pad"><h2 class="sec">E-mail de acesso</h2><p class="sec-sub">Atual: <b>' + esc(u.email) + '</b>. Por segurança, pedimos sua senha para trocar.</p><form id="femail" novalidate><div class="fgrid">' +
      P.field({ id: 'emailNovo', label: 'Novo e-mail', type: 'email', auto: 'email' }) + P.field({ id: 'senhaEmail', label: 'Sua senha', type: 'password', auto: 'current-password' }) +
      '</div><div class="form-actions"><button class="btn-primary" type="submit">Trocar e-mail</button></div></form></section>' +
      '<section class="card pad"><h2 class="sec">Recuperação de acesso</h2><p class="sec-sub">Um e-mail alternativo também recebe o código quando você usa “Esqueci minha senha”.</p><form id="frec" novalidate><div class="fgrid">' +
      P.field({ id: 'emailRec', label: 'E-mail de recuperação', type: 'email', value: u.emailRecuperacao, opt: true, hint: 'Deixe em branco para não usar.' }) + '</div><div class="form-actions"><button class="btn-primary" type="submit">Salvar e-mail de recuperação</button></div></form></section>' +
      '<section class="card pad"><h2 class="sec">Sessões</h2><p class="sec-sub" id="sesTxt">Verificando dispositivos conectados…</p><button class="btn-ghost" type="button" id="btnOut">Sair dos outros dispositivos</button></section></div>';
    var fs = $('#fsenha'); P.reqs($('#f-nova', fs), $('#rq', fs));
    $('#f-nova', fs).addEventListener('input', function (e) { P.reqs(e.target, $('#rq', fs)); });
    wire(fs, {
      action: 'security.changePassword',
      rules: function () { return { atual: function (v) { return v ? '' : 'Informe a senha atual.'; }, nova: P.pwdError, nova2: function (v) { return v === $('#f-nova', fs).value ? '' : 'As senhas não são iguais.'; } }; },
      payload: function () { return { atual: $('#f-atual', fs).value, nova: $('#f-nova', fs).value }; },
      ok: function (d) { applyPayload(d); fs.reset(); P.reqs($('#f-nova', fs), $('#rq', fs)); }, msg: 'Senha alterada.', busy: 'Alterando…'
    });
    var fe = $('#femail');
    wire(fe, {
      action: 'security.changeEmail',
      rules: function () { return { emailNovo: emailRule, senhaEmail: function (v) { return v ? '' : 'Informe sua senha.'; } }; },
      payload: function () { return { email: $('#f-emailNovo', fe).value, senha: $('#f-senhaEmail', fe).value }; },
      ok: function (d) { applyPayload(d); P.routes.config(['seguranca'], P.nav); }, msg: 'E-mail de acesso atualizado.'
    });
    var fr = $('#frec');
    wire(fr, {
      action: 'security.setRecoveryEmail',
      rules: function () { return { emailRec: optEmail }; }, payload: function () { return { email: $('#f-emailRec', fr).value }; },
      ok: applyPayload, msg: 'E-mail de recuperação salvo.'
    });
    SA.api('security.sessions').then(function (d) {
      if (P.stale(nav)) return;
      $('#sesTxt').textContent = d.ativas <= 1 ? 'Só este dispositivo está conectado.' : d.ativas + ' dispositivos conectados, contando este.';
    }).catch(function () { var t = $('#sesTxt'); if (t) t.textContent = 'Não foi possível verificar agora.'; });
    $('#btnOut').addEventListener('click', function (e) {
      var b = e.currentTarget; P.busy(b, true, 'Saindo…');
      SA.api('logout.others').then(function () { P.busy(b, false); $('#sesTxt').textContent = 'Só este dispositivo está conectado.'; SA.toast('Outros dispositivos desconectados.'); }).catch(function (err) { P.busy(b, false); SA.toast(err.message, 'err'); });
    });
  }

  /* ----- Usuários e acessos (titular) ----- */
  var USERS = [], FIN = '';
  function tabUsuarios(nav) {
    $('#cfg').innerHTML = '<div class="card pad"><div class="skeleton" style="margin:0"><i></i></div></div>';
    SA.api('users.list').then(function (d) { if (P.stale(nav)) return; USERS = d.usuarios.filter(function (u) { return u.status === 'ativo'; }); FIN = d.financeiroUserId; drawUsers(); })
      .catch(function (err) { if (!P.stale(nav)) P.errorState(err, function () { tabUsuarios(nav); }); });
  }
  function drawUsers() {
    var fin = USERS.filter(function (u) { return u.id === FIN; })[0];
    $('#cfg').innerHTML = '<div class="stack"><section class="card pad"><div style="display:flex;justify-content:space-between;gap:16px;flex-wrap:wrap;align-items:flex-start"><div><h2 class="sec">Usuários e acessos</h2>' +
      '<p class="sec-sub" style="margin-bottom:0;max-width:640px">Convide sua equipe e escolha o que cada pessoa pode fazer. O <b>titular</b> tem acesso total e é o único que gerencia usuários. O <b>titular financeiro</b>' + (fin ? ' (hoje, ' + esc(fin.nome) + ')' : '') + ' é quem responde por contratação, pagamentos e informações financeiras da conta.</p></div>' +
      '<button class="btn-primary" type="button" id="addU">' + P.svg('plus') + 'Adicionar usuário</button></div></section>' +
      '<section class="card utable"><div class="urow uhead"><span>Pessoa</span><span>Acesso</span><span>Último acesso</span><span></span></div>' + USERS.map(userRow).join('') + '</section></div>';
    $('#addU').addEventListener('click', function () { userModal(null); });
  }
  function userRow(u) {
    var tags = '';
    if (u.papel === 'titular') tags += '<span class="tag owner">Titular</span>';
    else tags += '<span class="tag">' + esc(SA.ROLE_LABELS[u.papel] || u.papel) + '</span>';
    if (u.id === FIN) tags += '<span class="tag fin">Titular financeiro</span>';
    var perms = u.papel === 'titular' ? '<div class="tiny muted" style="font-weight:600">Acesso total</div>' : '<div class="tiny muted" style="font-weight:600;margin-top:2px">' + u.perms.map(function (p) { return esc(SA.PERM_LABELS[p] || p); }).join(' · ') + '</div>';
    var items = userMenuItems(u);
    return '<div class="urow"><div class="uname"><b>' + esc(u.nome) + '</b><small>' + esc(u.email) + (u.cargo ? ' · ' + esc(u.cargo) : '') + '</small></div><div>' + tags + perms + '</div>' +
      '<div class="tiny" style="font-weight:700">' + (u.ultimoLogin ? SA.fmtDate(u.ultimoLogin) : '<span class="muted">Ainda não entrou</span>') + '</div>' +
      '<div class="kebab-wrap">' + (items ? '<button class="kebab" type="button" data-umenu="' + esc(u.id) + '" aria-haspopup="menu" aria-expanded="false" aria-label="Ações para ' + esc(u.nome) + '">' + P.svg('dots') + '</button>' : '') + '</div></div>';
  }

  document.addEventListener('click', function (e) {
    var km = e.target.closest('[data-umenu]'), ua = e.target.closest('[data-uact]');
    if (km) {
      var open = km.getAttribute('aria-expanded') === 'true';
      $$('.menu').forEach(function (m) { m.remove(); }); $$('.kebab[aria-expanded="true"]').forEach(function (b) { b.setAttribute('aria-expanded', 'false'); });
      if (open) return;
      var u = USERS.filter(function (x) { return x.id === km.getAttribute('data-umenu'); })[0]; if (!u) return;
      var m = document.createElement('div'); m.className = 'menu'; m.setAttribute('role', 'menu'); m.innerHTML = userMenuItems(u);
      km.parentNode.appendChild(m); km.setAttribute('aria-expanded', 'true'); return;
    }
    if (ua) userAction(ua.getAttribute('data-uact'), ua.getAttribute('data-id'));
  });
  function userMenuItems(u) {
    var items = '';
    if (u.papel !== 'titular') items += '<button type="button" data-uact="edit" data-id="' + esc(u.id) + '">' + P.svg('edit') + 'Editar acesso</button>';
    if (u.id !== FIN) items += '<button type="button" data-uact="fin" data-id="' + esc(u.id) + '">' + P.svg('shield') + 'Definir como titular financeiro</button>';
    if (u.papel !== 'titular') items += '<button type="button" data-uact="pwd" data-id="' + esc(u.id) + '">' + P.svg('key') + 'Redefinir senha</button><button type="button" class="danger" data-uact="rm" data-id="' + esc(u.id) + '">' + P.svg('trash') + 'Remover acesso</button>';
    return items;
  }

  function userAction(act, id) {
    var u = USERS.filter(function (x) { return x.id === id; })[0]; if (!u) return;
    if (act === 'edit') userModal(u);
    else if (act === 'fin') {
      P.confirm({ title: 'Definir titular financeiro?', text: u.nome + ' passa a ser a pessoa responsável por contratação, pagamentos e informações financeiras' + (u.papel !== 'titular' ? ' e recebe o acesso financeiro' : '') + '.', ok: 'Confirmar' }).then(function (yes) {
        if (!yes) return;
        SA.api('users.setFinancialHolder', { id: id }).then(function (d) { FIN = d.financeiroUserId; if (d.usuario) USERS = USERS.map(function (x) { return x.id === id ? d.usuario : x; }); var s = me(); s.account.financeiroUserId = FIN; drawUsers(); SA.toast(u.nome + ' é a titular financeira.'); }).catch(function (err) { SA.toast(err.message, 'err'); });
      });
    } else if (act === 'pwd') {
      P.confirm({ title: 'Redefinir a senha de ' + u.nome + '?', text: 'Geramos uma senha provisória e desconectamos a pessoa. No próximo acesso ela cria uma senha nova.', ok: 'Redefinir senha' }).then(function (yes) {
        if (!yes) return;
        SA.api('users.resetPassword', { id: id }).then(function (d) { secretModal(u.nome, u.email, d); }).catch(function (err) { SA.toast(err.message, 'err'); });
      });
    } else if (act === 'rm') {
      P.confirm({ title: 'Remover o acesso de ' + u.nome + '?', text: 'A pessoa é desconectada agora e não consegue mais entrar nesta conta.', ok: 'Remover acesso', danger: true }).then(function (yes) {
        if (!yes) return;
        SA.api('users.remove', { id: id }).then(function (d) { FIN = d.financeiroUserId; USERS = USERS.filter(function (x) { return x.id !== id; }); drawUsers(); SA.toast('Acesso removido.'); }).catch(function (err) { SA.toast(err.message, 'err'); });
      });
    }
  }

  function userModal(u) {
    var edit = !!u, papel = u ? u.papel : 'gestor', perms = u ? u.perms : [];
    var box = P.modal('<h3>' + (edit ? 'Editar acesso' : 'Adicionar usuário') + '</h3><p class="sub">' + (edit ? esc(u.email) : 'A pessoa recebe um e-mail com uma senha provisória e cria a própria senha no primeiro acesso.') + '</p><form id="fusr" novalidate>' +
      '<div class="fgrid">' + P.field({ id: 'nome', label: 'Nome', value: u ? u.nome : '', max: 100 }) + P.field({ id: 'cargo', label: 'Cargo', value: u ? u.cargo : '', opt: true, max: 80 }) +
      (edit ? '' : P.field({ id: 'email', label: 'E-mail', type: 'email', full: true, auto: 'off' })) + '</div>' +
      '<p style="font-family:var(--display);font-weight:700;font-size:.86rem;margin:2px 0 8px">Perfil de acesso</p><div class="roles">' +
      Object.keys(ROLE_INFO).map(function (k) { return '<label class="role"><input type="radio" name="papel" value="' + k + '"' + (k === papel ? ' checked' : '') + '><span><b>' + ROLE_INFO[k][0] + '</b><span>' + ROLE_INFO[k][1] + '</span></span></label>'; }).join('') + '</div>' +
      '<div class="perm-list" id="plist"' + (papel === 'personalizado' ? '' : ' hidden') + '>' + Object.keys(SA.PERM_LABELS).map(function (p) { return '<label><input type="checkbox" value="' + p + '"' + (perms.indexOf(p) >= 0 ? ' checked' : '') + '>' + esc(SA.PERM_LABELS[p]) + '</label>'; }).join('') + '</div>' +
      '<div class="modal-actions"><button type="button" class="btn-ghost" data-close>Cancelar</button><button class="btn-primary" type="submit">' + (edit ? 'Salvar acesso' : 'Enviar convite') + '</button></div></form>');
    var f = $('#fusr', box);
    $$('input[name=papel]', f).forEach(function (r) { r.addEventListener('change', function () { $('#plist', f).hidden = r.value !== 'personalizado' || !r.checked; }); });
    f.addEventListener('submit', function (e) {
      e.preventDefault(); P.clearErrs(f);
      var rules = { nome: function (v) { return v.trim().length >= 2 ? '' : 'Informe o nome.'; } };
      if (!edit) rules.email = emailRule;
      if (!P.validate(f, rules)) return;
      var pp = $('input[name=papel]:checked', f).value, pl = $$('#plist input:checked', f).map(function (c) { return c.value; });
      if (pp === 'personalizado' && !pl.length) { P.formAlert(f, 'Marque pelo menos uma permissão.'); return; }
      var b = $('button[type=submit]', f); P.busy(b, true, edit ? 'Salvando…' : 'Enviando…');
      var call = edit ? SA.api('users.update', { id: u.id, nome: $('#f-nome', f).value, cargo: $('#f-cargo', f).value, papel: pp, perms: pl })
        : SA.api('users.add', { nome: $('#f-nome', f).value, cargo: $('#f-cargo', f).value, email: $('#f-email', f).value, papel: pp, perms: pl });
      call.then(function (d) {
        P.closeModal();
        if (edit) { USERS = USERS.map(function (x) { return x.id === u.id ? d.usuario : x; }); FIN = d.financeiroUserId; drawUsers(); SA.toast('Acesso atualizado.'); }
        else { USERS.push(d.usuario); drawUsers(); secretModal(d.usuario.nome, d.usuario.email, d, true); }
      }).catch(function (err) { P.busy(b, false); P.serverError(f, err); });
    });
  }

  function secretModal(nome, email, d, isNew) {
    var box = P.modal('<h3>' + (isNew ? 'Convite criado' : 'Senha redefinida') + '</h3><p class="sub">' + (d.emailEnviado ? 'Enviamos as instruções para <b>' + esc(email) + '</b>. ' : 'Não conseguimos enviar o e-mail agora. ') + 'Se preferir, passe a senha provisória para ' + esc(nome) + ' por um canal seguro. Ela só aparece aqui, agora.</p>' +
      '<div class="secret"><span id="sec">' + esc(d.senhaProvisoria) + '</span><button class="btn-ghost btn-sm" type="button" id="cp">Copiar</button></div><p class="tiny muted" style="margin-top:12px;font-weight:600">No primeiro acesso, ' + esc(nome) + ' cria uma senha nova.</p><div class="modal-actions"><button class="btn-primary" type="button" data-close>Pronto</button></div>');
    $('#cp', box).addEventListener('click', function () {
      var t = $('#sec', box).textContent;
      (navigator.clipboard ? navigator.clipboard.writeText(t) : Promise.reject()).then(function () { SA.toast('Senha copiada.'); }, function () { var r = document.createRange(); r.selectNodeContents($('#sec', box)); var s = getSelection(); s.removeAllRanges(); s.addRange(r); SA.toast('Selecione e copie a senha.'); });
    });
  }

  /* ----- Financeiro ----- */
  function tabFinanceiro(nav) {
    var s = me(), a = s.account, f0 = a.faturamento || {};
    $('#cfg').innerHTML = '<div class="stack"><section class="card pad"><h2 class="sec">Dados de faturamento</h2><p class="sec-sub">Usados para emitir nota fiscal e cobrar as pesquisas contratadas. Visível só para quem tem acesso financeiro.</p><form id="ffin" novalidate><div class="fgrid">' +
      P.field({ id: 'razao', label: 'Razão social', value: f0.razao, opt: true, max: 140 }) + P.field({ id: 'cnpj', label: 'CNPJ para faturamento', value: SA.maskCnpj(f0.cnpj), opt: true, mode: 'numeric', max: 18 }) +
      P.field({ id: 'email', label: 'E-mail para cobrança e nota fiscal', value: f0.email, opt: true, type: 'email', full: true }) + P.field({ id: 'endereco', label: 'Endereço', value: f0.endereco, opt: true, full: true, max: 160 }) +
      P.field({ id: 'cidade', label: 'Cidade', value: f0.cidade, opt: true, max: 80 }) + P.field({ id: 'uf', label: 'Estado (UF)', value: f0.uf, opt: true, options: uf }) + P.field({ id: 'cep', label: 'CEP', value: SA.maskCep(f0.cep), opt: true, mode: 'numeric', max: 9 }) +
      '</div><div class="form-actions"><button class="btn-primary" type="submit">Salvar dados de faturamento</button></div></form></section>' +
      '<section class="card"><div style="padding:22px 28px 6px"><h2 class="sec">Contratações</h2><p class="sec-sub" style="margin-bottom:6px">Pesquisas enviadas ao time e o valor de cada uma.</p></div><div id="contr"><div class="skeleton"><i></i></div></div></section>' +
      '<div class="note" id="finNote"></div></div>';
    var f = $('#ffin'); bindMasks(f);
    wire(f, {
      action: 'billing.update',
      rules: function () { return { cnpj: function (v) { return !v.trim() || SA.validCnpj(v) ? '' : 'CNPJ inválido.'; }, email: optEmail, cep: cepRule }; },
      payload: function () { var g = function (id) { return $('#f-' + id, f).value; }; return { faturamento: { razao: g('razao'), cnpj: SA.digits(g('cnpj')), email: g('email'), endereco: g('endereco'), cidade: g('cidade'), uf: g('uf'), cep: SA.digits(g('cep')) } }; },
      ok: applyPayload, msg: 'Dados de faturamento salvos.'
    });
    var note = $('#finNote');
    if (a.financeiroUserId === s.user.id) note.textContent = 'Você é a titular financeira desta conta.';
    else if (isOwner()) SA.api('users.list').then(function (d) { var x = d.usuarios.filter(function (u) { return u.id === d.financeiroUserId; })[0]; if (!P.stale(nav)) note.textContent = 'Titular financeiro da conta: ' + (x ? x.nome : '—') + '.'; }).catch(function () { note.remove(); });
    else note.remove();
    if (!SA.can('pesquisas_ver')) { $('#contr').innerHTML = '<p class="muted" style="padding:0 28px 24px">Seu perfil não inclui a lista de pesquisas.</p>'; return; }
    SA.api('surveys.list').then(function (d) {
      if (P.stale(nav)) return;
      var list = d.pesquisas.filter(function (x) { return x.status !== 'rascunho'; }), total = list.reduce(function (t, x) { return t + x.preco; }, 0);
      $('#contr').innerHTML = list.length ? '<div style="padding:0 28px 22px;overflow-x:auto"><table class="dt"><thead><tr><th>Pesquisa</th><th>Código</th><th>Enviada em</th><th>Valor</th></tr></thead><tbody>' +
        list.map(function (x) { return '<tr><td>' + esc(x.nome) + '</td><td>' + esc(x.codigo) + '</td><td>' + SA.fmtDate(x.enviadaEm) + '</td><td>' + SA.fmtBRL(x.preco) + '</td></tr>'; }).join('') +
        '<tr><td colspan="3"><b>Total contratado</b></td><td><b>' + SA.fmtBRL(total) + '</b></td></tr></tbody></table></div>' : '<p class="muted" style="padding:0 28px 24px;font-weight:600">Nenhuma pesquisa contratada ainda.</p>';
    }).catch(function (err) { $('#contr').innerHTML = '<p class="muted" style="padding:0 28px 24px">' + esc(err.message) + '</p>'; });
  }
})();
