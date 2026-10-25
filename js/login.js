
"use strict";

document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("loginForm");
  const emailInput = document.getElementById("username");
  const senhaInput = document.getElementById("password");
  const mostrarSenha = document.getElementById("showPassword");
  const botao = document.getElementById("loginButton");
  const mensagem = document.getElementById("loginMessage");

  if (!form || !emailInput || !senhaInput || !botao || !mensagem) {
    console.error("Elementos do formulário de login não encontrados.");
    return;
  }

  function mostrarMensagem(texto) {
    mensagem.textContent = texto;
    mensagem.hidden = !texto;
  }

  function carregando(ativo) {
    botao.disabled = ativo;
    botao.textContent = ativo
      ? "Entrando..."
      : "Entrar no sistema";
  }

  mostrarSenha?.addEventListener("change", () => {
    senhaInput.type = mostrarSenha.checked
      ? "text"
      : "password";
  });

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

  form.addEventListener("submit", async (evento) => {
    evento.preventDefault();

    const email = emailInput.value.trim();
    const senha = senhaInput.value;

    mostrarMensagem("");

    if (!email || !senha) {
      mostrarMensagem("Informe seu e-mail e sua senha.");
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
          email,
          senha
        })
      });

      const dados = await resposta.json();

      if (!resposta.ok) {
        mostrarMensagem(
          dados.erro || "Não foi possível realizar o login."
        );
        return;
      }

      if (!dados.usuario) {
        mostrarMensagem(
          "O servidor não retornou os dados do usuário."
        );
        return;
      }

      // A sessão é mantida pelo cookie HttpOnly do servidor.
      // Não armazenamos senha ou token no localStorage.
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

  verificarSessao();
});
