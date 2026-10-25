
"use strict";

const argon2 = require("argon2");
const pool = require("../config/database");

// =====================================
// DADOS PÚBLICOS DO USUÁRIO
// =====================================

function usuarioPublico(usuario) {
  return {
    id: usuario.id,
    nome: usuario.nome,
    usuario: usuario.usuario,
    email: usuario.email,
    perfil: usuario.perfil
  };
}

// =====================================
// LOGIN COM USUÁRIO E SENHA
// =====================================

async function login(req, res, next) {
  try {
    const { usuario, senha } = req.body || {};

    if (
      typeof usuario !== "string" ||
      typeof senha !== "string" ||
      !usuario.trim() ||
      !senha
    ) {
      return res.status(400).json({
        erro: "Informe seu usuário e sua senha."
      });
    }

    const nomeUsuario = usuario.trim();

    const resultado = await pool.query(
      `SELECT
         id,
         nome,
         usuario,
         email,
         senha_hash,
         perfil,
         ativo
       FROM usuarios
       WHERE LOWER(usuario) = LOWER($1)
       LIMIT 1`,
      [nomeUsuario]
    );

    const usuarioEncontrado = resultado.rows[0];

    if (!usuarioEncontrado || !usuarioEncontrado.ativo) {
      return res.status(401).json({
        erro: "Usuário ou senha inválidos."
      });
    }

    const senhaValida = await argon2.verify(
      usuarioEncontrado.senha_hash,
      senha
    );

    if (!senhaValida) {
      return res.status(401).json({
        erro: "Usuário ou senha inválidos."
      });
    }

    // Renovar sessão após autenticação
    req.session.regenerate((erro) => {
      if (erro) {
        return next(erro);
      }

      req.session.usuario = usuarioPublico(
        usuarioEncontrado
      );

      req.session.save((erroSalvar) => {
        if (erroSalvar) {
          return next(erroSalvar);
        }

        return res.json({
          mensagem: "Login realizado com sucesso.",
          usuario: req.session.usuario
        });
      });
    });

  } catch (erro) {
    next(erro);
  }
}

// =====================================
// VERIFICAR SESSÃO
// =====================================

async function verificarSessao(req, res, next) {
  try {
    if (!req.session?.usuario) {
      return res.status(401).json({
        autenticado: false
      });
    }

    const resultado = await pool.query(
      `SELECT
         id,
         nome,
         usuario,
         email,
         perfil
       FROM usuarios
       WHERE id = $1
         AND ativo = TRUE`,
      [req.session.usuario.id]
    );

    const usuarioEncontrado = resultado.rows[0];

    if (!usuarioEncontrado) {
      return req.session.destroy((erro) => {
        if (erro) {
          return next(erro);
        }

        return res.status(401).json({
          autenticado: false
        });
      });
    }

    req.session.usuario = usuarioPublico(
      usuarioEncontrado
    );

    return res.json({
      autenticado: true,
      usuario: req.session.usuario
    });

  } catch (erro) {
    next(erro);
  }
}

// =====================================
// LOGOUT
// =====================================

function logout(req, res, next) {
  if (!req.session) {
    return res.json({
      mensagem: "Sessão encerrada."
    });
  }

  req.session.destroy((erro) => {
    if (erro) {
      return next(erro);
    }

    res.clearCookie("wj.sid", {
      path: "/",
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production"
    });

    return res.json({
      mensagem: "Logout realizado com sucesso."
    });
  });
}

// =====================================
// EXPORTAÇÕES
// =====================================

module.exports = {
  login,
  verificarSessao,
  logout
};
