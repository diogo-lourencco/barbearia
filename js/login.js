
"use strict";

document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("loginForm");
  const usuarioInput = document.getElementById("username");
  const senhaInput = document.getElementById("password");
  const mostrarSenha = document.getElementById("showPassword");
  const botao = document.getElementById("loginButton");
  const mensagem = document.getElementById("loginMessage");

  if (
    !form ||
    !usuarioInput ||
    !senhaInput ||
    !botao ||
    !mensagem
  ) {
    console.error(
      "Elementos do formulário de login não encontrados."
    );
    return;
  }

  // =====================================
  // EXIBIR MENSAGENS
  // =====================================

  function mostrarMensagem(texto) {
    mensagem.textContent = texto;
    mensagem.hidden = !texto;
  }

  // =====================================
  // ESTADO DO BOTÃO
  // =====================================

  function carregando(ativo) {
    botao.disabled = ativo;
    botao.textContent = ativo
      ? "Entrando..."
      : "Entrar no sistema";
  }

  // =====================================
  // MOSTRAR OU OCULTAR SENHA
  // =====================================

  mostrarSenha?.addEventListener("change", () => {
    senhaInput.type = mostrarSenha.checked
      ? "text"
      : "password";
  });

  // =====================================
  // VERIFICAR SESSÃO EXISTENTE
  // =====================================

  async function verificarSessao() {
    try {
      const resposta = await fetch("/api/auth/me", {
        method: "GET",
        credentials: "same-origin",
        cache: "no-store"
      });

      if (resposta.ok) {
        window.location.replace("/dashboard.html");
      }
    } catch (erro) {
      console.warn(
        "Não foi possível verificar a sessão:",
        erro.message
      );
    }
  }

  // =====================================
  // REALIZAR LOGIN COM USUÁRIO
  // =====================================

  form.addEventListener("submit", async (evento) => {
    evento.preventDefault();

    const usuario = usuarioInput.value.trim();
    const senha = senhaInput.value;

    mostrarMensagem("");

    if (!usuario || !senha) {
      mostrarMensagem(
        "Informe seu usuário e sua senha."
      );
      return;
    }

    carregando(true);

    try {
      const resposta = await fetch("/api/auth/login", {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          usuario,
          senha
        })
      });

      let dados;

      try {
        dados = await resposta.json();
      } catch {
        mostrarMensagem(
          "O servidor retornou uma resposta inválida."
        );
        return;
      }

      if (!resposta.ok) {
        mostrarMensagem(
          dados.erro ||
          "Usuário ou senha inválidos."
        );
        return;
      }

      if (!dados.usuario) {
        mostrarMensagem(
          "O servidor não retornou os dados do usuário."
        );
        return;
      }

      // A sessão é mantida pelo cookie HttpOnly.
      // Não armazenamos senhas ou tokens no localStorage.
      window.location.replace("/dashboard.html");

    } catch (erro) {
      console.error("Erro no login:", erro);

      mostrarMensagem(
        "Não foi possível conectar ao servidor. " +
        "Verifique se o backend está funcionando."
      );
    } finally {
      carregando(false);
    }
  });

  // =====================================
  // INICIALIZAÇÃO
  // =====================================

  verificarSessao();
});
