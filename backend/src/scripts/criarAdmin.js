
require("dotenv").config();

const readline = require("readline");
const argon2 = require("argon2");

const pool = require("../config/database");

const terminal = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function perguntar(pergunta) {
  return new Promise((resolve) => {
    terminal.question(pergunta, resolve);
  });
}

async function criarAdmin() {
  try {
    console.log("\n=== CRIAR ADMINISTRADOR WJ ===\n");

    const nome = (await perguntar("Nome: ")).trim();
    const email = (await perguntar("E-mail: ")).trim().toLowerCase();
    const senha = await perguntar("Senha (mínimo 12 caracteres): ");

    if (!nome || nome.length > 120) {
      throw new Error("Informe um nome válido.");
    }

    if (
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
      email.length > 180
    ) {
      throw new Error("Informe um e-mail válido.");
    }

    if (senha.length < 12) {
      throw new Error("A senha deve ter pelo menos 12 caracteres.");
    }

    const existente = await pool.query(
      "SELECT id FROM usuarios WHERE LOWER(email) = $1",
      [email]
    );

    if (existente.rowCount) {
      throw new Error("Já existe um usuário com este e-mail.");
    }

    const senhaHash = await argon2.hash(senha, {
      type: argon2.argon2id
    });

    const resultado = await pool.query(
      `INSERT INTO usuarios
        (nome, email, senha_hash, perfil)
       VALUES ($1, $2, $3, 'admin')
       RETURNING id, nome, email, perfil`,
      [nome, email, senhaHash]
    );

    console.log("\nAdministrador criado com sucesso!");
    console.log(resultado.rows[0]);
  } catch (erro) {
    console.error("\nErro:", erro.message);
    process.exitCode = 1;
  } finally {
    terminal.close();
    await pool.end();
  }
}

criarAdmin();
