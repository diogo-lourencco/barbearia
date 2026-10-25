
function exigirLogin(req, res, next) {
  if (!req.session || !req.session.usuario) {
    return res.status(401).json({
      erro: "Você precisa entrar no sistema."
    });
  }

  next();
}

function exigirAdmin(req, res, next) {
  if (!req.session || !req.session.usuario) {
    return res.status(401).json({
      erro: "Você precisa entrar no sistema."
    });
  }

  if (req.session.usuario.perfil !== "admin") {
    return res.status(403).json({
      erro: "Acesso permitido somente ao administrador."
    });
  }

  next();
}

module.exports = {
  exigirLogin,
  exigirAdmin
};
