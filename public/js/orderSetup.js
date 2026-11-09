// New order form: the colour × size grid with live totals, and the TNA preview
// computed from the chosen template and ex-factory date (the server recomputes it).
const data = JSON.parse(document.getElementById('setup-data').textContent);
const grid = document.getElementById('qty-grid');
const preview = document.getElementById('tna-preview');
const previewBody = preview.querySelector('tbody');
const hint = document.getElementById('tna-hint');
const pastWarning = document.getElementById('tna-past');
const templateSelect = document.getElementById('templateId');
const exFactoryInput = document.getElementById('exFactoryDate');

// ---- quantity grid ----
function sizeCount() {
  return grid.querySelectorAll('thead th input').length;
}

function reindexGrid() {
  grid.querySelectorAll('thead th input').forEach((input, j) => { input.name = `sizes[${j}]`; });
  grid.querySelectorAll('tbody .colour-row').forEach((row, i) => {
    row.querySelector('.colour-cell input').name = `colours[${i}]`;
    row.querySelectorAll('td input[type="number"]').forEach((input, j) => { input.name = `qty[${i}][${j}]`; });
  });
}

function recalc() {
  const colTotals = new Array(sizeCount()).fill(0);
  let grand = 0;
  grid.querySelectorAll('tbody .colour-row').forEach((row) => {
    let rowTotal = 0;
    row.querySelectorAll('td input[type="number"]').forEach((input, j) => {
      const value = Math.max(0, Number(input.value) || 0);
      rowTotal += value;
      colTotals[j] += value;
    });
    row.querySelector('.row-total').textContent = rowTotal.toLocaleString('en-GB');
    grand += rowTotal;
  });
  grid.querySelectorAll('tfoot .col-total').forEach((cell, j) => { cell.textContent = colTotals[j].toLocaleString('en-GB'); });
  grid.querySelector('.grand-total').textContent = grand.toLocaleString('en-GB');
}

function numberCell() {
  const td = document.createElement('td');
  const input = document.createElement('input');
  input.type = 'number'; input.min = '0'; input.step = '1'; input.inputMode = 'numeric';
  td.append(input);
  return td;
}

function addColourRow() {
  const row = document.createElement('tr');
  row.className = 'colour-row';
  const colourCell = document.createElement('td');
  colourCell.className = 'colour-cell';
  const colourInput = document.createElement('input');
  colourInput.type = 'text'; colourInput.maxLength = 60; colourInput.placeholder = data.labels.colour;
  colourCell.append(colourInput);
  row.append(colourCell);
  for (let j = 0; j < sizeCount(); j += 1) row.append(numberCell());
  const total = document.createElement('td');
  total.className = 'total row-total'; total.textContent = '0';
  const actions = document.createElement('td');
  const remove = document.createElement('button');
  remove.type = 'button'; remove.className = 'btn btn-sm'; remove.dataset.action = 'remove-colour'; remove.textContent = data.labels.removeColour;
  actions.append(remove);
  row.append(total, actions);
  grid.querySelector('tbody').append(row);
  reindexGrid();
  colourInput.focus();
}

function addSizeColumn() {
  const th = document.createElement('th');
  const input = document.createElement('input');
  input.type = 'text'; input.maxLength = 20; input.setAttribute('aria-label', data.labels.size);
  th.append(input);
  const headRow = grid.querySelector('thead tr');
  headRow.insertBefore(th, headRow.children[headRow.children.length - 2]);
  grid.querySelectorAll('tbody .colour-row').forEach((row) => {
    row.insertBefore(numberCell(), row.querySelector('.row-total'));
  });
  const footRow = grid.querySelector('tfoot tr');
  const totalCell = document.createElement('td');
  totalCell.className = 'total col-total'; totalCell.textContent = '0';
  footRow.insertBefore(totalCell, footRow.querySelector('.grand-total'));
  reindexGrid();
  input.focus();
}

grid.addEventListener('input', recalc);
grid.addEventListener('click', (event) => {
  const button = event.target.closest('button[data-action="remove-colour"]');
  if (!button) return;
  if (grid.querySelectorAll('tbody .colour-row').length > 1) button.closest('tr').remove();
  reindexGrid();
  recalc();
});
document.getElementById('add-colour').addEventListener('click', addColourRow);
document.getElementById('add-size').addEventListener('click', addSizeColumn);

// ---- TNA preview ----
function addDays(dateStr, days) {
  const date = new Date(`${dateStr}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function formatDate(dateStr) {
  const [year, month, day] = dateStr.split('-').map(Number);
  const text = `${day} ${data.months[month - 1]}`;
  return year === Number(data.today.slice(0, 4)) ? text : `${text} ${year}`;
}

function floorSelect(stageName) {
  const select = document.createElement('select');
  select.name = `floors[${stageName}]`;
  select.required = true;
  const blank = document.createElement('option');
  blank.value = ''; blank.textContent = data.labels.chooseFloor;
  select.append(blank);
  const units = [...new Set(data.floors.map((f) => f.unit))];
  for (const unit of units) {
    const group = document.createElement('optgroup');
    group.label = unit;
    data.floors.filter((f) => f.unit === unit).forEach((f) => {
      const option = document.createElement('option');
      option.value = f.id;
      option.textContent = `${f.name} · ${f.total} ${f.capacityUnit}`;
      if (String(data.selectedFloors[stageName] ?? '') === String(f.id)) option.selected = true;
      group.append(option);
    });
    select.append(group);
  }
  return select;
}

function renderPreview() {
  const template = data.templates.find((tpl) => String(tpl.id) === templateSelect.value);
  const exFactory = exFactoryInput.value;
  previewBody.replaceChildren();
  if (!template || !exFactory) {
    preview.hidden = true; hint.hidden = false; pastWarning.hidden = true;
    return;
  }
  let anyPast = false;
  template.milestones.forEach((m, index) => {
    const row = document.createElement('tr');
    const end = addDays(exFactory, -m.end);
    const start = m.kind === 'quantity' ? addDays(exFactory, -m.start) : null;
    if (end < data.today || (start && start < data.today)) anyPast = true;
    const cells = [String(index + 1), `${m.name} · ${m.kind === 'date' ? data.labels.date : data.labels.quantity}`, start ? formatDate(start) : '—', formatDate(end)];
    cells.forEach((text) => { const td = document.createElement('td'); td.textContent = text; row.append(td); });
    const floorCell = document.createElement('td');
    if (m.kind === 'quantity') floorCell.append(floorSelect(m.name));
    row.append(floorCell);
    previewBody.append(row);
  });
  preview.hidden = false; hint.hidden = true; pastWarning.hidden = !anyPast;
}

templateSelect.addEventListener('change', renderPreview);
exFactoryInput.addEventListener('change', renderPreview);
recalc();
renderPreview();
