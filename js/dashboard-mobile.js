
"use strict";

/* =====================================================
   BARBEARIA WJ — DASHBOARD MOBILE

   Simplifica a visualização no celular.
   Não altera autenticação, API ou dados financeiros.
===================================================== */

document.addEventListener("DOMContentLoaded", () => {
  const dashboard = document.querySelector(
    ".dashboard-page"
  );

  const reports = document.querySelector(
    ".dashboard-reports"
  );

  if (!dashboard || !reports) return;

  const mobileQuery = window.matchMedia(
    "(max-width: 760px)"
  );

  /* =====================================
     CRIAR BOTÃO DE RELATÓRIOS
  ===================================== */

  const button = document.createElement("button");

  button.type = "button";
  button.className = "dashboard-reports-toggle";

  button.setAttribute(
    "aria-controls",
    "dashboardReportsContent"
  );

  reports.id = "dashboardReportsContent";

  button.innerHTML = `
    <span class="dashboard-reports-toggle-label">

      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
      >
        <path d="M3 3v18h18"/>
        <path d="M7 16V9"/>
        <path d="M12 16V5"/>
        <path d="M17 16v-4"/>
      </svg>

      <span class="dashboard-reports-toggle-text">
        Ver relatórios e histórico
      </span>

    </span>

    <span class="dashboard-reports-toggle-arrow">

      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
      >
        <path d="m6 9 6 6 6-6"/>
      </svg>

    </span>
  `;

  reports.parentNode.insertBefore(
    button,
    reports
  );

  let reportsOpen = false;

  /* =====================================
     ATUALIZAR VISUALIZAÇÃO
  ===================================== */

  function updateReports() {
    const mobile = mobileQuery.matches;

    if (!mobile) {
      reports.classList.remove("mobile-collapsed");
      button.setAttribute(
        "aria-expanded",
        "true"
      );
      return;
    }

    reports.classList.toggle(
      "mobile-collapsed",
      !reportsOpen
    );

    button.setAttribute(
      "aria-expanded",
      String(reportsOpen)
    );

    const label = button.querySelector(
      ".dashboard-reports-toggle-text"
    );

    if (label) {
      label.textContent = reportsOpen
        ? "Ocultar relatórios e histórico"
        : "Ver relatórios e histórico";
    }
  }

  button.addEventListener("click", () => {
    reportsOpen = !reportsOpen;

    updateReports();

    if (!reportsOpen && mobileQuery.matches) {
      button.scrollIntoView({
        block: "nearest",
        behavior: "smooth"
      });
    }
  });

  /* =====================================
     ADAPTAR AO TAMANHO DA TELA
  ===================================== */

  if (typeof mobileQuery.addEventListener === "function") {
    mobileQuery.addEventListener(
      "change",
      updateReports
    );
  } else if (
    typeof mobileQuery.addListener === "function"
  ) {
    mobileQuery.addListener(updateReports);
  }

  updateReports();
});
