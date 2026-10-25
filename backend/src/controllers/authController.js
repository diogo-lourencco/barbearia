
const argon2 = require("argon2");
const pool = require("../config/database");

function usuarioPublico(usuario) {
  return {
    id: usuario.id,
    nome: usuario.nome,
    email: usuario.email,
    perfil: usuario.perfil
  };
}

async function login(req, res, next) {
  try {
    const { email, senha } = req.body || {};

    if (
      typeof email !== "string" ||
      typeof senha !== "string" ||
      !email.trim() ||
      !senha
    ) {
      return res.status(400).json({
        erro: "Informe e-mail e senha."
      });
    }

    const resultado = await pool.query(
      `SELECT id, nome, email, senha_hash, perfil, ativo
       FROM usuarios
       WHERE LOWER(email) = LOWER($1)
       LIMIT 1`,
      [email.trim()]
    );

    const usuario = resultado.rows[0];

    if (!usuario || !usuario.ativo) {
      return res.status(401).json({
        erro: "E-mail ou senha inválidos."
      });
    }

    const senhaValida = await argon2.verify(
      usuario.senha_hash,
      senha
    );

    if (!senhaValida) {
      return res.status(401).json({
        erro: "E-mail ou senha inválidos."
      });
    }

    req.session.regenerate((erro) => {
      if (erro) return next(erro);

      req.session.usuario = usuarioPublico(usuario);

      req.session.save((erroSalvar) => {
        if (erroSalvar) return next(erroSalvar);

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

async function verificarSessao(req, res, next) {
  try {
    if (!req.session?.usuario) {
      return res.status(401).json({
        autenticado: false
      });
    }

    const resultado = await pool.query(
      `SELECT id, nome, email, perfil
       FROM usuarios
       WHERE id = $1 AND ativo = TRUE`,
      [req.session.usuario.id]
    );

    const usuario = resultado.rows[0];

    if (!usuario) {
      return req.session.destroy(() => {
        res.status(401).json({ autenticado: false });
      });
    }

    req.session.usuario = usuarioPublico(usuario);

    return res.json({
      autenticado: true,
      usuario: req.session.usuario
    });
  } catch (erro) {
    next(erro);
  }
}

function logout(req, res, next) {
  if (!req.session) {
    return res.json({ mensagem: "Sessão encerrada." });
  }

  req.session.destroy((erro) => {
    if (erro) return next(erro);

    res.clearCookie("wj.sid", {
      path: "/",
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production"
    });

    res.json({ mensagem: "Logout realizado com sucesso." });
  });
}

module.exports = {
  login,
  verificarSessao,
  logout
};
