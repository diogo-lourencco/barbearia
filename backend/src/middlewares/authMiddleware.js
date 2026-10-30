"use strict";

const pool = require("../config/database");

// =====================================
// VALIDAR SESSÃO E USUÁRIO ATIVO
// =====================================

async function exigirLogin(req, res, next) {
  try {
    if (!req.session?.usuario) {
      return res.status(401).json({
        erro: "Você precisa entrar no sistema."
      });
    }

    const resultado = await pool.query(
      `SELECT
         id,
         nome,
         usuario,
         email,
         perfil,
         ativo
       FROM usuarios
       WHERE id = $1
       LIMIT 1`,
      [req.session.usuario.id]
    );

    const usuarioEncontrado = resultado.rows[0];

    if (
      !usuarioEncontrado ||
      usuarioEncontrado.ativo !== true
    ) {
      return req.session.destroy((erro) => {
        if (erro) {
          return next(erro);
        }

        res.clearCookie("wj.sid", {
          path: "/",
          httpOnly: true,
          sameSite: "lax",
          secure: process.env.NODE_ENV === "production"
        });

        return res.status(401).json({
          erro: "Acesso expirado."
        });
      });
    }

    // Atualizar os dados e o perfil com os valores do banco.
    req.session.usuario = {
      id: usuarioEncontrado.id,
      nome: usuarioEncontrado.nome,
      usuario: usuarioEncontrado.usuario,
      email: usuarioEncontrado.email,
      perfil: usuarioEncontrado.perfil
    };

    return next();
  } catch (erro) {
    return next(erro);
  }
}

// =====================================
// VALIDAR ACESSO DO ADMINISTRADOR
// =====================================

function exigirAdmin(req, res, next) {
  return exigirLogin(req, res, () => {
    if (req.session.usuario.perfil !== "admin") {
      return res.status(403).json({
        erro: "Acesso permitido somente ao administrador."
      });
    }

    return next();
  });
}

// =====================================
// EXPORTAÇÕES
// =====================================

module.exports = {
  exigirLogin,
  exigirAdmin
};