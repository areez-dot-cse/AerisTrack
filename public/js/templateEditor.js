// Template editor: add, remove and reorder milestone rows. Field names are
// re-indexed after every change so the server receives a clean array.
const tbody = document.querySelector('#milestone-rows tbody');
const rowTemplate = document.getElementById('row-template');

function reindex() {
  [...tbody.querySelectorAll('.milestone-row')].forEach((row, index) => {
    row.querySelector('.seq').textContent = index + 1;
    row.querySelectorAll('input, select').forEach((field) => {
      field.name = field.name.replace(/milestones\[\d+\]/, `milestones[${index}]`);
    });
  });
}

function syncKind(row) {
  const kind = row.querySelector('.kind').value;
  const start = row.querySelector('.start');
  start.disabled = kind === 'date';
  if (kind === 'date') start.value = '';
}

tbody.addEventListener('change', (event) => {
  if (event.target.classList.contains('kind')) syncKind(event.target.closest('.milestone-row'));
});

tbody.addEventListener('click', (event) => {
  const button = event.target.closest('button[data-action]');
  if (!button) return;
  const row = button.closest('.milestone-row');
  const action = button.dataset.action;
  if (action === 'remove') row.remove();
  if (action === 'up' && row.previousElementSibling) row.previousElementSibling.before(row);
  if (action === 'down' && row.nextElementSibling) row.nextElementSibling.after(row);
  reindex();
});

document.getElementById('add-row').addEventListener('click', () => {
  const row = rowTemplate.content.firstElementChild.cloneNode(true);
  tbody.append(row);
  reindex();
  row.querySelector('input[type="text"]').focus();
});

[...tbody.querySelectorAll('.milestone-row')].forEach(syncKind);
