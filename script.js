// ==========================================================================
// Configuração do Firebase
// ==========================================================================
const firebaseConfig = {
    apiKey: "AIzaSyC-GutZKz3vwYZJM6LnWXhUlIQo0rTBCQQ",
    authDomain: "gerenciador-full.firebaseapp.com",
    projectId: "gerenciador-full",
    storageBucket: "gerenciador-full.firebasestorage.app",
    messagingSenderId: "301242322977",
    appId: "1:301242322977:web:9adc46adb1760617f19360"
};

// Inicializa Firebase
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

// ==========================================================================
// Estado da Aplicação
// ==========================================================================
let produtos = []; // Agora inicializa vazio, vai ser populado pelo Firebase
let resultadosProcessados = [];
let editingSku = null;

// Vínculo Shopee -> SKU Olist (Planilha Murilo)
let produtosOlist = {};   // sku -> { sku, nome, qtd_caixa }   (coleção "produtos_olist")
let anunciosShopee = {};  // identificador (Model ID ou Item ID) -> { sku, titulo, origem }   (coleção "anuncios_shopee")
let ultimaPlanilhaMurilo = null; // arquivo processado por último, para reprocessar depois de salvar pendências

// ==========================================================================
// Elementos DOM
// ==========================================================================
const tabs = document.querySelectorAll('.tab-btn');
const tabContents = document.querySelectorAll('.tab-content');

// Formulário e Config
const formSku = document.getElementById('form-sku');
const inputSku = document.getElementById('input-sku');
const inputName = document.getElementById('input-name');
const inputQtd = document.getElementById('input-qtd');
const configTbody = document.getElementById('config-tbody');

const btnExportBackup = document.getElementById('btn-export-backup');
const btnImportBackup = document.getElementById('btn-import-backup');
const inputImportBackup = document.getElementById('input-import-backup');

// Gerador
const btnGenerate = document.getElementById('btn-generate');
const shopeeInput = document.getElementById('shopee-input');
const excelUploadInput = document.getElementById('excel-upload');
const btnGenerateExcel = document.getElementById('btn-generate-excel');
const inboundGeneratorUpload = document.getElementById('inbound-generator-upload');
const btnGenerateInbound = document.getElementById('btn-generate-inbound');
const resultsContainer = document.getElementById('results-container');
const resultTbody = document.getElementById('result-tbody');
const btnDownload = document.getElementById('btn-download');
const toastEl = document.getElementById('toast');

// ==========================================================================
// Inicialização
// ==========================================================================
document.addEventListener('DOMContentLoaded', async () => {
    // Busca dados do Firebase primeiro
    await loadProductsFromFirebase();
    await loadVinculosFromFirebase();
    setupTabs();
});

// Busca o cadastro por SKU Olist e os vínculos de anúncios no Firebase
async function loadVinculosFromFirebase() {
    try {
        const [snapProdutos, snapAnuncios] = await Promise.all([
            db.collection('produtos_olist').get(),
            db.collection('anuncios_shopee').get()
        ]);
        produtosOlist = {};
        snapProdutos.forEach(doc => {
            const d = doc.data();
            produtosOlist[d.sku] = { sku: d.sku, nome: d.nome || '', qtd_caixa: d.qtd_caixa || 1 };
        });
        anunciosShopee = {};
        snapAnuncios.forEach(doc => {
            anunciosShopee[doc.id] = doc.data();
        });
        renderOlistTable();
    } catch (error) {
        console.error("Erro ao carregar vínculos do Firebase:", error);
        showToast("Erro ao carregar o cadastro por SKU Olist: " + error.message, "error");
    }
}

// Grava vários documentos em lotes (o Firestore aceita até 500 operações por lote)
async function gravarEmLotes(colecao, docs) {
    const TAMANHO_LOTE = 400;
    for (let i = 0; i < docs.length; i += TAMANHO_LOTE) {
        const batch = db.batch();
        docs.slice(i, i + TAMANHO_LOTE).forEach(({ id, data }) => {
            batch.set(db.collection(colecao).doc(id), data, { merge: true });
        });
        await batch.commit();
    }
}

// Busca Produtos no Firebase
async function loadProductsFromFirebase() {
    try {
        const querySnapshot = await db.collection('produtos').get();
        produtos = [];
        querySnapshot.forEach((doc) => {
            const data = doc.data();
            // Salva o id do doc para facilitar exclusão/update
            produtos.push({ id: doc.id, ...data }); 
        });
        renderConfigTable();
    } catch (error) {
        console.error("Erro ao carregar do Firebase:", error);
        showToast("Erro ao carregar banco de dados.", "error");
    }
}

// ==========================================================================
// Sistema de Abas
// ==========================================================================
function setupTabs() {
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            // Remove active de todos
            tabs.forEach(t => t.classList.remove('active'));
            tabContents.forEach(c => c.classList.remove('active'));

            // Adiciona active no clicado
            tab.classList.add('active');
            document.getElementById(tab.dataset.tab).classList.add('active');
        });
    });
}

// ==========================================================================
// Configurações (CRUD LocalStorage)
// ==========================================================================
formSku.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const sku = inputSku.value.trim();
    const name = inputName.value.trim();
    const qtd = parseInt(inputQtd.value);

    if (!sku || !name || !qtd) return;

    // Loading estado no botão
    const submitBtn = formSku.querySelector('button[type="submit"]');
    const originalText = submitBtn.innerHTML;
    submitBtn.innerHTML = "<i class='bx bx-loader-alt bx-spin'></i> Salvando...";
    submitBtn.disabled = true;

    try {
        if (editingSku) {
            // Edição
            const docRef = db.collection('produtos').doc(editingSku);
            await docRef.update({
                sku: sku,
                name: name,
                qtd: qtd
            });
            showToast('Produto atualizado com sucesso!');
        } else {
            // Adição Nova
            // Verifica duplicidade no array local
            const exists = produtos.find(p => p.sku.toLowerCase() === sku.toLowerCase());
            if (exists) {
                showToast('Este SKU já está cadastrado!', 'error');
                submitBtn.innerHTML = originalText;
                submitBtn.disabled = false;
                return;
            }

            const newProd = { sku, name, qtd };
            await db.collection('produtos').add(newProd);
            showToast('Produto cadastrado!');
        }
        
        // Recarrega os dados fresquinhos do Firebase
        await loadProductsFromFirebase();

        // Reseta o formulário
        formSku.reset();
        editingSku = null;
        submitBtn.innerHTML = "<i class='bx bx-plus'></i> Adicionar";
        submitBtn.classList.remove('editing-mode');
        submitBtn.disabled = false;

    } catch (error) {
        console.error("Erro ao salvar:", error);
        showToast("Erro ao salvar produto no banco.", "error");
        submitBtn.innerHTML = originalText;
        submitBtn.disabled = false;
    }
});

function editProduct(id) {
    const prod = produtos.find(p => p.id === id);
    if (prod) {
        inputSku.value = prod.sku;
        inputName.value = prod.name;
        inputQtd.value = prod.qtd;
        editingSku = prod.id; // Guarda o ID real do documento no Firebase

        const submitBtn = formSku.querySelector('button[type="submit"]');
        submitBtn.innerHTML = "<i class='bx bx-check'></i> Salvar Edição";
        submitBtn.classList.add('editing-mode');
        
        document.querySelector('.tab-btn[data-tab="config"]').click();
    }
}

window.deleteProduct = async function(id) {
    if (confirm('Tem certeza que deseja remover este produto?')) {
        try {
            await db.collection('produtos').doc(id).delete();
            showToast('Produto removido!');
            await loadProductsFromFirebase();
        } catch (error) {
            console.error("Erro ao excluir:", error);
            showToast("Erro ao excluir produto.", "error");
        }
    }
};

function renderConfigTable() {
    configTbody.innerHTML = '';
    
    if (produtos.length === 0) {
        configTbody.innerHTML = '<tr><td colspan="4" style="text-align:center; color: var(--text-muted);">Nenhum produto cadastrado.</td></tr>';
        return;
    }

    produtos.forEach(p => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${p.sku}</td>
            <td>${p.name}</td>
            <td>${p.qtd}</td>
            <td class="action-cell">
                <button class="btn-icon" onclick="editProduct('${p.id}')" title="Editar">
                    <i class='bx bx-edit-alt'></i>
                </button>
                <button class="btn-icon" onclick="deleteProduct('${p.id}')" title="Excluir">
                    <i class='bx bx-trash'></i>
                </button>
            </td>
        `;
        configTbody.appendChild(tr);
    });
}

// ==========================================================================
// Exportar / Importar Backup
// ==========================================================================
btnExportBackup.addEventListener('click', () => {
    if (produtos.length === 0) {
        showToast('Não há produtos para exportar.', 'error');
        return;
    }
    const dataStr = JSON.stringify(produtos, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    saveAs(blob, 'backup_fullshopee.json');
    showToast('Backup exportado com sucesso!');
});

btnImportBackup.addEventListener('click', () => {
    inputImportBackup.click();
});

inputImportBackup.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
        try {
            const importedData = JSON.parse(event.target.result);
            if (!Array.isArray(importedData)) throw new Error('Formato inválido');
            
            const isValid = importedData.every(p => p.hasOwnProperty('sku') && p.hasOwnProperty('name') && p.hasOwnProperty('qtd'));
            if (!isValid) throw new Error('Dados faltando no JSON');

            btnImportBackup.innerHTML = "<i class='bx bx-loader-alt bx-spin'></i> Importando...";
            btnImportBackup.disabled = true;

            let produtosParaAdicionar = [];

            if (produtos.length > 0) {
                const mesclar = confirm('Você já tem produtos cadastrados.\n\nClique em [OK] para MESCLAR com o backup (manter os atuais e adicionar os novos).\nClique em [Cancelar] para APAGAR TUDO e usar apenas o backup.');
                
                if (mesclar) {
                    importedData.forEach(newProd => {
                        const exists = produtos.find(p => p.sku === newProd.sku);
                        if (!exists) {
                            produtosParaAdicionar.push(newProd);
                        }
                    });
                } else {
                    // Apagar tudo primeiro
                    for (const p of produtos) {
                        await db.collection('produtos').doc(p.id).delete();
                    }
                    produtosParaAdicionar = importedData;
                }
            } else {
                produtosParaAdicionar = importedData;
            }

            // Adicionar novos no Firebase
            for (const newProd of produtosParaAdicionar) {
                // Remove propriedades indesejadas (como um antigo id)
                const { id, ...dataToSave } = newProd;
                await db.collection('produtos').add(dataToSave);
            }

            await loadProductsFromFirebase();
            showToast('Backup importado com sucesso!');
            
        } catch (error) {
            console.error(error);
            showToast('Erro ao importar: ' + error.message, 'error');
        } finally {
            btnImportBackup.innerHTML = "<i class='bx bx-import'></i> Importar Backup";
            btnImportBackup.disabled = false;
            inputImportBackup.value = '';
        }
    };
    reader.readAsText(file);
});

// ==========================================================================
// Lógica do Parseador da Shopee
// ==========================================================================
btnGenerate.addEventListener('click', () => {
    const text = shopeeInput.value;
    if (!text) {
        showToast('Cole o texto da Shopee primeiro!', 'error');
        return;
    }

    if (produtos.length === 0) {
        showToast('Cadastre ao menos 1 produto na aba Configurações!', 'error');
        return;
    }

    const lines = text.split('\n').map(l => l.trim());
    resultadosProcessados = [];

    const naoCadastrados = [];

    // Varrer as linhas procurando os SKUs (conhecidos ou não)
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        
        let skuDesconhecido = null;

        // Regra 1: O SKU está salvo nos produtos cadastrados (checa tanto o campo SKU quanto o campo NOME)
        let prod = produtos.find(p => 
            p.sku.trim().toLowerCase() === line.trim().toLowerCase() ||
            p.name.trim().toLowerCase() === line.trim().toLowerCase()
        );
        
        // Regra 2: Se não está cadastrado, verificar se é um novo item guiado pelo código da Shopee na linha de baixo
        if (!prod && i + 1 < lines.length) {
            const nextLineIsShopeeCode = /^\d+_\d+$/.test(lines[i+1]);
            const iAmNotShopeeCode = !/^\d+_\d+$/.test(line);
            
            if (nextLineIsShopeeCode && iAmNotShopeeCode && line !== '-' && line !== '') {
                // Validação de Ouro: Se o usuário salvou o código gigante da Shopee como sendo o SKU lá nas configurações, 
                // a linha de baixo VAI ser reconhecida na próxima rodada, então não devemos dar falso alarme aqui!
                let nextLineCadastrada = produtos.find(p => p.sku.trim().toLowerCase() === lines[i+1].trim().toLowerCase());
                
                if (!nextLineCadastrada) {
                    skuDesconhecido = line;
                    naoCadastrados.push({
                        sku: skuDesconhecido,
                        codigo: lines[i+1]
                    });
                }
            }
        }

        if (prod || skuDesconhecido) {
            // Agora pegamos a quantidade nas próximas linhas
            let qtdEnviada = 0;
            let tempQtds = [];
            
            // Olha as próximas linhas (no máximo 15)
            for (let j = 1; j <= 15; j++) {
                if (i + j >= lines.length) break;
                const nextLine = lines[i + j];
                
                // Se achou outro SKU conhecido, para
                if (produtos.some(p => p.sku.trim().toLowerCase() === nextLine.trim().toLowerCase())) break;
                
                // Se achou "Peças", para (já pegou o que precisava)
                if (nextLine.toLowerCase().includes('peças')) break;

                // Previne vazar para outro SKU desconhecido (para o laço se achar o código shopee de outro produto)
                if (j > 2 && i + j + 1 < lines.length) {
                    if (/^\d+_\d+$/.test(lines[i + j + 1]) && !/^\d+_\d+$/.test(nextLine)) {
                        break;
                    }
                }

                // Tenta extrair número. Ignora linhas que tenham "_" (são códigos internos) ou só "-"
                if (!nextLine.includes('_') && nextLine !== '-') {
                    const num = parseInt(nextLine);
                    if (!isNaN(num) && num > 0) {
                        tempQtds.push(num);
                    }
                }
            }
            
            // A quantidade certa costuma ser a última numérica da sequência extraída
            if (tempQtds.length > 0) {
                qtdEnviada = tempQtds[tempQtds.length - 1];
            }

            if (qtdEnviada > 0) {
                let caixas = prod ? Math.ceil(qtdEnviada / prod.qtd) : qtdEnviada; // sem config = 1 qtd por caixa
                let finalName = prod ? prod.name : skuDesconhecido;

                resultadosProcessados.push({
                    id: Date.now() + Math.random(),
                    item: finalName,
                    quantidade: qtdEnviada,
                    caixas: caixas,
                    qtdPorCaixa: prod ? prod.qtd : 1
                });
            }
        }
    }

    // Aproveita a função reaproveitável
    tratarNomesDuplicadosEGerarTabela(naoCadastrados);
});

// ==========================================================================
// Cadastro por SKU Olist + Vínculo de Anúncios (Configurações)
// ==========================================================================
const olistTbody = document.getElementById('olist-tbody');
const olistBusca = document.getElementById('olist-busca');
const olistStats = document.getElementById('olist-stats');
const btnImportAnuncios = document.getElementById('btn-import-anuncios');
const inputImportAnuncios = document.getElementById('input-import-anuncios');
const btnImportCadastroOlist = document.getElementById('btn-import-cadastro-olist');
const inputImportCadastroOlist = document.getElementById('input-import-cadastro-olist');
const btnExportCadastroOlist = document.getElementById('btn-export-cadastro-olist');

// Normaliza o texto de cabeçalho para achar colunas pelo nome
const normalizarCabecalho = (txt) => String(txt || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();

// Lê a primeira aba de um .xls/.xlsx/.csv como lista de objetos (SheetJS)
async function lerPlanilhaComoLinhas(file) {
    const data = new Uint8Array(await file.arrayBuffer());
    const workbook = XLSX.read(data, { type: 'array' });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    return XLSX.utils.sheet_to_json(sheet, { defval: '', raw: false });
}

// Acha o nome real da coluna a partir de uma lista de variações aceitas
function acharColuna(linha, variacoes) {
    const colunas = Object.keys(linha || {});
    return colunas.find(c => variacoes.includes(normalizarCabecalho(c))) || null;
}

function escapeHtml(txt) {
    return String(txt ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
}

function renderOlistTable() {
    if (!olistTbody) return;
    const totalSkus = Object.keys(produtosOlist).length;
    const totalAnuncios = Object.keys(anunciosShopee).length;
    olistStats.textContent = `${totalAnuncios} anúncios vinculados · ${totalSkus} SKUs com cadastro`;

    const termo = normalizarCabecalho(olistBusca.value);
    const lista = Object.values(produtosOlist)
        .filter(p => !termo || normalizarCabecalho(p.sku).includes(termo) || normalizarCabecalho(p.nome).includes(termo))
        .sort((a, b) => a.nome.localeCompare(b.nome));

    if (lista.length === 0) {
        olistTbody.innerHTML = '<tr><td colspan="4" style="text-align:center; color: var(--text-muted);">Nenhum SKU cadastrado.</td></tr>';
        return;
    }

    olistTbody.innerHTML = lista.map(p => `
        <tr>
            <td>${escapeHtml(p.sku)}</td>
            <td><input type="text" class="olist-nome" data-sku="${escapeHtml(p.sku)}" value="${escapeHtml(p.nome)}" style="width: 100%; padding: 0.4rem;"></td>
            <td><input type="number" class="table-input olist-qtd" data-sku="${escapeHtml(p.sku)}" value="${p.qtd_caixa}" min="1"></td>
            <td class="action-cell">
                <button class="btn-icon olist-excluir" data-sku="${escapeHtml(p.sku)}" title="Excluir"><i class='bx bx-trash'></i></button>
            </td>
        </tr>
    `).join('');
}

if (olistBusca) olistBusca.addEventListener('input', renderOlistTable);

// Edição direta na tabela: salva ao sair do campo
if (olistTbody) {
    olistTbody.addEventListener('change', async (e) => {
        const sku = e.target.dataset.sku;
        if (!sku || !produtosOlist[sku]) return;
        const campo = e.target.classList.contains('olist-nome') ? 'nome' : 'qtd_caixa';
        const valor = campo === 'nome' ? e.target.value.trim() : parseInt(e.target.value);
        if (!valor) {
            showToast('Valor inválido.', 'error');
            renderOlistTable();
            return;
        }
        try {
            await db.collection('produtos_olist').doc(sku).set({ [campo]: valor }, { merge: true });
            produtosOlist[sku][campo] = valor;
            showToast(`${sku} atualizado!`);
        } catch (error) {
            console.error(error);
            showToast('Erro ao salvar: ' + error.message, 'error');
        }
    });

    olistTbody.addEventListener('click', async (e) => {
        const btn = e.target.closest('.olist-excluir');
        if (!btn) return;
        const sku = btn.dataset.sku;
        if (!confirm(`Remover o cadastro do SKU ${sku}?\n(Os vínculos de anúncios continuam.)`)) return;
        try {
            await db.collection('produtos_olist').doc(sku).delete();
            delete produtosOlist[sku];
            renderOlistTable();
            showToast('SKU removido!');
        } catch (error) {
            console.error(error);
            showToast('Erro ao excluir: ' + error.message, 'error');
        }
    });
}

// Importar Anúncios do Olist: Identificador (Model ID ou Item ID) -> Produto (SKU)
if (btnImportAnuncios) {
    btnImportAnuncios.addEventListener('click', () => inputImportAnuncios.click());
    inputImportAnuncios.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const textoOriginal = btnImportAnuncios.innerHTML;
        try {
            const linhas = await lerPlanilhaComoLinhas(file);
            const colId = acharColuna(linhas[0], ['identificador']);
            const colSku = acharColuna(linhas[0], ['produto (sku)', 'sku']);
            const colTitulo = acharColuna(linhas[0], ['titulo']);
            const colIntegracao = acharColuna(linhas[0], ['integracao']);
            if (!colId || !colSku) throw new Error('Colunas "Identificador" e "Produto (SKU)" não encontradas.');

            // Agrupa por Identificador: o mesmo anúncio com SKUs diferentes no Olist é conflito e fica de fora
            const porId = {};
            let ignorados = 0;
            const integracoes = new Set();
            linhas.forEach(l => {
                const id = String(l[colId]).trim();
                const sku = String(l[colSku]).trim();
                if (!id || !sku || id.includes('/')) { ignorados++; return; }
                if (colIntegracao) integracoes.add(String(l[colIntegracao]).trim());
                porId[id] = porId[id] || { skus: new Set(), titulo: colTitulo ? String(l[colTitulo]).trim() : '' };
                porId[id].skus.add(sku);
            });

            const novos = [], alterados = [], conflitos = [];
            let iguais = 0;
            Object.entries(porId).forEach(([id, { skus, titulo }]) => {
                if (skus.size > 1) { conflitos.push(`  ${id}: ${[...skus].join(' / ')}`); return; }
                const sku = [...skus][0];
                const atual = anunciosShopee[id];
                const doc = { id, data: { sku, titulo, origem: 'olist' } };
                if (!atual) novos.push(doc);
                else if (atual.sku !== sku) alterados.push({ ...doc, antes: atual.sku });
                else iguais++;
            });

            const exemplosAlterados = alterados.slice(0, 5).map(a => `  ${a.id}: ${a.antes} → ${a.data.sku}`).join('\n');
            const ok = confirm(
                `Anúncios do Olist (${[...integracoes].join(', ') || 'integração não informada'})\n\n` +
                `Novos: ${novos.length}\nAlterados: ${alterados.length}\nSem mudança: ${iguais}\nIgnorados (sem Identificador ou SKU): ${ignorados}\n` +
                `Conflitos (mesmo anúncio com 2 SKUs — ficam de fora, corrigir no Olist): ${conflitos.length}\n` +
                (conflitos.length ? `${conflitos.slice(0, 5).join('\n')}\n` : '') +
                (exemplosAlterados ? `\nExemplos alterados:\n${exemplosAlterados}\n` : '') +
                `\nGravar ${novos.length + alterados.length} vínculos no banco?`
            );
            if (!ok) return;

            btnImportAnuncios.innerHTML = "<i class='bx bx-loader-alt bx-spin'></i> Gravando...";
            btnImportAnuncios.disabled = true;
            await gravarEmLotes('anuncios_shopee', [...novos, ...alterados]);
            await loadVinculosFromFirebase();
            showToast(`${novos.length + alterados.length} vínculos gravados!`);
        } catch (error) {
            console.error(error);
            showToast('Erro ao importar anúncios: ' + error.message, 'error');
        } finally {
            btnImportAnuncios.innerHTML = textoOriginal;
            btnImportAnuncios.disabled = false;
            inputImportAnuncios.value = '';
        }
    });
}

// Importar Cadastro por SKU: colunas "SKU", "Nome", "Qtd por Caixa"
if (btnImportCadastroOlist) {
    btnImportCadastroOlist.addEventListener('click', () => inputImportCadastroOlist.click());
    inputImportCadastroOlist.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const textoOriginal = btnImportCadastroOlist.innerHTML;
        try {
            const linhas = await lerPlanilhaComoLinhas(file);
            const colSku = acharColuna(linhas[0], ['sku', 'sku olist', 'produto (sku)']);
            const colNome = acharColuna(linhas[0], ['nome', 'nome do produto']);
            const colQtd = acharColuna(linhas[0], ['qtd por caixa', 'qtd / caixa', 'quantidade por caixa', 'qtd_caixa']);
            if (!colSku || !colNome || !colQtd) throw new Error('A planilha precisa das colunas "SKU", "Nome" e "Qtd por Caixa".');

            const docs = [];
            let novos = 0, alterados = 0, iguais = 0, invalidos = 0;
            linhas.forEach(l => {
                const sku = String(l[colSku]).trim();
                const nome = String(l[colNome]).trim();
                const qtd = parseInt(l[colQtd]);
                if (!sku || !nome || isNaN(qtd) || qtd <= 0 || sku.includes('/')) { invalidos++; return; }
                const atual = produtosOlist[sku];
                if (!atual) novos++;
                else if (atual.nome !== nome || atual.qtd_caixa !== qtd) alterados++;
                else { iguais++; return; }
                docs.push({ id: sku, data: { sku, nome, qtd_caixa: qtd } });
            });

            const ok = confirm(
                `Cadastro por SKU Olist\n\nNovos: ${novos}\nAlterados: ${alterados}\nSem mudança: ${iguais}\nLinhas inválidas: ${invalidos}\n\n` +
                `Gravar ${docs.length} SKUs no banco? (nada é apagado)`
            );
            if (!ok) return;

            btnImportCadastroOlist.innerHTML = "<i class='bx bx-loader-alt bx-spin'></i> Gravando...";
            btnImportCadastroOlist.disabled = true;
            await gravarEmLotes('produtos_olist', docs);
            await loadVinculosFromFirebase();
            showToast(`${docs.length} SKUs gravados!`);
        } catch (error) {
            console.error(error);
            showToast('Erro ao importar cadastro: ' + error.message, 'error');
        } finally {
            btnImportCadastroOlist.innerHTML = textoOriginal;
            btnImportCadastroOlist.disabled = false;
            inputImportCadastroOlist.value = '';
        }
    });
}

// Baixar Cadastro por SKU (serve de backup e de modelo para importar)
if (btnExportCadastroOlist) {
    btnExportCadastroOlist.addEventListener('click', () => {
        const lista = Object.values(produtosOlist).sort((a, b) => a.sku.localeCompare(b.sku));
        if (lista.length === 0) {
            showToast('Não há SKUs para exportar.', 'error');
            return;
        }
        const aoa = [['SKU', 'Nome', 'Qtd por Caixa'], ...lista.map(p => [p.sku, p.nome, p.qtd_caixa])];
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), 'Cadastro');
        const buffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
        saveAs(new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), 'cadastro_sku_olist.xlsx');
        showToast('Cadastro exportado!');
    });
}

// ==========================================================================
// Lógica do Parseador via Planilha Murilo (Excel Upload) - Método 2
// ==========================================================================
const pendenciasCard = document.getElementById('pendencias-card');
const btnSalvarPendencias = document.getElementById('btn-salvar-pendencias');

btnGenerateExcel.addEventListener('click', async () => {
    const file = excelUploadInput.files[0];
    if (!file) {
        showToast('Por favor, selecione uma planilha primeiro!', 'error');
        return;
    }
    await processarPlanilhaMurilo(file);
});

async function processarPlanilhaMurilo(file) {
    if (typeof ExcelJS === 'undefined') {
        showToast('Biblioteca do Excel ainda não carregou!', 'error');
        return;
    }

    try {
        showToast('Lendo planilha, aguarde...');
        btnGenerateExcel.innerHTML = "<i class='bx bx-loader-alt bx-spin'></i> Processando...";
        const arrayBuffer = await file.arrayBuffer();
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.load(arrayBuffer);
        const worksheet = workbook.worksheets[0]; // Pega a primeira aba

        resultadosProcessados = [];

        // Função auxiliar para extrair valores reais (texto, fórmulas, richText)
        const extractValue = (val) => {
            if (val === null || val === undefined) return '';
            if (typeof val === 'object') {
                if (val.result !== undefined) return val.result;
                if (val.richText) return val.richText.map(rt => rt.text).join('');
                if (val.text !== undefined) return val.text;
                return '';
            }
            return val;
        };

        // 1. Procurar as colunas pelo nome do cabeçalho (linha 1) — sem chute de posição
        const col = {};
        worksheet.getRow(1).eachCell((cell, colNumber) => {
            const h = normalizarCabecalho(extractValue(cell.value));
            if (h === 'item id') col.itemId = colNumber;
            else if (h === 'model id') col.modelId = colNumber;
            else if (h.includes('warehouse sku') || h.includes('mt sku id')) col.mtSku = colNumber;
            else if (h === 'id sku do vendedor') col.skuVendedor = colNumber;
            else if (h === 'item name') col.itemName = colNumber;
            else if (h === 'model name') col.modelName = colNumber;
            else if (h.includes('iremos mandar')) col.qtd = colNumber;
        });

        const faltando = [];
        if (!col.qtd) faltando.push('"Iremos Mandar"');
        if (!col.itemId && !col.modelId) faltando.push('"Item ID" / "Model ID"');
        if (faltando.length) {
            showToast(`Coluna ${faltando.join(' e ')} não encontrada na planilha.`, 'error');
            return;
        }

        const lerCelula = (row, colNumber) => colNumber ? String(extractValue(row.getCell(colNumber).value)).trim() : '';
        const semVinculo = [];       // linhas sem SKU Olist resolvido
        const skusSemCadastro = {};  // sku -> sugestão de nome/qtd

        // 2. Extrair os dados e resolver o SKU: Model ID -> Item ID -> ID SKU do Vendedor
        for (let i = 2; i <= worksheet.rowCount; i++) {
            const row = worksheet.getRow(i);

            // Pula as linhas que estão ocultas (filtradas) no Excel
            if (row.hidden) continue;

            const qtd = parseInt(extractValue(row.getCell(col.qtd).value));
            if (isNaN(qtd) || qtd <= 0) continue; // Pula se não tiver quantidade válida

            const itemId = lerCelula(row, col.itemId);
            const modelId = lerCelula(row, col.modelId);
            const mtSku = lerCelula(row, col.mtSku);
            const skuVendedor = lerCelula(row, col.skuVendedor);
            const nomeAnuncio = lerCelula(row, col.itemName);
            const nomeVariacao = lerCelula(row, col.modelName);
            if (!itemId && !modelId) continue;

            const vinculo = anunciosShopee[modelId] || anunciosShopee[itemId];
            let sku = vinculo ? vinculo.sku : '';
            let origem = vinculo ? 'vinculo' : '';
            if (!sku && skuVendedor) {
                sku = skuVendedor;
                origem = 'vendedor';
            }

            // Reserva: cadastro antigo pelo código Shopee (Warehouse SKU)
            const antigo = produtos.find(p => String(p.sku).trim() === mtSku);
            const cadastro = sku ? produtosOlist[sku] : null;
            const nomeVariacaoUtil = nomeVariacao && nomeVariacao !== nomeAnuncio ? ` ${nomeVariacao}` : '';
            const nomeSugerido = antigo ? antigo.name : (vinculo && vinculo.titulo ? vinculo.titulo : nomeAnuncio + nomeVariacaoUtil);
            const qtdCaixa = cadastro ? cadastro.qtd_caixa : (antigo ? antigo.qtd : 1);

            if (!sku || origem === 'vendedor') {
                semVinculo.push({ itemId, modelId, sugestao: sku, anuncio: nomeAnuncio + nomeVariacaoUtil });
            }
            if (sku && !cadastro && !skusSemCadastro[sku]) {
                skusSemCadastro[sku] = { nome: nomeSugerido, qtd_caixa: antigo ? antigo.qtd : '' };
            }

            resultadosProcessados.push({
                id: Date.now() + Math.random(),
                sku: sku,
                item: cadastro ? cadastro.nome : nomeSugerido,
                quantidade: qtd,
                caixas: Math.ceil(qtd / qtdCaixa),
                qtdPorCaixa: qtdCaixa
            });
        }

        ultimaPlanilhaMurilo = file;

        // Reutilizar a lógica de tratar Nomes Duplicados (o alerta antigo fica vazio neste método)
        tratarNomesDuplicadosEGerarTabela([]);
        renderPendencias(semVinculo, skusSemCadastro);

    } catch (error) {
        console.error(error);
        showToast('Erro ao ler a planilha: ' + error.message, 'error');
    } finally {
        btnGenerateExcel.innerHTML = "<i class='bx bx-file'></i> Processar Planilha Importada";
    }
}

function renderPendencias(semVinculo, skusSemCadastro) {
    const skusCadastro = Object.keys(skusSemCadastro);
    if (semVinculo.length === 0 && skusCadastro.length === 0) {
        pendenciasCard.style.display = 'none';
        return;
    }

    // Lista de SKUs conhecidos para autocompletar
    const conhecidos = new Set([...Object.keys(produtosOlist), ...Object.values(anunciosShopee).map(a => a.sku)]);
    document.getElementById('skus-olist-datalist').innerHTML = [...conhecidos].sort().map(s => `<option value="${escapeHtml(s)}">`).join('');

    document.getElementById('pendencias-resumo').innerHTML =
        `<strong>${semVinculo.length}</strong> anúncio(s) sem vínculo com o Olist e <strong>${skusCadastro.length}</strong> SKU(s) sem cadastro. ` +
        `Confira, ajuste se precisar e clique em salvar — da próxima vez eles já saem certos.`;

    document.getElementById('pendencias-vinculos-wrap').style.display = semVinculo.length ? 'block' : 'none';
    document.getElementById('pendencias-vinculos-tbody').innerHTML = semVinculo.map(p => `
        <tr>
            <td>${escapeHtml(p.anuncio)}${p.sugestao ? '<br><small style="color:#f59e0b;">sugestão do "ID SKU do Vendedor" — confira</small>' : ''}</td>
            <td>${escapeHtml(p.modelId || p.itemId)}</td>
            <td><input type="text" class="pend-vinculo" list="skus-olist-datalist" data-id="${escapeHtml(p.modelId || p.itemId)}" value="${escapeHtml(p.sugestao)}" placeholder="SKU do Olist" style="width: 100%; min-width: 220px; padding: 0.4rem;"></td>
        </tr>
    `).join('');

    document.getElementById('pendencias-cadastro-wrap').style.display = skusCadastro.length ? 'block' : 'none';
    document.getElementById('pendencias-cadastro-tbody').innerHTML = skusCadastro.map(sku => `
        <tr>
            <td>${escapeHtml(sku)}</td>
            <td><input type="text" class="pend-nome" data-sku="${escapeHtml(sku)}" value="${escapeHtml(skusSemCadastro[sku].nome)}" style="width: 100%; padding: 0.4rem;"></td>
            <td><input type="number" class="table-input pend-qtd" data-sku="${escapeHtml(sku)}" value="${skusSemCadastro[sku].qtd_caixa}" min="1" placeholder="?"></td>
        </tr>
    `).join('');

    pendenciasCard.style.display = 'block';
}

if (btnSalvarPendencias) {
    btnSalvarPendencias.addEventListener('click', async () => {
        const vinculos = [...document.querySelectorAll('.pend-vinculo')]
            .map(inp => ({ id: inp.dataset.id, sku: inp.value.trim() }))
            .filter(v => v.id && v.sku && !v.sku.includes('/'))
            .map(v => ({ id: v.id, data: { sku: v.sku, titulo: '', origem: 'planilha' } }));

        const cadastros = [];
        const incompletos = [];
        document.querySelectorAll('.pend-nome').forEach(inp => {
            const sku = inp.dataset.sku;
            const nome = inp.value.trim();
            const qtd = parseInt(document.querySelector(`.pend-qtd[data-sku="${CSS.escape(sku)}"]`).value);
            if (!nome || isNaN(qtd) || qtd <= 0) incompletos.push(sku);
            else cadastros.push({ id: sku, data: { sku, nome, qtd_caixa: qtd } });
        });

        if (vinculos.length === 0 && cadastros.length === 0) {
            showToast('Nada preenchido para salvar.', 'error');
            return;
        }
        const aviso = incompletos.length ? `\n\n${incompletos.length} SKU(s) sem nome/qtd por caixa ficam de fora: ${incompletos.slice(0, 5).join(', ')}` : '';
        if (!confirm(`Gravar no banco:\n\n${vinculos.length} vínculo(s) de anúncio\n${cadastros.length} SKU(s) no cadastro${aviso}`)) return;

        const textoOriginal = btnSalvarPendencias.innerHTML;
        btnSalvarPendencias.innerHTML = "<i class='bx bx-loader-alt bx-spin'></i> Gravando...";
        btnSalvarPendencias.disabled = true;
        try {
            if (vinculos.length) await gravarEmLotes('anuncios_shopee', vinculos);
            if (cadastros.length) await gravarEmLotes('produtos_olist', cadastros);
            await loadVinculosFromFirebase();
            showToast('Pendências salvas! Reprocessando...');
            if (ultimaPlanilhaMurilo) await processarPlanilhaMurilo(ultimaPlanilhaMurilo);
        } catch (error) {
            console.error(error);
            showToast('Erro ao salvar pendências: ' + error.message, 'error');
        } finally {
            btnSalvarPendencias.innerHTML = textoOriginal;
            btnSalvarPendencias.disabled = false;
        }
    });
}

// ==========================================================================
// Lógica do Parseador via Inbound (PDF/ZIP) - Método 3
// ==========================================================================
btnGenerateInbound.addEventListener('click', async () => {
    if (produtos.length === 0) {
        showToast('Cadastre ao menos 1 produto na aba Configurações!', 'error');
        return;
    }

    const file = inboundGeneratorUpload.files[0];
    if (!file) {
        showToast('Por favor, selecione um PDF ou ZIP primeiro!', 'error');
        return;
    }

    const ext = file.name.toLowerCase();

    if (ext.endsWith('.pdf') || ext.endsWith('.zip')) {
        try {
            showToast('Lendo Inbound, aguarde...');
            btnGenerateInbound.innerHTML = "<i class='bx bx-loader-alt bx-spin'></i> Processando...";
            let pdfBytes = null;
            
            if (ext.endsWith('.zip')) {
                const zip = await JSZip.loadAsync(file);
                let asnFile = null;
                for (let filename in zip.files) {
                    if (filename.includes('ASN_') && filename.toLowerCase().endsWith('.pdf')) {
                        asnFile = zip.files[filename];
                        break;
                    }
                }
                if (!asnFile) throw new Error("PDF de Separação (ASN_) não encontrado dentro do ZIP!");
                pdfBytes = await asnFile.async("uint8array");
            } else {
                pdfBytes = await readPdfAsUint8Array(file);
            }
            
            const parsedItems = await parseInboundPDF(pdfBytes);
            resultadosProcessados = [];
            const naoCadastrados = [];
            
            for (let row of parsedItems) {
                let blockClean = row.textBlock.toLowerCase().replace(/\s+/g, ' ');
                let blockNoSpace = blockClean.replace(/ /g, '');
                
                let matchedProd = produtos.find(p => {
                    let skuClean = p.sku.toLowerCase().trim();
                    let nameClean = p.name.toLowerCase().trim();
                    let skuNoSpace = skuClean.replace(/ /g, '');
                    return blockClean.includes(skuClean) || 
                           blockClean.includes(nameClean) || 
                           (skuNoSpace.length > 3 && blockNoSpace.includes(skuNoSpace));
                });
                
                let fallback = row.firstTokens.length > 1 ? row.firstTokens[1] : row.firstTokens[0];
                
                // Fallback: se não achou pelo bloco todo, tenta achar só pelo código da shopee extraído!
                if (!matchedProd && row.skuShopee) {
                    matchedProd = produtos.find(p => {
                        let skuNoSpace = p.sku.toLowerCase().replace(/ /g, '');
                        return skuNoSpace.includes(row.skuShopee.toLowerCase());
                    });
                }
                
                let finalName = matchedProd ? matchedProd.name : fallback;
                let caixas = matchedProd ? Math.ceil(row.qty / matchedProd.qtd) : row.qty;
                
                if (!matchedProd) {
                    naoCadastrados.push({
                        sku: fallback,
                        codigo: row.skuShopee || "ERRO LEITURA: " + blockNoSpace.substring(0, 60)
                    });
                }
                
                resultadosProcessados.push({
                    id: Date.now() + Math.random(),
                    item: finalName,
                    quantidade: row.qty,
                    caixas: caixas,
                    qtdPorCaixa: matchedProd ? matchedProd.qtd : 1
                });
            }
            
            tratarNomesDuplicadosEGerarTabela(naoCadastrados);
            
        } catch (err) {
            console.error(err);
            showToast('Erro ao ler o Inbound: ' + err.message, 'error');
        } finally {
            btnGenerateInbound.innerHTML = "<i class='bx bx-list-ol'></i> Processar Inbound";
        }
    } else {
        showToast('Formato não suportado! Use .pdf ou .zip', 'error');
    }
});

// Função extraída para reaproveitar no processamento de texto e de planilha
function tratarNomesDuplicadosEGerarTabela(naoCadastradosArray) {
    // Esconde as pendências da Planilha Murilo (o Método 2 mostra de novo logo depois)
    pendenciasCard.style.display = 'none';

    // Tratar Nomes Duplicados (Adicionar 1, 2, 3...)
    const ocorrencias = {};
    resultadosProcessados.forEach(r => {
        ocorrencias[r.item] = (ocorrencias[r.item] || 0) + 1;
    });
    
    const contadores = {};
    resultadosProcessados.forEach(r => {
        // Se apareceu mais de uma vez, vamos numerar
        if (ocorrencias[r.item] > 1) {
            contadores[r.item] = (contadores[r.item] || 0) + 1;
            r.item = `${r.item} ${contadores[r.item]}`;
        }
    });

    // Exibir Alerta de SKUs Não Cadastrados
    const alertDiv = document.getElementById('missing-skus-alert');
    const alertList = document.getElementById('missing-skus-list');
    
    if (naoCadastradosArray.length > 0) {
        alertList.innerHTML = '';
        naoCadastradosArray.forEach(nc => {
            alertList.innerHTML += `<li>SKU: <strong>${nc.sku}</strong> | Código Shopee: <em>${nc.codigo}</em></li>`;
        });
        alertDiv.style.display = 'block';
    } else {
        alertDiv.style.display = 'none';
    }

    if (resultadosProcessados.length > 0) {
        renderResultTable();
        resultsContainer.style.display = 'block';
        resultsContainer.scrollIntoView({ behavior: 'smooth' });
        showToast(`${resultadosProcessados.length} itens processados!`);
    } else {
        showToast('Nenhum dado válido para processar.', 'error');
    }
}

// ==========================================================================
// Tabela de Resultados e Cálculos Interativos
// ==========================================================================
function renderResultTable() {
    resultTbody.innerHTML = '';
    let totalCaixasCount = 0;
    let sumQuantidade = 0;
    let sumCaixas = 0;

    resultadosProcessados.forEach((item, index) => {
        // Cálculo de volume dinâmico: =SOMA($E$1:E1)+1 & " - " & SOMA($E$2:E2)
        const volumeInicio = totalCaixasCount + 1;
        const volumeFim = totalCaixasCount + item.caixas;
        totalCaixasCount += item.caixas;
        
        sumQuantidade += parseInt(item.quantidade);
        sumCaixas += parseInt(item.caixas);
        
        const volumeStr = `${volumeInicio} - ${volumeFim}`;

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${escapeHtml(item.sku || '')}</td>
            <td>${escapeHtml(item.item)}</td>
            <td></td>
            <td></td>
            <td>
                <input type="number" class="table-input qty-input" data-index="${index}" value="${item.quantidade}" min="1">
            </td>
            <td>
                <input type="number" class="table-input cx-input" data-index="${index}" value="${item.caixas}" min="1">
            </td>
            <td>
                <input type="number" class="table-input qc-input" data-index="${index}" value="${item.qtdPorCaixa}" step="0.01" min="0.01">
            </td>
            <td><span class="volume-cell">${volumeStr}</span></td>
        `;
        resultTbody.appendChild(tr);
    });
    
    // Gera a linha de total idêntica ao do usuário
    const tfoot = document.getElementById('result-tfoot');
    if (tfoot) {
        tfoot.innerHTML = `
            <tr style="font-weight: bold; background: rgba(0,0,0,0.5);">
                <td></td>
                <td style="text-align: center;">Total</td>
                <td></td>
                <td></td>
                <td>${sumQuantidade}</td>
                <td>${sumCaixas}</td>
                <td>Qualquer duvida consultar Pedrão ♥</td>
                <td></td>
            </tr>
        `;
    }

    attachTableEvents();
}

// Atachar eventos de input para recalcular os dados em tempo real
function attachTableEvents() {
    const qtyInputs = document.querySelectorAll('.qty-input');
    const cxInputs = document.querySelectorAll('.cx-input');
    const qcInputs = document.querySelectorAll('.qc-input');

    // Se mudar a Quantidade
    qtyInputs.forEach(input => {
        input.addEventListener('change', (e) => {
            const idx = e.target.dataset.index;
            const newQty = parseInt(e.target.value) || 0;
            
            resultadosProcessados[idx].quantidade = newQty;
            // Recalcula caixas mantendo a qtdPorCaixa
            resultadosProcessados[idx].caixas = Math.ceil(newQty / resultadosProcessados[idx].qtdPorCaixa);
            
            renderResultTable();
        });
    });

    // Se mudar a Qtd por Caixa
    qcInputs.forEach(input => {
        input.addEventListener('change', (e) => {
            const idx = e.target.dataset.index;
            const newQc = parseFloat(e.target.value) || 1;
            
            resultadosProcessados[idx].qtdPorCaixa = newQc;
            // Recalcula caixas mantendo a quantidade
            resultadosProcessados[idx].caixas = Math.ceil(resultadosProcessados[idx].quantidade / newQc);
            
            renderResultTable();
        });
    });

    // Se mudar as Caixas (fórmula inversa)
    cxInputs.forEach(input => {
        input.addEventListener('change', (e) => {
            const idx = e.target.dataset.index;
            const newCx = parseInt(e.target.value) || 1;
            
            resultadosProcessados[idx].caixas = newCx;
            // Recalcula qtd por caixa (=SOMA(Quantidade/Caixas))
            const calcQc = (resultadosProcessados[idx].quantidade / newCx).toFixed(2);
            resultadosProcessados[idx].qtdPorCaixa = parseFloat(calcQc);
            
            renderResultTable();
        });
    });
}

// ==========================================================================
// Gerar e Baixar Excel (Nativo Excel Table)
// ==========================================================================
btnDownload.addEventListener('click', async () => {
    if (typeof ExcelJS === 'undefined') {
        showToast('Biblioteca do Excel ainda não carregou!', 'error');
        return;
    }

    try {
        showToast('Gerando planilha, aguarde...');
        const workbook = new ExcelJS.Workbook();
        const sheet = workbook.addWorksheet('Envio');

        // Configurar as larguras e alinhamentos das colunas
        sheet.columns = [
            { key: 'sku', width: 28 },
            { key: 'item', width: 45 },
            { key: 'confere', width: 12 },
            { key: 'quemFez', width: 15 },
            { key: 'qtd', width: 15 },
            { key: 'caixas', width: 12 },
            { key: 'qtdCaixa', width: 45 },
            { key: 'volume', width: 15 }
        ];

        // Centralizar todas as colunas exceto SKU (A) e Item (B)
        for (let i = 3; i <= 8; i++) {
            sheet.getColumn(i).alignment = { vertical: 'middle', horizontal: 'center' };
        }
        
        // Quantidade (E/5) e Caixas (F/6) em Negrito
        sheet.getColumn(5).font = { bold: true };
        sheet.getColumn(6).font = { bold: true };

        // Pega as linhas do corpo (tbody) e cria a array de arrays
        const rows = document.querySelectorAll('#result-tbody tr');
        let tableRows = [];

        rows.forEach((row, i) => {
            const rowIndex = i + 2; // Cabeçalho é 1, dados começam na 2
            const sku = row.cells[0].innerText.trim();
            const item = row.cells[1].innerText;
            const qtd = parseInt(row.cells[4].querySelector('input').value) || 0;
            const caixas = parseInt(row.cells[5].querySelector('input').value) || 0;

            // Valores pré-calculados que já estão na tela (evita precisar abrir o Excel para calcular a fórmula)
            const qcValue = parseFloat(row.cells[6].querySelector('input').value) || 0;
            const volumeValue = row.cells[7].innerText.trim();

            // Fórmulas usando coordenadas dinâmicas e já injetando o resultado pré-calculado
            const formulaQtdCaixa = { 
                formula: 'SUM(E' + rowIndex + '/F' + rowIndex + ')',
                result: qcValue
            };
            const formulaVolume = { 
                formula: `SUM($F$1:F${rowIndex - 1})+1 & " - " & SUM($F$2:F${rowIndex})`,
                result: volumeValue
            };

            tableRows.push([
                sku,
                item, 
                '', 
                '', 
                qtd, 
                caixas, 
                formulaQtdCaixa, 
                formulaVolume
            ]);
        });

        // Adicionar Tabela Nativa do Excel
        sheet.addTable({
            name: 'TabelaEnvio',
            ref: 'A1',
            headerRow: true,
            totalsRow: true,
            style: {
                theme: 'TableStyleMedium1', // Table preta/cinza padrão
                showRowStripes: true,
            },
            columns: [
                { name: 'SKU Olist', filterButton: true },
                { name: 'Item', totalsRowLabel: 'Total', filterButton: true },
                { name: 'Confere', filterButton: true },
                { name: 'Quem Fez?', filterButton: true },
                { name: 'Quantidade', totalsRowFunction: 'sum', filterButton: true },
                { name: 'Caixas', totalsRowFunction: 'sum', filterButton: true },
                { name: 'Quantidade por Caixa', totalsRowLabel: 'Qualquer duvida consultar Pedrão ♥', filterButton: true },
                { name: 'Volume', filterButton: true }
            ],
            rows: tableRows
        });

        // Aplicar o fundo preto com letras brancas no cabeçalho (apenas para garantir o design)
        sheet.getRow(1).eachCell(cell => {
            cell.fill = {
                type: 'pattern',
                pattern: 'solid',
                fgColor: { argb: 'FF000000' }
            };
            cell.font = {
                color: { argb: 'FFFFFFFF' },
                bold: true
            };
        });
        
        // Estilizar linha de Total (a última linha adicionada)
        const totalRowIndex = tableRows.length + 2;
        sheet.getRow(totalRowIndex).eachCell(cell => {
            cell.font = { bold: true };
        });
        
        // Forçar o texto do Pedrão no rodapé caso a tabela do ExcelJS omita o totalsRowLabel
        sheet.getCell('G' + totalRowIndex).value = 'Qualquer duvida consultar Pedrão ♥';
        // O rótulo "Total" fica na coluna Item (B), não na SKU (A)
        sheet.getCell('A' + totalRowIndex).value = '';
        sheet.getCell('B' + totalRowIndex).value = 'Total';

        // Aplicar Bordas em todas as células da tabela (de A1 até a última coluna e linha)
        for (let rIdx = 1; rIdx <= totalRowIndex; rIdx++) {
            const rowRef = sheet.getRow(rIdx);
            for (let cIdx = 1; cIdx <= 8; cIdx++) {
                const cell = rowRef.getCell(cIdx);
                cell.border = {
                    top: {style:'thin'},
                    left: {style:'thin'},
                    bottom: {style:'thin'},
                    right: {style:'thin'}
                };
            }
        }

        // Gerar arquivo e baixar
        const buffer = await workbook.xlsx.writeBuffer();
        const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        saveAs(blob, 'Envio_Shopee.xlsx');
        
        showToast('Planilha gerada com fórmulas do Excel!');
    } catch (e) {
        console.error(e);
        showToast('Erro ao gerar a planilha.', 'error');
    }
});

// ==========================================================================
// Enviar Direto para Impressão
// ==========================================================================
let isPlanilhaCarregadaDireta = false; // Flag para saber se veio do botão direto

const btnPrintDirect = document.getElementById('btn-print-direct');
if (btnPrintDirect) {
    btnPrintDirect.addEventListener('click', () => {
        // Constrói a lista impItems direto da tabela atual
        impItems = [];
        const rows = document.querySelectorAll('#result-tbody tr');
        rows.forEach(row => {
            const item = row.cells[1].innerText.trim();
            const volume = row.cells[7].innerText.trim();
            if (item && volume) {
                impItems.push({
                    product: item,
                    volume: volume
                });
            }
        });

        if (impItems.length === 0) {
            showToast('Nenhum item válido para enviar.', 'error');
            return;
        }

        // Seta a flag
        isPlanilhaCarregadaDireta = true;
        
        // Atualiza UI da aba de impressão
        impExcelFileName.textContent = "Carregada do Sistema ✅";
        impExcelUpload.parentElement.style.borderColor = "#10b981";
        impExcelUpload.parentElement.style.background = "rgba(16, 185, 129, 0.1)";

        // Muda para a aba do impressor
        document.querySelector('.tab-btn[data-tab="impressor"]').click();
        
        showToast('Planilha carregada! Falta apenas o PDF das etiquetas.', 'success');
        checkStartCondition();
    });
}

// ==========================================================================
// Imprimir Tabela (Impressora Física)
// ==========================================================================
const btnPrintPaper = document.getElementById('btn-print-paper');
if (btnPrintPaper) {
    btnPrintPaper.addEventListener('click', () => {
        window.print();
    });
}

// ==========================================================================
// Toast Utility
// ==========================================================================
function showToast(message, type = 'success') {
    toastEl.innerText = message;
    if (type === 'error') {
        toastEl.classList.add('error');
    } else {
        toastEl.classList.remove('error');
    }
    
    toastEl.classList.add('show');
    
    setTimeout(() => {
        toastEl.classList.remove('show');
    }, 3000);
}

// ==========================================================================
// Lógica do Impressor Automático
// ==========================================================================
const impExcelUpload = document.getElementById('impressor-excel-upload');
const impPdfUpload = document.getElementById('impressor-pdf-upload');
const impExcelFileName = document.getElementById('impressor-excel-file-name');
const impPdfFileName = document.getElementById('impressor-pdf-file-name');
const btnStart = document.getElementById('btn-start');

const impSetupSection = document.getElementById('setup-section');
const impPrintSection = document.getElementById('print-section');

const productNameEl = document.getElementById('product-name');
const volumeValueEl = document.getElementById('volume-value');
const currentIndexEl = document.getElementById('current-index');
const totalItemsEl = document.getElementById('total-items');
const progressFill = document.getElementById('progress-fill');

const btnPrev = document.getElementById('btn-prev');
const btnNext = document.getElementById('btn-next');
const btnPrint = document.getElementById('btn-print');

// Estado da Aplicação - Impressor
let impItems = []; 
let originalPdfBytes = null;
let currentIndex = 0;
let isPrinting = false;

// Event Listeners para Uploads
impExcelUpload.addEventListener('change', (e) => {
    if (e.target.files.length > 0) {
        impExcelFileName.textContent = e.target.files[0].name;
        e.target.parentElement.classList.add('active');
        checkStartCondition();
    }
});

impPdfUpload.addEventListener('change', (e) => {
    if (e.target.files.length > 0) {
        impPdfFileName.textContent = e.target.files[0].name;
        e.target.parentElement.classList.add('active');
        checkStartCondition();
    }
});

function checkStartCondition() {
    const hasExcel = isPlanilhaCarregadaDireta || impExcelUpload.files.length > 0;
    const hasPdf = impPdfUpload.files.length > 0;
    
    if (hasExcel && hasPdf) {
        btnStart.disabled = false;
    } else {
        btnStart.disabled = true;
    }
}

// Iniciar Processo
btnStart.addEventListener('click', async () => {
    btnStart.disabled = true;
    btnStart.innerHTML = "<i class='bx bx-loader-alt bx-spin'></i> Processando...";
    
    try {
        if (!isPlanilhaCarregadaDireta) {
            await loadExcel(impExcelUpload.files[0]);
        }
        await loadPDF(impPdfUpload.files[0]);
        
        if (impItems.length === 0) {
            showToast('Nenhum dado válido encontrado na planilha.', 'error');
            btnStart.disabled = false;
            btnStart.innerHTML = "<i class='bx bx-play-circle'></i> Iniciar Processo";
            return;
        }

        // Sucesso, transição de tela
        impSetupSection.style.display = 'none';
        impPrintSection.style.display = 'flex';
        
        currentIndex = 0;
        updateUI();
        showToast('Arquivos carregados com sucesso!');
        
    } catch (error) {
        console.error(error);
        showToast('Erro ao processar os arquivos: ' + error.message, 'error');
        btnStart.disabled = false;
        btnStart.innerHTML = "<i class='bx bx-play-circle'></i> Iniciar Processo";
    }
});

// Navegação
btnPrev.addEventListener('click', () => {
    if (currentIndex > 0) {
        currentIndex--;
        updateUI();
    }
});

btnNext.addEventListener('click', () => {
    if (currentIndex < impItems.length - 1) {
        currentIndex++;
        updateUI();
    }
});

// Função Principal de Impressão
btnPrint.addEventListener('click', async () => {
    if (isPrinting) return;
    
    const currentItem = impItems[currentIndex];
    if (!currentItem || !currentItem.volume) {
        showToast('Volume inválido para impressão.', 'error');
        return;
    }

    // Fazer parse do volume "X - Y" ou "X"
    let startPage, endPage;
    try {
        const parts = currentItem.volume.toString().split('-').map(p => parseInt(p.trim()));
        startPage = parts[0];
        endPage = parts.length > 1 ? parts[1] : parts[0];
        
        if (isNaN(startPage) || isNaN(endPage)) throw new Error("Formato inválido");
    } catch (e) {
        showToast(`Formato de volume não reconhecido: ${currentItem.volume}`, 'error');
        return;
    }

    try {
        isPrinting = true;
        btnPrint.innerHTML = "<i class='bx bx-loader-alt bx-spin'></i> Preparando...";
        btnPrint.disabled = true;

        // Criar um novo PDF com apenas as páginas selecionadas
        const { PDFDocument, StandardFonts, rgb } = PDFLib;
        const pdfDoc = await PDFDocument.load(originalPdfBytes);
        const newPdfDoc = await PDFDocument.create();
        
        const pageIndices = [];
        for (let i = startPage; i <= endPage; i++) {
            pageIndices.push(i - 1); 
        }

        const maxPage = pdfDoc.getPageCount();
        const validIndices = pageIndices.filter(i => i >= 0 && i < maxPage);
        
        if (validIndices.length === 0) {
            throw new Error(`As páginas ${startPage}-${endPage} não existem no PDF (Total: ${maxPage}).`);
        }

        const copiedPages = await newPdfDoc.copyPages(pdfDoc, validIndices);
        copiedPages.forEach((page) => {
            newPdfDoc.addPage(page);
        });

        // Adicionar uma página extra no final com o nome do produto
        let pageDims = { width: 595.28, height: 841.89 };
        if (copiedPages.length > 0) {
            pageDims = copiedPages[0].getSize();
        }
        
        const extraPage = newPdfDoc.addPage([pageDims.width, pageDims.height]);
        const font = await newPdfDoc.embedFont(StandardFonts.HelveticaBold);
        
        const text = currentItem.product || "Produto";
        let textSize = 30;
        let textWidth = font.widthOfTextAtSize(text, textSize);
        
        while (textWidth > pageDims.width - 40 && textSize > 8) {
            textSize -= 2;
            textWidth = font.widthOfTextAtSize(text, textSize);
        }

        extraPage.drawText(text, {
            x: (pageDims.width - textWidth) / 2,
            y: (pageDims.height / 2) - (textSize / 2),
            size: textSize,
            font: font,
            color: rgb(0, 0, 0)
        });

        // Adicionar script de auto-impressão
        newPdfDoc.addJavaScript('print', 'this.print({bUI:true,bSilent:false,bShrinkToFit:true});');

        const pdfBytes = await newPdfDoc.save();
        const blob = new Blob([pdfBytes], { type: 'application/pdf' });
        const blobUrl = URL.createObjectURL(blob);

        printPDFBlob(blobUrl);
        
    } catch (error) {
        console.error(error);
        showToast('Erro ao preparar impressão: ' + error.message, 'error');
        isPrinting = false;
        btnPrint.innerHTML = "<i class='bx bx-printer'></i> Imprimir Este Volume";
        btnPrint.disabled = false;
    }
});

function printPDFBlob(url) {
    let iframe = document.getElementById('print-iframe');
    if (!iframe) {
        iframe = document.createElement('iframe');
        iframe.id = 'print-iframe';
        document.body.appendChild(iframe);
    }
    
    iframe.src = url;
    
    iframe.onload = () => {
        setTimeout(() => {
            try {
                iframe.focus();
                iframe.contentWindow.print();
                showToast('Tela de impressão aberta!');
            } catch (e) {
                console.warn('Iframe print falhou, tentando fallback', e);
                window.open(url, '_blank');
                showToast('Aberto em nova aba para impressão!');
            }
            
            isPrinting = false;
            btnPrint.innerHTML = "<i class='bx bx-printer'></i> Imprimir Este Volume";
            btnPrint.disabled = false;
            
        }, 800); 
    };
}

function updateUI() {
    const item = impItems[currentIndex];
    productNameEl.textContent = item.product || "Desconhecido";
    volumeValueEl.textContent = item.volume || "N/A";
    
    currentIndexEl.textContent = currentIndex + 1;
    totalItemsEl.textContent = impItems.length;
    
    const progress = ((currentIndex + 1) / impItems.length) * 100;
    progressFill.style.width = `${progress}%`;
    
    btnPrev.disabled = currentIndex === 0;
    btnNext.disabled = currentIndex === impItems.length - 1;
}

function loadExcel(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const data = new Uint8Array(e.target.result);
                const workbook = XLSX.read(data, { type: 'array' });
                
                const firstSheetName = workbook.SheetNames[0];
                const worksheet = workbook.Sheets[firstSheetName];
                
                const json = XLSX.utils.sheet_to_json(worksheet, { defval: "" });
                
                impItems = [];
                json.forEach(row => {
                    const productStr = row["Item"] || row["Produto"] || row["Nome"] || Object.values(row)[0];
                    const volumeStr = row["Volumes"] || row["Volume"] || row["Paginas"];
                    
                    if (productStr && volumeStr) {
                        impItems.push({
                            product: String(productStr).trim(),
                            volume: String(volumeStr).trim()
                        });
                    }
                });
                
                resolve();
            } catch (error) {
                reject(error);
            }
        };
        reader.onerror = reject;
        reader.readAsArrayBuffer(file);
    });
}

function loadPDF(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                if (file.name.toLowerCase().endsWith('.zip')) {
                    showToast('Descompactando arquivo ZIP... aguarde!', 'success');
                    const zipData = new Uint8Array(e.target.result);
                    const zip = await JSZip.loadAsync(zipData);
                    
                    const pdfFiles = Object.values(zip.files).filter(f => !f.dir && f.name.toLowerCase().endsWith('.pdf'));
                    
                    if (pdfFiles.length === 0) {
                        throw new Error("Nenhum arquivo PDF encontrado dentro do ZIP.");
                    }
                    
                    // Ordenação natural (ex: part1, part2, part10)
                    const collator = new Intl.Collator(undefined, {numeric: true, sensitivity: 'base'});
                    pdfFiles.sort((a, b) => collator.compare(a.name, b.name));
                    
                    showToast(`Juntando ${pdfFiles.length} arquivos PDF... aguarde!`, 'success');
                    
                    const { PDFDocument } = PDFLib;
                    const mergedPdf = await PDFDocument.create();
                    
                    for (const pdfFile of pdfFiles) {
                        const pdfData = await pdfFile.async('uint8array');
                        const tempDoc = await PDFDocument.load(pdfData);
                        const copiedPages = await mergedPdf.copyPages(tempDoc, tempDoc.getPageIndices());
                        copiedPages.forEach((page) => mergedPdf.addPage(page));
                    }
                    
                    originalPdfBytes = await mergedPdf.save();
                } else {
                    originalPdfBytes = new Uint8Array(e.target.result);
                }
                resolve();
            } catch (error) {
                reject(error);
            }
        };
        reader.onerror = reject;
        reader.readAsArrayBuffer(file);
    });
}

// ==========================================================================
// ABA: Imprimir Produtos
// ==========================================================================
let prodOriginalPdfBytes = null;
let inboundPdfBytes = null;
let prodItems = [];
let prodCurrentIndex = 0;
let prodBlobUrl = null;

const prodPdfUpload = document.getElementById('prod-pdf-upload');
const prodPdfFileName = document.getElementById('prod-pdf-file-name');
const shopeeInputProd = document.getElementById('shopee-input-prod');
const inboundPdfUpload = document.getElementById('inbound-pdf-upload');
const inboundPdfFileName = document.getElementById('inbound-pdf-file-name');
const btnStartProd = document.getElementById('btn-start-prod');

const setupSectionProd = document.getElementById('setup-section-prod');
const printSectionProd = document.getElementById('print-section-prod');
const progressFillProd = document.getElementById('progress-fill-prod');
const currentIndexProd = document.getElementById('current-index-prod');
const totalItemsProd = document.getElementById('total-items-prod');
const productNameProd = document.getElementById('product-name-prod');
const productSkuProd = document.getElementById('product-sku-prod');
const volumeValueProd = document.getElementById('volume-value-prod');
const btnPrevProd = document.getElementById('btn-prev-prod');
const btnNextProd = document.getElementById('btn-next-prod');
const btnPrintProd = document.getElementById('btn-print-prod');

function checkProdStartReady() {
    if (prodOriginalPdfBytes && (shopeeInputProd.value.trim() !== '' || inboundPdfBytes)) {
        btnStartProd.removeAttribute('disabled');
    } else {
        btnStartProd.setAttribute('disabled', 'true');
    }
}

prodPdfUpload.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (file) {
        prodPdfFileName.textContent = "Carregando...";
        try {
            // Se precisar suportar ZIP aqui depois, podemos replicar o código do Impressor de Volumes
            // Mas por enquanto, vamos ler apenas PDF direto.
            prodOriginalPdfBytes = await readPdfAsUint8Array(file);
            prodPdfFileName.textContent = file.name;
            checkProdStartReady();
        } catch (error) {
            showToast('Erro ao carregar o PDF', 'error');
            prodPdfFileName.textContent = "Erro";
            prodOriginalPdfBytes = null;
        }
    }
});

shopeeInputProd.addEventListener('input', () => {
    if (shopeeInputProd.value.trim() !== '') {
        inboundPdfBytes = null;
        inboundPdfUpload.value = '';
        inboundPdfFileName.textContent = 'Nenhum arquivo';
    }
    checkProdStartReady();
});

inboundPdfUpload.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (file) {
        inboundPdfFileName.textContent = "Carregando...";
        try {
            if (file.name.toLowerCase().endsWith('.zip')) {
                const zip = await JSZip.loadAsync(file);
                let asnFile = null;
                
                // Procurar arquivo que comece com ASN_ e termine com .pdf
                for (let filename in zip.files) {
                    if (filename.includes('ASN_') && filename.toLowerCase().endsWith('.pdf')) {
                        asnFile = zip.files[filename];
                        break;
                    }
                }
                
                if (!asnFile) {
                    throw new Error("PDF de Separação (ASN_) não encontrado dentro do ZIP!");
                }
                
                inboundPdfBytes = await asnFile.async("uint8array");
            } else {
                inboundPdfBytes = await readPdfAsUint8Array(file);
            }
            
            inboundPdfFileName.textContent = file.name;
            shopeeInputProd.value = '';
            checkProdStartReady();
        } catch (error) {
            showToast('Erro ao carregar o Inbound: ' + error.message, 'error');
            inboundPdfFileName.textContent = "Erro";
            inboundPdfBytes = null;
        }
    }
});

function readPdfAsUint8Array(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(new Uint8Array(e.target.result));
        reader.onerror = reject;
        reader.readAsArrayBuffer(file);
    });
}

btnStartProd.addEventListener('click', async () => {
    let parsedItems = [];
    
    if (inboundPdfBytes) {
        showToast('Lendo PDF Inbound...', 'success');
        btnStartProd.innerHTML = "<i class='bx bx-loader-alt bx-spin'></i> Processando...";
        btnStartProd.disabled = true;
        
        try {
            const extractedRows = await parseInboundPDF(inboundPdfBytes);
            for (let row of extractedRows) {
                let blockClean = row.textBlock.toLowerCase().replace(/\s+/g, ' ');
                let blockNoSpace = blockClean.replace(/ /g, '');
                
                let matchedProd = produtos.find(p => {
                    let skuClean = p.sku.toLowerCase().trim();
                    let nameClean = p.name.toLowerCase().trim();
                    let skuNoSpace = skuClean.replace(/ /g, '');
                    
                    return blockClean.includes(skuClean) || 
                           blockClean.includes(nameClean) || 
                           (skuNoSpace.length > 3 && blockNoSpace.includes(skuNoSpace));
                });
                
                let skuFinal = matchedProd ? matchedProd.sku : row.firstTokens[1] || 'Desconhecido';
                let nameFinal = matchedProd ? matchedProd.name : row.firstTokens[1] || 'Desconhecido';
                
                parsedItems.push({
                    name: nameFinal,
                    sku: skuFinal,
                    qtd: row.qty
                });
            }
        } catch (err) {
            console.error(err);
            showToast('Erro ao extrair dados do PDF Inbound.', 'error');
            btnStartProd.innerHTML = "<i class='bx bx-play-circle'></i> Processar e Imprimir";
            btnStartProd.disabled = false;
            return;
        }
    } else {
        const text = shopeeInputProd.value;
        const lines = text.split('\n').map(l => l.trim());
        
        // Parseador (idêntico ao do Gerador de Planilha)
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            let skuDesconhecido = null;
            
            let prod = produtos.find(p => p.sku.trim().toLowerCase() === line.trim().toLowerCase() || p.name.trim().toLowerCase() === line.trim().toLowerCase());
            
            if (!prod && i + 1 < lines.length) {
                const nextLineIsShopeeCode = /^\d+_\d+$/.test(lines[i+1]);
                const iAmNotShopeeCode = !/^\d+_\d+$/.test(line);
                if (nextLineIsShopeeCode && iAmNotShopeeCode && line !== '-' && line !== '') {
                    let nextLineCadastrada = produtos.find(p => p.sku.trim().toLowerCase() === lines[i+1].trim().toLowerCase());
                    if (!nextLineCadastrada) skuDesconhecido = line;
                }
            }
            
            if (prod || skuDesconhecido) {
                let qtdEnviada = 0;
                let tempQtds = [];
                for (let j = 1; j <= 15; j++) {
                    if (i + j >= lines.length) break;
                    const nextLine = lines[i + j];
                    if (produtos.some(p => p.sku.trim().toLowerCase() === nextLine.trim().toLowerCase())) break;
                    if (nextLine.toLowerCase().includes('peças')) break;
                    if (j > 2 && i + j + 1 < lines.length && /^\d+_\d+$/.test(lines[i + j + 1]) && !/^\d+_\d+$/.test(nextLine)) break;
                    
                    if (!nextLine.includes('_') && nextLine !== '-') {
                        const num = parseInt(nextLine);
                        if (!isNaN(num) && num > 0) tempQtds.push(num);
                    }
                }
                if (tempQtds.length > 0) qtdEnviada = tempQtds[tempQtds.length - 1];
                
                if (qtdEnviada > 0) {
                    parsedItems.push({
                        name: prod ? prod.name : skuDesconhecido,
                        sku: prod ? prod.sku : skuDesconhecido,
                        qtd: qtdEnviada
                    });
                }
            }
        }
    }
    
    if (parsedItems.length === 0) {
        showToast('Nenhum produto válido encontrado no texto!', 'error');
        return;
    }
    
    // VERIFICAÇÃO DE SEGURANÇA: Qtd Lida == Total Páginas PDF
    showToast('Validando segurança e estrutura do PDF...', 'success');
    btnStartProd.innerHTML = "<i class='bx bx-loader-alt bx-spin'></i> Processando...";
    btnStartProd.disabled = true;
    
    try {
        const { PDFDocument } = PDFLib;
        const pdfDoc = await PDFDocument.load(prodOriginalPdfBytes);
        const totalPdfPages = pdfDoc.getPageCount();
        
        let totalParsedQtd = parsedItems.reduce((acc, item) => acc + item.qtd, 0);
        
        if (totalParsedQtd !== totalPdfPages) {
            alert(`⛔ ALERTA DE SEGURANÇA ⛔\n\nA quantidade de etiquetas no texto (${totalParsedQtd}) NÃO BATE com a quantidade de páginas do PDF (${totalPdfPages}).\n\nOperação cancelada para evitar mistura de etiquetas! Verifique se você não esqueceu de copiar algum pedaço do texto ou se fez upload do PDF errado.`);
            showToast('Validação de segurança falhou!', 'error');
            btnStartProd.innerHTML = "<i class='bx bx-play-circle'></i> Processar e Imprimir";
            btnStartProd.disabled = false;
            return;
        }
        
        // Gerando os Ranges de páginas fatiadas
        prodItems = [];
        let currentPage = 1;
        for (let item of parsedItems) {
            let startPage = currentPage;
            let endPage = currentPage + item.qtd - 1;
            prodItems.push({
                product: item.name,
                sku: item.sku,
                volume: `${startPage} - ${endPage}`
            });
            currentPage = endPage + 1;
        }
        
        prodCurrentIndex = 0;
        totalItemsProd.textContent = prodItems.length;
        
        setupSectionProd.style.display = 'none';
        printSectionProd.style.display = 'flex';
        
        renderProdPrintView();
        showToast('Tudo pronto! Fatiamento feito com sucesso.', 'success');
        
    } catch (error) {
        showToast('Erro ao ler o PDF!', 'error');
        console.error(error);
        btnStartProd.innerHTML = "<i class='bx bx-play-circle'></i> Processar e Imprimir";
        btnStartProd.disabled = false;
    }
});

async function renderProdPrintView() {
    if (prodItems.length === 0) return;
    const currentItem = prodItems[prodCurrentIndex];
    
    currentIndexProd.textContent = prodCurrentIndex + 1;
    productNameProd.textContent = currentItem.product;
    productSkuProd.textContent = `SKU: ${currentItem.sku}`;
    volumeValueProd.textContent = `Páginas: ${currentItem.volume}`;
    
    const progress = ((prodCurrentIndex) / prodItems.length) * 100;
    progressFillProd.style.width = `${progress}%`;
    
    btnPrevProd.disabled = (prodCurrentIndex === 0);
    btnNextProd.disabled = (prodCurrentIndex === prodItems.length - 1);

    // Gerar preview da 1ª página e injetar no iframe
    try {
        const [startPageStr] = currentItem.volume.replace('Páginas: ', '').split('-');
        const startPage = parseInt(startPageStr);
        
        const { PDFDocument } = PDFLib;
        const srcDoc = await PDFDocument.load(prodOriginalPdfBytes);
        const previewDoc = await PDFDocument.create();
        
        const [previewPage] = await previewDoc.copyPages(srcDoc, [startPage - 1]);
        previewDoc.addPage(previewPage);
        
        const pdfBytes = await previewDoc.save();
        const blob = new Blob([pdfBytes], { type: 'application/pdf' });
        const blobUrl = URL.createObjectURL(blob);
        
        document.getElementById('prod-preview-iframe').src = blobUrl + '#toolbar=0&navpanes=0&scrollbar=0&view=Fit';
    } catch (e) {
        console.error("Erro ao gerar preview", e);
    }
}

btnPrevProd.addEventListener('click', () => {
    if (prodCurrentIndex > 0) {
        prodCurrentIndex--;
        renderProdPrintView();
    }
});

btnNextProd.addEventListener('click', () => {
    if (prodCurrentIndex < prodItems.length - 1) {
        prodCurrentIndex++;
        renderProdPrintView();
    }
});

btnPrintProd.addEventListener('click', async () => {
    try {
        btnPrintProd.innerHTML = "<i class='bx bx-loader-alt bx-spin'></i> Preparando...";
        btnPrintProd.disabled = true;

        const currentItem = prodItems[prodCurrentIndex];
        const [startPageStr, endPageStr] = currentItem.volume.replace('Páginas: ', '').split('-').map(s => s.trim());
        const startPage = parseInt(startPageStr);
        const endPage = parseInt(endPageStr);
        
        showToast(`Preparando impressão de ${currentItem.product}...`, 'success');
        
        const { PDFDocument } = PDFLib;
        const srcDoc = await PDFDocument.load(prodOriginalPdfBytes);
        const newPdf = await PDFDocument.create();
        
        const pageIndices = [];
        for (let i = startPage - 1; i <= endPage - 1; i++) {
            pageIndices.push(i);
        }
        
        const copiedPages = await newPdf.copyPages(srcDoc, pageIndices);
        copiedPages.forEach((page) => newPdf.addPage(page));
        
        // Auto-print popup code
        newPdf.addJavaScript('print', 'this.print({bUI:true,bSilent:false,bShrinkToFit:true});');
        
        const pdfBytes = await newPdf.save();
        const blob = new Blob([pdfBytes], { type: 'application/pdf' });
        
        if (prodBlobUrl) {
            URL.revokeObjectURL(prodBlobUrl);
        }
        prodBlobUrl = URL.createObjectURL(blob);
        
        // Sistema de Impressão (Iframe com Fallback)
        let iframe = document.getElementById('prod-print-iframe-hidden');
        if (!iframe) {
            iframe = document.createElement('iframe');
            iframe.id = 'prod-print-iframe-hidden';
            iframe.style.display = 'none';
            document.body.appendChild(iframe);
        }
        
        iframe.src = prodBlobUrl;
        
        iframe.onload = () => {
            setTimeout(() => {
                try {
                    iframe.focus();
                    iframe.contentWindow.print();
                    showToast('Tela de impressão aberta!');
                } catch (e) {
                    console.warn('Iframe print falhou, usando aba', e);
                    window.open(prodBlobUrl, '_blank');
                    showToast('Aberto em nova aba para impressão!');
                }
                
                btnPrintProd.innerHTML = "<i class='bx bx-printer'></i> Imprimir Este Produto";
                btnPrintProd.disabled = false;
            }, 800);
        };
        
        const progress = ((prodCurrentIndex + 1) / prodItems.length) * 100;
        progressFillProd.style.width = `${progress}%`;
        
    } catch (error) {
        console.error(error);
        showToast('Erro ao preparar o PDF para impressão', 'error');
        btnPrintProd.innerHTML = "<i class='bx bx-printer'></i> Imprimir Este Produto";
        btnPrintProd.disabled = false;
    }
});

// ==========================================================================
// Parsing do PDF Inbound (Shopee) via PDF.js
// ==========================================================================
async function parseInboundPDF(pdfBytes) {
    if (!window.pdfjsLib) {
        throw new Error("PDF.js não está carregado");
    }
    const loadingTask = window.pdfjsLib.getDocument({ data: pdfBytes });
    const pdf = await loadingTask.promise;
    
    let allItems = [];
    
    // 1. Coletar todos os itens de todas as páginas
    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
        const page = await pdf.getPage(pageNum);
        const textContent = await page.getTextContent();
        // Offset gigante para não misturar Y de páginas diferentes
        const yOffset = (pdf.numPages - pageNum) * 3000;
        
        textContent.items.forEach(item => {
            let str = item.str.trim();
            if (str) {
                allItems.push({
                    str: str,
                    x: item.transform[4],
                    y: item.transform[5] + yOffset
                });
            }
        });
    }

    // 2. Ordenar globalmente: cima para baixo (Y desc) e da esquerda pra direita (X asc)
    allItems.sort((a, b) => {
        if (Math.abs(a.y - b.y) > 4) {
            return b.y - a.y;
        }
        return a.x - b.x;
    });

    // 3. Agrupar em linhas horizontais para melhor estruturação
    let tempLines = [];
    let currentY = null;
    let currentTempLine = [];
    
    allItems.forEach(item => {
        if (currentY === null || Math.abs(currentY - item.y) > 4) {
            if (currentTempLine.length > 0) tempLines.push(currentTempLine);
            currentY = item.y;
            currentTempLine = [item];
        } else {
            currentTempLine.push(item);
        }
    });
    if (currentTempLine.length > 0) tempLines.push(currentTempLine);
    
    // 4. Descobrir a posição X da coluna "No." dinamicamente através da MODA (valor mais comum)
    let leftNumbersX = [];
    tempLines.forEach(line => {
        // Pega o primeiro número encostado à esquerda da linha
        let numItem = line.find(i => /^\d+$/.test(i.str.trim()));
        if (numItem && numItem.x < 250) {
            leftNumbersX.push(numItem.x);
        }
    });
    
    // Agrupa os valores de X (arredondados de 5 em 5) para descobrir onde a coluna "No." realmente está
    let counts = {};
    leftNumbersX.forEach(x => {
        let rounded = Math.round(x / 5) * 5;
        counts[rounded] = (counts[rounded] || 0) + 1;
    });
    
    let baseNumberX = 50; // valor padrão seguro
    let maxCount = 0;
    for (let x in counts) {
        if (counts[x] > maxCount) {
            maxCount = counts[x];
            baseNumberX = parseInt(x);
        }
    }

    // 5. Agrupar linhas horizontais em "Rows" da tabela, filtrando rodapés
    let tableRows = [];
    let currentRowLines = [];
    
    tempLines.forEach(hLine => {
        let firstItem = hLine[0];
        
        // Verifica se é início de linha: o primeiro item tem que ser número e o X tem que estar bem colado na base
        // Diminui a tolerância para 15 pts para não confundir com números do SKU (como "01") que ficam um pouco mais pra direita
        let isRowStart = firstItem && /^\d+$/.test(firstItem.str.trim()) && Math.abs(firstItem.x - baseNumberX) <= 15;
        
        // Verifica se chegamos no rodapé ou cabeçalho que não nos interessa
        let isFooter = hLine.some(i => i.str.toLowerCase().includes('total') || i.str.toLowerCase().includes('notas'));
        
        if (isFooter) {
            if (currentRowLines.length > 0) {
                tableRows.push(currentRowLines);
                currentRowLines = [];
            }
            return; // Ignora esta linha horizontal (ex: Total 483)
        }

        if (isRowStart) {
            if (currentRowLines.length > 0) {
                tableRows.push(currentRowLines);
            }
            currentRowLines = [hLine];
        } else {
            if (currentRowLines.length > 0) {
                currentRowLines.push(hLine);
            }
        }
    });
    if (currentRowLines.length > 0) {
        tableRows.push(currentRowLines);
    }
    
    // 5.5 Descobrir a posição X da coluna "Qnt Aprovada" no documento TODO
    // Como a quantidade é sempre a última coluna, pegamos o item mais à direita do PDF inteiro que seja um número
    let numberItems = allItems.filter(i => /^\d+$/.test(i.str.trim()));
    let globalMaxX = numberItems.length > 0 ? Math.max(...numberItems.map(i => i.x)) : 750;

    let parsedRows = [];
    
    // 6. Processar cada linha da tabela para extrair texto e quantidade isolada
    for (let rowLines of tableRows) {
        // Achata a linha para lidar com todos os itens dela
        let rowItems = rowLines.flat();
        if (rowItems.length < 3) continue; // Ignorar lixo
        
        // Em vez de calcular o maxX da linha (que pode pegar o código de barras se a qtd estiver na linha de cima),
        // usamos o limite direito global do documento! Tolerância de 35 pontos.
        let qtyItems = rowItems.filter(i => i.x >= globalMaxX - 35);
        
        // Garante que as partes da quantidade estejam em ordem de cima pra baixo (ex: "1" e "0")
        qtyItems.sort((a, b) => b.y - a.y);
        
        // Junta os pedaços num texto só
        let qtyString = qtyItems.map(i => i.str).join('');
        let qty = parseInt(qtyString.replace(/\D/g, '')); // Extrai apenas os números e faz o parse
        
        if (!isNaN(qty) && qty > 0) {
            // Para reconstruir o texto da linha corretamente, agrupamos os itens por coluna (X).
            // Aumentei a tolerância do X para 45 pontos, pois partes de um mesmo código podem estar ligeiramente desalinhadas.
            let colSortedItems = [...rowItems].sort((a, b) => {
                if (Math.abs(a.x - b.x) > 45) return a.x - b.x;
                return b.y - a.y; // Y descrescente (cima pra baixo na mesma coluna)
            });
            
            let textBlock = colSortedItems.map(i => i.str).join(' ');
            
            // Pega o ID do SKU (ex: 24937478346_246855735384) para usar de fallback usando regex
            // Como removemos os espaços para a regex, ele vai achar o ID mesmo que tenha quebrado de linha
            let blockNoSpace = textBlock.replace(/\s+/g, '');
            let skuMatch = blockNoSpace.match(/\d{8,}_\d{8,}/);
            
            // Se não achar o ID gigante, tenta o SKU do vendedor (que geralmente fica na 2ª coluna)
            let fallbackName = skuMatch ? skuMatch[0] : (rowLines[0].length > 1 ? rowLines[0][1].str : 'Desconhecido');
            
            parsedRows.push({
                textBlock: textBlock,
                qty: qty,
                firstTokens: [rowLines[0][0].str, fallbackName],
                skuShopee: skuMatch ? skuMatch[0] : null
            });
        }
    }

    return parsedRows;
}
