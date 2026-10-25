
"use strict";

document.addEventListener("DOMContentLoaded", async () => {
  const autorizado = await WJ.init("financeiro");
  if (!autorizado) return;

  const $ = id => document.getElementById(id);

  const form = $("transactionForm");
  const section = $("transactionSection");
  const table = $("transactionTable");

  const fields = {
    id: $("transactionId"),
    type: $("transactionType"),
    date: $("transactionDate"),
    description: $("transactionDescription"),
    category: $("transactionCategory"),
    value: $("transactionValue"),
    payment: $("transactionPayment"),
    notes: $("transactionNotes"),
    client: $("clientName"),
    whatsapp: $("clientWhatsapp")
  };

  const searchInput = $("searchTransaction");
  const filterType = $("filterType");
  const filterMonth = $("filterMonth");

  const categories = {
    Receita: [
      "Corte masculino",
      "Barba",
      "Corte + barba",
      "Sobrancelha",
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

  const paymentMethods = ["Pix", "Cartão", "Dinheiro"];

  let transactions = [];
  let products = [];
  let saving = false;
  let loading = false;

  const dateOnly = value =>
    String(value || "").slice(0, 10);

  const roundMoney = value =>
    Math.round((Number(value) + Number.EPSILON) * 100) / 100;

  const roundQuantity = value =>
    Math.round(Number(value) * 1000) / 1000;

  const formatQuantity = value =>
    Number(value || 0).toLocaleString("pt-BR", {
      maximumFractionDigits: 3
    });

  const isRevenue = item =>
    String(item.tipo).toLowerCase() === "receita";

  const isStockSale = item =>
    item.origem === "venda_produto";

  function showError(error, fallback) {
    console.error(error);
    WJ.toast(error?.message || fallback);
  }

  // =====================================
  // PAINEL DE VENDA DE PRODUTOS
  // =====================================

  const productPanel = document.createElement("section");

  productPanel.id = "financeProductPanel";
  productPanel.className = "sale-panel";
  productPanel.hidden = true;

  productPanel.innerHTML = `
    <div class="sale-panel-header">
      <div class="sale-panel-icon">
        <i data-lucide="shopping-bag"></i>
      </div>

      <div class="sale-panel-heading">
        <strong>Venda de produto</strong>
        <span>
          Selecione um produto e informe a quantidade
          e o preço de venda.
        </span>
      </div>

      <span class="sale-panel-tag">ESTOQUE</span>
    </div>

    <div class="sale-panel-fields">
      <div class="sale-field sale-field-product">
        <label for="financeProduct">Produto</label>

        <select id="financeProduct">
          <option value="">Selecione um produto</option>
        </select>
      </div>

      <div class="sale-field">
        <label for="financeProductQty">
          Quantidade
        </label>

        <input
          id="financeProductQty"
          type="number"
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
          id="financeSaleUnitPrice"
          type="number"
          min="0.01"
          step="0.01"
        >
      </div>
    </div>

    <div class="sale-panel-stock">
      <i data-lucide="package-check"></i>

      <span id="financeProductInfo">
        Selecione um produto disponível.
      </span>
    </div>

    <div class="sale-panel-total">
      <div>
        <span class="sale-total-label">
          TOTAL DA VENDA
        </span>

        <small id="financeTotalDetails">
          Informe a quantidade e o preço.
        </small>
      </div>

      <strong id="financeTotalDisplay">
        R$ 0,00
      </strong>
    </div>
  `;

  const formGrid = fields.category.closest(".form-grid");

  if (formGrid) {
    formGrid.insertAdjacentElement("afterend", productPanel);
  } else {
    fields.category.parentElement.insertAdjacentElement(
      "afterend",
      productPanel
    );
  }

  const productInput = $("financeProduct");
  const productQtyInput = $("financeProductQty");
  const unitPriceInput = $("financeSaleUnitPrice");
  const productInfo = $("financeProductInfo");
  const totalDisplay = $("financeTotalDisplay");
  const totalDetails = $("financeTotalDetails");

  WJ.initIcons();

  function isProductCategory() {
    return fields.type.value === "Receita" &&
      fields.category.value === "Produtos vendidos" &&
      !fields.id.value;
  }

  function selectedProduct() {
    return products.find(
      product => String(product.id) === productInput.value
    );
  }

  function loadStockProducts() {
    const previousId = productInput.value;

    productInput.replaceChildren();

    const placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = "Selecione um produto";

    productInput.appendChild(placeholder);

    products.forEach(product => {
      const option = document.createElement("option");

      option.value = String(product.id);

      option.textContent =
        `${product.nome} — ` +
        `${formatQuantity(product.quantidade)} ` +
        `${product.unidade || "un"}`;

      option.disabled = Number(product.quantidade) <= 0;

      productInput.appendChild(option);
    });

    const previousProduct = products.find(
      product =>
        String(product.id) === previousId &&
        Number(product.quantidade) > 0
    );

    if (previousProduct) {
      productInput.value = previousId;
    }
  }

  function updateProductCalculation() {
    if (!isProductCategory()) return;

    const product = selectedProduct();

    if (!product) {
      fields.description.value = "";
      fields.value.value = "";

      productInfo.textContent =
        "Selecione um produto disponível.";

      totalDisplay.textContent = WJ.money(0);
      totalDetails.textContent =
        "Informe a quantidade e o preço.";

      return;
    }

    const quantity = Number(productQtyInput.value);
    const unitPrice = Number(unitPriceInput.value);
    const available = Number(product.quantidade);

    productQtyInput.max = String(available);

    productInfo.textContent =
      `Disponível: ${formatQuantity(available)} ` +
      `${product.unidade || "un"}`;

    const valid =
      Number.isFinite(quantity) &&
      quantity > 0 &&
      quantity <= available &&
      Number.isFinite(unitPrice) &&
      unitPrice > 0;

    const total = valid
      ? roundMoney(quantity * unitPrice)
      : 0;

    fields.description.value =
      `Venda de produto: ${product.nome} ` +
      `(${formatQuantity(quantity)} ` +
      `${product.unidade || "un"})`;

    fields.value.value = valid
      ? total.toFixed(2)
      : "";

    totalDisplay.textContent = WJ.money(total);

    totalDetails.textContent = valid
      ? `${formatQuantity(quantity)} × ${WJ.money(unitPrice)}`
      : "Verifique quantidade e preço.";
  }

  function updateProductFields() {
    const active = isProductCategory();

    productPanel.hidden = !active;

    productInput.required = active;
    productQtyInput.required = active;
    unitPriceInput.required = active;

    fields.description.readOnly = active;
    fields.value.readOnly = active;

    const descriptionField =
      fields.description.closest(".field");

    const valueField =
      fields.value.closest(".field");

    if (descriptionField) {
      descriptionField.hidden = active;
    }

    if (valueField) {
      valueField.hidden = active;
    }

    if (active) {
      loadStockProducts();
      updateProductCalculation();
    }
  }

  productInput.addEventListener("change", () => {
    const product = selectedProduct();

    if (product) {
      unitPriceInput.value =
        Number(product.preco_venda || 0).toFixed(2);
    }

    updateProductCalculation();
  });

  productQtyInput.addEventListener(
    "input",
    updateProductCalculation
  );

  unitPriceInput.addEventListener(
    "input",
    updateProductCalculation
  );

  // =====================================
  // CATEGORIAS
  // =====================================

  function updateCategories(selected = "") {
    const options = categories[fields.type.value] || [];

    fields.category.replaceChildren();

    options.forEach(category => {
      const option = document.createElement("option");

      option.value = category;
      option.textContent = category;

      fields.category.appendChild(option);
    });

    if (selected && !options.includes(selected)) {
      const option = document.createElement("option");

      option.value = selected;
      option.textContent = selected;

      fields.category.appendChild(option);
    }

    if (selected) {
      fields.category.value = selected;
    }

    updateProductFields();
  }

  function updateClientFields() {
    const revenue = fields.type.value === "Receita";

    document
      .querySelectorAll("[data-client-field]")
      .forEach(element => {
        element.hidden = !revenue;
      });

    if ($("clientHint")) {
      $("clientHint").hidden = !revenue;
    }

    fields.client.disabled = !revenue;
    fields.whatsapp.disabled = !revenue;
  }

  fields.type.addEventListener("change", () => {
    updateCategories();
    updateClientFields();
  });

  fields.category.addEventListener(
    "change",
    updateProductFields
  );

  // =====================================
  // WHATSAPP
  // =====================================

  function digitsOnly(value) {
    return String(value || "").replace(/\D/g, "");
  }

  function normalizeWhatsapp(value) {
    const digits = digitsOnly(value);

    if (!digits) return "";

    if (digits.length === 10 || digits.length === 11) {
      return "55" + digits;
    }

    if (
      digits.startsWith("55") &&
      (digits.length === 12 || digits.length === 13)
    ) {
      return digits;
    }

    return null;
  }

  function formatWhatsapp(value) {
    let digits = digitsOnly(value);

    if (
      digits.startsWith("55") &&
      (digits.length === 12 || digits.length === 13)
    ) {
      digits = digits.slice(2);
    }

    if (digits.length === 11) {
      return `(${digits.slice(0, 2)}) ` +
        `${digits.slice(2, 7)}-${digits.slice(7)}`;
    }

    if (digits.length === 10) {
      return `(${digits.slice(0, 2)}) ` +
        `${digits.slice(2, 6)}-${digits.slice(6)}`;
    }

    return String(value || "");
  }

  fields.whatsapp.addEventListener("input", () => {
    const digits = digitsOnly(fields.whatsapp.value);

    if (digits.length <= 11) {
      fields.whatsapp.value = formatWhatsapp(digits);
    }
  });

  function openWhatsapp(transaction) {
    if (!isRevenue(transaction)) return;

    const phone = normalizeWhatsapp(
      transaction.cliente_whatsapp
    );

    if (!phone) {
      WJ.toast("WhatsApp inválido ou não cadastrado.");
      return;
    }

    const name = String(
      transaction.cliente_nome || ""
    ).trim();

    const message = isStockSale(transaction)
      ? `E aí${name ? ", " + name : ""}!\n\n` +
        "Obrigado pela compra e pela confiança na " +
        "Barbearia WJ!\n\nTamo junto!"
      : `E aí${name ? ", " + name : ""}!\n\n` +
        "Obrigado pela confiança! Esperamos que tenha " +
        "curtido nosso serviço.\n\n" +
        "Tamo junto, até o próximo corte!";

    window.open(
      `https://wa.me/${phone}?text=${encodeURIComponent(message)}`,
      "_blank",
      "noopener,noreferrer"
    );
  }

  // =====================================
  // ABRIR FORMULÁRIO
  // =====================================

  function openForm() {
    form.reset();

    fields.id.value = "";
    fields.date.value = WJ.today();
    fields.type.value = "Receita";
    fields.payment.value = "";

    productInput.value = "";
    productQtyInput.value = "1";
    unitPriceInput.value = "";

    updateCategories();
    updateClientFields();

    $("formTitle").textContent = "Nova movimentação";
    $("saveTransaction").textContent = "Salvar movimentação";

    section.hidden = false;

    section.scrollIntoView({
      behavior: "smooth",
      block: "start"
    });
  }

  // =====================================
  // EDITAR MOVIMENTAÇÃO
  // =====================================

  function editTransaction(transaction) {
    if (isStockSale(transaction)) {
      WJ.toast(
        "Vendas do estoque não podem ser editadas aqui."
      );
      return;
    }

    form.reset();

    fields.id.value = String(transaction.id);

    fields.type.value = isRevenue(transaction)
      ? "Receita"
      : "Despesa";

    fields.date.value = dateOnly(transaction.data);

    updateCategories(transaction.categoria || "");
    updateClientFields();

    fields.description.value =
      transaction.descricao || "";

    fields.value.value =
      Number(transaction.valor || 0).toFixed(2);

    fields.payment.value =
      transaction.pagamento || "";

    fields.notes.value =
      transaction.observacoes || "";

    fields.client.value =
      transaction.cliente_nome || "";

    fields.whatsapp.value = formatWhatsapp(
      transaction.cliente_whatsapp || ""
    );

    updateProductFields();

    $("formTitle").textContent = "Editar movimentação";
    $("saveTransaction").textContent = "Salvar alterações";

    section.hidden = false;

    section.scrollIntoView({
      behavior: "smooth",
      block: "start"
    });
  }

  // =====================================
  // FECHAR FORMULÁRIO
  // =====================================

  function closeForm() {
    if (saving) return;

    section.hidden = true;

    form.reset();
    fields.id.value = "";

    productInput.value = "";
    unitPriceInput.value = "";

    productPanel.hidden = true;

    fields.description.readOnly = false;
    fields.value.readOnly = false;

    const descriptionField =
      fields.description.closest(".field");

    const valueField =
      fields.value.closest(".field");

    if (descriptionField) {
      descriptionField.hidden = false;
    }

    if (valueField) {
      valueField.hidden = false;
    }
  }

  $("newTransaction").addEventListener(
    "click",
    openForm
  );

  $("closeForm").addEventListener(
    "click",
    closeForm
  );

  $("cancelForm").addEventListener(
    "click",
    closeForm
  );

  // =====================================
  // CARREGAR DADOS DO POSTGRESQL
  // =====================================

  async function loadData() {
    if (loading) return;

    loading = true;

    try {
      const [financeData, stockData] = await Promise.all([
        WJ.api("/financeiro"),
        WJ.api("/estoque")
      ]);

      if (
        !Array.isArray(financeData) ||
        !Array.isArray(stockData)
      ) {
        throw new Error("Resposta inválida da API.");
      }

      transactions = financeData;
      products = stockData;

      render();

      if (!productPanel.hidden) {
        loadStockProducts();
        updateProductCalculation();
      }
    } catch (error) {
      showError(error, "Erro ao carregar o Financeiro.");
    } finally {
      loading = false;
    }
  }

  // =====================================
  // SALVAR CADASTRO OU EDIÇÃO
  // =====================================

  form.addEventListener("submit", async event => {
    event.preventDefault();

    if (saving) return;

    const editingId = fields.id.value;
    const editing = Boolean(editingId);

    const revenue = fields.type.value === "Receita";
    const payment = fields.payment.value;

    if (!paymentMethods.includes(payment)) {
      WJ.toast("Selecione uma forma de pagamento.");
      return;
    }

    const rawWhatsapp = revenue
      ? fields.whatsapp.value.trim()
      : "";

    const whatsapp = rawWhatsapp
      ? normalizeWhatsapp(rawWhatsapp)
      : "";

    if (rawWhatsapp && !whatsapp) {
      WJ.toast("Informe um WhatsApp válido com DDD.");
      return;
    }

    const client = revenue
      ? fields.client.value.trim()
      : "";

    const date = fields.date.value || WJ.today();

    let endpoint;
    let method;
    let payload;
    let successMessage;

    // VENDA DE PRODUTO

    if (isProductCategory() && !editing) {
      const product = selectedProduct();

      if (!product) {
        WJ.toast("Selecione um produto.");
        return;
      }

      const quantity = Number(productQtyInput.value);
      const unitPrice = Number(unitPriceInput.value);

      if (
        !Number.isFinite(quantity) ||
        quantity <= 0 ||
        Math.abs(roundQuantity(quantity) - quantity) >
          0.0000001
      ) {
        WJ.toast(
          "Informe uma quantidade válida com até 3 casas decimais."
        );
        return;
      }

      if (quantity > Number(product.quantidade)) {
        WJ.toast("Estoque insuficiente.");
        await loadData();
        return;
      }

      if (
        !Number.isFinite(unitPrice) ||
        unitPrice <= 0 ||
        Math.abs(roundMoney(unitPrice) - unitPrice) >
          0.0000001
      ) {
        WJ.toast("Informe um preço válido.");
        return;
      }

      const total = roundMoney(quantity * unitPrice);

      if (total <= 0) {
        WJ.toast("Total da venda inválido.");
        return;
      }

      endpoint = "/financeiro/vendas";
      method = "POST";

      payload = {
        produto_id: Number(product.id),
        quantidade: quantity,
        preco_unitario: unitPrice,
        data: date,
        pagamento: payment,
        cliente_nome: client,
        cliente_whatsapp: whatsapp,
        observacoes: fields.notes.value.trim()
      };

      successMessage =
        `Venda registrada: ${WJ.money(total)}`;

    } else {
      // RECEITA OU DESPESA MANUAL

      const value = Number(fields.value.value);
      const description = fields.description.value.trim();

      if (
        !Number.isFinite(value) ||
        value <= 0 ||
        Math.abs(roundMoney(value) - value) >
          0.0000001
      ) {
        WJ.toast("Informe um valor válido.");
        return;
      }

      if (!description) {
        WJ.toast("Informe a descrição.");
        return;
      }

      endpoint = editing
        ? `/financeiro/${editingId}`
        : "/financeiro";

      method = editing ? "PUT" : "POST";

      payload = {
        tipo: revenue ? "receita" : "despesa",
        data: date,
        descricao: description,
        categoria: fields.category.value,
        valor: roundMoney(value),
        pagamento: payment,
        observacoes: fields.notes.value.trim(),
        cliente_nome: client,
        cliente_whatsapp: whatsapp
      };

      successMessage = editing
        ? "Movimentação atualizada com sucesso!"
        : "Movimentação cadastrada com sucesso!";
    }

    saving = true;

    const saveButton = $("saveTransaction");

    saveButton.disabled = true;
    saveButton.textContent = "Salvando...";

    try {
      await WJ.api(endpoint, {
        method,
        body: JSON.stringify(payload)
      });

      saving = false;
      closeForm();

      await loadData();

      WJ.toast(successMessage);

    } catch (error) {
      showError(error, "Erro ao salvar movimentação.");

    } finally {
      saving = false;

      saveButton.disabled = false;
      saveButton.textContent = fields.id.value
        ? "Salvar alterações"
        : "Salvar movimentação";
    }
  });

  // =====================================
  // FILTRAR MOVIMENTAÇÕES
  // =====================================

  function filteredTransactions() {
    const search = searchInput.value
      .trim()
      .toLocaleLowerCase("pt-BR");

    const type = filterType.value.toLowerCase();
    const month = filterMonth.value;

    return transactions
      .filter(item => {
        const searchable = [
          item.descricao,
          item.categoria,
          item.cliente_nome,
          item.cliente_whatsapp,
          item.pagamento
        ]
          .join(" ")
          .toLocaleLowerCase("pt-BR");

        const matchesSearch = searchable.includes(search);

        const matchesType =
          !type ||
          String(item.tipo).toLowerCase() === type;

        const matchesMonth =
          !month ||
          dateOnly(item.data).startsWith(month);

        return matchesSearch &&
          matchesType &&
          matchesMonth;
      })
      .sort((a, b) => {
        const dateCompare = dateOnly(b.data)
          .localeCompare(dateOnly(a.data));

        return dateCompare ||
          Number(b.id) - Number(a.id);
      });
  }

  // =====================================
  // INDICADORES
  // =====================================

  function renderSummary(rows) {
    const revenue = rows
      .filter(isRevenue)
      .reduce(
        (total, item) => total + Number(item.valor || 0),
        0
      );

    const expenses = rows
      .filter(item => !isRevenue(item))
      .reduce(
        (total, item) => total + Number(item.valor || 0),
        0
      );

    const balance = revenue - expenses;

    $("totalRevenue").textContent = WJ.money(revenue);
    $("totalExpenses").textContent = WJ.money(expenses);

    $("totalBalance").textContent = WJ.money(balance);

    $("totalBalance").classList.toggle(
      "bad",
      balance < 0
    );

    $("totalBalance").classList.toggle(
      "accent",
      balance >= 0
    );

    $("totalTransactions").textContent = rows.length;
  }

  // =====================================
  // BADGE DE PAGAMENTO
  // =====================================

  function paymentBadge(payment) {
    const method = String(payment || "").trim();

    if (!method) {
      return `
        <span class="payment-badge">
          Não informado
        </span>
      `;
    }

    const cssClass =
      method === "Pix" ? "pix" :
      method === "Cartão" ? "card" :
      method === "Dinheiro" ? "cash" : "";

    return `
      <span class="payment-badge ${cssClass}">
        ${WJ.escape(method)}
      </span>
    `;
  }

  // =====================================
  // TABELA DE MOVIMENTAÇÕES
  // =====================================

  function renderTable(rows) {
    if (!rows.length) {
      table.innerHTML = `
        <tr>
          <td colspan="8" class="empty-row">
            Nenhuma movimentação encontrada.
          </td>
        </tr>
      `;

      return;
    }

    table.innerHTML = rows.map(item => {
      const revenue = isRevenue(item);
      const stockSale = isStockSale(item);

      const hasWhatsapp =
        revenue &&
        Boolean(normalizeWhatsapp(item.cliente_whatsapp));

      const id = WJ.escape(String(item.id));

      return `
        <tr>
          <td>
            ${WJ.date(item.data)}
          </td>

          <td>
            <span class="client-name">
              ${WJ.escape(item.cliente_nome || "-")}
            </span>

            <span class="client-phone">
              ${WJ.escape(
                formatWhatsapp(item.cliente_whatsapp || "")
              )}
            </span>
          </td>

          <td>
            <span class="transaction-description">
              ${WJ.escape(item.descricao || "")}
            </span>

            ${
              stockSale
                ? `<span class="transaction-notes">
                     Venda automática do estoque
                   </span>`
                : ""
            }

            ${
              item.observacoes
                ? `<span class="transaction-notes">
                     ${WJ.escape(item.observacoes)}
                   </span>`
                : ""
            }
          </td>

          <td>
            ${WJ.escape(item.categoria || "-")}
          </td>

          <td>
            <span class="type-badge ${
              revenue ? "revenue" : "expense"
            }">
              ${revenue ? "Receita" : "Despesa"}
            </span>
          </td>

          <td>
            ${paymentBadge(item.pagamento)}
          </td>

          <td class="${revenue ? "good" : "bad"}">
            ${revenue ? "+" : "-"}
            ${WJ.money(item.valor)}
          </td>

          <td>
            <div class="table-actions">
              ${
                hasWhatsapp
                  ? `
                    <button
                      type="button"
                      class="whatsapp-action"
                      data-action="whatsapp"
                      data-id="${id}"
                    >
                      WhatsApp
                    </button>
                  `
                  : ""
              }

              ${
                stockSale
                  ? `
                    <span class="muted">
                      Registro automático
                    </span>
                  `
                  : `
                    <button
                      type="button"
                      data-action="edit"
                      data-id="${id}"
                    >
                      Editar
                    </button>

                    <button
                      type="button"
                      class="delete-action"
                      data-action="delete"
                      data-id="${id}"
                    >
                      Excluir
                    </button>
                  `
              }
            </div>
          </td>
        </tr>
      `;
    }).join("");
  }

  // =====================================
  // EDITAR, EXCLUIR E WHATSAPP
  // =====================================

  table.addEventListener("click", async event => {
    const button = event.target.closest(
      "button[data-action]"
    );

    if (!button) return;

    const id = button.dataset.id;

    const transaction = transactions.find(
      item => String(item.id) === id
    );

    if (!transaction) {
      WJ.toast("Movimentação não encontrada.");
      await loadData();
      return;
    }

    const action = button.dataset.action;

    if (action === "whatsapp") {
      openWhatsapp(transaction);
      return;
    }

    if (isStockSale(transaction)) {
      WJ.toast(
        "Vendas do estoque não podem ser alteradas aqui."
      );
      return;
    }

    if (action === "edit") {
      editTransaction(transaction);
      return;
    }

    if (action === "delete") {
      const confirmed = confirm(
        `Deseja excluir "${transaction.descricao}"?`
      );

      if (!confirmed) return;

      button.disabled = true;

      try {
        await WJ.api(`/financeiro/${id}`, {
          method: "DELETE"
        });

        await loadData();

        WJ.toast("Movimentação excluída.");

      } catch (error) {
        showError(error, "Erro ao excluir movimentação.");

      } finally {
        button.disabled = false;
      }
    }
  });

  // =====================================
  // RENDERIZAÇÃO
  // =====================================

  function render() {
    const rows = filteredTransactions();

    renderSummary(rows);
    renderTable(rows);

    $("resultsCount").textContent =
      `${rows.length} ` +
      `${rows.length === 1
        ? "movimentação encontrada"
        : "movimentações encontradas"}`;
  }

  searchInput.addEventListener("input", render);
  filterType.addEventListener("change", render);
  filterMonth.addEventListener("change", render);

  $("clearFilters").addEventListener("click", () => {
    searchInput.value = "";
    filterType.value = "";
    filterMonth.value = "";

    render();
  });

  // =====================================
  // EXPORTAR CSV
  // =====================================

  $("exportCSV").addEventListener("click", () => {
    const rows = filteredTransactions();

    if (!rows.length) {
      WJ.toast("Não há movimentações para exportar.");
      return;
    }

    function csvEscape(value) {
      let text = String(value ?? "");

      // Impede execução de fórmulas em planilhas.
      if (/^\s*[=+\-@]/.test(text)) {
        text = "'" + text;
      }

      return `"${text.replace(/"/g, '""')}"`;
    }

    const headers = [
      "Data",
      "Cliente",
      "WhatsApp",
      "Descrição",
      "Categoria",
      "Tipo",
      "Pagamento",
      "Valor",
      "Observações"
    ];

    const lines = [
      headers.map(csvEscape).join(";"),

      ...rows.map(item => [
        WJ.date(item.data),
        item.cliente_nome || "",
        item.cliente_whatsapp || "",
        item.descricao || "",
        item.categoria || "",
        isRevenue(item) ? "Receita" : "Despesa",
        item.pagamento || "",
        Number(item.valor || 0)
          .toFixed(2)
          .replace(".", ","),
        item.observacoes || ""
      ].map(csvEscape).join(";"))
    ];

    WJ.download(
      "financeiro-barbearia-wj.csv",
      "\uFEFF" + lines.join("\r\n"),
      "text/csv;charset=utf-8"
    );

    WJ.toast("Relatório exportado!");
  });

  // =====================================
  // ATUALIZAÇÃO AUTOMÁTICA
  // =====================================

  document.addEventListener("visibilitychange", () => {
    if (!document.hidden && !saving) {
      loadData();
    }
  });

  setInterval(() => {
    if (!document.hidden && !saving) {
      loadData();
    }
  }, 60000);

  // =====================================
  // INICIALIZAÇÃO
  // =====================================

  updateCategories();
  updateClientFields();

  await loadData();
});
