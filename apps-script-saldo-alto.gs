/**
 * Saldo Alto — recebe os cadastros dos formulários (empreendedoras e empresas)
 * e grava na aba correta da planilha.
 *
 * COMO PUBLICAR:
 * 1. Cole este código no editor do Apps Script (Extensões > Apps Script).
 * 2. Clique em "Implantar" (Deploy) > "Nova implantação" (New deployment).
 * 3. Tipo: "App da Web" (Web app).
 * 4. Executar como: "Eu" (Me).
 * 5. Quem pode acessar: "Qualquer pessoa" (Anyone).
 * 6. Clique em "Implantar" e autorize as permissões pedidas.
 * 7. Copie a URL gerada (termina em /exec) e cole no lugar de APPS_SCRIPT_URL
 *    nos arquivos saldo-alto-landing.html e saldo-alto-empresas.html.
 *
 * Sempre que editar este código, é preciso criar uma NOVA implantação
 * (ou editar a implantação existente) pra que a mudança valha.
 */

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const isEmpresa = data.formType === 'empresa';
    const sheetName = isEmpresa ? 'Empresas' : 'Empreendedoras';

    let sheet = ss.getSheetByName(sheetName);
    if (!sheet) {
      sheet = ss.insertSheet(sheetName);
    }

    if (isEmpresa) {
      sheet.appendRow([
        new Date(),
        data.nome || '',
        data.sobrenome || '',
        data.cargo || '',
        data.telefone || '',
        data.emailCorp || '',
        data.empresa || '',
        data.cnpj || '',
        data.setor || '',
        data.site || '',
        data.plano || '',
        data.objetivo || '',
        data.optin || 'Não'
      ]);
    } else {
      sheet.appendRow([
        new Date(),
        data.nome || '',
        data.sobrenome || '',
        data.cidade || '',
        data.estado || '',
        data.emailPessoal || '',
        data.emailCorp || '',
        data.telefone || '',
        data.negocio || '',
        data.nicho || '',
        data.instagram || '',
        data.site || '',
        data.optin || 'Não'
      ]);
    }

    return ContentService.createTextOutput(JSON.stringify({ status: 'ok' }))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ status: 'error', message: err.message }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}
