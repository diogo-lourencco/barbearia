
const express = require("express");
const controller = require("../controllers/estoqueController");
const {
  exigirLogin,
  exigirAdmin
} = require("../middlewares/authMiddleware");

const router = express.Router();

router.use(exigirLogin);

router.get("/", controller.listar);
router.post("/", exigirAdmin, controller.cadastrar);
router.put("/:id", exigirAdmin, controller.atualizar);
router.delete("/:id", exigirAdmin, controller.excluir);

module.exports = router;
