
"use strict";

document.addEventListener("DOMContentLoaded", async () => {
  const autorizado = await WJ.init("estoque");
  if (!autorizado) return;

  const $ = id => document.getElementById(id);

  const form = $("stockForm");
  const tableBody = $("stockRows");
  const searchInput = $("searchStock");
  const filterInput = $("filterStock");

  if (!form || !tableBody || !searchInput || !filterInput) {
    console.error("Elementos da página de estoque não encontrados.");
    return;
  }

  let produtos = [];
  let carregando = false;
  let salvando = false;
  let vendendo = false;

  const icon = name =>
    `<i data-lucide="${name}" aria-hidden="true"></i>`;

  function refreshIcons() {
    WJ.initIcons();
  }

  function formatQuantity(value) {
    return Number(value || 0).toLocaleString("pt-BR", {
      maximumFractionDigits: 3
    });
  }

  function roundQuantity(value) {
    return Math.round(value * 1000) / 1000;
  }

  function roundMoney(value) {
    return Math.round((value + Number.EPSILON) * 100) / 100;
  }

  function isLow(product) {
    return Number(product.quantidade) <=
      Number(product.estoque_minimo);
  }

  function validQuantity(value, allowZero = true) {
    const number = Number(value);

    return value !== "" &&
      Number.isFinite(number) &&
      (allowZero ? number >= 0 : number > 0) &&
      Math.abs(roundQuantity(number) - number) < 0.0000001;
  }

  function clearForm() {
    form.reset();
    $("stockId").value = "";
    $("stockFormTitle").textContent = "Cadastrar produto";
    $("stockSaveText").textContent = "Salvar produto";
  }

  function getProduct(id) {
    return produtos.find(
      product => String(product.id) === String(id)
    );
  }

  function showError(error, fallback) {
    console.error(error);
    WJ.toast(error?.message || fallback);
  }

  // =====================================
  // CARREGAR PRODUTOS DO POSTGRESQL
  // =====================================

  async function loadProducts() {
    if (carregando) return;

    carregando = true;

    try {
      const resposta = await WJ.api("/estoque");

      if (!Array.isArray(resposta)) {
        throw new Error("Resposta inválida do servidor.");
      }

      produtos = resposta;
      render();
    } catch (error) {
      showError(error, "Erro ao carregar o estoque.");
    } finally {
      carregando = false;
    }
  }

  // =====================================
  // MODAL DE VENDA
  // =====================================

  function createSaleModal() {
    if ($("saleModal")) return;

    const style = document.createElement("style");

    style.textContent = `
      .wj-sale-overlay {
        position: fixed;
        inset: 0;
        z-index: 1000;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 16px;
        background: rgba(0, 0, 0, .75);
      }

      .wj-sale-overlay[hidden] {
        display: none !important;
      }

      .wj-sale-card {
        width: 100%;
        max-width: 460px;
        max-height: 92dvh;
        overflow-y: auto;
        padding: 24px;
        border: 1px solid #3C4048;
        border-radius: 18px;
        background: #24272D;
        color: #F7F7F7;
        box-shadow: 0 20px 60px #0008;
      }

      .wj-sale-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        margin-bottom: 20px;
      }

      .wj-sale-header h2 {
        margin: 0;
        font-size: 20px;
      }

      .wj-sale-close {
        border: 0;
        background: transparent;
        color: #ADB0B7;
        font-size: 25px;
        cursor: pointer;
      }

      .wj-sale-fields {
        display: grid;
        gap: 14px;
      }

      .wj-sale-fields label {
        display: grid;
        gap: 7px;
        color: #ADB0B7;
        font-size: 13px;
      }

      .wj-sale-fields input,
      .wj-sale-fields select {
        width: 100%;
        padding: 12px;
        background: #30343A;
        border: 1px solid #3C4048;
        border-radius: 10px;
        color: #F7F7F7;
      }

      .wj-sale-product {
        padding: 14px;
        border-radius: 10px;
        background: #30343A;
        margin-bottom: 16px;
      }

      .wj-sale-product strong {
        display: block;
        margin-bottom: 6px;
      }

      .wj-sale-product small {
        color: #ADB0B7;
      }

      .wj-sale-total {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 16px;
        margin-top: 18px;
        border-radius: 10px;
        background: #39332B;
      }

      .wj-sale-total strong {
        color: #F28C28;
        font-size: 22px;
      }

      .wj-sale-actions {
        display: flex;
        justify-content: flex-end;
        gap: 10px;
        margin-top: 20px;
      }

      .wj-sale-actions button {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
      }

      .wj-sale-actions svg {
        width: 17px;
        height: 17px;
      }

      @media (max-width: 460px) {
        .wj-sale-card {
          padding: 18px;
        }

        .wj-sale-actions {
          flex-direction: column-reverse;
        }

        .wj-sale-actions button {
          width: 100%;
        }
      }
    `;

    document.head.appendChild(style);

    document.body.insertAdjacentHTML("beforeend", `
      <div
        class="wj-sale-overlay"
        id="saleModal"
        hidden
      >
        <div
          class="wj-sale-card"
          role="dialog"
          aria-modal="true"
          aria-labelledby="saleModalTitle"
        >
          <div class="wj-sale-header">
            <h2 id="saleModalTitle">Vender produto</h2>

            <button
              type="button"
              class="wj-sale-close"
              id="closeSaleModal"
              aria-label="Fechar"
            >&times;</button>
          </div>

          <div class="wj-sale-product">
            <strong id="saleProductName"></strong>
            <small id="saleAvailable"></small>
          </div>

          <form id="saleForm">
            <input type="hidden" id="saleProductId">

            <div class="wj-sale-fields">
              <label>
                Quantidade vendida
                <input
                  id="saleQuantity"
                  type="number"
                  min="0.001"
                  step="0.001"
                  value="1"
                  required
                >
              </label>

              <label>
                Preço unitário (R$)
                <input
                  id="saleUnitPrice"
                  type="number"
                  min="0.01"
                  step="0.01"
                  required
                >
              </label>

              <label>
                Forma de pagamento
                <select id="salePayment" required>
                  <option value="">Selecione</option>
                  <option value="Pix">Pix</option>
                  <option value="Cartão">Cartão</option>
                  <option value="Dinheiro">Dinheiro</option>
                </select>
              </label>

              <label>
                Nome do cliente (opcional)
                <input
                  id="saleClient"
                  type="text"
                  maxlength="120"
                  placeholder="Nome do cliente"
                >
              </label>
            </div>

            <div class="wj-sale-total">
              <span>Total da venda</span>
              <strong id="saleTotal">R$ 0,00</strong>
            </div>

            <div class="wj-sale-actions">
              <button
                type="button"
                class="btn alt"
                id="cancelSale"
              >
                Cancelar
              </button>

              <button
                type="submit"
                class="btn"
                id="confirmSale"
              >
                ${icon("check-circle")}
                Confirmar venda
              </button>
            </div>
          </form>
        </div>
      </div>
    `);

    $("closeSaleModal").addEventListener(
      "click",
      closeSaleModal
    );

    $("cancelSale").addEventListener(
      "click",
      closeSaleModal
    );

    $("saleModal").addEventListener("click", event => {
      if (event.target === $("saleModal")) {
        closeSaleModal();
      }
    });

    document.addEventListener("keydown", event => {
      if (
        event.key === "Escape" &&
        !$("saleModal").hidden
      ) {
        closeSaleModal();
      }
    });

    $("saleQuantity").addEventListener(
      "input",
      updateSaleTotal
    );

    $("saleUnitPrice").addEventListener(
      "input",
      updateSaleTotal
    );

    $("saleForm").addEventListener(
      "submit",
      confirmSale
    );

    refreshIcons();
  }

  function openSaleModal(product) {
    createSaleModal();

    const available = Number(product.quantidade);

    if (!Number.isFinite(available) || available <= 0) {
      WJ.toast("Produto sem estoque disponível.");
      return;
    }

    $("saleForm").reset();

    $("saleProductId").value = String(product.id);
    $("saleProductName").textContent = product.nome;

    $("saleAvailable").textContent =
      `Disponível: ${formatQuantity(available)} ` +
      `${product.unidade || "un"}`;

    $("saleQuantity").value = Math.min(1, available);
    $("saleQuantity").max = String(available);

    const preco = Number(product.preco_venda || 0);

    $("saleUnitPrice").value = preco.toFixed(2);

    $("saleModal").hidden = false;

    updateSaleTotal();
    $("saleQuantity").focus();
  }

  function closeSaleModal() {
    if (vendendo) return;

    if ($("saleModal")) {
      $("saleModal").hidden = true;
    }
  }

  function updateSaleTotal() {
    const quantity = Number($("saleQuantity").value);
    const unitPrice = Number($("saleUnitPrice").value);

    const total =
      Number.isFinite(quantity) &&
      Number.isFinite(unitPrice)
        ? roundMoney(quantity * unitPrice)
        : 0;

    $("saleTotal").textContent = WJ.money(total);
  }

  // =====================================
  // REGISTRAR VENDA NO POSTGRESQL
  // =====================================

  async function confirmSale(event) {
    event.preventDefault();

    if (vendendo) return;

    const productId = $("saleProductId").value;
    const quantity = Number($("saleQuantity").value);
    const unitPrice = Number($("saleUnitPrice").value);
    const payment = $("salePayment").value;
    const client = $("saleClient").value.trim();

    if (!validQuantity($("saleQuantity").value, false)) {
      WJ.toast(
        "Informe uma quantidade válida com até 3 casas decimais."
      );
      return;
    }

    if (
      !Number.isFinite(unitPrice) ||
      unitPrice <= 0 ||
      roundMoney(unitPrice) !== unitPrice
    ) {
      WJ.toast("Informe um preço válido.");
      return;
    }

    if (!["Pix", "Cartão", "Dinheiro"].includes(payment)) {
      WJ.toast("Selecione a forma de pagamento.");
      return;
    }

    const product = getProduct(productId);

    if (!product) {
      WJ.toast("Produto não encontrado.");
      return;
    }

    if (quantity > Number(product.quantidade)) {
      WJ.toast("Quantidade maior que o estoque disponível.");
      return;
    }

    vendendo = true;
    $("confirmSale").disabled = true;

    try {
      const resultado = await WJ.api(
        "/financeiro/vendas",
        {
          method: "POST",
          body: JSON.stringify({
            produto_id: productId,
            quantidade: quantity,
            preco_unitario: unitPrice,
            data: WJ.today(),
            pagamento: payment,
            cliente_nome: client
          })
        }
      );

      vendendo = false;
      closeSaleModal();

      await loadProducts();

      WJ.toast(
        `Venda registrada! Receita: ${WJ.money(
          resultado.venda.total
        )}`
      );
    } catch (error) {
      showError(error, "Erro ao registrar a venda.");
    } finally {
      vendendo = false;
      $("confirmSale").disabled = false;
    }
  }

  // =====================================
  // RENDERIZAR ESTOQUE
  // =====================================

  function render() {
    const search = searchInput.value
      .trim()
      .toLocaleLowerCase("pt-BR");

    const filter = filterInput.value;

    const lowProducts = produtos.filter(isLow);

    const totalValue = produtos.reduce((sum, product) => {
      return sum +
        Number(product.quantidade || 0) *
        Number(product.custo_unitario || 0);
    }, 0);

    $("stockTotal").textContent = produtos.length;
    $("stockLow").textContent = lowProducts.length;
    $("stockValue").textContent = WJ.money(totalValue);

    const filtered = produtos.filter(product => {
      const matchesSearch = String(product.nome || "")
        .toLocaleLowerCase("pt-BR")
        .includes(search);

      const low = isLow(product);

      const matchesFilter =
        filter === "Todos" ||
        (filter === "Baixo" && low) ||
        (filter === "Normal" && !low);

      return matchesSearch && matchesFilter;
    });

    $("stockResults").textContent =
      `${filtered.length} produto` +
      `${filtered.length === 1 ? "" : "s"} encontrado` +
      `${filtered.length === 1 ? "" : "s"}`;

    if (!filtered.length) {
      tableBody.innerHTML = `
        <tr>
          <td colspan="6" class="stock-empty">
            Nenhum produto encontrado.
          </td>
        </tr>
      `;
      return;
    }

    tableBody.innerHTML = filtered.map(product => {
      const low = isLow(product);
      const id = WJ.escape(String(product.id));
      const available = Number(product.quantidade) > 0;

      return `
        <tr>
          <td>
            ${WJ.escape(product.nome)}
          </td>

          <td>
            ${formatQuantity(product.quantidade)}
            ${WJ.escape(product.unidade || "un")}
          </td>

          <td>
            ${formatQuantity(product.estoque_minimo)}
          </td>

          <td>
            ${WJ.money(product.custo_unitario)}
          </td>

          <td>
            <span class="pill ${low ? "warn" : ""}">
              ${low ? "Repor" : "Normal"}
            </span>
          </td>

          <td>
            <div class="actions">

              <button
                class="btn sm"
                type="button"
                data-sell="${id}"
                ${available ? "" : "disabled"}
                title="Vender produto"
              >
                ${icon("shopping-cart")}
                <span>Vender</span>
              </button>

              <button
                class="btn sm"
                type="button"
                data-add="${id}"
                title="Repor estoque"
              >
                ${icon("package-plus")}
                <span>Repor</span>
              </button>

              <button
                class="btn alt sm"
                type="button"
                data-edit="${id}"
                title="Editar produto"
              >
                ${icon("pencil")}
                <span>Editar</span>
              </button>

              <button
                class="btn danger sm"
                type="button"
                data-del="${id}"
                title="Excluir produto"
              >
                ${icon("trash-2")}
                <span>Excluir</span>
              </button>

            </div>
          </td>
        </tr>
      `;
    }).join("");

    refreshIcons();
  }

  // =====================================
  // CADASTRAR OU EDITAR PRODUTO
  // =====================================

  form.addEventListener("submit", async event => {
    event.preventDefault();

    if (salvando) return;

    const id = $("stockId").value;

    const product = {
      nome: $("stockName").value.trim(),
      unidade: $("stockUnit").value,
      quantidade: Number($("stockQty").value),
      estoque_minimo: Number($("stockMin").value),
      custo_unitario: Number($("stockPrice").value),
      preco_venda: 0
    };

    const existente = id ? getProduct(id) : null;

    if (existente) {
      product.preco_venda = Number(
        existente.preco_venda || 0
      );
    } else {
      // Como o formulário atual possui somente um campo
      // de valor, inicialmente usamos esse valor também
      // como preço sugerido de venda.
      product.preco_venda = product.custo_unitario;
    }

    if (
      !product.nome ||
      !validQuantity($("stockQty").value) ||
      !validQuantity($("stockMin").value) ||
      !Number.isFinite(product.custo_unitario) ||
      product.custo_unitario < 0
    ) {
      WJ.toast("Verifique os dados do produto.");
      return;
    }

    salvando = true;

    const botaoSalvar = form.querySelector(
      'button[type="submit"]'
    );

    if (botaoSalvar) botaoSalvar.disabled = true;

    try {
      await WJ.api(
        id ? `/estoque/${id}` : "/estoque",
        {
          method: id ? "PUT" : "POST",
          body: JSON.stringify(product)
        }
      );

      clearForm();
      await loadProducts();

      WJ.toast("Produto salvo com sucesso!");
    } catch (error) {
      showError(error, "Erro ao salvar produto.");
    } finally {
      salvando = false;

      if (botaoSalvar) {
        botaoSalvar.disabled = false;
      }
    }
  });

  // =====================================
  // AÇÕES DA TABELA
  // =====================================

  tableBody.addEventListener("click", async event => {
    const button = event.target.closest(
      "button[data-sell], button[data-add], " +
      "button[data-edit], button[data-del]"
    );

    if (!button) return;

    const id =
      button.dataset.sell ??
      button.dataset.add ??
      button.dataset.edit ??
      button.dataset.del;

    const product = getProduct(id);

    if (!product) {
      WJ.toast("Produto não encontrado.");
      return;
    }

    // VENDER PRODUTO
    if (button.dataset.sell !== undefined) {
      openSaleModal(product);
      return;
    }

    // REPOR ESTOQUE
    if (button.dataset.add !== undefined) {
      const response = prompt(
        `Quantidade a repor de "${product.nome}":`,
        "1"
      );

      if (response === null) return;

      const quantity = Number(
        response.trim().replace(",", ".")
      );

      if (
        !validQuantity(String(quantity), false)
      ) {
        WJ.toast("Informe uma quantidade válida.");
        return;
      }

      const novaQuantidade = roundQuantity(
        Number(product.quantidade) + quantity
      );

      try {
        await WJ.api(`/estoque/${id}`, {
          method: "PUT",
          body: JSON.stringify({
            nome: product.nome,
            unidade: product.unidade,
            quantidade: novaQuantidade,
            estoque_minimo: Number(product.estoque_minimo),
            custo_unitario: Number(product.custo_unitario),
            preco_venda: Number(product.preco_venda || 0)
          })
        });

        await loadProducts();
        WJ.toast("Estoque atualizado com sucesso!");
      } catch (error) {
        showError(error, "Erro ao repor estoque.");
      }

      return;
    }

    // EXCLUIR PRODUTO
    if (button.dataset.del !== undefined) {
      const confirmed = confirm(
        `Deseja realmente excluir "${product.nome}"?`
      );

      if (!confirmed) return;

      try {
        await WJ.api(`/estoque/${id}`, {
          method: "DELETE"
        });

        if ($("stockId").value === String(id)) {
          clearForm();
        }

        await loadProducts();
        WJ.toast("Produto excluído.");
      } catch (error) {
        showError(error, "Erro ao excluir produto.");
      }

      return;
    }

    // EDITAR PRODUTO
    $("stockId").value = product.id;
    $("stockName").value = product.nome;
    $("stockUnit").value = product.unidade;
    $("stockQty").value = product.quantidade;
    $("stockMin").value = product.estoque_minimo;
    $("stockPrice").value = product.custo_unitario || 0;

    $("stockFormTitle").textContent = "Editar produto";
    $("stockSaveText").textContent = "Salvar alterações";

    $("stockFormPanel").scrollIntoView({
      behavior: "smooth",
      block: "start"
    });

    $("stockName").focus({
      preventScroll: true
    });
  });

  // =====================================
  // PESQUISA E FILTROS
  // =====================================

  searchInput.addEventListener("input", render);
  filterInput.addEventListener("change", render);

  $("cancelStock").addEventListener(
    "click",
    clearForm
  );

  // =====================================
  // ATUALIZAÇÃO AUTOMÁTICA
  // =====================================

  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) {
      loadProducts();
    }
  });

  setInterval(() => {
    if (!document.hidden) {
      loadProducts();
    }
  }, 60000);

  // =====================================
  // INICIALIZAÇÃO
  // =====================================

  await loadProducts();
  refreshIcons();
});
