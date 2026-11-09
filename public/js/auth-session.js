// A browser can restore an authenticated page from its back/forward cache
// without issuing a request. Reload restored pages so the server can enforce
// the current session after a logout in this or another tab.
window.addEventListener('pageshow', (event) => {
  if (event.persisted) window.location.reload();
});
