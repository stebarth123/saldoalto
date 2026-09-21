/**
 * Saldo Alto — backend (Google Apps Script + Google Planilhas).
 *
 * O que este script faz:
 *  1. Recebe os cadastros dos formulários públicos (empreendedoras e empresas)
 *     e grava nas abas "Empreendedoras" e "Empresas" (comportamento antigo, mantido).
 *  2. É a API da ÁREA LOGADA DA EMPRESA: cadastro de conta, login, sessão,
 *     recuperação de senha, pesquisas, usuários e acessos, configurações e o
 *     dashboard "Inteligência da Base". Tudo fica gravado nas abas abaixo, que o
 *     time pode abrir na planilha:
 *       Contas        → uma linha por empresa cadastrada
 *       Usuarios      → pessoas com acesso a cada conta (o titular é o papel "titular")
 *       Sessoes       → sessões ativas (só guarda o hash do token)
 *       Pesquisas     → pesquisas criadas pelas empresas (rascunho, em revisão, ativa, encerrada)
 *       Recuperacoes  → códigos de recuperação de senha (só o hash)
 *       Auditoria     → registro de ações importantes (login, envio de pesquisa, usuários…)
 *
 * OPERAÇÃO DO TIME (na aba "Pesquisas"):
 *   - Depois de revisar uma pesquisa "em_revisao", troque a coluna "status" para
 *     ativa e, quando terminar, para encerrada.
 *   - Atualize a coluna "respostas" com o número de respostas coletadas: o
 *     progresso que a empresa vê é respostas ÷ amostra.
 *   Valores aceitos em "status": rascunho, em_revisao, ativa, encerrada.
 *
 * COMO PUBLICAR (de novo, sempre que este código mudar):
 *  1. Abra a planilha > Extensões > Apps Script e cole este código no lugar do antigo.
 *  2. Clique em "Implantar" > "Gerenciar implantações" > lápis (editar) na implantação
 *     existente > Versão: "Nova versão" > Implantar. Assim a URL /exec continua a mesma.
 *     (Numa implantação nova, a URL muda e é preciso atualizar SA_API_URL em sa-app.js
 *     e APPS_SCRIPT_URL em index.html e saldo-alto-empresas.html.)
 *  3. Tipo: App da Web · Executar como: Eu · Quem pode acessar: Qualquer pessoa.
 *  4. Na primeira vez, autorize as permissões pedidas (Planilhas, e-mail e cache).
 *  5. Para testar: abra a URL /exec?action=ping no navegador. Deve responder
 *     {"status":"ok","api":2}.
 *
 * SEGURANÇA (resumo):
 *  - Senhas nunca são gravadas: guarda-se um hash com salt e um segredo ("pepper") que
 *    fica só nas Propriedades do script.
 *  - Tokens de sessão são aleatórios; a planilha guarda apenas o hash deles.
 *  - Toda leitura/gravação de pesquisas e usuários é filtrada pela conta da sessão,
 *    nunca por um identificador enviado pelo navegador.
 *  - Depois de 5 tentativas de login erradas, o e-mail fica bloqueado por 15 minutos.
 *  - O dashboard só entrega números agregados; grupos com menos de 5 pessoas não aparecem.
 */

var API_VERSION = 2;
var SITE_URL_DEFAULT = 'https://saldoalto.netlify.app';
var SESSION_HOURS = 12;
var SESSION_DAYS_REMEMBER = 30;
var HASH_ROUNDS = 300;
var K_ANON = 5;
var MAX_DADOS = 160000;      // 4 colunas de 40.000 caracteres (limite da célula é 50.000)
var CHUNK = 40000;

var HEADERS = {
  Contas: ['id', 'criadoEm', 'empresa', 'razaoSocial', 'cnpj', 'setor', 'site', 'email', 'telefone', 'cep', 'cidade', 'uf',
    'financeiroUserId', 'fatRazao', 'fatCnpj', 'fatEmail', 'fatEndereco', 'fatCidade', 'fatUf', 'fatCep', 'plano', 'status'],
  Usuarios: ['id', 'contaId', 'criadoEm', 'nome', 'cargo', 'email', 'telefone', 'papel', 'perms', 'senhaHash', 'salt',
    'mustChange', 'status', 'ultimoLogin', 'emailRecuperacao', 'convidadoPor'],
  Sessoes: ['tokenHash', 'userId', 'contaId', 'criadoEm', 'expiraEm', 'lembrar', 'revogada'],
  Pesquisas: ['id', 'contaId', 'criadoPor', 'nome', 'status', 'criadaEm', 'atualizadaEm', 'enviadaEm', 'codigo', 'objetivo',
    'amostra', 'preco', 'perguntas', 'nichos', 'progresso', 'respostas', 'contato', 'dados0', 'dados1', 'dados2', 'dados3'],
  Recuperacoes: ['email', 'codigoHash', 'salt', 'expiraEm', 'tentativas', 'usado', 'criadoEm'],
  Auditoria: ['quando', 'contaId', 'userId', 'acao', 'detalhe']
};

var PERMS = ['pesquisas_ver', 'pesquisas_criar', 'dashboard', 'financeiro'];
var ROLES = {
  titular: PERMS.slice(),
  financeiro: ['pesquisas_ver', 'pesquisas_criar', 'dashboard', 'financeiro'],
  gestor: ['pesquisas_ver', 'pesquisas_criar', 'dashboard'],
  leitor: ['pesquisas_ver', 'dashboard']
};
var STATUSES = ['rascunho', 'em_revisao', 'ativa', 'encerrada'];
var UFS = ['AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO'];
var NICHOS = ['Serviços de Beleza / Estética', 'Saúde / Bem-estar', 'Alimentação / Confeitaria', 'Moda / Costura',
  'Educação / Cursos e mentorias', 'Revenda de produtos', 'Serviços (design, marketing etc.)'];

/* ============================== Entradas HTTP ============================== */

function doGet(e) {
  var action = e && e.parameter && e.parameter.action;
  if (action === 'ping') return json_({ status: 'ok', api: API_VERSION });
  return json_({ status: 'error', code: 'metodo', message: 'Use POST.' });
}

function doPost(e) {
  var data;
  try { data = JSON.parse(e.postData.contents); } catch (err) { return json_({ status: 'error', code: 'json', message: 'Requisição inválida.' }); }
  if (data && data.action) return json_(handleApi_(data));
  return json_(saveLegacyForm_(data));
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

/* Formulários públicos (comportamento original, sem mudanças) */
function saveLegacyForm_(data) {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var isEmpresa = data.formType === 'empresa';
    var sheetName = isEmpresa ? 'Empresas' : 'Empreendedoras';
    var sheet = ss.getSheetByName(sheetName);
    if (!sheet) sheet = ss.insertSheet(sheetName);
    if (isEmpresa) {
      sheet.appendRow([new Date(), data.nome || '', data.sobrenome || '', data.cargo || '', data.telefone || '', data.emailCorp || '',
        data.empresa || '', data.cnpj || '', data.setor || '', data.site || '', data.plano || '', data.objetivo || '', data.optin || 'Não']);
    } else {
      sheet.appendRow([new Date(), data.nome || '', data.sobrenome || '', data.cidade || '', data.estado || '', data.emailPessoal || '',
        data.emailCorp || '', data.telefone || '', data.negocio || '', data.nicho || '', data.instagram || '', data.site || '', data.optin || 'Não']);
    }
    return { status: 'ok' };
  } catch (err) {
    return { status: 'error', message: err.message };
  }
}

/* ============================== Roteador da API ============================== */

var PUBLIC = { register: 1, login: 1, 'reset.request': 1, 'reset.confirm': 1 };
var WRITES = {
  register: 1, login: 1, logout: 1, 'logout.others': 1, 'reset.request': 1, 'reset.confirm': 1, 'profile.update': 1, 'account.update': 1,
  'billing.update': 1, 'security.changePassword': 1, 'security.changeEmail': 1, 'security.setRecoveryEmail': 1, 'users.add': 1,
  'users.update': 1, 'users.remove': 1, 'users.resetPassword': 1, 'users.setFinancialHolder': 1, 'surveys.save': 1, 'surveys.submit': 1,
  'surveys.duplicate': 1, 'surveys.delete': 1, 'surveys.rename': 1
};

function handleApi_(data) {
  var cache = {};
  var lock = null;
  try {
    var action = String(data.action);
    if (WRITES[action]) { lock = LockService.getScriptLock(); lock.waitLock(20000); }
    var fn = ACTIONS[action];
    if (!fn) throw apiError_('acao', 'Ação desconhecida.');
    var ctx = { db: cache, now: new Date() };
    if (!PUBLIC[action]) authenticate_(ctx, data.token);
    return { status: 'ok', data: fn(data, ctx) };
  } catch (err) {
    if (err && err.isApi) { var out = { status: 'error', code: err.code, message: err.message }; if (err.fields) out.fields = err.fields; return out; }
    return { status: 'error', code: 'interno', message: 'Não foi possível concluir agora. Tente novamente em instantes.' };
  } finally {
    if (lock) { try { lock.releaseLock(); } catch (e2) { /* ignora */ } }
  }
}

function apiError_(code, message) { var e = new Error(message); e.isApi = true; e.code = code; return e; }

/* ============================== Planilhas como tabelas ============================== */

function sheet_(name) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    var cols = HEADERS[name].length;
    sh.getRange(1, 1, 1, cols).setValues([HEADERS[name]]);
    sh.getRange(1, 1, 1, cols).setFontWeight('bold');
    sh.setFrozenRows(1);
    sh.getRange(2, 1, Math.max(sh.getMaxRows() - 1, 1), cols).setNumberFormat('@');   // tudo como texto: evita datas e números "convertidos"
  }
  return sh;
}

function rows_(ctx, name) {
  if (ctx.db[name]) return ctx.db[name];
  var sh = sheet_(name), headers = HEADERS[name], last = sh.getLastRow(), out = [];
  if (last > 1) {
    var vals = sh.getRange(2, 1, last - 1, headers.length).getValues();
    for (var i = 0; i < vals.length; i++) {
      var o = { _row: i + 2 };
      for (var c = 0; c < headers.length; c++) o[headers[c]] = vals[i][c] === null || vals[i][c] === undefined ? '' : vals[i][c];
      out.push(o);
    }
  }
  ctx.db[name] = out;
  return out;
}

function toArr_(name, obj) {
  return HEADERS[name].map(function (h) { var v = obj[h]; return v === undefined || v === null ? '' : String(v); });
}

function insert_(ctx, name, obj) {
  var sh = sheet_(name);
  sh.appendRow(toArr_(name, obj));
  var row = sh.getLastRow();
  obj._row = row;
  rows_(ctx, name).push(obj);
  return obj;
}

function save_(ctx, name, obj) {
  var sh = sheet_(name);
  sh.getRange(obj._row, 1, 1, HEADERS[name].length).setValues([toArr_(name, obj)]);
  return obj;
}

function remove_(ctx, name, obj) {
  sheet_(name).deleteRow(obj._row);
  delete ctx.db[name];          // recarrega: os índices de linha mudaram
}

function find_(ctx, name, pred) {
  var list = rows_(ctx, name);
  for (var i = 0; i < list.length; i++) if (pred(list[i])) return list[i];
  return null;
}
function filter_(ctx, name, pred) { return rows_(ctx, name).filter(pred); }

function audit_(ctx, contaId, userId, acao, detalhe) {
  try { sheet_('Auditoria').appendRow([iso_(ctx.now), contaId || '', userId || '', acao, detalhe ? String(detalhe).slice(0, 300) : '']); } catch (e) { /* auditoria nunca derruba a ação */ }
}

/* ============================== Utilidades ============================== */

function iso_(d) { return d.toISOString(); }
function bool_(v) { return v === true || v === 'true' || v === 'TRUE'; }
function num_(v) { var n = Number(v); return isFinite(n) ? n : 0; }
function str_(v, max) { return String(v === undefined || v === null ? '' : v).trim().slice(0, max || 200); }
function lower_(v) { return String(v || '').trim().toLowerCase(); }
function id_(prefix) { return prefix + Utilities.getUuid().replace(/-/g, '').slice(0, 10); }
function digits_(v) { return String(v || '').replace(/\D/g, ''); }
function isEmail_(v) { return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(v || '')) && String(v).length <= 120; }

function bytesToHex_(bytes) {
  var s = '';
  for (var i = 0; i < bytes.length; i++) { var b = bytes[i] < 0 ? bytes[i] + 256 : bytes[i]; s += (b < 16 ? '0' : '') + b.toString(16); }
  return s;
}
function sha256_(text) { return bytesToHex_(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(text), Utilities.Charset.UTF_8)); }

function pepper_() {
  var props = PropertiesService.getScriptProperties();
  var p = props.getProperty('PEPPER');
  if (!p) { p = Utilities.getUuid() + Utilities.getUuid() + Utilities.getUuid(); props.setProperty('PEPPER', p); }
  return p;
}

function hashPassword_(password, salt) {
  var pep = pepper_(), h = salt + '|' + password;
  for (var i = 0; i < HASH_ROUNDS; i++) h = bytesToHex_(Utilities.computeHmacSha256Signature(h + salt, pep));
  return h;
}

function safeEqual_(a, b) {
  a = String(a); b = String(b);
  if (a.length !== b.length) return false;
  var r = 0;
  for (var i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

function newSalt_() { return Utilities.getUuid().replace(/-/g, ''); }
function newToken_() { return (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, ''); }

function passwordError_(p) {
  p = String(p || '');
  if (p.length < 8) return 'A senha precisa ter pelo menos 8 caracteres.';
  if (p.length > 100) return 'A senha é longa demais.';
  if (!/[A-Za-z]/.test(p) || !/[0-9]/.test(p)) return 'Use letras e números na senha.';
  return '';
}

function validCnpj_(raw) {
  var c = digits_(raw);
  if (c.length !== 14 || /^(\d)\1+$/.test(c)) return false;
  function dv(len) {
    var sum = 0, pos = len - 7;
    for (var i = len; i >= 1; i--) { sum += Number(c.charAt(len - i)) * pos--; if (pos < 2) pos = 9; }
    var r = sum % 11;
    return r < 2 ? 0 : 11 - r;
  }
  return dv(12) === Number(c.charAt(12)) && dv(13) === Number(c.charAt(13));
}

function sendMail_(to, subject, html) {
  try { MailApp.sendEmail({ to: to, subject: subject, htmlBody: html, name: 'Saldo Alto' }); return true; } catch (e) { return false; }
}
function siteUrl_() { return PropertiesService.getScriptProperties().getProperty('SITE_URL') || SITE_URL_DEFAULT; }
function mailWrap_(title, body) {
  return '<div style="font-family:Arial,sans-serif;max-width:520px;margin:auto;color:#171512"><h2 style="color:#E8156A;margin:0 0 12px">' + title + '</h2>' + body +
    '<p style="color:#777;font-size:12px;margin-top:24px">Saldo Alto para Empresas</p></div>';
}
function htmlEsc_(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

/* ============================== Sessão e permissões ============================== */

function permsOf_(user) {
  if (user.papel === 'titular') return PERMS.slice();
  var list;
  try { list = JSON.parse(user.perms || '[]'); } catch (e) { list = []; }
  return list.filter(function (p) { return PERMS.indexOf(p) >= 0; });
}
function can_(ctx, perm) { return ctx.perms.indexOf(perm) >= 0; }
function need_(ctx, perm) { if (!can_(ctx, perm)) throw apiError_('permissao', 'Você não tem permissão para isso. Fale com o titular da conta.'); }
function needOwner_(ctx) { if (ctx.user.papel !== 'titular') throw apiError_('permissao', 'Só o titular da conta pode fazer isso.'); }

function authenticate_(ctx, token) {
  token = String(token || '');
  if (token.length < 32) throw apiError_('sessao', 'Sua sessão expirou. Entre novamente.');
  var hash = sha256_(token);
  var ses = find_(ctx, 'Sessoes', function (s) { return s.tokenHash === hash; });
  if (!ses || bool_(ses.revogada) || new Date(ses.expiraEm).getTime() < ctx.now.getTime()) throw apiError_('sessao', 'Sua sessão expirou. Entre novamente.');
  var user = find_(ctx, 'Usuarios', function (u) { return u.id === ses.userId; });
  var conta = user && find_(ctx, 'Contas', function (c) { return c.id === user.contaId; });
  if (!user || !conta || user.status !== 'ativo' || conta.status !== 'ativa') throw apiError_('sessao', 'Sua sessão expirou. Entre novamente.');
  ctx.session = ses; ctx.user = user; ctx.account = conta; ctx.perms = permsOf_(user);
}

function publicUser_(u) {
  var perms = permsOf_(u);
  return { id: u.id, nome: u.nome, cargo: u.cargo, email: u.email, telefone: u.telefone, papel: u.papel, perms: perms, mustChange: bool_(u.mustChange),
    emailRecuperacao: u.emailRecuperacao || '', status: u.status, ultimoLogin: u.ultimoLogin || '', criadoEm: u.criadoEm };
}
function publicAccount_(a, withBilling) {
  var o = { id: a.id, empresa: a.empresa, razaoSocial: a.razaoSocial, cnpj: a.cnpj, setor: a.setor, site: a.site, email: a.email, telefone: a.telefone,
    cep: a.cep, cidade: a.cidade, uf: a.uf, financeiroUserId: a.financeiroUserId, plano: a.plano, criadoEm: a.criadoEm };
  if (withBilling) o.faturamento = { razao: a.fatRazao, cnpj: a.fatCnpj, email: a.fatEmail, endereco: a.fatEndereco, cidade: a.fatCidade, uf: a.fatUf, cep: a.fatCep };
  return o;
}
function sessionPayload_(ctx, token) {
  return { token: token, expiraEm: ctx.session ? ctx.session.expiraEm : '', user: publicUser_(ctx.user), account: publicAccount_(ctx.account, can_(ctx, 'financeiro')) };
}

function startSession_(ctx, user, conta, lembrar) {
  var token = newToken_();
  var hours = lembrar ? SESSION_DAYS_REMEMBER * 24 : SESSION_HOURS;
  var exp = new Date(ctx.now.getTime() + hours * 3600 * 1000);
  ctx.session = insert_(ctx, 'Sessoes', { tokenHash: sha256_(token), userId: user.id, contaId: conta.id, criadoEm: iso_(ctx.now), expiraEm: iso_(exp), lembrar: String(!!lembrar), revogada: 'false' });
  ctx.user = user; ctx.account = conta; ctx.perms = permsOf_(user);
  return token;
}

function revokeSessions_(ctx, userId, exceptHash) {
  filter_(ctx, 'Sessoes', function (s) { return s.userId === userId && !bool_(s.revogada) && s.tokenHash !== exceptHash; })
    .forEach(function (s) { s.revogada = 'true'; save_(ctx, 'Sessoes', s); });
}

/* ============================== Ações ============================== */

var ACTIONS = {};

ACTIONS.register = function (d, ctx) {
  var empresa = str_(d.empresa, 120), cnpj = digits_(d.cnpj), nome = str_(d.nome, 100), email = lower_(d.email), tel = digits_(d.telefone);
  var err = {};
  if (empresa.length < 2) err.empresa = 'Informe o nome da empresa.';
  if (!validCnpj_(cnpj)) err.cnpj = 'CNPJ inválido. Confira os 14 números.';
  if (nome.length < 2) err.nome = 'Informe seu nome.';
  if (!isEmail_(email)) err.email = 'Informe um e-mail válido.';
  if (tel.length < 10 || tel.length > 13) err.telefone = 'Informe um telefone com DDD.';
  var pe = passwordError_(d.senha); if (pe) err.senha = pe;
  if (!d.aceite) err.aceite = 'É preciso aceitar os termos e a política de privacidade.';
  if (Object.keys(err).length) throw fieldErrors_(err);
  if (find_(ctx, 'Usuarios', function (u) { return lower_(u.email) === email; })) throw fieldErrors_({ email: 'Este e-mail já tem cadastro. Entre ou recupere a senha.' });
  if (find_(ctx, 'Contas', function (c) { return digits_(c.cnpj) === cnpj; })) throw fieldErrors_({ cnpj: 'Já existe uma conta para este CNPJ. Peça acesso ao titular da conta.' });

  var conta = insert_(ctx, 'Contas', { id: id_('C-'), criadoEm: iso_(ctx.now), empresa: empresa, razaoSocial: '', cnpj: cnpj, setor: str_(d.setor, 80), site: str_(d.site, 120),
    email: email, telefone: tel, cep: '', cidade: '', uf: '', financeiroUserId: '', fatRazao: '', fatCnpj: cnpj, fatEmail: email, fatEndereco: '', fatCidade: '', fatUf: '', fatCep: '',
    plano: 'Pesquisa sob demanda', status: 'ativa' });
  var salt = newSalt_();
  var user = insert_(ctx, 'Usuarios', { id: id_('U-'), contaId: conta.id, criadoEm: iso_(ctx.now), nome: nome, cargo: str_(d.cargo, 80), email: email, telefone: tel, papel: 'titular',
    perms: JSON.stringify(PERMS), senhaHash: hashPassword_(String(d.senha), salt), salt: salt, mustChange: 'false', status: 'ativo', ultimoLogin: iso_(ctx.now), emailRecuperacao: '', convidadoPor: '' });
  conta.financeiroUserId = user.id; save_(ctx, 'Contas', conta);
  var token = startSession_(ctx, user, conta, false);
  audit_(ctx, conta.id, user.id, 'conta.criada', empresa);
  sendMail_(email, 'Bem-vinda ao Saldo Alto', mailWrap_('Sua conta está pronta', '<p>Olá, ' + htmlEsc_(nome) + '! A conta de <b>' + htmlEsc_(empresa) + '</b> foi criada.</p><p><a href="' + siteUrl_() + '/entrar.html">Acessar minha conta</a></p>'));
  return sessionPayload_(ctx, token);
};

function fieldErrors_(fields) {
  var e = apiError_('validacao', 'Confira os campos destacados.');
  e.fields = fields;
  return e;
}
ACTIONS.login = function (d, ctx) {
  var email = lower_(d.email), cacheSvc = CacheService.getScriptCache(), key = 'lf:' + sha256_(email).slice(0, 24);
  if (!isEmail_(email) || !d.senha) throw apiError_('credenciais', 'Informe e-mail e senha.');
  var fails = num_(cacheSvc.get(key));
  if (fails >= 5) throw apiError_('bloqueado', 'Muitas tentativas. Aguarde 15 minutos ou recupere sua senha.');
  var user = find_(ctx, 'Usuarios', function (u) { return lower_(u.email) === email; });
  var ok = false;
  if (user) ok = safeEqual_(hashPassword_(String(d.senha), user.salt), user.senhaHash);
  else hashPassword_('x', 'y');    // custo parecido: não revela se o e-mail existe
  if (!ok || user.status !== 'ativo') {
    cacheSvc.put(key, String(fails + 1), 900);
    throw apiError_('credenciais', 'E-mail ou senha incorretos.');
  }
  var conta = find_(ctx, 'Contas', function (c) { return c.id === user.contaId; });
  if (!conta || conta.status !== 'ativa') throw apiError_('conta', 'Esta conta está inativa. Fale com o time do Saldo Alto.');
  cacheSvc.remove(key);
  user.ultimoLogin = iso_(ctx.now); save_(ctx, 'Usuarios', user);
  var token = startSession_(ctx, user, conta, !!d.lembrar);
  audit_(ctx, conta.id, user.id, 'login', '');
  return sessionPayload_(ctx, token);
};

ACTIONS.me = function (d, ctx) { return sessionPayload_(ctx, String(d.token)); };

ACTIONS.logout = function (d, ctx) { ctx.session.revogada = 'true'; save_(ctx, 'Sessoes', ctx.session); return {}; };

ACTIONS['logout.others'] = function (d, ctx) { revokeSessions_(ctx, ctx.user.id, ctx.session.tokenHash); audit_(ctx, ctx.account.id, ctx.user.id, 'sessoes.encerradas', ''); return {}; };

/* ----- recuperação de senha ----- */
ACTIONS['reset.request'] = function (d, ctx) {
  var email = lower_(d.email);
  if (!isEmail_(email)) throw fieldErrors_({ email: 'Informe um e-mail válido.' });
  var user = find_(ctx, 'Usuarios', function (u) { return lower_(u.email) === email && u.status === 'ativo'; });
  if (user) {
    var recent = filter_(ctx, 'Recuperacoes', function (r) { return r.email === email && ctx.now.getTime() - new Date(r.criadoEm).getTime() < 3600 * 1000; });
    if (recent.length < 3) {
      var code = String(Math.floor(100000 + Math.random() * 900000)), salt = newSalt_();
      insert_(ctx, 'Recuperacoes', { email: email, codigoHash: sha256_(salt + code), salt: salt, expiraEm: iso_(new Date(ctx.now.getTime() + 30 * 60 * 1000)), tentativas: '0', usado: 'false', criadoEm: iso_(ctx.now) });
      var html = mailWrap_('Recuperação de senha', '<p>Use este código para criar uma nova senha:</p><p style="font-size:30px;letter-spacing:6px;font-weight:bold">' + code + '</p><p>Ele vale por 30 minutos. Se não foi você, ignore este e-mail.</p>');
      sendMail_(email, 'Seu código de recuperação — Saldo Alto', html);
      if (user.emailRecuperacao && isEmail_(user.emailRecuperacao)) sendMail_(user.emailRecuperacao, 'Seu código de recuperação — Saldo Alto', html);
      audit_(ctx, user.contaId, user.id, 'senha.recuperacao_solicitada', '');
    }
  }
  return { enviado: true };     // resposta igual exista ou não o e-mail
};

ACTIONS['reset.confirm'] = function (d, ctx) {
  var email = lower_(d.email), code = digits_(d.codigo);
  var pe = passwordError_(d.senha); if (pe) throw fieldErrors_({ senha: pe });
  var list = filter_(ctx, 'Recuperacoes', function (r) { return r.email === email && !bool_(r.usado); });
  var rec = list.length ? list[list.length - 1] : null;
  var bad = apiError_('codigo', 'Código inválido ou expirado. Peça um novo código.');
  if (!rec || new Date(rec.expiraEm).getTime() < ctx.now.getTime() || num_(rec.tentativas) >= 5) throw bad;
  if (!safeEqual_(sha256_(rec.salt + code), rec.codigoHash)) { rec.tentativas = String(num_(rec.tentativas) + 1); save_(ctx, 'Recuperacoes', rec); throw bad; }
  var user = find_(ctx, 'Usuarios', function (u) { return lower_(u.email) === email; });
  if (!user) throw bad;
  user.salt = newSalt_(); user.senhaHash = hashPassword_(String(d.senha), user.salt); user.mustChange = 'false'; save_(ctx, 'Usuarios', user);
  rec.usado = 'true'; save_(ctx, 'Recuperacoes', rec);
  revokeSessions_(ctx, user.id, '');
  audit_(ctx, user.contaId, user.id, 'senha.redefinida', '');
  return { ok: true };
};

/* ----- perfil, conta e faturamento ----- */
ACTIONS['profile.update'] = function (d, ctx) {
  var nome = str_(d.nome, 100), tel = digits_(d.telefone);
  var err = {};
  if (nome.length < 2) err.nome = 'Informe seu nome.';
  if (tel && (tel.length < 10 || tel.length > 13)) err.telefone = 'Informe um telefone com DDD.';
  if (Object.keys(err).length) throw fieldErrors_(err);
  ctx.user.nome = nome; ctx.user.cargo = str_(d.cargo, 80); ctx.user.telefone = tel; save_(ctx, 'Usuarios', ctx.user);
  return sessionPayload_(ctx, String(d.token));
};

ACTIONS['account.update'] = function (d, ctx) {
  needOwner_(ctx);
  var a = ctx.account, err = {};
  var empresa = str_(d.empresa, 120), email = lower_(d.email), tel = digits_(d.telefone), uf = str_(d.uf, 2).toUpperCase(), cep = digits_(d.cep);
  if (empresa.length < 2) err.empresa = 'Informe o nome da empresa.';
  if (!isEmail_(email)) err.email = 'Informe um e-mail válido.';
  if (tel && (tel.length < 10 || tel.length > 13)) err.telefone = 'Informe um telefone com DDD.';
  if (uf && UFS.indexOf(uf) < 0) err.uf = 'UF inválida.';
  if (cep && cep.length !== 8) err.cep = 'CEP com 8 números.';
  if (Object.keys(err).length) throw fieldErrors_(err);
  a.empresa = empresa; a.razaoSocial = str_(d.razaoSocial, 140); a.setor = str_(d.setor, 80); a.site = str_(d.site, 120); a.email = email; a.telefone = tel;
  a.cep = cep; a.cidade = str_(d.cidade, 80); a.uf = uf; save_(ctx, 'Contas', a);
  audit_(ctx, a.id, ctx.user.id, 'conta.atualizada', '');
  return sessionPayload_(ctx, String(d.token));
};

ACTIONS['billing.update'] = function (d, ctx) {
  need_(ctx, 'financeiro');
  var a = ctx.account, err = {}, f = d.faturamento || {};
  var cnpj = digits_(f.cnpj), email = lower_(f.email), uf = str_(f.uf, 2).toUpperCase(), cep = digits_(f.cep);
  if (cnpj && !validCnpj_(cnpj)) err.cnpj = 'CNPJ inválido.';
  if (email && !isEmail_(email)) err.email = 'E-mail inválido.';
  if (uf && UFS.indexOf(uf) < 0) err.uf = 'UF inválida.';
  if (cep && cep.length !== 8) err.cep = 'CEP com 8 números.';
  if (Object.keys(err).length) throw fieldErrors_(err);
  a.fatRazao = str_(f.razao, 140); a.fatCnpj = cnpj; a.fatEmail = email; a.fatEndereco = str_(f.endereco, 160); a.fatCidade = str_(f.cidade, 80); a.fatUf = uf; a.fatCep = cep;
  save_(ctx, 'Contas', a);
  audit_(ctx, a.id, ctx.user.id, 'faturamento.atualizado', '');
  return sessionPayload_(ctx, String(d.token));
};

/* ----- segurança ----- */
ACTIONS['security.changePassword'] = function (d, ctx) {
  if (!safeEqual_(hashPassword_(String(d.atual || ''), ctx.user.salt), ctx.user.senhaHash)) throw fieldErrors_({ atual: 'Senha atual incorreta.' });
  var pe = passwordError_(d.nova); if (pe) throw fieldErrors_({ nova: pe });
  if (String(d.nova) === String(d.atual)) throw fieldErrors_({ nova: 'A nova senha precisa ser diferente da atual.' });
  ctx.user.salt = newSalt_(); ctx.user.senhaHash = hashPassword_(String(d.nova), ctx.user.salt); ctx.user.mustChange = 'false'; save_(ctx, 'Usuarios', ctx.user);
  revokeSessions_(ctx, ctx.user.id, ctx.session.tokenHash);
  audit_(ctx, ctx.account.id, ctx.user.id, 'senha.alterada', '');
  return sessionPayload_(ctx, String(d.token));
};

/* troca obrigatória (senha provisória): não exige a atual porque a pessoa acabou de entrar com ela */
ACTIONS['security.setInitialPassword'] = function (d, ctx) {
  if (!bool_(ctx.user.mustChange)) throw apiError_('permissao', 'A senha já foi definida.');
  var pe = passwordError_(d.nova); if (pe) throw fieldErrors_({ nova: pe });
  ctx.user.salt = newSalt_(); ctx.user.senhaHash = hashPassword_(String(d.nova), ctx.user.salt); ctx.user.mustChange = 'false'; save_(ctx, 'Usuarios', ctx.user);
  audit_(ctx, ctx.account.id, ctx.user.id, 'senha.definida', '');
  return sessionPayload_(ctx, String(d.token));
};
WRITES['security.setInitialPassword'] = 1;

ACTIONS['security.changeEmail'] = function (d, ctx) {
  var email = lower_(d.email);
  if (!safeEqual_(hashPassword_(String(d.senha || ''), ctx.user.salt), ctx.user.senhaHash)) throw fieldErrors_({ senha: 'Senha incorreta.' });
  if (!isEmail_(email)) throw fieldErrors_({ email: 'Informe um e-mail válido.' });
  if (email === lower_(ctx.user.email)) throw fieldErrors_({ email: 'Este já é o e-mail da conta.' });
  if (find_(ctx, 'Usuarios', function (u) { return lower_(u.email) === email; })) throw fieldErrors_({ email: 'Este e-mail já está em uso.' });
  var old = ctx.user.email;
  ctx.user.email = email; save_(ctx, 'Usuarios', ctx.user);
  sendMail_(old, 'O e-mail da sua conta Saldo Alto foi alterado', mailWrap_('E-mail alterado', '<p>O e-mail de acesso passou a ser <b>' + htmlEsc_(email) + '</b>. Se não foi você, fale com o time do Saldo Alto.</p>'));
  audit_(ctx, ctx.account.id, ctx.user.id, 'email.alterado', '');
  return sessionPayload_(ctx, String(d.token));
};

ACTIONS['security.setRecoveryEmail'] = function (d, ctx) {
  var email = lower_(d.email);
  if (email && !isEmail_(email)) throw fieldErrors_({ email: 'Informe um e-mail válido.' });
  if (email && email === lower_(ctx.user.email)) throw fieldErrors_({ email: 'Use um e-mail diferente do e-mail de acesso.' });
  ctx.user.emailRecuperacao = email; save_(ctx, 'Usuarios', ctx.user);
  audit_(ctx, ctx.account.id, ctx.user.id, 'recuperacao.email', '');
  return sessionPayload_(ctx, String(d.token));
};

ACTIONS['security.sessions'] = function (d, ctx) {
  var list = filter_(ctx, 'Sessoes', function (s) { return s.userId === ctx.user.id && !bool_(s.revogada) && new Date(s.expiraEm).getTime() > ctx.now.getTime(); });
  return { ativas: list.length };
};

/* ----- usuários e acessos (só o titular) ----- */
function rolePerms_(papel, perms) {
  if (papel === 'personalizado') return (perms || []).filter(function (p) { return PERMS.indexOf(p) >= 0; });
  if (!ROLES[papel] || papel === 'titular') throw fieldErrors_({ papel: 'Escolha um perfil de acesso.' });
  return ROLES[papel].slice();
}
function tempPassword_() {
  var chars = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789', out = '';
  var raw = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '');
  for (var i = 0; i < 12; i++) out += chars.charAt(parseInt(raw.substr(i * 2, 2), 16) % chars.length);
  return out + '7a';
}

ACTIONS['users.list'] = function (d, ctx) {
  needOwner_(ctx);
  var list = filter_(ctx, 'Usuarios', function (u) { return u.contaId === ctx.account.id; }).map(publicUser_);
  return { usuarios: list, financeiroUserId: ctx.account.financeiroUserId };
};

ACTIONS['users.add'] = function (d, ctx) {
  needOwner_(ctx);
  var nome = str_(d.nome, 100), email = lower_(d.email), err = {};
  if (nome.length < 2) err.nome = 'Informe o nome.';
  if (!isEmail_(email)) err.email = 'Informe um e-mail válido.';
  if (Object.keys(err).length) throw fieldErrors_(err);
  if (find_(ctx, 'Usuarios', function (u) { return lower_(u.email) === email; })) throw fieldErrors_({ email: 'Este e-mail já tem acesso a uma conta.' });
  var perms = rolePerms_(String(d.papel), d.perms);
  var temp = tempPassword_(), salt = newSalt_();
  var user = insert_(ctx, 'Usuarios', { id: id_('U-'), contaId: ctx.account.id, criadoEm: iso_(ctx.now), nome: nome, cargo: str_(d.cargo, 80), email: email, telefone: '', papel: String(d.papel),
    perms: JSON.stringify(perms), senhaHash: hashPassword_(temp, salt), salt: salt, mustChange: 'true', status: 'ativo', ultimoLogin: '', emailRecuperacao: '', convidadoPor: ctx.user.id });
  var enviado = sendMail_(email, 'Você foi convidada para o Saldo Alto', mailWrap_('Convite de acesso',
    '<p>' + htmlEsc_(ctx.user.nome) + ' deu a você acesso à conta de <b>' + htmlEsc_(ctx.account.empresa) + '</b> no Saldo Alto.</p><p>E-mail: <b>' + htmlEsc_(email) + '</b><br>Senha provisória: <b>' + temp +
    '</b></p><p><a href="' + siteUrl_() + '/entrar.html">Entrar agora</a>. Você vai criar uma senha nova no primeiro acesso.</p>'));
  audit_(ctx, ctx.account.id, ctx.user.id, 'usuario.adicionado', email);
  return { usuario: publicUser_(user), senhaProvisoria: temp, emailEnviado: enviado };
};

function targetUser_(ctx, id) {
  var u = find_(ctx, 'Usuarios', function (x) { return x.id === id && x.contaId === ctx.account.id; });
  if (!u) throw apiError_('nao_encontrado', 'Usuário não encontrado.');
  return u;
}

ACTIONS['users.update'] = function (d, ctx) {
  needOwner_(ctx);
  var u = targetUser_(ctx, String(d.id));
  if (u.papel === 'titular') throw apiError_('permissao', 'O perfil do titular não pode ser alterado.');
  var nome = str_(d.nome, 100);
  if (nome.length < 2) throw fieldErrors_({ nome: 'Informe o nome.' });
  var perms = rolePerms_(String(d.papel), d.perms);
  u.nome = nome; u.cargo = str_(d.cargo, 80); u.papel = String(d.papel); u.perms = JSON.stringify(perms); save_(ctx, 'Usuarios', u);
  if (ctx.account.financeiroUserId === u.id && perms.indexOf('financeiro') < 0) { ctx.account.financeiroUserId = ctx.user.id; save_(ctx, 'Contas', ctx.account); }
  audit_(ctx, ctx.account.id, ctx.user.id, 'usuario.atualizado', u.email);
  return { usuario: publicUser_(u), financeiroUserId: ctx.account.financeiroUserId };
};

ACTIONS['users.remove'] = function (d, ctx) {
  needOwner_(ctx);
  var u = targetUser_(ctx, String(d.id));
  if (u.papel === 'titular') throw apiError_('permissao', 'O titular da conta não pode ser removido.');
  revokeSessions_(ctx, u.id, '');
  u.status = 'removido'; save_(ctx, 'Usuarios', u);
  if (ctx.account.financeiroUserId === u.id) { ctx.account.financeiroUserId = ctx.user.id; save_(ctx, 'Contas', ctx.account); }
  audit_(ctx, ctx.account.id, ctx.user.id, 'usuario.removido', u.email);
  return { financeiroUserId: ctx.account.financeiroUserId };
};

ACTIONS['users.resetPassword'] = function (d, ctx) {
  needOwner_(ctx);
  var u = targetUser_(ctx, String(d.id));
  if (u.papel === 'titular') throw apiError_('permissao', 'Use "Esqueci minha senha" para o titular.');
  var temp = tempPassword_();
  u.salt = newSalt_(); u.senhaHash = hashPassword_(temp, u.salt); u.mustChange = 'true'; save_(ctx, 'Usuarios', u);
  revokeSessions_(ctx, u.id, '');
  var enviado = sendMail_(u.email, 'Nova senha provisória — Saldo Alto', mailWrap_('Senha redefinida', '<p>Sua senha provisória: <b>' + temp + '</b></p><p><a href="' + siteUrl_() + '/entrar.html">Entrar</a></p>'));
  audit_(ctx, ctx.account.id, ctx.user.id, 'usuario.senha_redefinida', u.email);
  return { senhaProvisoria: temp, emailEnviado: enviado };
};

ACTIONS['users.setFinancialHolder'] = function (d, ctx) {
  needOwner_(ctx);
  var u = targetUser_(ctx, String(d.id));
  if (u.status !== 'ativo') throw apiError_('nao_encontrado', 'Usuário não encontrado.');
  if (u.papel !== 'titular') {
    var perms = permsOf_(u);
    if (perms.indexOf('financeiro') < 0) { perms.push('financeiro'); u.perms = JSON.stringify(perms); if (u.papel !== 'personalizado' && u.papel !== 'financeiro') u.papel = 'personalizado'; save_(ctx, 'Usuarios', u); }
  }
  ctx.account.financeiroUserId = u.id; save_(ctx, 'Contas', ctx.account);
  audit_(ctx, ctx.account.id, ctx.user.id, 'titular_financeiro.definido', u.email);
  return { financeiroUserId: u.id, usuario: publicUser_(u) };
};

/* ----- pesquisas ----- */
function readDados_(row) {
  var s = '';
  for (var i = 0; i < 4; i++) s += row['dados' + i] || '';
  try { return s ? JSON.parse(s) : null; } catch (e) { return null; }
}
function writeDados_(row, obj) {
  var s = JSON.stringify(obj || {});
  if (s.length > MAX_DADOS) throw apiError_('tamanho', 'A pesquisa ficou grande demais para salvar. Reduza o texto ou o número de perguntas.');
  for (var i = 0; i < 4; i++) row['dados' + i] = s.slice(i * CHUNK, (i + 1) * CHUNK);
}
function normStatus_(v) {
  var k = normKey_(v).replace(/\s+/g, '_');
  if (k === 'em_revisao' || k === 'revisao' || k === 'em_analise') return 'em_revisao';
  if (k === 'ativa' || k === 'em_andamento' || k === 'no_ar') return 'ativa';
  if (k === 'encerrada' || k === 'concluida' || k === 'finalizada') return 'encerrada';
  if (k === 'rascunho') return 'rascunho';
  return 'em_revisao';
}
function surveySummary_(ctx, r) {
  var status = normStatus_(r.status);
  var autor = find_(ctx, 'Usuarios', function (u) { return u.id === r.criadoPor; });
  return { id: r.id, nome: r.nome, status: status, criadaEm: r.criadaEm, atualizadaEm: r.atualizadaEm, enviadaEm: r.enviadaEm, codigo: r.codigo, objetivo: r.objetivo,
    amostra: num_(r.amostra), respostas: num_(r.respostas), preco: num_(r.preco), perguntas: num_(r.perguntas), nichos: r.nichos, progresso: status === 'rascunho' ? num_(r.progresso) : (num_(r.amostra) > 0 ? Math.min(100, Math.round(num_(r.respostas) / num_(r.amostra) * 100)) : 0),
    criadoPorNome: autor ? autor.nome : '' };
}
function ownSurvey_(ctx, id) {
  var r = find_(ctx, 'Pesquisas', function (x) { return x.id === id && x.contaId === ctx.account.id; });
  if (!r) throw apiError_('nao_encontrado', 'Pesquisa não encontrada.');
  return r;
}
function cleanName_(v, fallback) { var n = str_(v, 80); return n || fallback || 'Pesquisa sem nome'; }
function applyResumo_(row, resumo) {
  resumo = resumo || {};
  row.objetivo = str_(resumo.objetivo, 300); row.amostra = String(Math.max(0, Math.floor(num_(resumo.amostra)))); row.preco = String(Math.max(0, Math.round(num_(resumo.preco))));
  row.perguntas = String(Math.max(0, Math.floor(num_(resumo.perguntas)))); row.nichos = str_(resumo.nichos, 300);
}

ACTIONS['surveys.list'] = function (d, ctx) {
  need_(ctx, 'pesquisas_ver');
  var list = filter_(ctx, 'Pesquisas', function (r) { return r.contaId === ctx.account.id; }).map(function (r) { return surveySummary_(ctx, r); });
  list.sort(function (a, b) { return String(a.atualizadaEm) < String(b.atualizadaEm) ? 1 : -1; });
  return { pesquisas: list };
};

ACTIONS['surveys.get'] = function (d, ctx) {
  need_(ctx, 'pesquisas_ver');
  var r = ownSurvey_(ctx, String(d.id));
  var s = surveySummary_(ctx, r); s.dados = readDados_(r); s.contato = safeJson_(r.contato);
  return { pesquisa: s };
};
function safeJson_(s) { try { return s ? JSON.parse(s) : null; } catch (e) { return null; } }

ACTIONS['surveys.save'] = function (d, ctx) {
  need_(ctx, 'pesquisas_criar');
  var r = null;
  if (d.id) { r = ownSurvey_(ctx, String(d.id)); if (normStatus_(r.status) !== 'rascunho') throw apiError_('status', 'Esta pesquisa já foi enviada e não pode mais ser editada.'); }
  else r = insert_(ctx, 'Pesquisas', { id: id_('P-'), contaId: ctx.account.id, criadoPor: ctx.user.id, status: 'rascunho', criadaEm: iso_(ctx.now), respostas: '0' });
  r.nome = cleanName_(d.nome, r.nome); r.atualizadaEm = iso_(ctx.now); r.progresso = String(Math.max(0, Math.min(100, Math.round(num_(d.progresso)))));
  applyResumo_(r, d.resumo);
  writeDados_(r, d.dados);
  save_(ctx, 'Pesquisas', r);
  return { pesquisa: surveySummary_(ctx, r) };
};

function newCode_(ctx) {
  var t = ctx.now, pad = function (n) { return (n < 10 ? '0' : '') + n; };
  var base = 'SA-' + t.getUTCFullYear() + pad(t.getUTCMonth() + 1) + pad(t.getUTCDate()) + '-';
  for (var i = 0; i < 20; i++) {
    var code = base + id_('').slice(0, 4).toUpperCase();
    if (!find_(ctx, 'Pesquisas', function (x) { return x.codigo === code; })) return code;
  }
  return base + id_('').slice(0, 6).toUpperCase();
}

ACTIONS['surveys.submit'] = function (d, ctx) {
  need_(ctx, 'pesquisas_criar');
  need_(ctx, 'financeiro');      // contratar é decisão financeira: só titular e quem tem acesso financeiro
  var resumo = d.resumo || {}, err = [];
  if (str_(resumo.objetivo, 400).length < 15) err.push('objetivo');
  if (num_(resumo.perguntas) < 1) err.push('perguntas');
  if (num_(resumo.amostra) < 30 || num_(resumo.amostra) > 5000) err.push('amostra');
  if (err.length) throw apiError_('validacao', 'A pesquisa está incompleta (' + err.join(', ') + ').');
  var c = d.contato || {};
  if (str_(c.name, 100).length < 2 || !isEmail_(lower_(c.email)) || digits_(c.whatsapp).length < 10) throw apiError_('validacao', 'Confira os dados de contato.');
  var r;
  if (d.id) { r = ownSurvey_(ctx, String(d.id)); if (normStatus_(r.status) !== 'rascunho') throw apiError_('status', 'Esta pesquisa já foi enviada.'); }
  else r = insert_(ctx, 'Pesquisas', { id: id_('P-'), contaId: ctx.account.id, criadoPor: ctx.user.id, criadaEm: iso_(ctx.now), respostas: '0' });
  r.nome = cleanName_(d.nome, cleanName_(resumo.objetivo)); r.status = 'em_revisao'; r.atualizadaEm = iso_(ctx.now); r.enviadaEm = iso_(ctx.now); r.codigo = newCode_(ctx); r.progresso = '100';
  applyResumo_(r, resumo);
  r.contato = JSON.stringify({ name: str_(c.name, 100), company: str_(c.company, 120), email: lower_(c.email), whatsapp: digits_(c.whatsapp) });
  var dados = d.dados || {}; dados.contracted = { id: r.codigo, at: iso_(ctx.now), total: num_(resumo.preco) };
  writeDados_(r, dados);
  save_(ctx, 'Pesquisas', r);
  audit_(ctx, ctx.account.id, ctx.user.id, 'pesquisa.enviada', r.codigo);
  return { pesquisa: surveySummary_(ctx, r) };
};

ACTIONS['surveys.duplicate'] = function (d, ctx) {
  need_(ctx, 'pesquisas_criar');
  var src = ownSurvey_(ctx, String(d.id)), dados = readDados_(src) || {};
  var nid = id_('P-');
  dados.contracted = null; dados.surveyId = nid; dados.screen = 'revisao';
  dados.completed = (dados.completed || []).filter(function (s) { return s !== 'revisao' && s !== 'contratacao'; });
  if (dados.contact) dados.contact.consent = false;
  var r = insert_(ctx, 'Pesquisas', { id: nid, contaId: ctx.account.id, criadoPor: ctx.user.id, status: 'rascunho', criadaEm: iso_(ctx.now), atualizadaEm: iso_(ctx.now), respostas: '0',
    nome: cleanName_(String(src.nome).slice(0, 70) + ' (cópia)'), objetivo: src.objetivo, amostra: src.amostra, preco: src.preco, perguntas: src.perguntas, nichos: src.nichos,
    progresso: String(Math.min(95, num_(src.progresso) >= 100 ? 80 : num_(src.progresso))) });
  writeDados_(r, dados);
  save_(ctx, 'Pesquisas', r);
  audit_(ctx, ctx.account.id, ctx.user.id, 'pesquisa.duplicada', src.id);
  return { pesquisa: surveySummary_(ctx, r) };
};

ACTIONS['surveys.delete'] = function (d, ctx) {
  need_(ctx, 'pesquisas_criar');
  var r = ownSurvey_(ctx, String(d.id));
  if (normStatus_(r.status) !== 'rascunho') throw apiError_('status', 'Só rascunhos podem ser excluídos. Para cancelar uma pesquisa enviada, fale com o time.');
  remove_(ctx, 'Pesquisas', r);
  audit_(ctx, ctx.account.id, ctx.user.id, 'pesquisa.excluida', String(d.id));
  return {};
};

ACTIONS['surveys.rename'] = function (d, ctx) {
  need_(ctx, 'pesquisas_criar');
  var r = ownSurvey_(ctx, String(d.id));
  var nome = str_(d.nome, 80); if (nome.length < 2) throw fieldErrors_({ nome: 'Informe um nome.' });
  r.nome = nome; r.atualizadaEm = iso_(ctx.now);
  var dados = readDados_(r); if (dados) { dados.name = nome; writeDados_(r, dados); }
  save_(ctx, 'Pesquisas', r);
  return { pesquisa: surveySummary_(ctx, r) };
};

/* ----- Inteligência da Base: só números agregados ----- */
function toDate_(v) {
  if (v instanceof Date) return v;
  var t = new Date(v); return isNaN(t.getTime()) ? null : t;
}
function normKey_(s) { return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim(); }
function titleCase_(s) {
  var small = { de: 1, da: 1, do: 1, dos: 1, das: 1, e: 1 };
  return String(s).toLowerCase().split(' ').map(function (w, i) { return i > 0 && small[w] ? w : w.charAt(0).toUpperCase() + w.slice(1); }).join(' ');
}
function tally_(map) { return Object.keys(map).map(function (k) { return { k: map[k].label, n: map[k].n }; }).sort(function (a, b) { return b.n - a.n; }); }
function bump_(map, key, label) { if (!map[key]) map[key] = { label: label || key, n: 0 }; map[key].n++; }
function kfilter_(list, keepOthers) {
  var big = list.filter(function (x) { return x.n >= K_ANON; }), small = list.filter(function (x) { return x.n < K_ANON; });
  var rest = small.reduce(function (a, x) { return a + x.n; }, 0);
  if (keepOthers && rest >= K_ANON) big.push({ k: 'Demais (grupos pequenos)', n: rest, agrupado: true });
  return big;
}

/* Regiões do Brasil e regras do "O que mudou" (só diferenças com significância estatística, sem inventar sinal). */
var REGIAO_UF = { norte: ['AC', 'AM', 'AP', 'PA', 'RO', 'RR', 'TO'], nordeste: ['AL', 'BA', 'CE', 'MA', 'PB', 'PE', 'PI', 'RN', 'SE'], centrooeste: ['DF', 'GO', 'MS', 'MT'], sudeste: ['ES', 'MG', 'RJ', 'SP'], sul: ['PR', 'RS', 'SC'] };
var MUDANCA_MIN_N = 30, MUDANCA_MIN_PP = 5, MUDANCA_Z = 2.576;
function regiaoDe_(uf) { for (var k in REGIAO_UF) if (REGIAO_UF[k].indexOf(uf) >= 0) return k; return ''; }
function matNivel_(r) { return r.insta && r.site && r.emailCorp ? 3 : (r.insta || r.site || r.emailCorp) && (r.site || r.emailCorp) ? 2 : 1; }
function mudancas_(rows, nowMs) {
  var cut = nowMs - 30 * 86400000;
  var nw = rows.filter(function (r) { return r.at && r.at.getTime() >= cut; }), old = rows.filter(function (r) { return r.at && r.at.getTime() < cut; });
  var out = { minN: MUDANCA_MIN_N, nNovas: nw.length, nAnteriores: old.length, itens: [] };
  if (nw.length < MUDANCA_MIN_N || old.length < MUDANCA_MIN_N) { out.insuficiente = true; return out; }
  var dims = [];
  NICHOS.concat(['Outros nichos']).forEach(function (n) { dims.push({ tema: 'Nicho', rotulo: n, fn: function (r) { return r.nicho === n; } }); });
  UFS.forEach(function (u) { dims.push({ tema: 'Estado', rotulo: u, fn: function (r) { return r.uf === u; } }); });
  ['Presença básica', 'Em estruturação', 'Estruturada'].forEach(function (l, i) { dims.push({ tema: 'Maturidade', rotulo: l, fn: function (r) { return matNivel_(r) === i + 1; } }); });
  dims.push({ tema: 'Presença digital', rotulo: 'Têm Instagram do negócio', fn: function (r) { return r.insta; } });
  dims.push({ tema: 'Presença digital', rotulo: 'Têm site', fn: function (r) { return r.site; } });
  dims.push({ tema: 'Presença digital', rotulo: 'Têm e-mail corporativo', fn: function (r) { return r.emailCorp; } });
  var n1 = nw.length, n2 = old.length;
  dims.forEach(function (dm) {
    var x1 = nw.filter(dm.fn).length, x2 = old.filter(dm.fn).length;
    if (x1 < K_ANON || x2 < K_ANON) return;                       // grupo pequeno demais para aparecer
    var p1 = x1 / n1, p2 = x2 / n2, pp = (x1 + x2) / (n1 + n2), se = Math.sqrt(pp * (1 - pp) * (1 / n1 + 1 / n2));
    if (!se) return;
    var z = (p1 - p2) / se, dpp = (p1 - p2) * 100;
    if (Math.abs(z) >= MUDANCA_Z && Math.abs(dpp) >= MUDANCA_MIN_PP) out.itens.push({ tema: dm.tema, rotulo: dm.rotulo, pNovas: Math.round(p1 * 100), pAnteriores: Math.round(p2 * 100), dpp: Math.round(dpp), z: Math.round(Math.abs(z) * 10) / 10 });
  });
  out.itens.sort(function (a, b) { return b.z - a.z; });
  out.itens = out.itens.slice(0, 3);
  return out;
}

ACTIONS['base.insights'] = function (d, ctx) {
  need_(ctx, 'dashboard');
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Empreendedoras');
  var all = [];
  if (sh && sh.getLastRow() > 0) {
    var vals = sh.getRange(1, 1, sh.getLastRow(), 13).getValues();
    for (var i = 0; i < vals.length; i++) {
      var v = vals[i]; if (!str_(v[1]) || normKey_(v[1]) === 'nome') continue;      // ignora cabeçalho e linhas vazias
      var niche = str_(v[9], 80);
      all.push({ at: toDate_(v[0]), cidade: normKey_(v[3]), cidadeLabel: str_(v[3], 60), uf: str_(v[4], 2).toUpperCase(), emailCorp: !!str_(v[6]), nicho: NICHOS.indexOf(niche) >= 0 ? niche : 'Outros nichos',
        insta: str_(v[10]).replace('@', '').length > 0, site: !!str_(v[11]) });
    }
  }
  var f = d.filtros || {}, regiao = REGIAO_UF[f.regiao] ? f.regiao : '';
  var options = { nichos: [], estados: [], regioes: [], cidades: [] };
  var mn = {}, me = {}, mr = {}, mc = {};
  all.forEach(function (r) {
    bump_(mn, r.nicho);
    if (UFS.indexOf(r.uf) >= 0) { bump_(me, r.uf); bump_(mr, regiaoDe_(r.uf)); if (r.cidade) bump_(mc, r.cidade + '|' + r.uf, titleCase_(r.cidadeLabel)); }
  });
  options.nichos = kfilter_(tally_(mn), false).map(function (x) { return x.k; });
  options.estados = kfilter_(tally_(me), false).map(function (x) { return x.k; });
  options.regioes = kfilter_(tally_(mr), false).map(function (x) { return x.k; });
  options.cidades = Object.keys(mc).filter(function (k) { return mc[k].n >= K_ANON; }).map(function (k) { return { v: k, k: mc[k].label, uf: k.split('|')[1] }; })
    .sort(function (a, b) { return a.k < b.k ? -1 : 1; });
  var rows = all.filter(function (r) {
    return (!f.nicho || r.nicho === f.nicho) && (!regiao || REGIAO_UF[regiao].indexOf(r.uf) >= 0) && (!f.estado || r.uf === f.estado) && (!f.cidade || (r.cidade + '|' + r.uf) === f.cidade);
  });
  var total = rows.length;
  if (total < K_ANON) return { total: total, insuficiente: true, opcoes: options, minGrupo: K_ANON };
  var byNicho = {}, byUf = {}, byCidade = {}, byMes = {}, mat = { 1: 0, 2: 0, 3: 0 }, insta = 0, site = 0, corp = 0, novos30 = 0;
  var cut30 = ctx.now.getTime() - 30 * 86400000, primeiro = null;
  rows.forEach(function (r) {
    bump_(byNicho, r.nicho);
    if (UFS.indexOf(r.uf) >= 0) bump_(byUf, r.uf);
    if (r.cidade) bump_(byCidade, r.cidade + '|' + r.uf, titleCase_(r.cidadeLabel) + (UFS.indexOf(r.uf) >= 0 ? ' / ' + r.uf : ''));
    if (r.at) { var key = r.at.getUTCFullYear() + '-' + (r.at.getUTCMonth() < 9 ? '0' : '') + (r.at.getUTCMonth() + 1); bump_(byMes, key); if (r.at.getTime() >= cut30) novos30++; if (!primeiro || r.at < primeiro) primeiro = r.at; }
    if (r.insta) insta++; if (r.site) site++; if (r.emailCorp) corp++;
    mat[matNivel_(r)]++;
  });
  // últimos 12 meses (com zeros)
  var meses = [], base = new Date(Date.UTC(ctx.now.getUTCFullYear(), ctx.now.getUTCMonth(), 1));
  for (var m = 11; m >= 0; m--) {
    var dt = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() - m, 1));
    var kk = dt.getUTCFullYear() + '-' + (dt.getUTCMonth() < 9 ? '0' : '') + (dt.getUTCMonth() + 1);
    meses.push({ k: kk, n: byMes[kk] ? byMes[kk].n : 0 });
  }
  var estados = tally_(byUf), cidades = tally_(byCidade);
  return {
    total: total, novos30: novos30, minGrupo: K_ANON, opcoes: options,
    periodo: { ate: iso_(ctx.now).slice(0, 10), desde: primeiro ? iso_(primeiro).slice(0, 10) : '' },
    mudancas: mudancas_(rows, ctx.now.getTime()),
    nichos: kfilter_(tally_(byNicho), true),
    estados: kfilter_(estados, false),
    estadosDistintos: estados.filter(function (x) { return x.n >= K_ANON; }).length,
    cidades: kfilter_(cidades, false).slice(0, 10),
    cidadesDistintas: cidades.filter(function (x) { return x.n >= K_ANON; }).length,
    crescimento: meses,
    presenca: { instagram: Math.round(insta / total * 100), site: Math.round(site / total * 100), emailCorp: Math.round(corp / total * 100) },
    maturidade: [{ k: 'Presença básica', n: mat[1] }, { k: 'Em estruturação', n: mat[2] }, { k: 'Estruturada', n: mat[3] }]
  };
};
