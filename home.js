(() => {
  document.addEventListener("click", (event) => {
    const button = event.target.closest?.("[data-home-view]");
    if (button) document.querySelector(`.nav-button[data-view="${button.dataset.homeView}"]`)?.click();
  });
})();
