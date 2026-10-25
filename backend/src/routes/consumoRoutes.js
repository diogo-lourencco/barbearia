
const express = require("express");
const controller = require("../controllers/consumoController");
const { exigirLogin } = require("../middlewares/authMiddleware");

const router = express.Router();

router.use(exigirLogin);

router.get("/", controller.listar);
router.post("/", controller.cadastrar);

module.exports = router;
