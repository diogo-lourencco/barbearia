"use strict";

document.addEventListener("DOMContentLoaded", async () => {
  if (typeof WJ === "undefined") {
    console.error("O arquivo global.js não foi carregado.");
    return;
  }

  try {
    const autorizado = await WJ.init("financeiro");
    if (autorizado === false) return;
  } catch (erro) {
    console.error("Erro de autenticação:", erro);
    return;
  }

  const $ = (id) => document.getElementById(id);

  const form = $("transactionForm");
  const section = $("transactionSection");
  const table = $("transactionTable");

  if (!form || !section || !table) {
    console.error("O HTML do Financeiro está incompleto.");
    return;
  }

  const campos = {
    id: $("transactionId"),
    tipo: $("transactionType"),
    data: $("transactionDate"),
    cliente: $("clientName"),
    whatsapp: $("clientWhatsapp"),
    descricao: $("transactionDescription"),
    categoria: $("transactionCategory"),
    valor: $("transactionValue"),
    pagamento: $("transactionPayment"),
    observacoes: $("transactionNotes")
  };

  const categorias = {
    Receita: [
      "Corte masculino",
      "Barba",
      "Corte + barba",
      "Sobrancelha",
      "Progressiva",
      "Alisante",
      "Luzes",
      "Platinado",
      "Hidratação",
      "Produtos vendidos",
      "Outros serviços",
      "Outras receitas"
    ],

    Despesa: [
      "Produtos e materiais",
      "Aluguel",
      "Água",
      "Energia elétrica",
      "Internet",
      "Salários",
      "Comissões",
      "Manutenção",
      "Marketing",
      "Impostos",
      "Outras despesas"
    ]
  };

  const pagamentos = ["Pix", "Cartão", "Dinheiro"];

  let movimentacoes = [];
  let produtos = [];

  let salvando = false;
  let excluindo = false;
  let carregando = false;

  /* =====================================================
     ÍCONE OFICIAL DO WHATSAPP

     SVG incorporado diretamente ao botão.
     Não depende da biblioteca Lucide.
  ===================================================== */

  const iconeWhatsapp = `
    <svg
      class="whatsapp-icon"
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 16 16"
      fill="currentColor"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M13.601 2.326A7.85 7.85 0 0 0 8.01 0C3.654 0 .11 3.542.108 7.894c0 1.391.363 2.75 1.054 3.949L.042 15.93l4.184-1.096a7.9 7.9 0 0 0 3.781.963h.003c4.356 0 7.9-3.542 7.902-7.895a7.85 7.85 0 0 0-2.311-5.576zM8.01 14.463a6.58 6.58 0 0 1-3.357-.919l-.241-.143-2.488.652.664-2.425-.156-.249a6.56 6.56 0 0 1-1.005-3.484c.002-3.619 2.951-6.566 6.586-6.566a6.54 6.54 0 0 1 4.654 1.928 6.54 6.54 0 0 1 1.927 4.654c-.002 3.618-2.952 6.565-6.584 6.565m3.61-4.913c-.198-.099-1.174-.579-1.356-.645-.182-.066-.314-.099-.446.099-.132.198-.512.645-.628.777-.116.132-.231.149-.43.05-.198-.1-.837-.309-1.595-.985-.59-.526-.988-1.176-1.104-1.374-.116-.198-.012-.305.087-.404.089-.089.198-.231.297-.347.1-.116.132-.198.198-.33.066-.132.033-.248-.017-.347-.05-.099-.446-1.075-.611-1.472-.161-.387-.325-.334-.446-.34l-.38-.006a.73.73 0 0 0-.529.248c-.182.198-.694.678-.694 1.654s.711 1.918.81 2.05c.1.132 1.4 2.137 3.391 2.996.474.205.844.327 1.132.418.476.151.909.13 1.251.079.382-.057 1.174-.48 1.34-.943.165-.463.165-.86.115-.943-.049-.083-.181-.132-.38-.231"/>
    </svg>
  `;

  /* =====================================================
     FUNÇÕES AUXILIARES
  ===================================================== */

  function moeda(valor) {
    return WJ.money(Number(valor || 0));
  }

  function escapar(valor) {
    return WJ.escape(String(valor ?? ""));
  }

  function dataSimples(valor) {
    return String(valor || "").slice(0, 10);
  }

  function ehReceita(item) {
    return String(item.tipo || "").toLowerCase() === "receita";
  }

  function ehVenda(item) {
    return item.origem === "venda_produto";
  }

  function tipoExibicao(tipo) {
    return String(tipo || "").toLowerCase() === "despesa"
      ? "Despesa"
      : "Receita";
  }

  function descricao(item) {
    return item.descricao || item.desc || "Movimentação";
  }

  function nomeCliente(item) {
    return item.cliente_nome || item.cliente || "";
  }

  function telefoneCliente(item) {
    return item.cliente_whatsapp || item.whatsapp || "";
  }

  function notas(item) {
    return item.observacoes || item.obs || "";
  }

  function dinheiroCentavos(valor) {
    return Math.round((Number(valor) + Number.EPSILON) * 100) / 100;
  }

  function quantidadeMil(valor) {
    return Math.round(Number(valor) * 1000) / 1000;
  }

  function atualizarIcones() {
    if (
      window.lucide &&
      typeof window.lucide.createIcons === "function"
    ) {
      window.lucide.createIcons();
    }
  }

  function aviso(mensagem) {
    if (typeof WJ.toast === "function") {
      WJ.toast(mensagem);
    } else {
      window.alert(mensagem);
    }
  }

  function erroOperacao(erro) {
    console.error("Erro no Financeiro:", erro);

    aviso(
      erro?.message ||
      "Não foi possível concluir a operação."
    );
  }

  /* =====================================================
     WHATSAPP — VALIDAR NÚMERO
  ===================================================== */

  function normalizarWhatsapp(numero) {
    const digitos = String(numero || "").replace(/\D/g, "");

    if (!digitos) return "";

    // Celular ou fixo brasileiro com DDD.
    if (digitos.length === 10 || digitos.length === 11) {
      return "55" + digitos;
    }

    // Número que já possui código 55.
    if (
      digitos.startsWith("55") &&
      (digitos.length === 12 || digitos.length === 13)
    ) {
      return digitos;
    }

    return null;
  }

  /* =====================================================
     WHATSAPP — MENSAGEM PERSONALIZADA
  ===================================================== */

  function abrirWhatsapp(item) {
    const numero = normalizarWhatsapp(
      telefoneCliente(item)
    );

    if (!numero) {
      aviso("Cadastre um WhatsApp válido para este cliente.");
      return;
    }

    const nome = nomeCliente(item).trim();

    const primeiroNome = nome
      ? nome.split(/\s+/)[0]
      : "meu parceiro";

    let mensagem;

    if (ehVenda(item)) {
      mensagem =
        `Fala, ${primeiroNome}! \n\n` +
        `Aqui é da Barbearia WJ!\n\n` +
        `Obrigado pela confiança em nosso trabalho.\n\n` +
        `Sempre que precisar, estamos por aqui!\n\n` +
        `Tamo junto! 👊`;
    } else {
      mensagem =
        `Fala, ${primeiroNome}! \n\n` +
        `Aqui é da Barbearia WJ!\n\n` +
        `Obrigado pela confiança e por escolher nossa barbearia.\n\n` +
        `Esperamos que tenha curtido o atendimento!\n\n` +
        `Quando precisar dar aquele talento no visual, é só chamar.\n\n` +
        `Tamo junto e até o próximo corte!`;
    }

    const url =
      `https://wa.me/${numero}?text=` +
      encodeURIComponent(mensagem);

    // Abre o WhatsApp com a mensagem preenchida.
    // O envio é confirmado manualmente no aplicativo.
    window.open(url, "_blank", "noopener,noreferrer");
  }

  /* =====================================================
     BOTÕES RÁPIDOS DO CELULAR
  ===================================================== */

  function criarAcoesRapidas() {
    const content = document.querySelector(
      ".main > .content"
    );

    const heading = content?.querySelector(".heading");

    if (!heading || $("financeQuickIncome")) return;

    const actions = document.createElement("div");

    actions.className = "finance-quick-actions";

    actions.innerHTML = `
      <button
        type="button"
        class="finance-quick finance-quick-income"
        id="financeQuickIncome"
      >
        <i data-lucide="plus-circle"></i>
        <span>Nova entrada</span>
      </button>

      <button
        type="button"
        class="finance-quick finance-quick-expense"
        id="financeQuickExpense"
      >
        <i data-lucide="minus-circle"></i>
        <span>Nova despesa</span>
      </button>
    `;

    heading.insertAdjacentElement("afterend", actions);

    $("financeQuickIncome").addEventListener(
      "click",
      () => abrirFormulario(null, "Receita")
    );

    $("financeQuickExpense").addEventListener(
      "click",
      () => abrirFormulario(null, "Despesa")
    );
  }

  /* =====================================================
     NAVEGAÇÃO INFERIOR
  ===================================================== */

  function criarMenuMobile() {
    if (document.querySelector(".finance-mobile-nav")) {
      return;
    }

    const nav = document.createElement("nav");
    nav.className = "finance-mobile-nav";

    nav.setAttribute(
      "aria-label",
      "Navegação principal"
    );

    nav.innerHTML = `
      <a href="dashboard.html">
        <i data-lucide="house"></i>
        <span>Início</span>
      </a>

      <a
        href="financeiro.html"
        class="active"
        aria-current="page"
      >
        <i data-lucide="wallet"></i>
        <span>Financeiro</span>
      </a>

      <a href="estoque.html">
        <i data-lucide="boxes"></i>
        <span>Estoque</span>
      </a>

      <a href="consumo.html">
        <i data-lucide="clipboard-list"></i>
        <span>Consumo</span>
      </a>

      <button
        type="button"
        id="financeMenuMobile"
        aria-label="Abrir menu"
        aria-expanded="false"
      >
        <i data-lucide="menu"></i>
        <span>Menu</span>
      </button>
    `;

    const overlay = document.createElement("div");
    overlay.className = "finance-menu-overlay";
    overlay.hidden = true;

    document.body.append(overlay, nav);

    const menu = $("financeMenuMobile");

    function obterSidebar() {
      return document.querySelector(".sidebar");
    }

    function sincronizarMenu() {
      const aberto = !!obterSidebar()?.classList.contains(
        "open"
      );

      overlay.hidden = !aberto;

      menu.setAttribute(
        "aria-expanded",
        String(aberto)
      );

      document.body.classList.toggle(
        "finance-menu-open",
        aberto
      );
    }

    function fecharMenu() {
      obterSidebar()?.classList.remove("open");
      sincronizarMenu();
    }

    menu.addEventListener("click", () => {
      const sidebar = obterSidebar();

      if (!sidebar) return;

      sidebar.classList.toggle("open");
      sincronizarMenu();
    });

    overlay.addEventListener("click", fecharMenu);

    document.addEventListener("keydown", (evento) => {
      if (evento.key === "Escape") {
        fecharMenu();
      }
    });

    window.addEventListener("resize", () => {
      if (window.innerWidth > 760) {
        fecharMenu();
      }
    });
  }

  /* =====================================================
     PAINEL DE VENDA DE PRODUTOS
  ===================================================== */

  const painelVenda = document.createElement("section");

  painelVenda.className = "sale-panel";
  painelVenda.id = "financeProductPanel";
  painelVenda.hidden = true;

  painelVenda.innerHTML = `
    <div class="sale-panel-header">

      <div class="sale-panel-icon">
        <i data-lucide="shopping-bag"></i>
      </div>

      <div class="sale-panel-heading">
        <strong>Venda de produto</strong>

        <span>
          Registre a venda e atualize o estoque
          automaticamente.
        </span>
      </div>

      <span class="sale-panel-tag">
        ESTOQUE
      </span>

    </div>

    <div class="sale-panel-fields">

      <div class="sale-field sale-field-product">
        <label for="financeProduct">Produto</label>

        <select id="financeProduct">
          <option value="">
            Selecione um produto
          </option>
        </select>
      </div>

      <div class="sale-field">
        <label for="financeProductQty">
          Quantidade
        </label>

        <input
          type="number"
          id="financeProductQty"
          min="0.001"
          step="0.001"
          value="1"
        >
      </div>

      <div class="sale-field">
        <label for="financeSaleUnitPrice">
          Preço unitário (R$)
        </label>

        <input
          type="number"
          id="financeSaleUnitPrice"
          min="0.01"
          step="0.01"
          placeholder="35.00"
          inputmode="decimal"
        >
      </div>
    </div>

    <div
      class="sale-panel-stock"
      id="financeProductInfo"
    >
      Selecione um produto do estoque.
    </div>

    <div class="sale-panel-total">

      <div>
        <span class="sale-total-label">
          TOTAL DA VENDA
        </span>

        <small id="financeTotalDetails">
          Quantidade × preço
        </small>
      </div>

      <strong id="financeTotalDisplay">
        R$ 0,00
      </strong>
    </div>
  `;

  section.querySelector(".form-grid")
    .insertAdjacentElement("afterend", painelVenda);

  const produtoInput = $("financeProduct");
  const quantidadeInput = $("financeProductQty");
  const precoInput = $("financeSaleUnitPrice");

  function modoVenda() {
    return (
      !campos.id.value &&
      tipoExibicao(campos.tipo.value) === "Receita" &&
      campos.categoria.value === "Produtos vendidos"
    );
  }

  function preencherProdutos() {
    const anterior = produtoInput.value;

    produtoInput.replaceChildren(
      new Option("Selecione um produto", "")
    );

    produtos.forEach((produto) => {
      const quantidade = Number(produto.quantidade || 0);

      const rotulo =
        `${produto.nome} — ` +
        quantidade.toLocaleString("pt-BR", {
          maximumFractionDigits: 3
        }) +
        ` ${produto.unidade || "un"}`;

      const option = new Option(
        rotulo,
        String(produto.id)
      );

      option.disabled = quantidade <= 0;

      produtoInput.add(option);
    });

    if (
      produtos.some((produto) =>
        String(produto.id) === anterior &&
        Number(produto.quantidade) > 0
      )
    ) {
      produtoInput.value = anterior;
    }

    atualizarVenda();
  }

  function atualizarVenda() {
    const produto = produtos.find(
      (item) => String(item.id) === produtoInput.value
    );

    const quantidade = Number(quantidadeInput.value);
    const preco = Number(precoInput.value);

    const total =
      Number.isFinite(quantidade) &&
      quantidade > 0 &&
      Number.isFinite(preco) &&
      preco > 0
        ? dinheiroCentavos(quantidade * preco)
        : 0;

    $("financeProductInfo").textContent = produto
      ? (
          "Disponível: " +
          Number(produto.quantidade).toLocaleString(
            "pt-BR",
            { maximumFractionDigits: 3 }
          ) +
          ` ${produto.unidade || "un"}`
        )
      : "Selecione um produto do estoque.";

    $("financeTotalDisplay").textContent = moeda(total);

    $("financeTotalDetails").textContent = total > 0
      ? `${quantidade} × ${moeda(preco)}`
      : "Informe quantidade e preço.";
  }

  function atualizarCamposVenda() {
    const ativo = modoVenda();

    painelVenda.hidden = !ativo;

    const campoDescricao = campos.descricao.closest(".field");
    const campoValor = campos.valor.closest(".field");

    if (campoDescricao) campoDescricao.hidden = ativo;
    if (campoValor) campoValor.hidden = ativo;

    campos.descricao.required = !ativo;
    campos.valor.required = !ativo;

    produtoInput.required = ativo;
    quantidadeInput.required = ativo;
    precoInput.required = ativo;

    if (ativo) preencherProdutos();
  }

  produtoInput.addEventListener("change", atualizarVenda);
  quantidadeInput.addEventListener("input", atualizarVenda);
  precoInput.addEventListener("input", atualizarVenda);

  /* =====================================================
     CATEGORIAS
  ===================================================== */

  function atualizarCategorias(selecionada = "") {
    const tipo = tipoExibicao(campos.tipo.value);
    const lista = categorias[tipo] || [];

    campos.categoria.replaceChildren(
      ...lista.map((nome) => new Option(nome, nome))
    );

    if (selecionada && !lista.includes(selecionada)) {
      campos.categoria.add(
        new Option(selecionada, selecionada)
      );
    }

    if (selecionada) {
      campos.categoria.value = selecionada;
    }

    atualizarCamposVenda();
  }

  function atualizarCamposCliente() {
    const mostrar =
      tipoExibicao(campos.tipo.value) === "Receita";

    document.querySelectorAll(
      "[data-client-field]"
    ).forEach((elemento) => {
      elemento.hidden = !mostrar;
    });

    if ($("clientHint")) {
      $("clientHint").hidden = !mostrar;
    }

    campos.cliente.disabled = !mostrar;
    campos.whatsapp.disabled = !mostrar;
  }

  campos.tipo.addEventListener("change", () => {
    atualizarCategorias();
    atualizarCamposCliente();
  });

  campos.categoria.addEventListener(
    "change",
    atualizarCamposVenda
  );

  /* =====================================================
     ABRIR FORMULÁRIO
  ===================================================== */

  function abrirFormulario(
    item = null,
    tipo = "Receita"
  ) {
    if (salvando) return;

    if (item && ehVenda(item)) {
      aviso(
        "Vendas de produtos devem ser canceladas, não editadas."
      );
      return;
    }

    form.reset();

    campos.id.value = item?.id ?? "";
    campos.tipo.value = item
      ? tipoExibicao(item.tipo)
      : tipo;

    campos.data.value = item
      ? dataSimples(item.data)
      : WJ.today();

    campos.cliente.value = item
      ? nomeCliente(item)
      : "";

    campos.whatsapp.value = item
      ? telefoneCliente(item)
      : "";

    campos.descricao.value = item
      ? descricao(item)
      : "";

    campos.valor.value = item
      ? Number(item.valor).toFixed(2)
      : "";

    campos.pagamento.value = item?.pagamento || "Pix";

    campos.observacoes.value = item
      ? notas(item)
      : "";

    produtoInput.value = "";
    quantidadeInput.value = "1";
    precoInput.value = "";

    atualizarCategorias(item?.categoria || "");
    atualizarCamposCliente();

    $("formTitle").textContent = item
      ? "Editar movimentação"
      : tipo === "Despesa"
        ? "Nova despesa"
        : "Nova entrada";

    const textoSalvar = $("saveTransaction").querySelector(
      "span"
    );

    if (textoSalvar) {
      textoSalvar.textContent = item
        ? "Salvar alterações"
        : "Salvar movimentação";
    }

    section.hidden = false;

    section.scrollIntoView({
      behavior: "smooth",
      block: "start"
    });

    // Não abre teclado automaticamente no celular.
    if (window.innerWidth > 760) {
      campos.descricao.focus({
        preventScroll: true
      });
    }

    atualizarIcones();
  }

  function fecharFormulario() {
    if (!salvando) {
      section.hidden = true;
    }
  }

  $("newTransaction").addEventListener(
    "click",
    () => abrirFormulario()
  );

  $("closeForm").addEventListener(
    "click",
    fecharFormulario
  );

  $("cancelForm").addEventListener(
    "click",
    fecharFormulario
  );

  /* =====================================================
     SALVAR MOVIMENTAÇÃO NO POSTGRESQL
  ===================================================== */

  form.addEventListener("submit", async (evento) => {
    evento.preventDefault();

    if (salvando) return;

    const tipo = tipoExibicao(
      campos.tipo.value
    ).toLowerCase();

    const pagamento = campos.pagamento.value;
    const id = campos.id.value;

    if (!pagamentos.includes(pagamento)) {
      aviso("Escolha Pix, Cartão ou Dinheiro.");
      return;
    }

    const telefone =
      tipo === "receita"
        ? normalizarWhatsapp(campos.whatsapp.value)
        : "";

    if (telefone === null) {
      aviso("Informe um WhatsApp válido com DDD.");
      return;
    }

    let endpoint = "/financeiro";
    let metodo = id ? "PUT" : "POST";
    let dados;

    const venda = modoVenda();

    /* VENDA DE PRODUTO */

    if (venda) {
      const produto = produtos.find(
        (item) => String(item.id) === produtoInput.value
      );

      const quantidade = Number(quantidadeInput.value);
      const preco = Number(precoInput.value);

      if (!produto) {
        aviso("Selecione um produto do estoque.");
        return;
      }

      if (
        !Number.isFinite(quantidade) ||
        quantidade <= 0 ||
        quantidadeMil(quantidade) !== quantidade
      ) {
        aviso("Informe uma quantidade válida.");
        return;
      }

      if (quantidade > Number(produto.quantidade)) {
        aviso("Estoque insuficiente.");
        return;
      }

      if (
        !Number.isFinite(preco) ||
        preco <= 0 ||
        dinheiroCentavos(preco) !== preco
      ) {
        aviso("Informe um preço válido.");
        return;
      }

      const total = dinheiroCentavos(
        quantidade * preco
      );

      if (
        !Number.isFinite(total) ||
        total <= 0 ||
        total > 9999999999.99
      ) {
        aviso("O valor total da venda é inválido.");
        return;
      }

      endpoint = "/financeiro/vendas";
      metodo = "POST";

      dados = {
        produto_id: produto.id,
        quantidade,
        preco_unitario: preco,
        data: campos.data.value,
        cliente_nome: campos.cliente.value.trim(),
        cliente_whatsapp: telefone || "",
        pagamento,
        observacoes: campos.observacoes.value.trim()
      };

    /* RECEITA OU DESPESA MANUAL */

    } else {
      const valor = Number(campos.valor.value);
      const textoDescricao = campos.descricao.value.trim();

      if (
        !Number.isFinite(valor) ||
        valor <= 0 ||
        valor > 9999999999.99 ||
        dinheiroCentavos(valor) !== valor
      ) {
        aviso("Informe um valor válido maior que zero.");
        return;
      }

      if (
        !textoDescricao ||
        textoDescricao.length > 250
      ) {
        aviso("Informe uma descrição válida.");
        return;
      }

      if (id) {
        endpoint += `/${encodeURIComponent(id)}`;
      }

      dados = {
        tipo,
        data: campos.data.value,
        descricao: textoDescricao,
        categoria: campos.categoria.value,
        valor,
        pagamento,
        cliente_nome:
          tipo === "receita"
            ? campos.cliente.value.trim()
            : "",
        cliente_whatsapp: telefone || "",
        observacoes: campos.observacoes.value.trim()
      };
    }

    salvando = true;

    const botaoSalvar = $("saveTransaction");
    botaoSalvar.disabled = true;

    try {
      await WJ.api(endpoint, {
        method: metodo,
        body: JSON.stringify(dados)
      });

      section.hidden = true;

      aviso(
        id
          ? "Movimentação atualizada!"
          : venda
            ? "Venda registrada e estoque atualizado!"
            : "Movimentação salva!"
      );

      await carregarDados();

    } catch (erro) {
      erroOperacao(erro);

    } finally {
      salvando = false;
      botaoSalvar.disabled = false;
    }
  });

  /* =====================================================
     CONSULTAR FINANCEIRO E ESTOQUE
  ===================================================== */

  async function carregarDados() {
    if (carregando) return;

    carregando = true;

    try {
      const resposta = await WJ.api("/financeiro");

      if (!Array.isArray(resposta)) {
        throw new Error(
          "A API retornou uma lista financeira inválida."
        );
      }

      movimentacoes = resposta;

      try {
        const estoque = await WJ.api("/estoque");

        if (Array.isArray(estoque)) {
          produtos = estoque;
        } else if (Array.isArray(estoque?.produtos)) {
          produtos = estoque.produtos;
        } else {
          produtos = [];
        }
      } catch (erroEstoque) {
        console.warn(
          "Estoque indisponível:",
          erroEstoque
        );

        produtos = [];
      }

      preencherProdutos();
      renderizar();

    } catch (erro) {
      erroOperacao(erro);

      $("resultsCount").textContent =
        "Não foi possível carregar as movimentações.";

    } finally {
      carregando = false;
    }
  }

  /* =====================================================
     FILTROS
  ===================================================== */

  function filtrar() {
    const busca = $("searchTransaction").value
      .trim()
      .toLocaleLowerCase("pt-BR");

    const tipo = $("filterType").value.toLowerCase();
    const mes = $("filterMonth").value;

    return movimentacoes
      .filter((item) => {
        const texto = [
          descricao(item),
          item.categoria,
          nomeCliente(item),
          telefoneCliente(item),
          item.pagamento
        ]
          .join(" ")
          .toLocaleLowerCase("pt-BR");

        const buscaOk = texto.includes(busca);

        const tipoOk =
          !tipo ||
          String(item.tipo).toLowerCase() === tipo;

        const mesOk =
          !mes ||
          dataSimples(item.data).startsWith(mes);

        return buscaOk && tipoOk && mesOk;
      })
      .sort((a, b) => {
        const porData = dataSimples(b.data)
          .localeCompare(dataSimples(a.data));

        return porData || Number(b.id) - Number(a.id);
      });
  }

  /* =====================================================
     RESUMO FINANCEIRO
  ===================================================== */

  function renderizarTotais(lista) {
    let entradas = 0;
    let saidas = 0;

    lista.forEach((item) => {
      const valor = Number(item.valor || 0);

      if (ehReceita(item)) {
        entradas += valor;
      } else {
        saidas += valor;
      }
    });

    const saldo = entradas - saidas;

    $("totalRevenue").textContent = moeda(entradas);
    $("totalExpenses").textContent = moeda(saidas);
    $("totalBalance").textContent = moeda(saldo);

    $("totalTransactions").textContent =
      String(lista.length);

    $("totalBalance").classList.toggle(
      "bad",
      saldo < 0
    );

    $("totalBalance").classList.toggle(
      "accent",
      saldo >= 0
    );
  }

  /* =====================================================
     BOTÕES DO HISTÓRICO
  ===================================================== */

  function botoesTabela(item) {
    const id = escapar(item.id);
    const botoes = [];

    /* WHATSAPP */

    if (
      ehReceita(item) &&
      normalizarWhatsapp(telefoneCliente(item))
    ) {
      botoes.push(`
        <button
          type="button"
          class="whatsapp-action"
          data-action="whatsapp"
          data-id="${id}"
          aria-label="Enviar mensagem pelo WhatsApp"
        >
          ${iconeWhatsapp}
          <span>Enviar WhatsApp</span>
        </button>
      `);
    }

    /* CANCELAMENTO DE VENDA */

    if (ehVenda(item)) {
      botoes.push(`
        <button
          type="button"
          class="delete-action"
          data-action="cancel-sale"
          data-id="${id}"
        >
          <i data-lucide="rotate-ccw"></i>
          <span>Cancelar venda</span>
        </button>
      `);

    /* MOVIMENTAÇÕES NORMAIS */

    } else {
      botoes.push(`
        <button
          type="button"
          class="edit-action"
          data-action="edit"
          data-id="${id}"
        >
          <i data-lucide="pencil"></i>
          <span>Editar</span>
        </button>
      `);

      botoes.push(`
        <button
          type="button"
          class="delete-action"
          data-action="delete"
          data-id="${id}"
        >
          <i data-lucide="trash-2"></i>
          <span>Excluir</span>
        </button>
      `);
    }

    return botoes.join("");
  }

  /* =====================================================
     TABELA / CARTÕES DO HISTÓRICO
  ===================================================== */

  function renderizarTabela(lista) {
    if (!lista.length) {
      table.innerHTML = `
        <tr class="finance-empty-row">
          <td colspan="8" class="empty-row">
            Nenhuma movimentação encontrada.
          </td>
        </tr>
      `;

      return;
    }

    table.innerHTML = lista.map((item) => {
      const entrada = ehReceita(item);

      const classePagamento =
        item.pagamento === "Pix"
          ? "pix"
          : item.pagamento === "Cartão"
            ? "card"
            : item.pagamento === "Dinheiro"
              ? "cash"
              : "";

      const observacaoHtml = notas(item)
        ? `
          <span class="transaction-notes">
            ${escapar(notas(item))}
          </span>
        `
        : "";

      const telefoneHtml = telefoneCliente(item)
        ? `
          <span class="client-phone">
            ${escapar(telefoneCliente(item))}
          </span>
        `
        : "";

      return `
        <tr>

          <td data-label="Data">
            ${escapar(WJ.date(item.data))}
          </td>

          <td data-label="Cliente">
            <span class="client-name">
              ${escapar(nomeCliente(item) || "Não informado")}
            </span>
            ${telefoneHtml}
          </td>

          <td data-label="Descrição">
            <span class="transaction-description">
              ${escapar(descricao(item))}
            </span>

            ${
              ehVenda(item)
                ? `
                  <span class="transaction-notes">
                    Venda de produto do estoque
                  </span>
                `
                : ""
            }

            ${observacaoHtml}
          </td>

          <td data-label="Categoria">
            ${escapar(item.categoria || "-")}
          </td>

          <td data-label="Tipo">
            <span class="type-badge ${
              entrada ? "revenue" : "expense"
            }">
              ${entrada ? "Receita" : "Despesa"}
            </span>
          </td>

          <td data-label="Pagamento">
            <span class="payment-badge ${classePagamento}">
              ${escapar(item.pagamento || "-")}
            </span>
          </td>

          <td
            data-label="Valor"
            class="${entrada ? "good" : "bad"}"
          >
            ${entrada ? "+" : "−"} ${moeda(item.valor)}
          </td>

          <td data-label="Ações">
            <div class="table-actions">
              ${botoesTabela(item)}
            </div>
          </td>

        </tr>
      `;
    }).join("");
  }

  function renderizar() {
    const lista = filtrar();

    renderizarTotais(lista);
    renderizarTabela(lista);

    $("resultsCount").textContent =
      `${lista.length} movimentação${
        lista.length === 1 ? "" : "ões"
      }`;

    // Atualiza somente os ícones Lucide.
    // O SVG do WhatsApp já está pronto no HTML.
    atualizarIcones();
  }

  /* =====================================================
     WHATSAPP, EDITAR, EXCLUIR E CANCELAR
  ===================================================== */

  table.addEventListener("click", async (evento) => {
    const botao = evento.target.closest(
      "button[data-action]"
    );

    if (!botao || salvando || excluindo) return;

    const item = movimentacoes.find(
      (registro) =>
        String(registro.id) === botao.dataset.id
    );

    if (!item) {
      aviso("Movimentação não encontrada.");
      return;
    }

    const acao = botao.dataset.action;

    if (acao === "whatsapp") {
      abrirWhatsapp(item);
      return;
    }

    if (acao === "edit") {
      abrirFormulario(item);
      return;
    }

    if (
      acao !== "delete" &&
      acao !== "cancel-sale"
    ) {
      return;
    }

    if (
      acao === "cancel-sale" &&
      !ehVenda(item)
    ) {
      return;
    }

    const mensagemConfirmacao =
      acao === "cancel-sale"
        ? (
            `Cancelar a venda "${descricao(item)}"?\n\n` +
            "O valor sairá do Financeiro e o produto " +
            "retornará ao estoque."
          )
        : (
            `Excluir "${descricao(item)}"?\n\n` +
            "Essa ação não pode ser desfeita."
          );

    if (!window.confirm(mensagemConfirmacao)) {
      return;
    }

    excluindo = true;

    const botoes = table.querySelectorAll(
      "button[data-action]"
    );

    botoes.forEach((itemBotao) => {
      itemBotao.disabled = true;
    });

    try {
      const endpoint =
        acao === "cancel-sale"
          ? (
              `/financeiro/${encodeURIComponent(item.id)}` +
              "/cancelar-venda"
            )
          : `/financeiro/${encodeURIComponent(item.id)}`;

      await WJ.api(endpoint, {
        method: "DELETE"
      });

      aviso(
        acao === "cancel-sale"
          ? "Venda cancelada e estoque devolvido!"
          : "Movimentação excluída!"
      );

      await carregarDados();

    } catch (erro) {
      erroOperacao(erro);

    } finally {
      excluindo = false;

      botoes.forEach((itemBotao) => {
        itemBotao.disabled = false;
      });
    }
  });

  /* =====================================================
     FILTROS DO HISTÓRICO
  ===================================================== */

  $("searchTransaction").addEventListener(
    "input",
    renderizar
  );

  $("filterType").addEventListener(
    "change",
    renderizar
  );

  $("filterMonth").addEventListener(
    "change",
    renderizar
  );

  $("clearFilters").addEventListener("click", () => {
    $("searchTransaction").value = "";
    $("filterType").value = "";
    $("filterMonth").value = "";

    renderizar();
  });

  /* =====================================================
     EXPORTAÇÃO CSV
  ===================================================== */

  $("exportCSV").addEventListener("click", () => {
    const lista = filtrar();

    if (!lista.length) {
      aviso("Não há movimentações para exportar.");
      return;
    }

    function campoCSV(valor) {
      let texto = String(valor ?? "");

      // Evita que o Excel execute fórmulas
      // enviadas em campos de texto.
      if (/^\s*[=+\-@]/.test(texto)) {
        texto = "'" + texto;
      }

      return '"' + texto.replace(/"/g, '""') + '"';
    }

    const linhas = [
      [
        "Data",
        "Cliente",
        "WhatsApp",
        "Descrição",
        "Categoria",
        "Tipo",
        "Pagamento",
        "Valor",
        "Observações"
      ],

      ...lista.map((item) => [
        dataSimples(item.data),
        nomeCliente(item),
        telefoneCliente(item),
        descricao(item),
        item.categoria,
        tipoExibicao(item.tipo),
        item.pagamento,
        Number(item.valor || 0)
          .toFixed(2)
          .replace(".", ","),
        notas(item)
      ])
    ];

    const conteudo =
      "\uFEFF" +
      linhas
        .map((linha) => linha.map(campoCSV).join(";"))
        .join("\r\n");

    const blob = new Blob([conteudo], {
      type: "text/csv;charset=utf-8"
    });

    const url = URL.createObjectURL(blob);

    const link = document.createElement("a");

    link.href = url;
    link.download = "financeiro-barbearia-wj.csv";

    document.body.appendChild(link);
    link.click();
    link.remove();

    window.setTimeout(() => {
      URL.revokeObjectURL(url);
    }, 1000);

    aviso("Relatório exportado!");
  });

  /* =====================================================
     INICIAR O FINANCEIRO
  ===================================================== */

  atualizarCategorias();
  atualizarCamposCliente();

  // Mostra o mês atual por padrão.
  $("filterMonth").value = WJ.today().slice(0, 7);

  document.body.classList.add("finance-mobile-ui");

  document.querySelector(
    ".main > .content"
  )?.classList.add("finance-mobile-page");

  criarAcoesRapidas();
  criarMenuMobile();

  atualizarIcones();

  await carregarDados();

  /* =====================================================
     ATUALIZAR AO RETORNAR AO SISTEMA
  ===================================================== */

  document.addEventListener("visibilitychange", () => {
    if (
      !document.hidden &&
      !salvando &&
      !excluindo
    ) {
      carregarDados();
    }
  });

  window.addEventListener("pageshow", (evento) => {
    if (
      evento.persisted &&
      !salvando &&
      !excluindo
    ) {
      carregarDados();
    }
  });
});
