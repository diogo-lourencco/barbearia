
"use strict";

// ==========================================
// VALIDAÇÃO DE QUANTIDADE
// ==========================================

function quantidadeValida(valor) {
  if (
    valor === null ||
    valor === undefined ||
    valor === ""
  ) {
    return false;
  }

  const numero = Number(valor);

  return (
    Number.isFinite(numero) &&
    numero > 0 &&
    Number.isFinite(numero * 1000) &&
    Math.abs(
      Math.round(numero * 1000) - numero * 1000
    ) < 0.0000001
  );
}

// ==========================================
// BAIXAR ESTOQUE
// ==========================================

async function baixarEstoque(client, produtoId, quantidade) {
  const id = Number(produtoId);
  const quantidadeNumerica = Number(quantidade);

  if (
    !Number.isSafeInteger(id) ||
    id <= 0
  ) {
    const erro = new Error("Produto inválido.");
    erro.status = 400;
    throw erro;
  }

  if (!quantidadeValida(quantidade)) {
    const erro = new Error(
      "Informe uma quantidade positiva com até três casas decimais."
    );

    erro.status = 400;
    throw erro;
  }

  // A condição quantidade >= $1 impede
  // que o estoque fique negativo.
  //
  // A atualização é atômica no PostgreSQL.

  const resultado = await client.query(
    `UPDATE produtos
     SET
       quantidade = quantidade - $1,
       atualizado_em = NOW()
     WHERE id = $2
       AND quantidade >= $1
     RETURNING *`,
    [
      quantidadeNumerica,
      id
    ]
  );

  if (!resultado.rowCount) {
    const erro = new Error(
      "Produto não encontrado ou estoque insuficiente."
    );

    erro.status = 409;
    throw erro;
  }

  return resultado.rows[0];
}

module.exports = {
  baixarEstoque
};
