"use strict";

document.addEventListener("DOMContentLoaded", async () => {

  /* =====================================================
     AUTENTICAÇÃO
  ===================================================== */

  if (typeof WJ === "undefined") {
    console.error("global.js não foi carregado.");
    return;
  }

  try {
    const autorizado = await WJ.init("estoque");

    if (autorizado === false) {
      return;
    }

  } catch (erro) {
    console.error("Falha na autenticação:", erro);
    return;
  }

  /* =====================================================
     ELEMENTOS
  ===================================================== */

  const $ = (id) => document.getElementById(id);

  const form = $("stockForm");
  const tableBody = $("stockRows");
  const searchInput = $("searchStock");
  const filterInput = $("filterStock");

  if (!form || !tableBody || !searchInput || !filterInput) {
    console.error("Elementos do Estoque não encontrados.");
    return;
  }

  const cadastro = {
    id: $("stockId"),
    nome: $("stockName"),
    unidade: $("stockUnit"),
    quantidade: $("stockQty"),
    minimo: $("stockMin"),
    custo: $("stockPrice"),
    precoVenda: $("stockSalePrice")
  };

  const reposicao = {
    modal: $("stockRestockModal"),
    form: $("stockRestockForm"),
    id: $("restockProductId"),
    nome: $("restockProductName"),
    disponivel: $("restockAvailable"),
    quantidade: $("restockQuantity"),
    total: $("restockTotal"),
    confirmar: $("confirmRestock")
  };

  const venda = {
    modal: $("saleModal"),
    form: $("saleForm"),
    id: $("saleProductId"),
    nome: $("saleProductName"),
    disponivel: $("saleAvailable"),
    quantidade: $("saleQuantity"),
    preco: $("saleUnitPrice"),
    pagamento: $("salePayment"),
    cliente: $("saleClient"),
    whatsapp: $("saleWhatsapp"),
    total: $("saleTotal"),
    confirmar: $("confirmSale")
  };

  let produtos = [];

  let carregando = false;
  let salvando = false;
  let repondo = false;
  let vendendo = false;
  let excluindo = false;

  let focoAnterior = null;

  /* =====================================================
     UTILITÁRIOS
  ===================================================== */

  function icon(nome) {
    return `<i data-lucide="${nome}" aria-hidden="true"></i>`;
  }

  function atualizarIcones() {
    if (
      window.lucide &&
      typeof window.lucide.createIcons === "function"
    ) {
      window.lucide.createIcons();
    }
  }

  function escapar(valor) {
    return WJ.escape(String(valor ?? ""));
  }

  function moeda(valor) {
    return WJ.money(Number(valor || 0));
  }

  function formatarQuantidade(valor) {
    return Number(valor || 0).toLocaleString("pt-BR", {
      maximumFractionDigits: 3
    });
  }

  function arredondarQuantidade(valor) {
    return Math.round(Number(valor) * 1000) / 1000;
  }

  function arredondarDinheiro(valor) {
    return Math.round(
      (Number(valor) + Number.EPSILON) * 100
    ) / 100;
  }

  function quantidadeValida(valor, permiteZero = true) {
    if (
      valor === "" ||
      valor === null ||
      valor === undefined
    ) {
      return false;
    }

    const numero = Number(valor);

    return (
      Number.isFinite(numero) &&
      (permiteZero ? numero >= 0 : numero > 0) &&
      Math.abs(
        arredondarQuantidade(numero) - numero
      ) < 0.0000001
    );
  }

  function dinheiroValido(valor, permiteZero = true) {
    if (
      valor === "" ||
      valor === null ||
      valor === undefined
    ) {
      return false;
    }

    const numero = Number(valor);

    return (
      Number.isFinite(numero) &&
      (permiteZero ? numero >= 0 : numero > 0) &&
      numero <= 9999999999.99 &&
      Math.abs(
        arredondarDinheiro(numero) - numero
      ) < 0.0000001
    );
  }

  function obterProduto(id) {
    return produtos.find(
      (produto) => String(produto.id) === String(id)
    );
  }

  function semEstoque(produto) {
    return Number(produto.quantidade) <= 0;
  }

  function estoqueBaixo(produto) {
    return (
      Number(produto.quantidade) <=
      Number(produto.estoque_minimo)
    );
  }

  function situacao(produto) {
    if (semEstoque(produto)) return "Sem estoque";
    if (estoqueBaixo(produto)) return "Estoque baixo";
    return "Disponível";
  }

  function avisar(mensagem) {
    if (typeof WJ.toast === "function") {
      WJ.toast(mensagem);
    } else {
      window.alert(mensagem);
    }
  }

  function mostrarErro(erro, fallback) {
    console.error("Estoque WJ:", erro);

    avisar(
      erro?.message ||
      fallback ||
      "Não foi possível realizar a operação."
    );
  }

  function podeExecutar() {
    return !salvando && !repondo && !vendendo && !excluindo;
  }

  /* =====================================================
     CARREGAR PRODUTOS DO POSTGRESQL
  ===================================================== */

  async function carregarProdutos() {
    if (carregando) return;

    carregando = true;

    try {
      const resposta = await WJ.api("/estoque");

      if (!Array.isArray(resposta)) {
        throw new Error(
          "O servidor retornou uma lista de produtos inválida."
        );
      }

      produtos = resposta;

      renderizar();

    } catch (erro) {
      mostrarErro(
        erro,
        "Não foi possível carregar o estoque."
      );

      $("stockResults").textContent =
        "Erro ao carregar produtos.";

    } finally {
      carregando = false;
    }
  }

  /* =====================================================
     RESUMO
  ===================================================== */

  function renderizarResumo() {
    const total = produtos.length;

    const baixos = produtos.filter(
      estoqueBaixo
    ).length;

    const faltando = produtos.filter(
      semEstoque
    ).length;

    const valor = produtos.reduce(
      (soma, produto) =>
        soma +
        Number(produto.quantidade || 0) *
        Number(produto.custo_unitario || 0),
      0
    );

    $("stockTotal").textContent = String(total);
    $("stockLow").textContent = String(baixos);
    $("stockOut").textContent = String(faltando);
    $("stockValue").textContent = moeda(valor);
  }

  /* =====================================================
     PESQUISA E FILTROS
  ===================================================== */

  function filtrarProdutos() {
    const busca = searchInput.value
      .trim()
      .toLocaleLowerCase("pt-BR");

    const filtro = filterInput.value;

    return produtos
      .filter((produto) => {
        const correspondeNome = String(
          produto.nome || ""
        )
          .toLocaleLowerCase("pt-BR")
          .includes(busca);

        const correspondeFiltro =
          filtro === "Todos" ||
          (filtro === "Baixo" && estoqueBaixo(produto)) ||
          (filtro === "Sem" && semEstoque(produto)) ||
          (filtro === "Normal" && !estoqueBaixo(produto));

        return correspondeNome && correspondeFiltro;
      })
      .sort((a, b) => {
        const prioridade = (produto) => {
          if (semEstoque(produto)) return 0;
          if (estoqueBaixo(produto)) return 1;
          return 2;
        };

        return (
          prioridade(a) - prioridade(b) ||
          String(a.nome).localeCompare(
            String(b.nome),
            "pt-BR"
          )
        );
      });
  }

  /* =====================================================
     BOTÕES DE CADA PRODUTO
  ===================================================== */

  function botoesProduto(produto) {
    const id = escapar(produto.id);

    const temEstoque =
      Number(produto.quantidade) > 0;

    return `
      <div class="actions">

        <button
          class="btn sm stock-action-sell"
          type="button"
          data-sell="${id}"
          ${temEstoque ? "" : "disabled"}
        >
          ${icon("shopping-cart")}
          <span>Vender</span>
        </button>

        <button
          class="btn sm stock-action-restock"
          type="button"
          data-add="${id}"
        >
          ${icon("package-plus")}
          <span>Repor</span>
        </button>

        <button
          class="btn alt sm"
          type="button"
          data-edit="${id}"
        >
          ${icon("pencil")}
          <span>Editar</span>
        </button>

        <button
          class="btn danger sm"
          type="button"
          data-del="${id}"
        >
          ${icon("trash-2")}
          <span>Excluir</span>
        </button>

      </div>
    `;
  }

  /* =====================================================
     LISTAR PRODUTOS
  ===================================================== */

  function renderizarTabela() {
    const lista = filtrarProdutos();

    $("stockResults").textContent =
      `${lista.length} produto${
        lista.length === 1 ? "" : "s"
      } encontrado${
        lista.length === 1 ? "" : "s"
      }`;

    if (!lista.length) {
      tableBody.innerHTML = `
        <tr class="stock-empty-row">
          <td colspan="6" class="stock-empty">
            Nenhum produto encontrado.
          </td>
        </tr>
      `;

      return;
    }

    tableBody.innerHTML = lista.map((produto) => {
      const status = situacao(produto);

      const classe =
        status === "Sem estoque"
          ? "out"
          : status === "Estoque baixo"
            ? "warn"
            : "";

      const classeLinha =
        status === "Sem estoque"
          ? "row-out"
          : status === "Estoque baixo"
            ? "row-low"
            : "";

      const unidade = escapar(
        produto.unidade || "unid."
      );

      return `
        <tr class="${classeLinha}">

          <td data-label="Produto">

            <span class="stock-product-name">
              ${escapar(produto.nome)}
            </span>

            <span class="stock-product-meta">
              Preço de venda:
              ${moeda(produto.preco_venda)}
            </span>

          </td>

          <td data-label="Disponível">
            ${formatarQuantidade(produto.quantidade)}
            ${unidade}
          </td>

          <td data-label="Estoque mínimo">
            ${formatarQuantidade(produto.estoque_minimo)}
            ${unidade}
          </td>

          <td data-label="Custo por unidade">
            ${moeda(produto.custo_unitario)}
          </td>

          <td data-label="Situação">

            <span class="pill ${classe}">
              ${status}
            </span>

          </td>

          <td data-label="Ações">
            ${botoesProduto(produto)}
          </td>

        </tr>
      `;
    }).join("");

    atualizarIcones();
  }

  function renderizar() {
    renderizarResumo();
    renderizarTabela();
  }

  /* =====================================================
     MOSTRAR / OCULTAR FORMULÁRIO
  ===================================================== */

  function mostrarFormulario() {
    document.body.classList.add(
      "stock-form-open"
    );

    $("stockFormPanel").scrollIntoView({
      behavior: "smooth",
      block: "start"
    });
  }

  function esconderFormulario() {
    document.body.classList.remove(
      "stock-form-open"
    );
  }

  function limparFormulario() {
    form.reset();

    cadastro.id.value = "";

    cadastro.quantidade.value = "";
    cadastro.minimo.value = "";
    cadastro.custo.value = "";
    cadastro.precoVenda.value = "";

    $("stockFormTitle").textContent =
      "Cadastrar produto";

    $("stockSaveText").textContent =
      "Salvar produto";
  }

  function novoProduto() {
    if (!podeExecutar()) return;

    limparFormulario();
    mostrarFormulario();
  }

  function editarProduto(produto) {
    if (!podeExecutar()) return;

    cadastro.id.value = produto.id;
    cadastro.nome.value = produto.nome;
    cadastro.unidade.value = produto.unidade;

    cadastro.quantidade.value =
      produto.quantidade;

    cadastro.minimo.value =
      produto.estoque_minimo;

    cadastro.custo.value =
      Number(produto.custo_unitario || 0).toFixed(2);

    cadastro.precoVenda.value =
      Number(produto.preco_venda || 0).toFixed(2);

    $("stockFormTitle").textContent =
      "Editar produto";

    $("stockSaveText").textContent =
      "Salvar alterações";

    mostrarFormulario();
  }

  $("openStockForm").addEventListener(
    "click",
    novoProduto
  );

  $("cancelStock").addEventListener(
    "click",
    () => {
      limparFormulario();
      esconderFormulario();
    }
  );

  $("closeStockForm").addEventListener(
    "click",
    () => {
      limparFormulario();
      esconderFormulario();
    }
  );

  /* =====================================================
     CADASTRAR E EDITAR NO POSTGRESQL
  ===================================================== */

  form.addEventListener("submit", async (evento) => {
    evento.preventDefault();

    if (!podeExecutar()) return;

    const id = cadastro.id.value;

    const nome = cadastro.nome.value.trim();

    const dados = {
      nome,
      unidade: cadastro.unidade.value,

      quantidade: Number(
        cadastro.quantidade.value
      ),

      estoque_minimo: Number(
        cadastro.minimo.value
      ),

      custo_unitario: Number(
        cadastro.custo.value
      ),

      preco_venda: Number(
        cadastro.precoVenda.value
      )
    };

    if (!nome || nome.length > 120) {
      avisar("Informe o nome do produto.");
      return;
    }

    if (
      !quantidadeValida(
        cadastro.quantidade.value
      ) ||
      !quantidadeValida(
        cadastro.minimo.value
      )
    ) {
      avisar(
        "Quantidade e estoque mínimo devem ser válidos."
      );
      return;
    }

    if (
      !dinheiroValido(cadastro.custo.value) ||
      !dinheiroValido(cadastro.precoVenda.value)
    ) {
      avisar(
        "Confira o custo e o preço de venda."
      );
      return;
    }

    salvando = true;

    const botao = $("saveStock");
    botao.disabled = true;

    try {
      await WJ.api(
        id
          ? `/estoque/${encodeURIComponent(id)}`
          : "/estoque",
        {
          method: id ? "PUT" : "POST",
          body: JSON.stringify(dados)
        }
      );

      limparFormulario();
      esconderFormulario();

      await carregarProdutos();

      avisar(
        id
          ? "Produto atualizado com sucesso!"
          : "Produto cadastrado com sucesso!"
      );

    } catch (erro) {
      mostrarErro(
        erro,
        "Não foi possível salvar o produto."
      );

    } finally {
      salvando = false;
      botao.disabled = false;
    }
  });

  /* =====================================================
     GERENCIAMENTO DOS MODAIS
  ===================================================== */

  function modalAberto() {
    return (
      !reposicao.modal.hidden ||
      !venda.modal.hidden
    );
  }

  function abrirModal(modal) {
    focoAnterior = document.activeElement;

    modal.hidden = false;

    document.body.classList.add(
      "stock-modal-open"
    );

    const caixa = modal.querySelector(
      ".stock-dialog"
    );

    requestAnimationFrame(() => {
      caixa.scrollTop = 0;

      try {
        caixa.focus({ preventScroll: true });
      } catch {
        caixa.focus();
      }
    });
  }

  function fecharModal(modal) {
    if (repondo || vendendo) return;

    modal.hidden = true;

    if (!modalAberto()) {
      document.body.classList.remove(
        "stock-modal-open"
      );
    }

    if (
      focoAnterior &&
      typeof focoAnterior.focus === "function"
    ) {
      try {
        focoAnterior.focus({
          preventScroll: true
        });
      } catch {
        focoAnterior.focus();
      }
    }
  }

  document.querySelectorAll(
    ".stock-modal [data-close-modal]"
  ).forEach((botao) => {
    botao.addEventListener("click", () => {
      const modal = botao.closest(
        ".stock-modal"
      );

      if (modal) fecharModal(modal);
    });
  });

  document.addEventListener("keydown", (evento) => {
    if (!modalAberto()) return;

    const modal = !reposicao.modal.hidden
      ? reposicao.modal
      : venda.modal;

    if (evento.key === "Escape") {
      evento.preventDefault();
      fecharModal(modal);
      return;
    }

    // Mantém a navegação pelo teclado dentro da janela.
    if (evento.key !== "Tab") return;

    const elementos = Array.from(
      modal.querySelectorAll(
        "button:not(:disabled), " +
        "input:not(:disabled), " +
        "select:not(:disabled)"
      )
    ).filter((elemento) => {
      return elemento.getClientRects().length > 0 &&
        elemento.type !== "hidden";
    });

    if (!elementos.length) return;

    const primeiro = elementos[0];
    const ultimo = elementos[elementos.length - 1];

    if (
      evento.shiftKey &&
      document.activeElement === primeiro
    ) {
      evento.preventDefault();
      ultimo.focus();

    } else if (
      !evento.shiftKey &&
      document.activeElement === ultimo
    ) {
      evento.preventDefault();
      primeiro.focus();
    }
  });

  /* =====================================================
     REPOR ESTOQUE
  ===================================================== */

  function abrirReposicao(produto) {
    if (!podeExecutar()) return;

    reposicao.form.reset();

    reposicao.id.value = String(produto.id);
    reposicao.nome.textContent = produto.nome;

    reposicao.disponivel.textContent =
      `${formatarQuantidade(produto.quantidade)} ` +
      `${produto.unidade || "unid."}`;

    reposicao.quantidade.value = "";
    reposicao.total.textContent =
      reposicao.disponivel.textContent;

    abrirModal(reposicao.modal);
  }

  function atualizarTotalReposicao() {
    const produto = obterProduto(
      reposicao.id.value
    );

    if (!produto) return;

    const adicionada = Number(
      reposicao.quantidade.value
    );

    const total =
      Number.isFinite(adicionada) &&
      adicionada > 0
        ? arredondarQuantidade(
            Number(produto.quantidade) + adicionada
          )
        : Number(produto.quantidade);

    reposicao.total.textContent =
      `${formatarQuantidade(total)} ` +
      `${produto.unidade || "unid."}`;
  }

  reposicao.quantidade.addEventListener(
    "input",
    atualizarTotalReposicao
  );

  reposicao.form.addEventListener(
    "submit",
    async (evento) => {
      evento.preventDefault();

      if (!podeExecutar()) return;

      const quantidadeTexto =
        reposicao.quantidade.value;

      if (!quantidadeValida(quantidadeTexto, false)) {
        avisar(
          "Informe uma quantidade maior que zero, " +
          "com até 3 casas decimais."
        );
        return;
      }

      const id = reposicao.id.value;

      const quantidadeAdicionar =
        Number(quantidadeTexto);

      repondo = true;
      reposicao.confirmar.disabled = true;

      let sucesso = false;

      try {
        // Busca a quantidade mais recente antes de repor.
        const listaAtual = await WJ.api("/estoque");

        if (!Array.isArray(listaAtual)) {
          throw new Error(
            "Não foi possível verificar o estoque atual."
          );
        }

        const produto = listaAtual.find(
          (item) =>
            String(item.id) === String(id)
        );

        if (!produto) {
          throw new Error(
            "Produto não encontrado no estoque."
          );
        }

        const novaQuantidade = arredondarQuantidade(
          Number(produto.quantidade) +
          quantidadeAdicionar
        );

        if (!quantidadeValida(
          String(novaQuantidade)
        )) {
          throw new Error(
            "A quantidade final é inválida."
          );
        }

        await WJ.api(
          `/estoque/${encodeURIComponent(id)}`,
          {
            method: "PUT",
            body: JSON.stringify({
              nome: produto.nome,
              unidade: produto.unidade,

              quantidade: novaQuantidade,

              estoque_minimo: Number(
                produto.estoque_minimo
              ),

              custo_unitario: Number(
                produto.custo_unitario
              ),

              preco_venda: Number(
                produto.preco_venda || 0
              )
            })
          }
        );

        sucesso = true;

      } catch (erro) {
        mostrarErro(
          erro,
          "Não foi possível repor o produto."
        );

      } finally {
        repondo = false;
        reposicao.confirmar.disabled = false;
      }

      if (sucesso) {
        fecharModal(reposicao.modal);

        await carregarProdutos();

        avisar("Reposição registrada com sucesso!");
      }
    }
  );

  /* =====================================================
     VENDA DE PRODUTO
  ===================================================== */

  function abrirVenda(produto) {
    if (!podeExecutar()) return;

    const disponivel = Number(
      produto.quantidade
    );

    if (
      !Number.isFinite(disponivel) ||
      disponivel <= 0
    ) {
      avisar("Este produto está sem estoque.");
      return;
    }

    venda.form.reset();

    venda.id.value = String(produto.id);
    venda.nome.textContent = produto.nome;

    venda.disponivel.textContent =
      `${formatarQuantidade(disponivel)} ` +
      `${produto.unidade || "unid."}`;

    venda.quantidade.value = String(
      Math.min(1, disponivel)
    );

    venda.quantidade.max = String(disponivel);

    const precoSugerido = Number(
      produto.preco_venda || 0
    );

    venda.preco.value = precoSugerido > 0
      ? precoSugerido.toFixed(2)
      : "";

    venda.pagamento.value = "Pix";

    atualizarTotalVenda();

    abrirModal(venda.modal);
  }

  function atualizarTotalVenda() {
    const quantidade = Number(
      venda.quantidade.value
    );

    const preco = Number(
      venda.preco.value
    );

    const total =
      Number.isFinite(quantidade) &&
      quantidade > 0 &&
      Number.isFinite(preco) &&
      preco > 0
        ? arredondarDinheiro(
            quantidade * preco
          )
        : 0;

    venda.total.textContent = moeda(total);
  }

  venda.quantidade.addEventListener(
    "input",
    atualizarTotalVenda
  );

  venda.preco.addEventListener(
    "input",
    atualizarTotalVenda
  );

  function normalizarWhatsapp(numero) {
    const digitos = String(
      numero || ""
    ).replace(/\D/g, "");

    if (!digitos) return "";

    if (
      digitos.length === 10 ||
      digitos.length === 11
    ) {
      return `55${digitos}`;
    }

    if (
      digitos.startsWith("55") &&
      (
        digitos.length === 12 ||
        digitos.length === 13
      )
    ) {
      return digitos;
    }

    return null;
  }

  venda.form.addEventListener(
    "submit",
    async (evento) => {
      evento.preventDefault();

      if (!podeExecutar()) return;

      const id = venda.id.value;

      const produto = obterProduto(id);

      if (!produto) {
        avisar("Produto não encontrado.");
        return;
      }

      const quantidadeTexto =
        venda.quantidade.value;

      const precoTexto =
        venda.preco.value;

      const quantidade = Number(
        quantidadeTexto
      );

      const preco = Number(
        precoTexto
      );

      const pagamento =
        venda.pagamento.value;

      const whatsapp =
        normalizarWhatsapp(
          venda.whatsapp.value
        );

      if (
        !quantidadeValida(
          quantidadeTexto,
          false
        )
      ) {
        avisar("Informe uma quantidade válida.");
        return;
      }

      if (
        quantidade > Number(produto.quantidade)
      ) {
        avisar(
          "A quantidade é maior que o estoque disponível."
        );
        return;
      }

      if (
        !dinheiroValido(
          precoTexto,
          false
        )
      ) {
        avisar(
          "Informe um preço de venda válido."
        );
        return;
      }

      if (
        !["Pix", "Cartão", "Dinheiro"].includes(
          pagamento
        )
      ) {
        avisar(
          "Selecione Pix, Cartão ou Dinheiro."
        );
        return;
      }

      if (whatsapp === null) {
        avisar(
          "Informe um WhatsApp válido com DDD."
        );
        return;
      }

      const total = arredondarDinheiro(
        quantidade * preco
      );

      if (
        !dinheiroValido(
          String(total),
          false
        )
      ) {
        avisar("Valor total inválido.");
        return;
      }

      vendendo = true;
      venda.confirmar.disabled = true;

      let sucesso = false;

      try {
        await WJ.api(
          "/financeiro/vendas",
          {
            method: "POST",
            body: JSON.stringify({
              produto_id: id,
              quantidade,
              preco_unitario: preco,
              data: WJ.today(),

              cliente_nome:
                venda.cliente.value.trim(),

              cliente_whatsapp:
                whatsapp || "",

              pagamento,
              observacoes: ""
            })
          }
        );

        sucesso = true;

      } catch (erro) {
        mostrarErro(
          erro,
          "Não foi possível registrar a venda. " +
          "Confira o Financeiro antes de tentar novamente."
        );

      } finally {
        vendendo = false;
        venda.confirmar.disabled = false;
      }

      if (sucesso) {
        fecharModal(venda.modal);

        await carregarProdutos();

        avisar(
          `Venda registrada: ${moeda(total)}`
        );
      }
    }
  );

  /* =====================================================
     EXCLUIR PRODUTO
  ===================================================== */

  async function excluirProduto(produto) {
    if (!podeExecutar()) return;

    const confirmado = window.confirm(
      `Deseja excluir "${produto.nome}" do estoque?\n\n` +
      "Essa ação poderá ser impedida pelo servidor " +
      "se houver registros vinculados."
    );

    if (!confirmado) return;

    excluindo = true;

    try {
      await WJ.api(
        `/estoque/${encodeURIComponent(produto.id)}`,
        {
          method: "DELETE"
        }
      );

      if (
        cadastro.id.value === String(produto.id)
      ) {
        limparFormulario();
        esconderFormulario();
      }

      await carregarProdutos();

      avisar("Produto excluído com sucesso!");

    } catch (erro) {
      mostrarErro(
        erro,
        "Não foi possível excluir o produto."
      );

    } finally {
      excluindo = false;
    }
  }

  /* =====================================================
     AÇÕES DA LISTA
  ===================================================== */

  tableBody.addEventListener(
    "click",
    (evento) => {
      const botao = evento.target.closest(
        "button[data-sell], " +
        "button[data-add], " +
        "button[data-edit], " +
        "button[data-del]"
      );

      if (!botao || !podeExecutar()) return;

      const id =
        botao.dataset.sell ??
        botao.dataset.add ??
        botao.dataset.edit ??
        botao.dataset.del;

      const produto = obterProduto(id);

      if (!produto) {
        avisar("Produto não encontrado.");
        return;
      }

      if (botao.hasAttribute("data-sell")) {
        abrirVenda(produto);
        return;
      }

      if (botao.hasAttribute("data-add")) {
        abrirReposicao(produto);
        return;
      }

      if (botao.hasAttribute("data-edit")) {
        editarProduto(produto);
        return;
      }

      if (botao.hasAttribute("data-del")) {
        excluirProduto(produto);
      }
    }
  );

  /* =====================================================
     CONTROLES DO INVENTÁRIO
  ===================================================== */

  searchInput.addEventListener(
    "input",
    renderizarTabela
  );

  filterInput.addEventListener(
    "change",
    renderizarTabela
  );

  $("clearStockFilters").addEventListener(
    "click",
    () => {
      searchInput.value = "";
      filterInput.value = "Todos";

      renderizarTabela();
    }
  );

  $("viewLowStock").addEventListener(
    "click",
    () => {
      searchInput.value = "";
      filterInput.value = "Baixo";

      renderizarTabela();

      $("stockInventory").scrollIntoView({
        behavior: "smooth",
        block: "start"
      });
    }
  );

  /* =====================================================
     MENU INFERIOR
  ===================================================== */

  const menuMobile = $("stockMobileMenu");
  const overlay = $("stockNavOverlay");

  function obterSidebar() {
    return document.querySelector(".sidebar");
  }

  function sincronizarMenu() {
    const aberto = !!obterSidebar()?.classList.contains(
      "open"
    );

    overlay.hidden = !aberto;

    menuMobile.setAttribute(
      "aria-expanded",
      String(aberto)
    );

    document.body.classList.toggle(
      "stock-menu-open",
      aberto
    );
  }

  function fecharMenu() {
    obterSidebar()?.classList.remove("open");
    sincronizarMenu();
  }

  menuMobile.addEventListener("click", () => {
    const sidebar = obterSidebar();

    if (!sidebar) return;

    sidebar.classList.toggle("open");
    sincronizarMenu();
  });

  overlay.addEventListener(
    "click",
    fecharMenu
  );

  document.addEventListener("keydown", (evento) => {
    if (
      evento.key === "Escape" &&
      !modalAberto()
    ) {
      fecharMenu();
    }
  });

  window.addEventListener("resize", () => {
    if (window.innerWidth > 760) {
      fecharMenu();
    }
  });

  /* =====================================================
     ATUALIZAÇÃO AUTOMÁTICA
  ===================================================== */

  document.addEventListener(
    "visibilitychange",
    () => {
      if (
        !document.hidden &&
        podeExecutar()
      ) {
        carregarProdutos();
      }
    }
  );

  window.addEventListener(
    "pageshow",
    (evento) => {
      if (
        evento.persisted &&
        podeExecutar()
      ) {
        carregarProdutos();
      }
    }
  );

  window.setInterval(() => {
    if (
      !document.hidden &&
      podeExecutar() &&
      !modalAberto()
    ) {
      carregarProdutos();
    }
  }, 60000);

  /* =====================================================
     INICIALIZAR
  ===================================================== */

  document.body.classList.add(
    "stock-ready"
  );

  atualizarIcones();

  await carregarProdutos();

});
