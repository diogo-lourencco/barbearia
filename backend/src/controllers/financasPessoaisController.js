
"use strict";

const pool = require("../config/database");

const CAMPOS = [
  "wallets",
  "transactions",
  "bills",
  "goals",
  "cards",
  "purchases",
  "recurring",
  "transfers",
  "goalMoves",
  "invoicePayments"
];

const vazio = () =>
  Object.fromEntries(
    CAMPOS.map(chave => [chave, []])
  );

function validar(dados) {
  if (
    !dados ||
    typeof dados !== "object" ||
    Array.isArray(dados)
  ) {
    return false;
  }

  if (
    Object.keys(dados).some(
      chave => !CAMPOS.includes(chave)
    )
  ) {
    return false;
  }

  return CAMPOS.every(
    chave =>
      Array.isArray(dados[chave]) &&
      dados[chave].length <= 20000
  );
}

// =====================================
// BUSCAR FINANÇAS PESSOAIS
// =====================================

async function obter(req, res, next) {
  try {
    const usuarioId = req.session.usuario.id;

    const resultado = await pool.query(
      `SELECT dados, revisao
       FROM financas_pessoais_dados
       WHERE usuario_id = $1`,
      [usuarioId]
    );

    if (!resultado.rowCount) {
      return res.json({
        dados: vazio(),
        revisao: 0
      });
    }

    return res.json({
      dados: {
        ...vazio(),
        ...resultado.rows[0].dados
      },
      revisao: Number(resultado.rows[0].revisao)
    });

  } catch (erro) {
    next(erro);
  }
}

// =====================================
// SALVAR FINANÇAS PESSOAIS
// =====================================

async function salvar(req, res, next) {
  try {
    const { dados, revisao } = req.body || {};

    if (
      !validar(dados) ||
      !Number.isSafeInteger(revisao) ||
      revisao < 0
    ) {
      return res.status(400).json({
        erro: "Dados pessoais ou revisão inválidos."
      });
    }

    const usuarioId = req.session.usuario.id;

    const resultado = await pool.query(
      `INSERT INTO financas_pessoais_dados
         (usuario_id, dados, revisao)
       SELECT $1, $2::jsonb, 1
       WHERE $3::bigint = 0
          OR EXISTS (
            SELECT 1
            FROM financas_pessoais_dados
            WHERE usuario_id = $1
          )

       ON CONFLICT (usuario_id)
       DO UPDATE SET
         dados = EXCLUDED.dados,
         revisao = financas_pessoais_dados.revisao + 1,
         atualizado_em = NOW()

       WHERE financas_pessoais_dados.revisao =
         $3::bigint

       RETURNING revisao`,
      [
        usuarioId,
        JSON.stringify(dados),
        revisao
      ]
    );

    if (!resultado.rowCount) {
      return res.status(409).json({
        erro:
          "Os dados foram alterados em outra aba. " +
          "Atualize a página antes de salvar novamente."
      });
    }

    return res.json({
      mensagem: "Finanças pessoais salvas.",
      revisao: Number(resultado.rows[0].revisao)
    });

  } catch (erro) {
    next(erro);
  }
}

module.exports = {
  obter,
  salvar
};
