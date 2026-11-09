// Small progressive enhancements: disable the submit button and show loading
// text while a form is being sent, confirm destructive actions, and give
// download links a moment of feedback.
document.addEventListener('submit', (event) => {
  const form = event.target;
  if (form.dataset.confirm && !window.confirm(form.dataset.confirm)) {
    event.preventDefault();
    return;
  }
  const button = form.querySelector('button[type="submit"]:not([disabled])');
  if (button) {
    button.classList.add('is-loading');
    if (button.dataset.loading) button.textContent = button.dataset.loading;
    // Disable on the next tick so the button's value is still submitted.
    setTimeout(() => { button.disabled = true; }, 0);
  }
});

document.addEventListener('click', (event) => {
  const link = event.target.closest('a[data-loading]');
  if (!link || link.classList.contains('is-loading')) return;
  const label = link.textContent;
  link.classList.add('is-loading');
  link.textContent = link.dataset.loading;
  setTimeout(() => { link.classList.remove('is-loading'); link.textContent = label; }, 2500);
});
