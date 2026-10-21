// Presentation only: keep the controller's existing navigation action names.
export function renderStudentHome(statusMarkup) {
  return `
    <div class="fusion-home">
      <header class="fusion-header">
        <div class="fusion-brand" aria-label="ST Student">
          <img src="./src/assets/st-student-logo.png" alt="" width="64" height="64">
          <span>ST<small>student</small></span>
        </div>
        ${statusMarkup}
      </header>
      <section class="fusion-content" aria-labelledby="page-title">
        <h1 id="page-title">Bugün ne <span>çalıyoruz?</span></h1>
        <nav class="fusion-cards" aria-label="Ana menü">
          <button type="button" class="fusion-card fusion-pool" data-action="show-public-pool" aria-label="Havuz">
            <img src="./src/assets/home-fusion-pool.svg" alt="" class="fusion-art" width="280" height="170">
            <span class="fusion-card-label">Havuz<span class="fusion-arrow" aria-hidden="true">→</span></span>
          </button>
          <button type="button" class="fusion-card fusion-work" data-action="show-my-work" aria-label="Benim Çalışmalarım">
            <img src="./src/assets/home-fusion-work.svg" alt="" class="fusion-art" width="280" height="170">
            <span class="fusion-card-label">Çalışmalarım<span class="fusion-arrow" aria-hidden="true">→</span></span>
          </button>
        </nav>
      </section>
      <footer class="fusion-footer">
        <span aria-hidden="true">♫</span>
        <button type="button" data-action="sign-out">Çıkış <span aria-hidden="true">↗</span></button>
      </footer>
    </div>
  `;
}
