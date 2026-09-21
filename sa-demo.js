/* Saldo Alto — modo demonstração.
   Uma "empresa" fictícia (Demo Saldo Alto) com pesquisas, usuários e uma base de empreendedoras inventadas.
   TUDO roda no navegador: nenhuma chamada vai ao Google/planilha e nada toca nas contas reais.
   O estado fica em sessionStorage (some ao fechar a aba) e pode ser reiniciado pelo botão "Reiniciar demonstração".
   Responde às mesmas ações da API real (mesmos nomes e mesmo formato de resposta), para a experiência ser idêntica. */
(function () {
  'use strict';
  var KEY = 'sa.demo.v1';
  var K_ANON = 5;
  var PERMS = ['pesquisas_ver', 'pesquisas_criar', 'dashboard', 'financeiro'];
  var ROLES = { financeiro: PERMS.slice(), gestor: ['pesquisas_ver', 'pesquisas_criar', 'dashboard'], leitor: ['pesquisas_ver', 'dashboard'] };
  var UFS = ['AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO'];
  var mem = null;   // cópia em memória (usada também quando o sessionStorage não está disponível)

  /* ---------- utilitários ---------- */
  function err(code, message, fields) { var E = (window.SA && window.SA.Err) || Error; var e = new E(code, message, fields); if (!e.code) { e.code = code; e.fields = fields || null; e.message = message; } return e; }
  function fieldErr(fields) { return err('validacao', 'Confira os campos destacados.', fields); }
  function clone(o) { return o === undefined ? undefined : JSON.parse(JSON.stringify(o)); }
  function iso(d) { return new Date(d).toISOString(); }
  function daysAgo(n, h) { return iso(Date.now() - n * 86400000 - (h || 0) * 3600000); }
  function str(v, max) { return String(v === undefined || v === null ? '' : v).trim().slice(0, max || 200); }
  function digits(v) { return String(v || '').replace(/\D/g, ''); }
  function num(v) { var n = Number(v); return isNaN(n) ? 0 : n; }
  function isEmail(v) { return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(v || '')); }
  function uid(p) { return p + Math.random().toString(36).slice(2, 10); }
  function passwordError(p) {
    p = String(p || '');
    if (p.length < 8) return 'Use pelo menos 8 caracteres.';
    if (!/[A-Za-z]/.test(p) || !/[0-9]/.test(p)) return 'Use letras e números.';
    return '';
  }
  function rng(seed) { var s = seed >>> 0; return function () { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
  function pick(r, weighted) { var t = 0, i; for (i = 0; i < weighted.length; i++) t += weighted[i][1]; var x = r() * t; for (i = 0; i < weighted.length; i++) { x -= weighted[i][1]; if (x <= 0) return weighted[i][0]; } return weighted[weighted.length - 1][0]; }

  /* ---------- dados fictícios ---------- */
  var Q = function (type, text, extra) { return Object.assign({ id: uid('q'), text: text, type: type, options: [], scale: { max: 5, low: 'Nada', high: 'Muito' }, range: { min: 0, max: 500, unit: 'R$' }, source: 'ai' }, extra || {}); };
  var scale = function (max, low, high) { return { max: max, low: low, high: high }; };

  function baseState(s) {
    return { v: 2, surveyId: null, name: s.name, screen: s.screen || 'contratacao', completed: s.completed, objective: s.objetivo, material: { involves: false, desc: '' },
      audience: { desc: s.publico, universe: s.universo || null },
      niches: s.niches, customNiches: [], profile: Object.assign({ ageMin: null, ageMax: null, incMin: null, incMax: null, edu: [], momento: [], local: { regiao: '', uf: '', cidade: '' }, others: [] }, s.profile || {}),
      sample: { mode: 'manual', manual: s.amostra, precision: 'padrao', conf: 95, margin: 5, compare: false }, questions: s.questions, suggestions: [], aiAutoRan: true, media: [],
      contact: { name: 'Helena Prado', company: 'Demo Saldo Alto', cnpj: '', setor: '', email: 'helena@demosaldoalto.example', whatsapp: '(11) 99999-0001', consent: true },
      contracted: s.codigo ? { id: s.codigo, at: s.enviadaEm, total: s.preco, surveyId: s.id } : null };
  }
  var ALL = ['objetivo', 'publico', 'amostra', 'perguntas', 'revisao', 'contratacao'];

  function seedSurveys() {
    var list = [];
    function add(o) {
      var dados = baseState({ id: o.id, name: o.nome, screen: o.screen, completed: o.completed || ALL, objetivo: o.objetivo, publico: o.publico || ('Empreendedoras dos nichos: ' + o.nichosLabel + '.'), universo: o.universo, niches: o.niches, profile: o.profile, amostra: o.amostra, questions: o.questions,
        codigo: o.codigo, enviadaEm: o.enviadaEm, preco: o.preco });
      dados.surveyId = o.id;
      list.push({ id: o.id, nome: o.nome, status: o.status, criadaEm: o.criadaEm, atualizadaEm: o.atualizadaEm, enviadaEm: o.enviadaEm || '', codigo: o.codigo || '', objetivo: o.objetivo, amostra: o.amostra,
        respostas: o.respostas || 0, preco: o.preco, perguntas: o.questions.length, nichos: o.nichosLabel, progresso: o.progresso || 0, criadoPor: o.criadoPor,
        contato: o.status === 'rascunho' ? null : { name: 'Helena Prado', company: 'Demo Saldo Alto', email: 'helena@demosaldoalto.example', whatsapp: '11999990001' }, dados: dados });
    }
    add({ id: 'P-demo-01', nome: 'Teste da nova embalagem — linha skincare', status: 'encerrada', criadaEm: daysAgo(58), atualizadaEm: daysAgo(9), enviadaEm: daysAgo(56), codigo: 'SA-20260725-K7QD',
      objetivo: 'Entender se a nova embalagem da linha de skincare transmite qualidade e se as empreendedoras da beleza a recomendariam para clientes.', niches: ['beleza', 'saude'], nichosLabel: 'Serviços de Beleza / Estética, Saúde / Bem-estar',
      amostra: 300, respostas: 300, preco: 4180, criadoPor: 'U-demo-1', profile: { ageMin: 25, ageMax: 50, momento: ['crescimento', 'consolidado'], local: { regiao: 'sudeste', uf: 'SP', cidade: '' } },
      publico: 'Empreendedoras da beleza e do bem-estar, com negócio em crescimento ou consolidado, na região Sudeste.', universo: 40000,
      questions: [
        Q('scale', 'Em uma escala de 1 a 5, quanto a embalagem transmite qualidade?', { scale: scale(5, 'Nenhuma qualidade', 'Muita qualidade') }),
        Q('single', 'Qual característica mais chama a sua atenção na embalagem?', { options: ['A cor', 'O formato', 'O rótulo', 'O tamanho', 'Nenhuma em especial'] }),
        Q('multiple', 'Quais destas palavras você associa a este produto?', { options: ['Premium', 'Natural', 'Acessível', 'Profissional', 'Comum'] }),
        Q('scale', 'De 0 a 10, o quanto você recomendaria este produto a outra empreendedora?', { scale: scale(10, 'Não recomendaria', 'Recomendaria muito') }),
        Q('range', 'Quanto você pagaria por uma unidade de 200 ml?', { range: { min: 20, max: 200, unit: 'R$' } }),
        Q('yesno', 'Você usaria este produto no seu negócio?'),
        Q('ranking', 'Ordene o que mais importa na compra de um cosmético profissional.', { options: ['Preço', 'Marca', 'Embalagem', 'Fórmula', 'Prazo de entrega'] }),
        Q('open', 'O que você mudaria nesta embalagem?')
      ] });
    add({ id: 'P-demo-02', nome: 'Interesse em agendamento online', status: 'ativa', criadaEm: daysAgo(24), atualizadaEm: daysAgo(1, 3), enviadaEm: daysAgo(22), codigo: 'SA-20260829-M3XP',
      objetivo: 'Descobrir como empreendedoras de beleza e serviços organizam hoje os agendamentos e se pagariam por um aplicativo de agenda com cobrança integrada.', niches: ['beleza', 'servicos', 'saude'],
      nichosLabel: 'Serviços de Beleza / Estética, Serviços (design, marketing etc.), Saúde / Bem-estar', amostra: 500, respostas: 342, preco: 6350, criadoPor: 'U-demo-2',
      questions: [
        Q('single', 'Como você organiza hoje os agendamentos e compromissos do seu negócio?', { options: ['Caderno ou agenda de papel', 'WhatsApp', 'Planilha', 'Aplicativo ou sistema', 'Não tenho uma organização definida'] }),
        Q('multiple', 'Quais destes problemas você já teve com agendamentos?', { options: ['Clientes que faltam', 'Horários duplicados', 'Esquecimentos', 'Remarcações de última hora'] }),
        Q('scale', 'Em uma escala de 1 a 5, quanto você teria interesse em uma solução que resolvesse isso?', { scale: scale(5, 'Nenhum interesse', 'Muito interesse') }),
        Q('range', 'Quanto você pagaria por mês por essa solução?', { range: { min: 0, max: 300, unit: 'R$' } }),
        Q('open', 'Qual recurso não pode faltar em um aplicativo de agenda para você?')
      ] });
    add({ id: 'P-demo-03', nome: 'Sabores de brigadeiro gourmet', status: 'ativa', criadaEm: daysAgo(12), atualizadaEm: daysAgo(0, 6), enviadaEm: daysAgo(10), codigo: 'SA-20260910-B9LE',
      objetivo: 'Quero descobrir quais sabores de brigadeiro gourmet as empreendedoras da confeitaria mais vendem e por quanto.', niches: ['alimentacao'], nichosLabel: 'Alimentação / Confeitaria',
      amostra: 200, respostas: 88, preco: 3120, criadoPor: 'U-demo-1',
      questions: [
        Q('multiple', 'Quais sabores você mais vende hoje?', { options: ['Tradicional', 'Ninho com Nutella', 'Pistache', 'Limão siciliano', 'Doce de leite com flor de sal'] }),
        Q('range', 'Qual é o preço médio de venda por unidade?', { range: { min: 1, max: 15, unit: 'R$' } }),
        Q('single', 'Com que frequência você lança um sabor novo?', { options: ['Todo mês', 'A cada 2 ou 3 meses', 'Poucas vezes ao ano', 'Nunca'] }),
        Q('open', 'Qual sabor ainda não existe e você gostaria de vender?')
      ] });
    add({ id: 'P-demo-04', nome: 'Campanha de verão: qual mensagem funciona?', status: 'em_revisao', criadaEm: daysAgo(3), atualizadaEm: daysAgo(2), enviadaEm: daysAgo(2), codigo: 'SA-20260918-T4NA',
      objetivo: 'Comparar três mensagens de campanha de verão para saber qual gera mais interesse entre empreendedoras de moda e revenda de produtos.', niches: ['moda', 'revenda'],
      nichosLabel: 'Moda / Costura, Revenda de produtos', amostra: 400, respostas: 0, preco: 5240, criadoPor: 'U-demo-2', profile: { ageMin: 25, ageMax: 45 },
      questions: [
        Q('single', 'Qual destas mensagens mais chama a sua atenção?', { options: ['Verão sem complicação', 'Mais leve, mais você', 'O calor chegou, e as ofertas também'] }),
        Q('scale', 'Em uma escala de 1 a 5, quanto você compartilharia essa campanha?', { scale: scale(5, 'Nunca compartilharia', 'Compartilharia com certeza') }),
        Q('open', 'Que palavra você usaria para descrever esta campanha?')
      ] });
    add({ id: 'P-demo-05', nome: 'Novo kit de revenda: validação de preço', status: 'rascunho', criadaEm: daysAgo(5), atualizadaEm: daysAgo(1), objetivo: 'Validar o preço ideal do novo kit de revenda com 12 itens antes do lançamento no segundo semestre.',
      niches: ['revenda'], nichosLabel: 'Revenda de produtos', amostra: 300, preco: 3900, progresso: 60, criadoPor: 'U-demo-1', screen: 'perguntas', completed: ['objetivo', 'publico', 'amostra'],
      questions: [
        Q('range', 'Qual é o máximo que você pagaria por este kit?', { range: { min: 50, max: 800, unit: 'R$' } }),
        Q('single', 'O preço é o principal critério na sua decisão de compra?', { options: ['Sim, é o mais importante', 'É importante, mas não o único', 'Pesa pouco', 'Não pesa'] })
      ] });
    add({ id: 'P-demo-06', nome: 'Hábitos de compra de materiais e insumos', status: 'rascunho', criadaEm: daysAgo(1), atualizadaEm: daysAgo(0, 2), objetivo: 'Mapear onde e com que frequência as empreendedoras compram materiais e insumos para o próprio negócio.',
      niches: ['beleza', 'alimentacao', 'moda'], nichosLabel: 'Serviços de Beleza / Estética, Alimentação / Confeitaria, Moda / Costura', amostra: 250, preco: 3350, progresso: 20, criadoPor: 'U-demo-1', screen: 'publico', completed: ['objetivo'], questions: [] });
    return list;
  }

  function seedUsers() {
    var mk = function (id, nome, cargo, email, papel, perms, extra) { return Object.assign({ id: id, contaId: 'C-demo', nome: nome, cargo: cargo, email: email, telefone: '11999990001', papel: papel, perms: perms, mustChange: false, emailRecuperacao: '', status: 'ativo', ultimoLogin: daysAgo(0, 1), criadoEm: daysAgo(90) }, extra || {}); };
    return [
      mk('U-demo-1', 'Helena Prado', 'Diretora de Marketing', 'helena@demosaldoalto.example', 'titular', PERMS.slice()),
      mk('U-demo-2', 'Rafael Costa', 'Analista de Pesquisa', 'rafael@demosaldoalto.example', 'gestor', ROLES.gestor.slice(), { telefone: '11999990002', ultimoLogin: daysAgo(1), criadoEm: daysAgo(70) }),
      mk('U-demo-3', 'Beatriz Nunes', 'Financeiro', 'beatriz@demosaldoalto.example', 'financeiro', ROLES.financeiro.slice(), { telefone: '11999990003', ultimoLogin: daysAgo(3), criadoEm: daysAgo(60) }),
      mk('U-demo-4', 'Caio Mendes', 'Estagiário de Marketing', 'caio@demosaldoalto.example', 'leitor', ROLES.leitor.slice(), { telefone: '', ultimoLogin: daysAgo(6), criadoEm: daysAgo(30) })
    ];
  }

  function seed() {
    return { v: 1, startedAt: iso(Date.now()), users: seedUsers(), financeiroUserId: 'U-demo-1',
      account: { id: 'C-demo', empresa: 'Demo Saldo Alto', razaoSocial: 'Demo Saldo Alto Comércio de Cosméticos Ltda', cnpj: '11222333000181', setor: 'Moda e beleza', site: 'www.demosaldoalto.example', email: 'contato@demosaldoalto.example',
        telefone: '1130000001', cep: '01310100', cidade: 'São Paulo', uf: 'SP', plano: 'Pesquisa sob demanda', criadoEm: daysAgo(90),
        fat: { razao: 'Demo Saldo Alto Comércio de Cosméticos Ltda', cnpj: '11222333000181', email: 'financeiro@demosaldoalto.example', endereco: 'Av. Paulista, 1000, conj. 52', cidade: 'São Paulo', uf: 'SP', cep: '01310100' } },
      surveys: seedSurveys() };
  }

  /* ---------- estado ---------- */
  function load() {
    if (mem) return mem;
    try { var raw = sessionStorage.getItem(KEY); if (raw) { mem = JSON.parse(raw); return mem; } } catch (e) { /* segue com memória */ }
    mem = seed(); persist(); return mem;
  }
  function persist() { try { sessionStorage.setItem(KEY, JSON.stringify(mem)); } catch (e) { /* só em memória */ } }
  function reset() {
    mem = null; try { sessionStorage.removeItem(KEY); } catch (e) { /* ok */ }
    try { Object.keys(localStorage).filter(function (k) { return k.indexOf('saldoalto:') === 0 && k.indexOf('U-demo-') > 0; }).forEach(function (k) { localStorage.removeItem(k); }); } catch (e) { /* ok */ }
  }

  /* ---------- formatos iguais aos da API real ---------- */
  function pubUser(u) { return { id: u.id, nome: u.nome, cargo: u.cargo, email: u.email, telefone: u.telefone, papel: u.papel, perms: u.perms.slice(), mustChange: !!u.mustChange, emailRecuperacao: u.emailRecuperacao || '', status: u.status, ultimoLogin: u.ultimoLogin || '', criadoEm: u.criadoEm }; }
  function pubAccount(st) {
    var a = st.account;
    return { id: a.id, empresa: a.empresa, razaoSocial: a.razaoSocial, cnpj: a.cnpj, setor: a.setor, site: a.site, email: a.email, telefone: a.telefone, cep: a.cep, cidade: a.cidade, uf: a.uf,
      financeiroUserId: st.financeiroUserId, plano: a.plano, criadoEm: a.criadoEm, faturamento: clone(a.fat) };
  }
  function me(st) { return { token: 'demo', expiraEm: iso(Date.now() + 12 * 3600000), user: pubUser(st.users[0]), account: pubAccount(st), demo: true }; }
  function summary(st, r) {
    var autor = st.users.filter(function (u) { return u.id === r.criadoPor; })[0];
    return { id: r.id, nome: r.nome, status: r.status, criadaEm: r.criadaEm, atualizadaEm: r.atualizadaEm, enviadaEm: r.enviadaEm, codigo: r.codigo, objetivo: r.objetivo, amostra: r.amostra, respostas: r.respostas,
      preco: r.preco, perguntas: r.perguntas, nichos: r.nichos,
      progresso: r.status === 'rascunho' ? r.progresso : (r.amostra > 0 ? Math.min(100, Math.round(r.respostas / r.amostra * 100)) : 0), criadoPorNome: autor ? autor.nome : '' };
  }
  function own(st, id) { var r = st.surveys.filter(function (x) { return x.id === id; })[0]; if (!r) throw err('nao_encontrado', 'Pesquisa não encontrada.'); return r; }
  function applyResumo(r, resumo) {
    resumo = resumo || {};
    r.objetivo = str(resumo.objetivo, 300); r.amostra = Math.max(0, Math.floor(num(resumo.amostra))); r.preco = Math.max(0, Math.round(num(resumo.preco)));
    r.perguntas = Math.max(0, Math.floor(num(resumo.perguntas))); r.nichos = str(resumo.nichos, 300);
  }

  /* ---------- Inteligência da Base: base fictícia de ~480 empreendedoras ---------- */
  var NICHOS = ['Serviços de Beleza / Estética', 'Saúde / Bem-estar', 'Alimentação / Confeitaria', 'Moda / Costura', 'Educação / Cursos e mentorias', 'Revenda de produtos', 'Serviços (design, marketing etc.)'];
  var CITIES = { SP: ['São Paulo', 'Campinas', 'Santos', 'Sorocaba', 'Ribeirão Preto', 'Guarulhos', 'São José dos Campos'], RJ: ['Rio de Janeiro', 'Niterói', 'Petrópolis'], MG: ['Belo Horizonte', 'Uberlândia', 'Juiz de Fora'],
    PR: ['Curitiba', 'Londrina', 'Maringá'], RS: ['Porto Alegre', 'Caxias do Sul'], BA: ['Salvador', 'Feira de Santana'], SC: ['Florianópolis', 'Joinville'], DF: ['Brasília'], PE: ['Recife'], CE: ['Fortaleza'], GO: ['Goiânia'], ES: ['Vitória'], AM: ['Manaus'], PA: ['Belém'] };
  var base = null;
  function baseRows() {
    if (base) return base;
    var r = rng(20260921), rows = [], now = new Date();
    var ufW = [['SP', 38], ['RJ', 12], ['MG', 10], ['PR', 7], ['RS', 6], ['BA', 6], ['SC', 5], ['DF', 4], ['PE', 3], ['CE', 3], ['GO', 2], ['ES', 1], ['AM', 1], ['PA', 1]];
    var nW = [[NICHOS[0], 22], [NICHOS[1], 12], [NICHOS[2], 18], [NICHOS[3], 11], [NICHOS[4], 8], [NICHOS[5], 17], [NICHOS[6], 9], ['Outros nichos', 3]];
    var perMonth = [14, 18, 22, 26, 30, 34, 38, 42, 48, 54, 62, 70];   // cresce mês a mês (do mais antigo ao mais recente)
    perMonth.forEach(function (n, i) {
      var back = 11 - i;
      for (var k = 0; k < n; k++) {
        var uf = pick(r, ufW), cs = CITIES[uf], city = cs[Math.floor(Math.pow(r(), 1.7) * cs.length)];
        var day = 1 + Math.floor(r() * 27), at = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - back, day, 12));
        if (at.getTime() > now.getTime()) at = new Date(now.getTime() - Math.floor(r() * 5 + 1) * 86400000);
        rows.push({ at: at, cidade: city.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase(), cidadeLabel: city, uf: uf, emailCorp: r() < 0.33, nicho: pick(r, nW), insta: r() < 0.78, site: r() < 0.41 });
      }
    });
    // base sintética: as cadastradas dos últimos 30 dias têm um perfil um pouco diferente, para o "O que mudou" ter o que mostrar na demonstração
    var cut = now.getTime() - 30 * 86400000;
    rows.forEach(function (x) { if (x.at.getTime() >= cut) { if (r() < 0.2) x.nicho = NICHOS[2]; if (r() < 0.3) x.site = true; } });
    base = rows; return rows;
  }
  function bump(map, key, label) { if (!map[key]) map[key] = { label: label || key, n: 0 }; map[key].n++; }
  function tally(map) { return Object.keys(map).map(function (k) { return { k: map[k].label, n: map[k].n }; }).sort(function (a, b) { return b.n - a.n; }); }
  function kfilter(list, keepOthers) {
    var big = list.filter(function (x) { return x.n >= K_ANON; }), small = list.filter(function (x) { return x.n < K_ANON; });
    var rest = small.reduce(function (a, x) { return a + x.n; }, 0);
    if (keepOthers && rest >= K_ANON) big.push({ k: 'Demais (grupos pequenos)', n: rest, agrupado: true });
    return big;
  }
  var REGIAO_UF = { norte: ['AC', 'AM', 'AP', 'PA', 'RO', 'RR', 'TO'], nordeste: ['AL', 'BA', 'CE', 'MA', 'PB', 'PE', 'PI', 'RN', 'SE'], centrooeste: ['DF', 'GO', 'MS', 'MT'], sudeste: ['ES', 'MG', 'RJ', 'SP'], sul: ['PR', 'RS', 'SC'] };
  var MUDANCA_MIN_N = 30, MUDANCA_MIN_PP = 5, MUDANCA_Z = 2.576;
  function regiaoDe(uf) { for (var k in REGIAO_UF) if (REGIAO_UF[k].indexOf(uf) >= 0) return k; return ''; }
  function matNivel(r) { return r.insta && r.site && r.emailCorp ? 3 : (r.insta || r.site || r.emailCorp) && (r.site || r.emailCorp) ? 2 : 1; }
  function mudancas(rows, nowMs) {
    var cut = nowMs - 30 * 86400000, nw = rows.filter(function (r) { return r.at.getTime() >= cut; }), old = rows.filter(function (r) { return r.at.getTime() < cut; });
    var out = { minN: MUDANCA_MIN_N, nNovas: nw.length, nAnteriores: old.length, itens: [] };
    if (nw.length < MUDANCA_MIN_N || old.length < MUDANCA_MIN_N) { out.insuficiente = true; return out; }
    var dims = [];
    NICHOS.concat(['Outros nichos']).forEach(function (n) { dims.push({ tema: 'Nicho', rotulo: n, fn: function (r) { return r.nicho === n; } }); });
    UFS.forEach(function (u) { dims.push({ tema: 'Estado', rotulo: u, fn: function (r) { return r.uf === u; } }); });
    ['Presença básica', 'Em estruturação', 'Estruturada'].forEach(function (l, i) { dims.push({ tema: 'Maturidade', rotulo: l, fn: function (r) { return matNivel(r) === i + 1; } }); });
    dims.push({ tema: 'Presença digital', rotulo: 'Têm Instagram do negócio', fn: function (r) { return r.insta; } });
    dims.push({ tema: 'Presença digital', rotulo: 'Têm site', fn: function (r) { return r.site; } });
    dims.push({ tema: 'Presença digital', rotulo: 'Têm e-mail corporativo', fn: function (r) { return r.emailCorp; } });
    var n1 = nw.length, n2 = old.length;
    dims.forEach(function (dm) {
      var x1 = nw.filter(dm.fn).length, x2 = old.filter(dm.fn).length;
      if (x1 < K_ANON || x2 < K_ANON) return;
      var p1 = x1 / n1, p2 = x2 / n2, pp = (x1 + x2) / (n1 + n2), se = Math.sqrt(pp * (1 - pp) * (1 / n1 + 1 / n2));
      if (!se) return;
      var z = (p1 - p2) / se, dpp = (p1 - p2) * 100;
      if (Math.abs(z) >= MUDANCA_Z && Math.abs(dpp) >= MUDANCA_MIN_PP) out.itens.push({ tema: dm.tema, rotulo: dm.rotulo, pNovas: Math.round(p1 * 100), pAnteriores: Math.round(p2 * 100), dpp: Math.round(dpp), z: Math.round(Math.abs(z) * 10) / 10 });
    });
    out.itens.sort(function (a, b) { return b.z - a.z; }); out.itens = out.itens.slice(0, 3); return out;
  }
  function insights(d) {
    var all = baseRows(), f = d.filtros || {}, regiao = REGIAO_UF[f.regiao] ? f.regiao : '', options = { nichos: [], estados: [], regioes: [], cidades: [] }, mn = {}, me = {}, mr = {}, mc = {};
    all.forEach(function (r) { bump(mn, r.nicho); if (UFS.indexOf(r.uf) >= 0) { bump(me, r.uf); bump(mr, regiaoDe(r.uf)); if (r.cidade) bump(mc, r.cidade + '|' + r.uf, r.cidadeLabel); } });
    options.nichos = kfilter(tally(mn), false).map(function (x) { return x.k; });
    options.estados = kfilter(tally(me), false).map(function (x) { return x.k; });
    options.regioes = kfilter(tally(mr), false).map(function (x) { return x.k; });
    options.cidades = Object.keys(mc).filter(function (k) { return mc[k].n >= K_ANON; }).map(function (k) { return { v: k, k: mc[k].label, uf: k.split('|')[1] }; }).sort(function (a, b) { return a.k < b.k ? -1 : 1; });
    var rows = all.filter(function (r) { return (!f.nicho || r.nicho === f.nicho) && (!regiao || REGIAO_UF[regiao].indexOf(r.uf) >= 0) && (!f.estado || r.uf === f.estado) && (!f.cidade || (r.cidade + '|' + r.uf) === f.cidade); }), total = rows.length;
    if (total < K_ANON) return { total: total, insuficiente: true, opcoes: options, minGrupo: K_ANON };
    var byNicho = {}, byUf = {}, byCidade = {}, byMes = {}, mat = { 1: 0, 2: 0, 3: 0 }, insta = 0, site = 0, corp = 0, novos30 = 0, nowMs = Date.now(), cut30 = nowMs - 30 * 86400000, primeiro = null;
    rows.forEach(function (r) {
      bump(byNicho, r.nicho); if (UFS.indexOf(r.uf) >= 0) bump(byUf, r.uf);
      if (r.cidade) bump(byCidade, r.cidade + '|' + r.uf, r.cidadeLabel + ' / ' + r.uf);
      var key = r.at.getUTCFullYear() + '-' + (r.at.getUTCMonth() < 9 ? '0' : '') + (r.at.getUTCMonth() + 1); bump(byMes, key); if (r.at.getTime() >= cut30) novos30++;
      if (!primeiro || r.at < primeiro) primeiro = r.at;
      if (r.insta) insta++; if (r.site) site++; if (r.emailCorp) corp++; mat[matNivel(r)]++;
    });
    var meses = [], n0 = new Date(), b0 = new Date(Date.UTC(n0.getUTCFullYear(), n0.getUTCMonth(), 1));
    for (var m = 11; m >= 0; m--) { var dt = new Date(Date.UTC(b0.getUTCFullYear(), b0.getUTCMonth() - m, 1)); var kk = dt.getUTCFullYear() + '-' + (dt.getUTCMonth() < 9 ? '0' : '') + (dt.getUTCMonth() + 1); meses.push({ k: kk, n: byMes[kk] ? byMes[kk].n : 0 }); }
    var estados = tally(byUf), cidades = tally(byCidade);
    return { total: total, novos30: novos30, minGrupo: K_ANON, opcoes: options, periodo: { ate: new Date(nowMs).toISOString().slice(0, 10), desde: primeiro ? primeiro.toISOString().slice(0, 10) : '' }, mudancas: mudancas(rows, nowMs),
      nichos: kfilter(tally(byNicho), true), estados: kfilter(estados, false),
      estadosDistintos: estados.filter(function (x) { return x.n >= K_ANON; }).length, cidades: kfilter(cidades, false).slice(0, 10), cidadesDistintas: cidades.filter(function (x) { return x.n >= K_ANON; }).length,
      crescimento: meses, presenca: { instagram: Math.round(insta / total * 100), site: Math.round(site / total * 100), emailCorp: Math.round(corp / total * 100) },
      maturidade: [{ k: 'Presença básica', n: mat[1] }, { k: 'Em estruturação', n: mat[2] }, { k: 'Estruturada', n: mat[3] }] };
  }

  /* ---------- ações ---------- */
  var A = {};
  A.me = function (d, st) { return me(st); };
  A.logout = function () { return {}; };
  A['logout.others'] = function () { return {}; };
  A['security.sessions'] = function () { return { ativas: 1 }; };

  A['profile.update'] = function (d, st) {
    var nome = str(d.nome, 100), tel = digits(d.telefone), e = {};
    if (nome.length < 2) e.nome = 'Informe seu nome.';
    if (tel && (tel.length < 10 || tel.length > 13)) e.telefone = 'Informe um telefone com DDD.';
    if (Object.keys(e).length) throw fieldErr(e);
    var u = st.users[0]; u.nome = nome; u.cargo = str(d.cargo, 80); u.telefone = tel; return me(st);
  };
  A['account.update'] = function (d, st) {
    var a = st.account, e = {}, empresa = str(d.empresa, 120), email = str(d.email, 120).toLowerCase(), tel = digits(d.telefone), uf = str(d.uf, 2).toUpperCase(), cep = digits(d.cep);
    if (empresa.length < 2) e.empresa = 'Informe o nome da empresa.';
    if (!isEmail(email)) e.email = 'Informe um e-mail válido.';
    if (tel && (tel.length < 10 || tel.length > 13)) e.telefone = 'Informe um telefone com DDD.';
    if (uf && UFS.indexOf(uf) < 0) e.uf = 'UF inválida.';
    if (cep && cep.length !== 8) e.cep = 'CEP com 8 números.';
    if (Object.keys(e).length) throw fieldErr(e);
    a.empresa = empresa; a.razaoSocial = str(d.razaoSocial, 140); a.setor = str(d.setor, 80); a.site = str(d.site, 120); a.email = email; a.telefone = tel; a.cep = cep; a.cidade = str(d.cidade, 80); a.uf = uf;
    return me(st);
  };
  A['billing.update'] = function (d, st) {
    var f = d.faturamento || {}, e = {}, cnpj = digits(f.cnpj), email = str(f.email, 120).toLowerCase(), uf = str(f.uf, 2).toUpperCase(), cep = digits(f.cep);
    if (cnpj && !(window.SA && window.SA.validCnpj(cnpj))) e.cnpj = 'CNPJ inválido.';
    if (email && !isEmail(email)) e.email = 'Informe um e-mail válido.';
    if (uf && UFS.indexOf(uf) < 0) e.uf = 'UF inválida.';
    if (cep && cep.length !== 8) e.cep = 'CEP com 8 números.';
    if (Object.keys(e).length) throw fieldErr(e);
    st.account.fat = { razao: str(f.razao, 140), cnpj: cnpj, email: email, endereco: str(f.endereco, 160), cidade: str(f.cidade, 80), uf: uf, cep: cep };
    return me(st);
  };
  /* Segurança: na demonstração as credenciais não existem de verdade, então as trocas só validam e confirmam. */
  A['security.changePassword'] = function (d, st) {
    var pe = passwordError(d.nova); if (pe) throw fieldErr({ nova: pe });
    if (String(d.nova) === String(d.atual)) throw fieldErr({ nova: 'A nova senha precisa ser diferente da atual.' });
    return me(st);
  };
  A['security.setInitialPassword'] = function (d, st) { return me(st); };
  A['security.changeEmail'] = function (d, st) {
    var email = str(d.email, 120).toLowerCase();
    if (!isEmail(email)) throw fieldErr({ email: 'Informe um e-mail válido.' });
    if (email === st.users[0].email) throw fieldErr({ email: 'Este já é o e-mail da conta.' });
    if (st.users.some(function (u) { return u.email === email; })) throw fieldErr({ email: 'Este e-mail já está em uso.' });
    st.users[0].email = email; return me(st);
  };
  A['security.setRecoveryEmail'] = function (d, st) {
    var email = str(d.email, 120).toLowerCase();
    if (email && !isEmail(email)) throw fieldErr({ email: 'Informe um e-mail válido.' });
    if (email && email === st.users[0].email) throw fieldErr({ email: 'Use um e-mail diferente do e-mail de acesso.' });
    st.users[0].emailRecuperacao = email; return me(st);
  };

  function rolePerms(papel, perms) {
    if (papel === 'personalizado') return (perms || []).filter(function (p) { return PERMS.indexOf(p) >= 0; });
    if (!ROLES[papel]) throw fieldErr({ papel: 'Escolha um perfil de acesso.' });
    return ROLES[papel].slice();
  }
  function target(st, id) { var u = st.users.filter(function (x) { return x.id === id && x.status !== 'removido'; })[0]; if (!u) throw err('nao_encontrado', 'Usuário não encontrado.'); return u; }
  function tempPass() { var c = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789', o = ''; for (var i = 0; i < 12; i++) o += c.charAt(Math.floor(Math.random() * c.length)); return o + '7a'; }
  A['users.list'] = function (d, st) { return { usuarios: st.users.filter(function (u) { return u.status !== 'removido'; }).map(pubUser), financeiroUserId: st.financeiroUserId }; };
  A['users.add'] = function (d, st) {
    var nome = str(d.nome, 100), email = str(d.email, 120).toLowerCase(), e = {};
    if (nome.length < 2) e.nome = 'Informe o nome.';
    if (!isEmail(email)) e.email = 'Informe um e-mail válido.';
    if (Object.keys(e).length) throw fieldErr(e);
    if (st.users.some(function (u) { return u.email === email && u.status !== 'removido'; })) throw fieldErr({ email: 'Este e-mail já tem acesso a uma conta.' });
    var perms = rolePerms(String(d.papel), d.perms), temp = tempPass();
    var u = { id: uid('U-demo-'), contaId: 'C-demo', nome: nome, cargo: str(d.cargo, 80), email: email, telefone: '', papel: String(d.papel), perms: perms, mustChange: true, emailRecuperacao: '', status: 'ativo', ultimoLogin: '', criadoEm: iso(Date.now()) };
    st.users.push(u); return { usuario: pubUser(u), senhaProvisoria: temp, emailEnviado: false };
  };
  A['users.update'] = function (d, st) {
    var u = target(st, String(d.id));
    if (u.papel === 'titular') throw err('permissao', 'O perfil do titular não pode ser alterado.');
    var nome = str(d.nome, 100); if (nome.length < 2) throw fieldErr({ nome: 'Informe o nome.' });
    var perms = rolePerms(String(d.papel), d.perms);
    u.nome = nome; u.cargo = str(d.cargo, 80); u.papel = String(d.papel); u.perms = perms;
    if (st.financeiroUserId === u.id && perms.indexOf('financeiro') < 0) st.financeiroUserId = st.users[0].id;
    return { usuario: pubUser(u), financeiroUserId: st.financeiroUserId };
  };
  A['users.remove'] = function (d, st) {
    var u = target(st, String(d.id));
    if (u.papel === 'titular') throw err('permissao', 'O titular da conta não pode ser removido.');
    u.status = 'removido'; if (st.financeiroUserId === u.id) st.financeiroUserId = st.users[0].id;
    return { financeiroUserId: st.financeiroUserId };
  };
  A['users.resetPassword'] = function (d, st) {
    var u = target(st, String(d.id));
    if (u.papel === 'titular') throw err('permissao', 'Use "Esqueci minha senha" para o titular.');
    u.mustChange = true; return { senhaProvisoria: tempPass(), emailEnviado: false };
  };
  A['users.setFinancialHolder'] = function (d, st) {
    var u = target(st, String(d.id));
    if (u.papel !== 'titular' && u.perms.indexOf('financeiro') < 0) { u.perms.push('financeiro'); if (u.papel !== 'personalizado' && u.papel !== 'financeiro') u.papel = 'personalizado'; }
    st.financeiroUserId = u.id; return { financeiroUserId: u.id, usuario: pubUser(u) };
  };

  /* pesquisas */
  A['surveys.list'] = function (d, st) {
    var list = st.surveys.map(function (r) { return summary(st, r); });
    list.sort(function (a, b) { return String(a.atualizadaEm) < String(b.atualizadaEm) ? 1 : -1; });
    return { pesquisas: list };
  };
  A['surveys.get'] = function (d, st) { var r = own(st, String(d.id)), s = summary(st, r); s.dados = clone(r.dados); s.contato = clone(r.contato); return { pesquisa: s }; };
  function cleanName(v, fb) { var n = str(v, 80); return n || fb || 'Pesquisa sem nome'; }
  A['surveys.save'] = function (d, st) {
    var r;
    if (d.id) { r = own(st, String(d.id)); if (r.status !== 'rascunho') throw err('status', 'Esta pesquisa já foi enviada e não pode mais ser editada.'); }
    else { r = { id: uid('P-demo-'), nome: '', status: 'rascunho', criadaEm: iso(Date.now()), enviadaEm: '', codigo: '', respostas: 0, criadoPor: st.users[0].id, contato: null }; st.surveys.push(r); }
    r.nome = cleanName(d.nome, r.nome); r.atualizadaEm = iso(Date.now()); r.progresso = Math.max(0, Math.min(100, Math.round(num(d.progresso))));
    applyResumo(r, d.resumo); r.dados = clone(d.dados || {});
    return { pesquisa: summary(st, r) };
  };
  A['surveys.submit'] = function (d, st) {
    var resumo = d.resumo || {}, e = [];
    if (str(resumo.objetivo, 400).length < 15) e.push('objetivo');
    if (num(resumo.perguntas) < 1) e.push('perguntas');
    if (num(resumo.amostra) < 30 || num(resumo.amostra) > 5000) e.push('amostra');
    if (e.length) throw err('validacao', 'A pesquisa está incompleta (' + e.join(', ') + ').');
    var c = d.contato || {};
    if (str(c.name, 100).length < 2 || !isEmail(str(c.email).toLowerCase()) || digits(c.whatsapp).length < 10) throw err('validacao', 'Confira os dados de contato.');
    var r;
    if (d.id) { r = own(st, String(d.id)); if (r.status !== 'rascunho') throw err('status', 'Esta pesquisa já foi enviada.'); }
    else { r = { id: uid('P-demo-'), criadaEm: iso(Date.now()), respostas: 0, criadoPor: st.users[0].id }; st.surveys.push(r); }
    var t = new Date(), pad = function (n) { return (n < 10 ? '0' : '') + n; };
    r.nome = cleanName(d.nome, cleanName(resumo.objetivo)); r.status = 'em_revisao'; r.atualizadaEm = iso(t); r.enviadaEm = iso(t); r.progresso = 100;
    r.codigo = 'SA-' + t.getUTCFullYear() + pad(t.getUTCMonth() + 1) + pad(t.getUTCDate()) + '-' + Math.random().toString(36).slice(2, 6).toUpperCase();
    applyResumo(r, resumo);
    r.contato = { name: str(c.name, 100), company: str(c.company, 120), email: str(c.email).toLowerCase(), whatsapp: digits(c.whatsapp) };
    var dados = clone(d.dados || {}); dados.contracted = { id: r.codigo, at: r.enviadaEm, total: num(resumo.preco) }; r.dados = dados;
    return { pesquisa: summary(st, r) };
  };
  A['surveys.duplicate'] = function (d, st) {
    var src = own(st, String(d.id)), dados = clone(src.dados || {}), nid = uid('P-demo-'), now = iso(Date.now());
    dados.contracted = null; dados.surveyId = nid; dados.screen = 'revisao';
    dados.completed = (dados.completed || []).filter(function (s) { return s !== 'revisao' && s !== 'contratacao'; });
    if (dados.contact) dados.contact.consent = false;
    var r = { id: nid, nome: cleanName(String(src.nome).slice(0, 70) + ' (cópia)'), status: 'rascunho', criadaEm: now, atualizadaEm: now, enviadaEm: '', codigo: '', objetivo: src.objetivo, amostra: src.amostra, respostas: 0, preco: src.preco,
      perguntas: src.perguntas, nichos: src.nichos, progresso: Math.min(95, src.progresso >= 100 ? 80 : src.progresso), criadoPor: st.users[0].id, contato: null, dados: dados };
    st.surveys.push(r); return { pesquisa: summary(st, r) };
  };
  A['surveys.delete'] = function (d, st) {
    var r = own(st, String(d.id));
    if (r.status !== 'rascunho') throw err('status', 'Só rascunhos podem ser excluídos. Para cancelar uma pesquisa enviada, fale com o time.');
    st.surveys = st.surveys.filter(function (x) { return x.id !== r.id; }); return {};
  };
  A['surveys.rename'] = function (d, st) {
    var r = own(st, String(d.id)), nome = str(d.nome, 80); if (nome.length < 2) throw fieldErr({ nome: 'Informe um nome.' });
    r.nome = nome; r.atualizadaEm = iso(Date.now()); if (r.dados) r.dados.name = nome; return { pesquisa: summary(st, r) };
  };
  A['base.insights'] = function (d) { return insights(d); };

  window.SADemo = {
    /* Inicia (ou retoma) a demonstração e devolve o "login" no mesmo formato da API real. */
    start: function () { return me(load()); },
    reset: reset,
    handle: function (action, payload) {
      var fn = A[action];
      if (!fn) throw err('demo', 'Esta ação não está disponível na demonstração.');
      var st = load(), out = fn(payload || {}, st);
      persist();
      return clone(out);
    }
  };
})();
