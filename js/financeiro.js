
"use strict";
document.addEventListener("DOMContentLoaded", () => {
if (!WJ.init("financeiro")) return;
const $ = id => document.getElementById(id);
const form = $("transactionForm");
const section = $("transactionSection");
const table = $("transactionTable");
const idInput = $("transactionId");
const typeInput = $("transactionType");
const dateInput = $("transactionDate");
const descriptionInput = $("transactionDescription");
const categoryInput = $("transactionCategory");
const valueInput = $("transactionValue");
const paymentInput = $("transactionPayment");
const notesInput = $("transactionNotes");
const clientNameInput = $("clientName");
const clientWhatsappInput = $("clientWhatsapp");
const searchInput = $("searchTransaction");
const filterType = $("filterType");
const filterMonth = $("filterMonth");
const SALES_KEY = "bwj_vendas_produtos";
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
let transactions = WJ.finance();
const roundMoney = value =>
Math.round((value + Number.EPSILON) * 100) / 100;
const roundQuantity = value =>
Math.round(value * 1000) / 1000;
const formatQuantity = value =>
Number(value || 0).toLocaleString("pt-BR", {
maximumFractionDigits: 3
});
const isStockSale = item =>
item.origem === "estoque" || Boolean(item.vendaId);
// =====================================
// SELEÇÃO DE PRODUTOS DO ESTOQUE
// =====================================
const productPanel = document.createElement("section");
productPanel.id = "financeProductPanel";
productPanel.className = "sale-panel";
productPanel.hidden = true;
productPanel.innerHTML = `
  <div class="sale-panel-header">
    <div class="sale-panel-icon"><i data-lucide="shopping-bag"></i></div>
    <div class="sale-panel-heading">
      <strong>Venda de produto</strong>
      <span>Escolha um produto e defina o preço na hora da venda</span>
    </div>
    <span class="sale-panel-tag">ESTOQUE</span>
  </div>
  <div class="sale-panel-fields">
    <div class="sale-field sale-field-product">
      <label for="financeProduct">Produto do estoque</label>
      <select id="financeProduct"><option value="">Selecione um produto</option></select>
    </div>
    <div class="sale-field">
      <label for="financeProductQty">Quantidade</label>
      <input id="financeProductQty" type="number" min="0.001" step="0.001" value="1">
    </div>
    <div class="sale-field">
      <label for="financeSaleUnitPrice">Preço unitário (R$)</label>
      <input id="financeSaleUnitPrice" type="number" min="0.01" step="0.01" placeholder="Ex.: 35,00">
    </div>
  </div>
  <div class="sale-panel-stock"><i data-lucide="package-check"></i><span id="financeProductInfo">Selecione um produto disponível.</span></div>
  <div class="sale-panel-total">
    <div><span class="sale-total-label">TOTAL DA VENDA</span><small id="financeTotalDetails">Informe a quantidade e o preço unitário</small></div>
    <strong id="financeTotalDisplay">R$ 0,00</strong>
  </div>
`;
const categoryContainer = categoryInput.closest(".field") || categoryInput.parentElement;
const formGrid = categoryInput.closest(".form-grid");
if (formGrid) {
  formGrid.insertAdjacentElement("afterend", productPanel);
} else {
  categoryContainer.insertAdjacentElement("afterend", productPanel);
}
if (window.lucide) window.lucide.createIcons({ nodes: [productPanel] });
const productInput = $("financeProduct");
const productQtyInput = $("financeProductQty");
const saleUnitPriceInput = $("financeSaleUnitPrice");
const productInfo = $("financeProductInfo");
const totalDisplay = $("financeTotalDisplay");
const totalDetails = $("financeTotalDetails");
function isProductCategory() {
return typeInput.value === "Receita" &&
categoryInput.value === "Produtos vendidos";
}
function selectedProduct() {
return WJ.stock().find(
item => String(item.id) === productInput.value
);
}
function loadStockProducts() {
const selected = productInput.value;
const products = WJ.stock();
productInput.replaceChildren();
const placeholder = document.createElement("option");
placeholder.value = "";
placeholder.textContent = "Selecione um produto";
productInput.appendChild(placeholder);
products.forEach(product => {
const option = document.createElement("option");
option.value = String(product.id);
option.textContent =
`${product.nome} — ${formatQuantity(product.qtd)} ${product.un || "unid."}`;
option.disabled = Number(product.qtd) <= 0;
productInput.appendChild(option);
});
if (
products.some(
item => String(item.id) === selected &&
Number(item.qtd) > 0
)
) {
productInput.value = selected;
}
if (!productInput.value) {
productInfo.textContent =
products.length
? "Selecione um produto disponível."
: "Nenhum produto cadastrado no Estoque.";
}
}
function updateProductCalculation() {
if (!isProductCategory()) return;
const product = selectedProduct();
const quantity = Number(productQtyInput.value);
if (!product) {
descriptionInput.value = "";
valueInput.value = "";
productInfo.textContent =
"Selecione um produto cadastrado no Estoque.";
totalDisplay.textContent = WJ.money(0);
totalDetails.textContent = "Informe a quantidade e o preço unitário";
return;
}
const available = Number(product.qtd);
const unitPrice = Number(saleUnitPriceInput.value);
productQtyInput.max = String(available);
productInfo.textContent =
`Disponível: ${formatQuantity(available)} ${product.un || "unid."}. ` +
`Defina o preço de venda acima (o preço de compra não será usado).`;
descriptionInput.value =
`Venda de produto: ${product.nome} (${formatQuantity(quantity)} ${product.un || "unid."})`;
valueInput.value =
quantity > 0 && Number.isFinite(unitPrice) && unitPrice > 0
? roundMoney(quantity * unitPrice).toFixed(2)
: "";
const total = quantity > 0 && Number.isFinite(unitPrice) && unitPrice > 0
  ? roundMoney(quantity * unitPrice) : 0;
totalDisplay.textContent = WJ.money(total);
totalDetails.textContent = total > 0
  ? `${formatQuantity(quantity)} × ${WJ.money(unitPrice)}`
  : "Informe a quantidade e o preço unitário";
}
function updateProductFields() {
const active = isProductCategory();
productPanel.hidden = !active;
productInput.required = active;
productQtyInput.required = active;
saleUnitPriceInput.required = active;
descriptionInput.readOnly = active;
valueInput.readOnly = active;
const descriptionField = descriptionInput.closest(".field");
const valueField = valueInput.closest(".field");
if (descriptionField) descriptionField.hidden = active;
if (valueField) valueField.hidden = active;
// Campos continuam no formulário para preservar o salvamento.
if (active) {
loadStockProducts();
updateProductCalculation();
}
}
productInput.addEventListener(
"change",
updateProductCalculation
);
productQtyInput.addEventListener(
"input",
updateProductCalculation
);
saleUnitPriceInput.addEventListener("input", updateProductCalculation);
categoryInput.addEventListener(
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
const digits = digitsOnly(value).replace(/^55/, "");
if (digits.length === 11) {
return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
}
if (digits.length === 10) {
return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
}
return String(value || "");
}
clientWhatsappInput.addEventListener("input", () => {
const digits = digitsOnly(clientWhatsappInput.value);
if (digits.length <= 11) {
clientWhatsappInput.value = formatWhatsapp(digits);
}
});
// =====================================
// CATEGORIAS
// =====================================
function updateCategories(selected = "") {
const options = categories[typeInput.value] || [];
categoryInput.replaceChildren();
options.forEach(category => {
const option = document.createElement("option");
option.value = category;
option.textContent = category;
categoryInput.appendChild(option);
});
if (selected && !options.includes(selected)) {
const option = document.createElement("option");
option.value = selected;
option.textContent = selected;
categoryInput.appendChild(option);
}
if (selected) {
categoryInput.value = selected;
}
updateProductFields();
}
function updateClientFields() {
const revenue = typeInput.value === "Receita";
document
.querySelectorAll("[data-client-field]")
.forEach(field => {
field.hidden = !revenue;
});
if ($("clientHint")) {
$("clientHint").hidden = !revenue;
}
clientNameInput.disabled = !revenue;
clientWhatsappInput.disabled = !revenue;
}
typeInput.addEventListener("change", () => {
updateCategories();
updateClientFields();
});
// =====================================
// FORMULÁRIO
// =====================================
function openForm(transaction = null) {
if (transaction && isStockSale(transaction)) {
WJ.toast(
"Vendas do estoque não podem ser editadas diretamente."
);
return;
}
form.reset();
idInput.value = "";
dateInput.value = WJ.today();
typeInput.value = "Receita";
paymentInput.value = "";
productInput.value = "";
productQtyInput.value = "1";
saleUnitPriceInput.value = "";
updateCategories();
updateClientFields();
if (transaction) {
idInput.value = transaction.id;
typeInput.value = transaction.tipo;
dateInput.value = transaction.data;
descriptionInput.value = transaction.desc || "";
valueInput.value = transaction.valor;
notesInput.value = transaction.obs || "";
clientNameInput.value = transaction.cliente || "";
clientWhatsappInput.value = transaction.whatsapp || "";
updateCategories(transaction.categoria || "");
updateClientFields();
const savedPayment = transaction.pagamento || "";
if (
savedPayment &&
!paymentMethods.includes(savedPayment)
) {
const option = document.createElement("option");
option.value = savedPayment;
option.textContent = savedPayment;
paymentInput.appendChild(option);
}
paymentInput.value = savedPayment;
}
$("formTitle").textContent = transaction
? "Editar movimentação"
: "Nova movimentação";
$("saveTransaction").textContent = transaction
? "Salvar alterações"
: "Salvar movimentação";
section.hidden = false;
section.scrollIntoView({
behavior: "smooth",
block: "start"
});
}
function closeForm() {
section.hidden = true;
form.reset();
idInput.value = "";
productInput.value = "";
saleUnitPriceInput.value = "";
productPanel.hidden = true;
descriptionInput.readOnly = false;
valueInput.readOnly = false;
const descriptionField = descriptionInput.closest(".field");
const valueField = valueInput.closest(".field");
if (descriptionField) descriptionField.hidden = false;
if (valueField) valueField.hidden = false;
}
$("newTransaction").addEventListener(
"click",
() => openForm()
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
// SALVAR VENDA OU MOVIMENTAÇÃO
// =====================================
form.addEventListener("submit", event => {
event.preventDefault();
const isRevenue = typeInput.value === "Receita";
const payment = paymentInput.value;
if (!paymentMethods.includes(payment)) {
WJ.toast("Selecione Pix, Cartão ou Dinheiro.");
return;
}
const rawWhatsapp = isRevenue
? clientWhatsappInput.value.trim()
: "";
const whatsapp = rawWhatsapp
? normalizeWhatsapp(rawWhatsapp)
: "";
if (rawWhatsapp && !whatsapp) {
WJ.toast("Informe um WhatsApp válido com DDD.");
return;
}
const client = isRevenue
? clientNameInput.value.trim()
: "";
transactions = WJ.finance();
// =====================================
// VENDA DE PRODUTO DO ESTOQUE
// =====================================
if (isProductCategory()) {
if (idInput.value) {
WJ.toast(
"Não é possível transformar uma movimentação existente em venda do estoque."
);
return;
}
const products = WJ.stock();
const product = products.find(
item => String(item.id) === productInput.value
);
if (!product) {
WJ.toast("Selecione um produto do estoque.");
return;
}
const quantity = Number(productQtyInput.value);
const available = Number(product.qtd);
if (
!Number.isFinite(quantity) ||
quantity <= 0 ||
roundQuantity(quantity) !== quantity
) {
WJ.toast("Informe uma quantidade válida.");
return;
}
if (quantity > available) {
WJ.toast("Estoque insuficiente para a venda.");
loadStockProducts();
updateProductCalculation();
return;
}
const unitPrice = Number(saleUnitPriceInput.value);
const total = roundMoney(quantity * unitPrice);
if (
!Number.isFinite(total) ||
total <= 0
) {
WJ.toast("Informe o preço de venda unitário.");
return;
}
const saleId = WJ.id();
const transactionId = WJ.id();
const description =
`Venda de produto: ${product.nome} ` +
`(${formatQuantity(quantity)} ${product.un || "unid."})`;
const transaction = {
id: transactionId,
tipo: "Receita",
data: dateInput.value || WJ.today(),
desc: description,
categoria: "Produtos vendidos",
valor: total,
pagamento: payment,
obs: notesInput.value.trim(),
cliente: client,
whatsapp,
origem: "estoque",
vendaId: saleId,
produtoId: String(product.id),
quantidadeVendida: quantity,
precoUnitario: unitPrice
};
const sale = {
id: saleId,
transactionId,
data: transaction.data,
produtoId: String(product.id),
produto: product.nome,
unidade: product.un || "unid.",
quantidade: quantity,
precoUnitario: unitPrice,
total,
pagamento: payment,
cliente: client
};
const sales = WJ.get(SALES_KEY);
const previousStock =
localStorage.getItem(WJ.keys.stock);
const previousFinance =
localStorage.getItem(WJ.keys.finance);
const previousSales =
localStorage.getItem(SALES_KEY);
product.qtd = roundQuantity(
available - quantity
);
try {
WJ.save(
WJ.keys.finance,
[...transactions, transaction]
);
WJ.save(
SALES_KEY,
[...sales, sale]
);
WJ.save(
WJ.keys.stock,
products
);
} catch (error) {
console.error("Erro ao registrar venda:", error);
try {
const restore = (key, value) => {
if (value === null) {
localStorage.removeItem(key);
} else {
localStorage.setItem(key, value);
}
};
restore(WJ.keys.stock, previousStock);
restore(WJ.keys.finance, previousFinance);
restore(SALES_KEY, previousSales);
} catch (restoreError) {
console.error(
"Erro ao restaurar registros:",
restoreError
);
}
WJ.toast("Não foi possível salvar a venda.");
return;
}
transactions = WJ.finance();
closeForm();
render();
WJ.toast(
`Venda registrada: ${WJ.money(total)}`
);
return;
}
// =====================================
// MOVIMENTAÇÕES NORMAIS
// =====================================
const value = Number(valueInput.value);
const description = descriptionInput.value.trim();
if (!Number.isFinite(value) || value <= 0) {
WJ.toast("Informe um valor maior que zero.");
return;
}
if (!description) {
WJ.toast("Informe a descrição.");
return;
}
const existingId = idInput.value;
const transaction = {
id: existingId || WJ.id(),
tipo: typeInput.value,
data: dateInput.value || WJ.today(),
desc: description,
categoria: categoryInput.value,
valor: roundMoney(value),
pagamento: payment,
obs: notesInput.value.trim(),
cliente: client,
whatsapp
};
if (existingId) {
const index = transactions.findIndex(
item => String(item.id) === existingId
);
if (index === -1) {
WJ.toast("Movimentação não encontrada.");
return;
}
if (isStockSale(transactions[index])) {
WJ.toast(
"Esta venda está vinculada ao Estoque."
);
return;
}
transactions[index] = {
...transactions[index],
...transaction
};
} else {
transactions.push(transaction);
}
try {
WJ.save(WJ.keys.finance, transactions);
} catch (error) {
console.error(error);
WJ.toast("Erro ao salvar movimentação.");
return;
}
closeForm();
render();
WJ.toast(
existingId
? "Movimentação atualizada!"
: "Movimentação cadastrada!"
);
});
// =====================================
// FILTROS E INDICADORES
// =====================================
function filteredTransactions() {
const search = searchInput.value
.trim()
.toLocaleLowerCase("pt-BR");
const type = filterType.value;
const month = filterMonth.value;
return transactions
.filter(item => {
const searchable = [
item.desc,
item.categoria,
item.cliente,
item.whatsapp,
item.pagamento
]
.join(" ")
.toLocaleLowerCase("pt-BR");
return (
searchable.includes(search) &&
(!type || item.tipo === type) &&
(
!month ||
String(item.data || "").startsWith(month)
)
);
})
.sort((a, b) =>
String(b.data || "").localeCompare(
String(a.data || "")
)
);
}
function renderSummary(rows) {
const revenue = WJ.sum(rows, "Receita");
const expenses = WJ.sum(rows, "Despesa");
const balance = revenue - expenses;
$("totalRevenue").textContent =
WJ.money(revenue);
$("totalExpenses").textContent =
WJ.money(expenses);
const balanceElement = $("totalBalance");
balanceElement.textContent =
WJ.money(balance);
balanceElement.classList.toggle(
"bad",
balance < 0
);
balanceElement.classList.toggle(
"accent",
balance >= 0
);
$("totalTransactions").textContent =
rows.length;
}
// =====================================
// WHATSAPP
// =====================================
function openWhatsapp(transaction) {
if (transaction.tipo !== "Receita") {
WJ.toast(
"Agradecimentos disponíveis para receitas."
);
return;
}
const phone = normalizeWhatsapp(
transaction.whatsapp
);
if (!phone) {
WJ.toast(
"Cadastre um WhatsApp válido para o cliente."
);
return;
}
const name = String(
transaction.cliente || ""
).trim();
const message = isStockSale(transaction)
? `E aí${name ? ", " + name : ""}!\n\nObrigado pela compra e pela confiança na Barbearia WJ!\n\nTamo junto!`
: `E aí${name ? ", " + name : ""}!\n\nObrigado pela confiança, esperamos que tenha curtido nosso serviço!\n\nTamo junto, até o próximo corte!`;
window.open(
`https://wa.me/${phone}?text=${encodeURIComponent(message)}`,
"_blank",
"noopener,noreferrer"
);
}
// =====================================
// FORMA DE PAGAMENTO
// =====================================
function paymentBadge(payment) {
const method = String(payment || "").trim();
if (!method) {
return `<span class="payment-badge">Não informado</span>`;
}
const paymentClass =
method === "Pix" ? "pix" :
method === "Cartão" ? "card" :
method === "Dinheiro" ? "cash" : "";
return `
<span class="payment-badge ${paymentClass}">
${WJ.escape(method)}
</span>
`;
}
// =====================================
// HISTÓRICO
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
const revenue = item.tipo === "Receita";
const stockSale = isStockSale(item);
const hasWhatsapp =
revenue &&
Boolean(normalizeWhatsapp(item.whatsapp));
const id = WJ.escape(String(item.id));
return `
<tr>
<td>${WJ.date(item.data)}</td>
<td>
<span class="client-name">
${WJ.escape(item.cliente || "-")}
</span>
<span class="client-phone">
${WJ.escape(
formatWhatsapp(item.whatsapp || "")
)}
</span>
</td>
<td>
<span class="transaction-description">
${WJ.escape(item.desc || "")}
</span>
${
stockSale
? `<span class="transaction-notes">
Venda automática do estoque
</span>`
: ""
}
${
item.obs
? `<span class="transaction-notes">
${WJ.escape(item.obs)}
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
${WJ.escape(item.tipo)}
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
? `<button
  type="button"
  class="delete-action"
  data-action="cancel-sale"
  data-id="${id}"
  title="Cancelar venda e devolver produtos ao estoque"
>
Cancelar venda
</button>`
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
// CANCELAR VENDA DO ESTOQUE
// =====================================
function cancelStockSale(transaction) {
  // A origem pode ser tanto a tela Estoque quanto o Financeiro.
  // Algumas vendas antigas não possuem registro separado em SALES_KEY.
  const currentFinance = WJ.finance();
  const current = currentFinance.find(
    item => String(item.id) === String(transaction.id)
  );
  if (!current || !isStockSale(current)) {
    WJ.toast("Venda automática não encontrada.");
    return;
  }

  const sales = WJ.get(SALES_KEY);
  if (!Array.isArray(sales)) {
    WJ.toast("Não foi possível consultar o histórico de vendas.");
    return;
  }

  const matchingSales = sales.filter(sale =>
    String(sale.transactionId || "") === String(current.id) ||
    (current.vendaId && String(sale.id) === String(current.vendaId))
  );
  if (matchingSales.length > 1) {
    WJ.toast("Venda com vínculos duplicados. Cancelamento bloqueado.");
    return;
  }
  const sale = matchingSales[0] || null;

  const productId = String(current.produtoId || sale?.produtoId || "");
  const quantity = Number(current.quantidadeVendida ?? sale?.quantidade);
  const products = WJ.stock();
  const product = products.find(item => String(item.id) === productId);

  if (!product || !Number.isFinite(quantity) || quantity <= 0 ||
      roundQuantity(quantity) !== quantity ||
      !Number.isFinite(Number(product.qtd)) || Number(product.qtd) < 0) {
    WJ.toast("Produto ou quantidade original não identificado. Cancelamento bloqueado.");
    return;
  }

  if (sale && (
    String(sale.produtoId) !== productId ||
    Math.abs(Number(sale.quantidade) - quantity) > 0.000001
  )) {
    WJ.toast("Os dados da venda não coincidem. Cancelamento bloqueado.");
    return;
  }

  const restored = roundQuantity(Number(product.qtd) + quantity);
  if (!Number.isFinite(restored)) {
    WJ.toast("Não foi possível calcular a devolução ao estoque.");
    return;
  }

  const confirmed = window.confirm(
    `Cancelar a venda de ${formatQuantity(quantity)} ${product.un || "unid."} ` +
    `de ${product.nome} por ${WJ.money(current.valor)}?\n\n` +
    "A receita será removida do Financeiro e a quantidade devolvida ao estoque."
  );
  if (!confirmed) return;

  // Guardar as três chaves antes de alterar qualquer registro.
  const keys = [WJ.keys.finance, WJ.keys.stock, SALES_KEY];
  const snapshot = keys.map(key => [key, localStorage.getItem(key)]);
  const nextProducts = products.map(item =>
    String(item.id) === productId ? { ...item, qtd: restored } : item
  );
  const nextFinance = currentFinance.filter(item =>
    String(item.id) !== String(current.id)
  );
  const nextSales = sale
    ? sales.filter(item => String(item.id) !== String(sale.id))
    : sales;

  try {
    WJ.save(WJ.keys.stock, nextProducts);
    WJ.save(WJ.keys.finance, nextFinance);
    if (sale) WJ.save(SALES_KEY, nextSales);
  } catch (error) {
    console.error("Falha ao cancelar venda:", error);
    let rollbackFailed = false;
    for (const [key, value] of snapshot) {
      try {
        if (value === null) localStorage.removeItem(key);
        else localStorage.setItem(key, value);
      } catch (restoreError) {
        rollbackFailed = true;
        console.error("Falha na restauração de", key, restoreError);
      }
    }
    transactions = WJ.finance();
    render();
    WJ.toast(rollbackFailed
      ? "Erro grave ao restaurar dados. Confira Financeiro e Estoque antes de continuar."
      : "Não foi possível cancelar a venda. Alterações revertidas.");
    return;
  }

  transactions = WJ.finance();
  render();
  WJ.toast("Venda cancelada. Quantidade devolvida ao estoque.");
}

// =====================================
// AÇÕES DO HISTÓRICO
// =====================================
table.addEventListener("click", event => {
const button = event.target.closest(
"button[data-action]"
);
if (!button) return;
transactions = WJ.finance();
const id = button.dataset.id;
const transaction = transactions.find(
item => String(item.id) === id
);
if (!transaction) {
WJ.toast("Movimentação não encontrada.");
render();
return;
}
if (button.dataset.action === "whatsapp") {
openWhatsapp(transaction);
return;
}
if (isStockSale(transaction)) {
  if (button.dataset.action === "cancel-sale") {
    cancelStockSale(transaction);
  } else {
    WJ.toast("Vendas do estoque só podem ser canceladas, não editadas.");
  }
  return;
}
if (button.dataset.action === "edit") {
openForm(transaction);
return;
}
if (button.dataset.action === "delete") {
const confirmed = confirm(
`Deseja excluir a movimentação "${transaction.desc}"?`
);
if (!confirmed) return;
transactions = transactions.filter(
item => String(item.id) !== id
);
WJ.save(WJ.keys.finance, transactions);
render();
WJ.toast("Movimentação excluída.");
}
});
// =====================================
// ATUALIZAR TELA
// =====================================
function render() {
const rows = filteredTransactions();
renderSummary(rows);
renderTable(rows);
$("resultsCount").textContent =
`${rows.length} movimentação${rows.length === 1 ? "" : "ões"}`;
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
transactions = WJ.finance();
const rows = filteredTransactions();
if (!rows.length) {
WJ.toast("Não há movimentações para exportar.");
return;
}
const csvEscape = value =>
`"${String(value ?? "").replace(/"/g, '""')}"`;
const header = [
"Data",
"Cliente",
"WhatsApp",
"Descrição",
"Categoria",
"Tipo",
"Forma de pagamento",
"Valor",
"Observações"
];
const lines = [
header.map(csvEscape).join(";"),
...rows.map(item => [
WJ.date(item.data),
item.cliente || "",
item.whatsapp || "",
item.desc || "",
item.categoria || "",
item.tipo || "",
item.pagamento || "Não informado",
Number(item.valor || 0)
.toFixed(2)
.replace(".", ","),
item.obs || ""
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
// SINCRONIZAÇÃO
// =====================================
window.addEventListener("storage", event => {
if (event.key === WJ.keys.finance) {
transactions = WJ.finance();
render();
}
if (
event.key === WJ.keys.stock &&
!productPanel.hidden
) {
loadStockProducts();
updateProductCalculation();
}
});
document.addEventListener("visibilitychange", () => {
if (!document.hidden) {
transactions = WJ.finance();
render();
if (!productPanel.hidden) {
loadStockProducts();
updateProductCalculation();
}
}
});
// =====================================
// INICIAR
// =====================================
updateCategories();
updateClientFields();
render();
});
