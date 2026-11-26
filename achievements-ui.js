/* Gazelle Achievement UI — profile medal grid + translucent detail modal. */
(() => {
  'use strict';
  let overlay = null;
  let lastTrigger = null;

  const el = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = String(text);
    return node;
  };

  function ensureModal() {
    if (overlay) return overlay;
    overlay = el('div', 'gazelle-achievement-backdrop');
    overlay.hidden = true;
    overlay.setAttribute('aria-hidden', 'true');

    const dialog = el('section', 'gazelle-achievement-dialog');
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-modal', 'true');
    dialog.setAttribute('aria-labelledby', 'gazelleAchievementTitle');

    const close = el('button', 'gazelle-achievement-close', '×');
    close.type = 'button';
    close.setAttribute('aria-label', 'Close achievement details');
    close.addEventListener('click', closeModal);

    const artWrap = el('div', 'gazelle-achievement-art-wrap');
    const art = el('img', 'gazelle-achievement-art');
    art.alt = '';
    artWrap.append(art);

    const title = el('h3', 'gazelle-achievement-title');
    title.id = 'gazelleAchievementTitle';
    const description = el('p', 'gazelle-achievement-description');
    const conditionLabel = el('span', 'gazelle-achievement-kicker', 'HOW TO EARN');
    const condition = el('p', 'gazelle-achievement-condition');
    const status = el('span', 'gazelle-achievement-status');
    const progressWrap = el('div', 'gazelle-achievement-progress-wrap');
    const progressMeta = el('div', 'gazelle-achievement-progress-meta');
    const progressLabel = el('span', 'gazelle-achievement-progress-label');
    const progressValue = el('span', 'gazelle-achievement-progress-value');
    const progressTrack = el('div', 'gazelle-achievement-progress-track');
    const progressFill = el('span', 'gazelle-achievement-progress-fill');
    progressTrack.append(progressFill);
    progressMeta.append(progressLabel, progressValue);
    progressWrap.append(progressMeta, progressTrack);
    const count = el('p', 'gazelle-achievement-count');
    const pending = el('p', 'gazelle-achievement-pending');

    dialog.append(close, artWrap, title, description, conditionLabel, condition,
      status, progressWrap, count, pending);
    overlay.append(dialog);
    overlay.addEventListener('click', event => {
      if (event.target === overlay) closeModal();
    });
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && overlay && !overlay.hidden) closeModal();
    });
    document.body.append(overlay);
    overlay._parts = { close, art, title, description, condition, status,
      progressWrap, progressLabel, progressValue, progressFill, count, pending };
    return overlay;
  }

  function closeModal() {
    if (!overlay || overlay.hidden) return;
    overlay.hidden = true;
    overlay.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('gazelle-achievement-open');
    if (lastTrigger && typeof lastTrigger.focus === 'function') lastTrigger.focus();
  }

  function openModal(item, dataReady, trigger) {
    const modal = ensureModal();
    const p = modal._parts;
    lastTrigger = trigger || null;
    p.art.src = item.src || item.asset || '';
    p.art.alt = item.label || 'Achievement medal';
    p.title.textContent = item.label || 'Achievement';
    p.description.textContent = item.desc || '';
    p.condition.textContent = item.condition || item.desc || '';

    const count = Math.max(0, Number(item.count || 0));
    const earned = count > 0 || item.earned === true;
    p.status.className = 'gazelle-achievement-status ' + (earned ? 'is-earned' : dataReady ? 'is-locked' : 'is-pending');
    p.status.textContent = earned ? 'Earned' : dataReady ? 'Not unlocked yet' : 'Achievement details';

    const hasProgress = dataReady && item.progress !== null && item.progress !== undefined && Number.isFinite(Number(item.progress));
    const goal = Math.max(1, Number(item.goal || 1));
    if (hasProgress) {
      const progress = Math.max(0, Number(item.progress));
      const percent = Math.min(100, progress / goal * 100);
      p.progressWrap.hidden = false;
      p.progressLabel.textContent = item.progressText || 'Your progress';
      p.progressValue.textContent = `${Math.min(progress, goal)} / ${goal}`;
      p.progressFill.style.width = percent + '%';
    } else {
      p.progressWrap.hidden = true;
      p.progressFill.style.width = '0%';
    }

    p.count.hidden = count < 1;
    p.count.textContent = count > 0 ? `Earned ${count} time${count === 1 ? '' : 's'} · ×${count}` : '';
    p.pending.hidden = dataReady;
    p.pending.textContent = dataReady ? '' : 'Your unlock progress and earned count will appear here after the Supabase achievement records are connected.';

    modal.hidden = false;
    modal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('gazelle-achievement-open');
    p.close.focus();
  }

  function render(container, items, options = {}) {
    if (!container) return;
    const dataReady = options.dataReady === true;
    container.classList.add('gazelle-achievement-grid');
    container.replaceChildren();

    (items || []).forEach(item => {
      const earned = Number(item.count || 0) > 0 || item.earned === true;
      const button = el('button', 'gazelle-achievement-tile ' + (earned ? 'is-earned' : dataReady ? 'is-locked' : 'is-pending'));
      button.type = 'button';
      button.setAttribute('aria-label', `View ${item.label || 'achievement'} details`);
      button.title = item.label || 'Achievement';
      const image = el('img', 'gazelle-achievement-tile-image');
      image.src = item.src || item.asset || '';
      image.alt = '';
      image.loading = 'lazy';
      button.append(image);
      const count = Math.max(0, Number(item.count || 0));
      if (count > 0) button.append(el('span', 'gazelle-achievement-count-chip', '×' + count));
      if (earned) button.classList.add('has-earned-ring');
      button.addEventListener('click', () => openModal(item, dataReady, button));
      container.append(button);
    });
  }

  window.GazelleAchievements = { render, close: closeModal };
})();
