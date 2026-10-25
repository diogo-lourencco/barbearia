
"use strict";

const pool = require("../config/database");

// =====================================
// VALIDAÇÕES
// =====================================

function numeroValido(valor, minimo = 0) {
  return (
    valor !== null &&
    valor !== undefined &&
    valor !== "" &&
    Number.isFinite(Number(valor)) &&
    Number(valor) >= minimo
  );
}

function idValido(id) {
  return /^[1-9]\d*$/.test(String(id ?? ""));
}

// =====================================
// LISTAR PRODUTOS
// =====================================

async function listar(req, res, next) {
  try {
    const arquivados = req.query.arquivados === "true";

    const resultado = await pool.query(
      `
      SELECT
        *,
        (quantidade <= estoque_minimo) AS alerta,
        (quantidade * custo_unitario) AS valor_estoque
      FROM produtos
      WHERE ativo = $1
      ORDER BY nome ASC
      `,
      [!arquivados]
    );

    return res.json(resultado.rows);
  } catch (erro) {
    return next(erro);
  }
}

// =====================================
// CADASTRAR PRODUTO
// =====================================

async function cadastrar(req, res, next) {
  try {
    const {
      nome,
      unidade = "un",
      quantidade = 0,
      estoque_minimo = 0,
      custo_unitario = 0,
      preco_venda = 0
    } = req.body || {};

    if (
      typeof nome !== "string" ||
      !nome.trim() ||
      nome.length > 160
    ) {
      return res.status(400).json({
        erro: "Nome inválido."
      });
    }

    if (
      typeof unidade !== "string" ||
      !unidade.trim() ||
      unidade.length > 30 ||
      !numeroValido(quantidade) ||
      !numeroValido(estoque_minimo) ||
      !numeroValido(custo_unitario) ||
      !numeroValido(preco_venda)
    ) {
      return res.status(400).json({
        erro: "Confira os dados do produto."
      });
    }

    const resultado = await pool.query(
      `
      INSERT INTO produtos (
        nome,
        unidade,
        quantidade,
        estoque_minimo,
        custo_unitario,
        preco_venda
      )
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
      `,
      [
        nome.trim(),
        unidade.trim(),
        quantidade,
        estoque_minimo,
        custo_unitario,
        preco_venda
      ]
    );

    return res.status(201).json(resultado.rows[0]);
  } catch (erro) {
    return next(erro);
  }
}

// =====================================
// ATUALIZAR PRODUTO
// =====================================

async function atualizar(req, res, next) {
  try {
    const { id } = req.params;

    if (!idValido(id)) {
      return res.status(400).json({
        erro: "ID inválido."
      });
    }

    const {
      nome,
      unidade,
      quantidade,
      estoque_minimo,
      custo_unitario,
      preco_venda
    } = req.body || {};

    if (
      typeof nome !== "string" ||
      !nome.trim() ||
      nome.length > 160 ||
      typeof unidade !== "string" ||
      !unidade.trim() ||
      unidade.length > 30 ||
      !numeroValido(quantidade) ||
      !numeroValido(estoque_minimo) ||
      !numeroValido(custo_unitario) ||
      !numeroValido(preco_venda)
    ) {
      return res.status(400).json({
        erro: "Confira os dados do produto."
      });
    }

    const resultado = await pool.query(
      `
      UPDATE produtos
      SET
        nome = $1,
        unidade = $2,
        quantidade = $3,
        estoque_minimo = $4,
        custo_unitario = $5,
        preco_venda = $6,
        atualizado_em = NOW()
      WHERE id = $7
        AND ativo = TRUE
      RETURNING *
      `,
      [
        nome.trim(),
        unidade.trim(),
        quantidade,
        estoque_minimo,
        custo_unitario,
        preco_venda,
        id
      ]
    );

    if (!resultado.rowCount) {
      return res.status(404).json({
        erro: "Produto ativo não encontrado."
      });
    }

    return res.json(resultado.rows[0]);
  } catch (erro) {
    return next(erro);
  }
}

// =====================================
// EXCLUIR OU ARQUIVAR PRODUTO
// =====================================

async function excluir(req, res, next) {
  const { id } = req.params;

  if (!idValido(id)) {
    return res.status(400).json({
      erro: "ID inválido."
    });
  }

  let cliente;

  try {
    cliente = await pool.connect();

    await cliente.query("BEGIN");

    // Bloqueia o produto durante a operação.
    const existente = await cliente.query(
      `
      SELECT id, nome, ativo
      FROM produtos
      WHERE id = $1
      FOR UPDATE
      `,
      [id]
    );

    if (!existente.rowCount) {
      await cliente.query("ROLLBACK");

      return res.status(404).json({
        erro: "Produto não encontrado."
      });
    }

    if (!existente.rows[0].ativo) {
      await cliente.query("ROLLBACK");

      return res.status(409).json({
        erro: "Este produto já está arquivado."
      });
    }

    // Permite desfazer apenas a tentativa
    // de exclusão, preservando a transação.
    await cliente.query(
      "SAVEPOINT tentativa_exclusao"
    );

    try {
      // Tenta excluir definitivamente.
      const resultado = await cliente.query(
        `
        DELETE FROM produtos
        WHERE id = $1
        RETURNING id, nome
        `,
        [id]
      );

      await cliente.query(
        "RELEASE SAVEPOINT tentativa_exclusao"
      );

      await cliente.query("COMMIT");

      return res.json({
        mensagem: "Produto excluído definitivamente.",
        acao: "excluido",
        produto: resultado.rows[0]
      });

    } catch (erro) {
      // 23001: restrição RESTRICT
      // 23503: violação de chave estrangeira
      if (
        erro.code !== "23001" &&
        erro.code !== "23503"
      ) {
        throw erro;
      }

      // Recupera a transação após a falha
      // na exclusão.
      await cliente.query(
        "ROLLBACK TO SAVEPOINT tentativa_exclusao"
      );

      // Arquiva sem apagar o histórico.
      const resultado = await cliente.query(
        `
        UPDATE produtos
        SET
          ativo = FALSE,
          atualizado_em = NOW()
        WHERE id = $1
        RETURNING id, nome, ativo
        `,
        [id]
      );

      await cliente.query("COMMIT");

      return res.json({
        mensagem:
          "Produto arquivado com sucesso. " +
          "O histórico de vendas e consumo foi preservado.",
        acao: "arquivado",
        produto: resultado.rows[0]
      });
    }

  } catch (erro) {
    if (cliente) {
      try {
        await cliente.query("ROLLBACK");
      } catch (erroRollback) {
        console.error(
          "Erro ao desfazer transação:",
          erroRollback
        );
      }
    }

    console.error(
      "Erro ao excluir ou arquivar produto:",
      erro
    );

    return next(erro);

  } finally {
    if (cliente) {
      cliente.release();
    }
  }
}

// =====================================
// RESTAURAR PRODUTO ARQUIVADO
// =====================================

async function restaurar(req, res, next) {
  try {
    const { id } = req.params;

    if (!idValido(id)) {
      return res.status(400).json({
        erro: "ID inválido."
      });
    }

    const resultado = await pool.query(
      `
      UPDATE produtos
      SET
        ativo = TRUE,
        atualizado_em = NOW()
      WHERE id = $1
        AND ativo = FALSE
      RETURNING *
      `,
      [id]
    );

    if (!resultado.rowCount) {
      return res.status(404).json({
        erro: "Produto arquivado não encontrado."
      });
    }

    return res.json({
      mensagem: "Produto restaurado com sucesso.",
      produto: resultado.rows[0]
    });

  } catch (erro) {
    return next(erro);
  }
}

// =====================================
// EXPORTAÇÕES
// =====================================

module.exports = {
  listar,
  cadastrar,
  atualizar,
  excluir,
  restaurar
};
