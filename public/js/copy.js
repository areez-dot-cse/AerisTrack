// "Copy" buttons for the one-time buyer link.
document.addEventListener('click', async (event) => {
  const button = event.target.closest('button[data-copy]');
  if (!button) return;
  const text = document.querySelector(button.dataset.copy)?.textContent.trim();
  if (!text) return;
  try {
    await navigator.clipboard.writeText(text);
    const label = button.textContent;
    button.textContent = button.dataset.copied;
    setTimeout(() => { button.textContent = label; }, 1500);
  } catch {
    window.prompt('Copy this link', text);
  }
});
