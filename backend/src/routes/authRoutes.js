
const express = require("express");
const { rateLimit } = require("express-rate-limit");

const {
  login,
  verificarSessao,
  logout
} = require("../controllers/authController");

const router = express.Router();

const limiteLogin = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: {
    erro: "Muitas tentativas. Aguarde 15 minutos."
  }
});

router.post("/login", limiteLogin, login);
router.get("/me", verificarSessao);
router.post("/logout", logout);

module.exports = router;
