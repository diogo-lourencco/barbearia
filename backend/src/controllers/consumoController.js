
"use strict";

const pool = require("../config/database");
const { baixarEstoque } = require("../services/estoqueService");

// ==========================================
// VALIDAÇÕES
// ==========================================

function idValido(valor) {
  return (
    /^\d+$/.test(String(valor)) &&
    Number.isSafeInteger(Number(valor)) &&
    Number(valor) > 0
  );
}

function quantidadeValida(valor) {
  if (valor === null || valor === undefined || valor === "") {
    return false;
  }

  const numero = Number(valor);

  return (
    Number.isFinite(numero) &&
    numero > 0 &&
    numero <= 999999999 &&
    Math.abs(Math.round(numero * 1000) / 1000 - numero) < 0.0000001
  );
}

function dataValida(data) {
  if (typeof data !== "string") return false;

  if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) {
    return false;
  }

  const dataObj = new Date(`${data}T12:00:00Z`);

  return (
    !Number.isNaN(dataObj.getTime()) &&
    dataObj.toISOString().slice(0, 10) === data
  );
}

// ==========================================
// LISTAR CONSUMOS
// ==========================================

async function listar(req, res, next) {
  try {
    const resultado = await pool.query(
      `SELECT
         c.id,
         c.produto_id,
         c.quantidade,
         c.observacoes,
         c.observacoes AS motivo,
         TO_CHAR(
           c.criado_em AT TIME ZONE 'America/Sao_Paulo',
           'YYYY-MM-DD'
         ) AS data,
         c.criado_em,
         c.criado_por,
         p.nome AS produto_nome,
         p.unidade
       FROM consumos c
       JOIN produtos p ON p.id = c.produto_id
       ORDER BY c.criado_em DESC, c.id DESC`
    );

    return res.json(resultado.rows);
  } catch (erro) {
    return next(erro);
  }
}

// ==========================================
// CADASTRAR CONSUMO
// ==========================================

async function cadastrar(req, res, next) {
  const {
    produto_id,
    quantidade,
    motivo,
    observacoes,
    data
  } = req.body || {};

  const motivoFinal = String(
    motivo ?? observacoes ?? ""
  ).trim();

  if (!idValido(produto_id)) {
    return res.status(400).json({
      erro: "Selecione um produto válido."
    });
  }

  if (!quantidadeValida(quantidade)) {
    return res.status(400).json({
      erro: "Informe uma quantidade positiva com até três casas decimais."
    });
  }

  if (!motivoFinal) {
    return res.status(400).json({
      erro: "Informe o motivo do consumo."
    });
  }

  if (motivoFinal.length > 2000) {
    return res.status(400).json({
      erro: "O motivo deve ter no máximo 2000 caracteres."
    });
  }

  if (
    data !== undefined &&
    data !== null &&
    !dataValida(data)
  ) {
    return res.status(400).json({
      erro: "Informe uma data válida."
    });
  }

  let client;
  let transacaoIniciada = false;

  try {
    client = await pool.connect();

    await client.query("BEGIN");
    transacaoIniciada = true;

    const produto = await baixarEstoque(
      client,
      produto_id,
      Number(quantidade)
    );

    const resultado = await client.query(
      `INSERT INTO consumos (
         produto_id,
         quantidade,
         observacoes,
         criado_por
       )
       VALUES ($1, $2, $3, $4)
       RETURNING
         id,
         produto_id,
         quantidade,
         observacoes,
         observacoes AS motivo,
         TO_CHAR(
           criado_em AT TIME ZONE 'America/Sao_Paulo',
           'YYYY-MM-DD'
         ) AS data,
         criado_em,
         criado_por`,
      [
        produto_id,
        Number(quantidade),
        motivoFinal,
        req.session.usuario.id
      ]
    );

    await client.query("COMMIT");
    transacaoIniciada = false;

    return res.status(201).json({
      mensagem: "Consumo registrado e estoque atualizado!",
      consumo: resultado.rows[0],
      produto
    });

  } catch (erro) {
    if (transacaoIniciada && client) {
      try {
        await client.query("ROLLBACK");
      } catch (rollbackErro) {
        console.error("Erro no rollback:", rollbackErro);
      }
    }

    return next(erro);

  } finally {
    if (client) client.release();
  }
}

// ==========================================
// EXCLUIR CONSUMO E DEVOLVER AO ESTOQUE
// ==========================================

async function excluir(req, res, next) {
  const { id } = req.params;

  if (!idValido(id)) {
    return res.status(400).json({
      erro: "ID do consumo inválido."
    });
  }

  let client;
  let transacaoIniciada = false;

  try {
    client = await pool.connect();

    await client.query("BEGIN");
    transacaoIniciada = true;

    // Bloqueia o registro para evitar exclusões simultâneas.
    const consulta = await client.query(
      `SELECT
         c.id,
         c.produto_id,
         c.quantidade
       FROM consumos c
       WHERE c.id = $1
       FOR UPDATE`,
      [id]
    );

    if (!consulta.rowCount) {
      await client.query("ROLLBACK");
      transacaoIniciada = false;

      return res.status(404).json({
        erro: "Consumo não encontrado."
      });
    }

    const consumo = consulta.rows[0];

    // Devolve a quantidade ao produto.
    const atualizacao = await client.query(
      `UPDATE produtos
       SET
         quantidade = quantidade + $1,
         atualizado_em = NOW()
       WHERE id = $2
       RETURNING id, nome, quantidade`,
      [
        consumo.quantidade,
        consumo.produto_id
      ]
    );

    if (!atualizacao.rowCount) {
      throw new Error(
        "Produto vinculado ao consumo não encontrado."
      );
    }

    // Exclui o consumo.
    await client.query(
      `DELETE FROM consumos WHERE id = $1`,
      [id]
    );

    await client.query("COMMIT");
    transacaoIniciada = false;

    return res.json({
      mensagem:
        "Consumo excluído e quantidade devolvida ao estoque.",
      consumo_id: Number(id),
      quantidade_devolvida: consumo.quantidade,
      produto: atualizacao.rows[0]
    });

  } catch (erro) {
    if (transacaoIniciada && client) {
      try {
        await client.query("ROLLBACK");
      } catch (rollbackErro) {
        console.error("Erro no rollback:", rollbackErro);
      }
    }

    return next(erro);

  } finally {
    if (client) client.release();
  }
}

// ==========================================
// EXPORTAÇÕES
// ==========================================

module.exports = {
  listar,
  cadastrar,
  excluir
};
