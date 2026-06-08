'use strict';
// ============================================================
//  AX_LootingV2 - script.js
// ============================================================

let imagePath        = '';
let currentProps     = [];
let currentBoxes     = [];
let currentLootTypes = [];
let currentModels    = [];
let lootItems        = [];
let confirmCallback  = null;

// ============================================================
//  HELPERS
// ============================================================
function post(action, data = {}) {
    return fetch(`https://AX_LootingV2/${action}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
    }).then(r => r.json()).catch(() => null);
}
function imgUrl(name) { return `${imagePath}${name}.png`; }
function defaultImgUrl() { return `${imagePath}default.png`; }
function formatName(n) { return n ? n.replace(/[-_]/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) : 'Desconocido'; }

function showConfirm(text, cb) {
    document.getElementById('confirmText').textContent = text;
    confirmCallback = cb;
    const ov = document.getElementById('confirmOverlay');
    const dlg = document.getElementById('confirmDialog');
    ov.classList.remove('hidden'); ov.classList.add('visible');
    dlg.classList.remove('hidden'); void dlg.offsetHeight; dlg.classList.add('visible');
}
function hideConfirm() {
    document.getElementById('confirmDialog').classList.remove('visible');
    document.getElementById('confirmOverlay').classList.remove('visible');
    setTimeout(() => {
        document.getElementById('confirmDialog').classList.add('hidden');
        document.getElementById('confirmOverlay').classList.add('hidden');
    }, 220);
}
document.getElementById('confirmYes').addEventListener('click', () => { if (confirmCallback) { confirmCallback(); confirmCallback = null; } hideConfirm(); });
document.getElementById('confirmNo').addEventListener('click', hideConfirm);
document.getElementById('confirmOverlay').addEventListener('click', hideConfirm);

// ============================================================
//  LOOT BUILDER - sistema de inventario de items
// ============================================================

// Cada instancia del builder maneja: allItems, filteredItems, page, selectedItems
// selectedItems[name] = { name, label, min, max, probability }

class LootBuilder {
    constructor(gridId, searchId, prevId, nextId, pageInfoId, selectedListId, probTotalId) {
        this.grid         = document.getElementById(gridId);
        this.search       = document.getElementById(searchId);
        this.prevBtn      = document.getElementById(prevId);
        this.nextBtn      = document.getElementById(nextId);
        this.pageInfo     = document.getElementById(pageInfoId);
        this.selectedList = document.getElementById(selectedListId);
        this.probTotal    = document.getElementById(probTotalId);

        this.allItems      = [];
        this.filteredItems = [];
        this.page          = 0;
        this.perPage       = 24; // 3 cols x 8 rows
        this.selected      = {};  // name => { name, label, min, max, probability }

        this._bindEvents();
    }

    _bindEvents() {
        let debounce = null;
        this.search.addEventListener('input', () => {
            clearTimeout(debounce);
            debounce = setTimeout(() => { this.page = 0; this._applyFilter(); }, 150);
        });
        this.prevBtn.addEventListener('click', () => { if (this.page > 0) { this.page--; this._renderGrid(); } });
        this.nextBtn.addEventListener('click', () => {
            const maxPage = Math.max(0, Math.ceil(this.filteredItems.length / this.perPage) - 1);
            if (this.page < maxPage) { this.page++; this._renderGrid(); }
        });
    }

    async load() {
        this.allItems = await post('getAllItems') || [];
        this._applyFilter();
    }

    setItems(items) {
        // items = [ { name, min, max, probability } ]
        this.selected = {};
        (items || []).forEach(item => {
            this.selected[item.name] = {
                name: item.name,
                label: item.label || item.name,
                min: item.min || 1,
                max: item.max || 1,
                probability: item.probability || 0,
            };
        });
        this._renderGrid();
        this._renderSelected();
    }

    getItems() {
        return Object.values(this.selected).map(s => ({
            name: s.name,
            min: parseInt(s.min) || 1,
            max: parseInt(s.max) || 1,
            probability: parseInt(s.probability) || 0,
        }));
    }

    reset() {
        this.selected = {};
        this.page = 0;
        this.search.value = '';
        this._applyFilter();
        this._renderSelected();
    }

    _applyFilter() {
        const q = this.search.value.toLowerCase().trim();
        this.filteredItems = q.length < 1
            ? this.allItems
            : this.allItems.filter(i =>
                i.name.toLowerCase().includes(q) || i.label.toLowerCase().includes(q)
            );
        this._renderGrid();
    }

    _renderGrid() {
        this.grid.innerHTML = '';
        const start = this.page * this.perPage;
        const end   = start + this.perPage;
        const slice = this.filteredItems.slice(start, end);

        slice.forEach(item => {
            const card = document.createElement('div');
            card.className = 'inv-item-card' + (this.selected[item.name] ? ' selected' : '');
            card.dataset.name = item.name;

            const img = document.createElement('img');
            img.src = imgUrl(item.name);
            img.onerror = () => { img.src = defaultImgUrl(); };
            img.width = 18; img.height = 18;

            const lbl = document.createElement('span');
            lbl.className = 'inv-item-label';
            lbl.textContent = item.label;
            lbl.title = item.label;

            card.appendChild(img);
            card.appendChild(lbl);

            card.addEventListener('click', () => this._toggleItem(item, card));
            this.grid.appendChild(card);
        });

        // Actualizar paginacion
        const totalPages = Math.max(1, Math.ceil(this.filteredItems.length / this.perPage));
        this.pageInfo.textContent = `${this.page + 1} / ${totalPages}`;
        this.prevBtn.disabled = this.page === 0;
        this.nextBtn.disabled = this.page >= totalPages - 1;
    }

    _toggleItem(item, card) {
        if (this.selected[item.name]) {
            // Deseleccionar
            delete this.selected[item.name];
            card.classList.remove('selected');
        } else {
            // Seleccionar
            this.selected[item.name] = {
                name: item.name,
                label: item.label,
                min: 1, max: 1, probability: 0,
            };
            card.classList.add('selected');
        }
        this._renderSelected();
    }

    _renderSelected() {
        this.selectedList.innerHTML = '';
        const items = Object.values(this.selected);

        items.forEach(item => {
            const row = document.createElement('div');
            row.className = 'selected-item-row';

            const img = document.createElement('img');
            img.src = imgUrl(item.name);
            img.onerror = () => { img.src = defaultImgUrl(); };
            img.width = 20; img.height = 20;

            const name = document.createElement('span');
            name.className = 'selected-item-name';
            name.textContent = item.label;
            name.title = item.label;

            const inputs = document.createElement('div');
            inputs.className = 'selected-item-inputs';

            const minWrap = this._makeInputWrap('MIN', item.min, (v) => { item.min = parseInt(v) || 1; });
            const maxWrap = this._makeInputWrap('MAX', item.max, (v) => { item.max = parseInt(v) || 1; });
            const probWrap = this._makeInputWrap('%', item.probability, (v) => {
                item.probability = parseInt(v) || 0;
                this._updateProbTotal();
            });
            probWrap.querySelector('.sel-input').classList.add('prob-input');

            inputs.appendChild(minWrap);
            inputs.appendChild(maxWrap);
            inputs.appendChild(probWrap);

            const removeBtn = document.createElement('button');
            removeBtn.className = 'btn-remove-selected';
            removeBtn.innerHTML = '<i class="fa-solid fa-xmark"></i>';
            removeBtn.addEventListener('click', () => {
                delete this.selected[item.name];
                // Quitar highlight en el grid si esta visible
                const card = this.grid.querySelector(`[data-name="${item.name}"]`);
                if (card) card.classList.remove('selected');
                this._renderSelected();
            });

            row.appendChild(img);
            row.appendChild(name);
            row.appendChild(inputs);
            row.appendChild(removeBtn);
            this.selectedList.appendChild(row);
        });

        this._updateProbTotal();
    }

    _makeInputWrap(label, value, onChange) {
        const wrap = document.createElement('div');
        wrap.className = 'sel-input-wrap';

        const lbl = document.createElement('span');
        lbl.className = 'sel-input-label';
        lbl.textContent = label;

        const input = document.createElement('input');
        input.type = 'number';
        input.min = '0';
        input.className = 'sel-input';
        input.value = value;
        input.addEventListener('input', () => onChange(input.value));

        wrap.appendChild(lbl);
        wrap.appendChild(input);
        return wrap;
    }

    _updateProbTotal() {
        const total = Object.values(this.selected).reduce((acc, s) => acc + (parseInt(s.probability) || 0), 0);
        this.probTotal.textContent = total + '%';
        this.probTotal.className = 'prob-total-new' + (total > 100 ? ' over' : total === 100 ? ' full' : '');
    }
}

// Instancias de builders
const propBuilder = new LootBuilder('invItemsGrid', 'invSearchInput', 'invPrevPage', 'invNextPage', 'invPageInfo', 'selectedItemsList', 'probTotalNew');
const tipoBuilder = new LootBuilder('tipoInvItemsGrid', 'tipoInvSearchInput', 'tipoInvPrevPage', 'tipoInvNextPage', 'tipoInvPageInfo', 'tipoSelectedItemsList', 'tipoProbTotalNew');

// ============================================================
//  CREATOR ABRIR/CERRAR
// ============================================================
function openCreator(props, boxes, lootTypes, models) {
    currentProps     = props      || [];
    currentBoxes     = boxes      || [];
    currentLootTypes = lootTypes  || [];
    currentModels    = models     || [];

    renderPropsTable();
    renderBoxesTable();
    renderTiposTable();
    renderModelosTable();

    const ov = document.getElementById('creatorOverlay');
    const pn = document.getElementById('creatorPanel');
    ov.classList.remove('hidden'); pn.classList.remove('hidden', 'closing');
    void ov.offsetHeight; void pn.offsetHeight;
    ov.classList.add('visible'); pn.classList.add('visible');
}

function closeCreator() {
    const ov = document.getElementById('creatorOverlay');
    const pn = document.getElementById('creatorPanel');
    pn.classList.remove('visible'); pn.classList.add('closing');
    ov.classList.remove('visible');
    setTimeout(() => { pn.classList.add('hidden'); pn.classList.remove('closing'); ov.classList.add('hidden'); }, 260);
    post('closeCreator');
}

document.getElementById('btnCloseCreator').addEventListener('click', closeCreator);
document.getElementById('creatorOverlay').addEventListener('click', closeCreator);

// TABS
document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const map = { looting: 'tabLooting', box: 'tabBox', tipos: 'tabTipos', modelos: 'tabModelos' };
        document.querySelectorAll('.tab-content').forEach(tc => tc.classList.add('hidden'));
        if (map[btn.dataset.tab]) document.getElementById(map[btn.dataset.tab]).classList.remove('hidden');
    });
});

// ============================================================
//  TABLA PROPS
// ============================================================
function renderPropsTable(filter = '') {
    const tbody = document.getElementById('propsTableBody');
    const empty = document.getElementById('propsEmpty');
    const fl = filter.toLowerCase();
    const rows = currentProps.filter(p => !fl || p.name.toLowerCase().includes(fl) || p.model.toLowerCase().includes(fl));
    tbody.innerHTML = '';
    if (!rows.length) { empty.classList.remove('hidden'); return; }
    empty.classList.add('hidden');
    rows.forEach(prop => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><div class="td-prop"><div class="prop-icon-box"><i class="fa-solid fa-box-open"></i></div><div><div class="prop-name">${prop.name}</div><div class="prop-model">${prop.model}</div></div></div></td>
            <td><div class="td-items">${buildItemPills(prop.items)}</div></td>
            <td>${buildPctBadge(prop.items)}</td>
            <td><div class="td-actions">
                <button class="btn-action edit" data-id="${prop.id}" title="Editar"><i class="fa-solid fa-pen"></i></button>
                <button class="btn-action delete" data-id="${prop.id}" title="Eliminar"><i class="fa-solid fa-trash"></i></button>
            </div></td>`;
        tbody.appendChild(tr);
    });
    tbody.querySelectorAll('.btn-action.edit').forEach(btn => btn.addEventListener('click', () => openPropModal('edit', parseInt(btn.dataset.id))));
    tbody.querySelectorAll('.btn-action.delete').forEach(btn => btn.addEventListener('click', () => showConfirm('¿Eliminar este prop?', () => post('deleteProp', { id: parseInt(btn.dataset.id) }))));
}
function buildItemPills(items) {
    if (!items || !items.length) return '<span style="color:var(--text-muted);font-size:11px">—</span>';
    return items.slice(0, 5).map(item => `
        <div class="item-pill">
            <img src="${imgUrl(item.name)}" onerror="this.src='${defaultImgUrl()}'" />
            <span class="pill-range">x${item.min}-${item.max}</span>
            <span>${item.probability}%</span>
        </div>`).join('') + (items.length > 5 ? `<span style="color:var(--text-muted);font-size:10px">+${items.length-5}</span>` : '');
}

function buildPctBadge(items) {
    if (!items || !items.length) return '<span class="pct-badge empty">0%</span>';
    const total = items.reduce((acc, i) => acc + (i.probability || 0), 0);
    const cls   = total === 100 ? 'full' : total > 100 ? 'over' : '';
    return `<span class="pct-badge ${cls}">${total}%</span>`;
}
document.getElementById('searchProps').addEventListener('input', e => renderPropsTable(e.target.value));
document.getElementById('btnAddProp').addEventListener('click', () => openPropModal('create'));

// ============================================================
//  TABLA BOXES
// ============================================================
function renderBoxesTable(filter = '') {
    const tbody = document.getElementById('boxesTableBody');
    const empty = document.getElementById('boxesEmpty');
    const fl = filter.toLowerCase();
    const rows = currentBoxes.filter(b => !fl || b.name.toLowerCase().includes(fl) || b.model.toLowerCase().includes(fl));
    tbody.innerHTML = '';
    if (!rows.length) { empty.classList.remove('hidden'); return; }
    empty.classList.add('hidden');
    rows.forEach(box => {
        const hasRi = box.required_item && box.required_item !== '';
        const riHtml = hasRi
            ? `<img src="${imgUrl(box.required_item)}" onerror="this.src='${defaultImgUrl()}'" style="width:18px;height:18px;object-fit:contain" /><span>${box.required_item}</span>`
            : `<span class="no-item">—</span>`;
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><div class="td-prop"><div class="prop-icon-box"><i class="fa-solid fa-toolbox"></i></div><div><div class="prop-name">${box.name}</div><div class="prop-model">${box.model}</div></div></div></td>
            <td><div class="td-itemn">${riHtml}</div></td>
            <td><div class="td-items">${buildItemPills(box.items)}</div></td>
            <td>${buildPctBadge(box.items)}</td>
            <td><div class="td-actions">
                <button class="btn-action goto" data-id="${box.id}" title="Ir"><i class="fa-solid fa-location-arrow"></i></button>
                <button class="btn-action edit" data-id="${box.id}" title="Editar"><i class="fa-solid fa-pen"></i></button>
                <button class="btn-action delete" data-id="${box.id}" title="Eliminar"><i class="fa-solid fa-trash"></i></button>
            </div></td>`;
        tbody.appendChild(tr);
    });
    tbody.querySelectorAll('.btn-action.goto').forEach(btn => btn.addEventListener('click', () => post('gotoBox', { id: parseInt(btn.dataset.id) })));
    tbody.querySelectorAll('.btn-action.edit').forEach(btn => btn.addEventListener('click', () => openBoxModal('edit', parseInt(btn.dataset.id))));
    tbody.querySelectorAll('.btn-action.delete').forEach(btn => btn.addEventListener('click', () => showConfirm('¿Eliminar esta caja?', () => post('deleteBox', { id: parseInt(btn.dataset.id) }))));
}
document.getElementById('searchBoxes').addEventListener('input', e => renderBoxesTable(e.target.value));
document.getElementById('btnAddBox').addEventListener('click', () => openBoxModal('create'));

// ============================================================
//  TABLA TIPOS
// ============================================================
function renderTiposTable(filter = '') {
    const tbody = document.getElementById('tiposTableBody');
    const empty = document.getElementById('tiposEmpty');
    const fl = filter.toLowerCase();
    const rows = currentLootTypes.filter(t => !fl || t.name.toLowerCase().includes(fl) || t.label.toLowerCase().includes(fl));
    tbody.innerHTML = '';
    if (!rows.length) { empty.classList.remove('hidden'); return; }
    empty.classList.add('hidden');
    rows.forEach(tipo => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><div class="td-prop"><div class="prop-icon-box"><i class="fa-solid fa-layer-group"></i></div><div><div class="prop-name">${tipo.label}</div><div class="prop-model">${tipo.name}</div></div></div></td>
            <td><div class="td-items">${buildItemPills(tipo.items)}</div></td>
            <td>${buildPctBadge(tipo.items)}</td>
            <td><div class="td-actions">
                <button class="btn-action edit" data-id="${tipo.id}" title="Editar"><i class="fa-solid fa-pen"></i></button>
                <button class="btn-action delete" data-id="${tipo.id}" title="Eliminar"><i class="fa-solid fa-trash"></i></button>
            </div></td>`;
        tbody.appendChild(tr);
    });
    tbody.querySelectorAll('.btn-action.edit').forEach(btn => btn.addEventListener('click', () => openTipoModal('edit', parseInt(btn.dataset.id))));
    tbody.querySelectorAll('.btn-action.delete').forEach(btn => btn.addEventListener('click', () => showConfirm('¿Eliminar este tipo? Se eliminarán también los modelos asociados.', () => post('deleteLootType', { id: parseInt(btn.dataset.id) }))));
}
document.getElementById('searchTipos').addEventListener('input', e => renderTiposTable(e.target.value));
document.getElementById('btnAddTipo').addEventListener('click', () => openTipoModal('create'));

// ============================================================
//  TABLA MODELOS
// ============================================================
function renderModelosTable(filter = '') {
    const tbody = document.getElementById('modelosTableBody');
    const empty = document.getElementById('modelosEmpty');
    const fl = filter.toLowerCase();
    const rows = currentModels.filter(m => !fl || m.model.toLowerCase().includes(fl));
    tbody.innerHTML = '';
    if (!rows.length) { empty.classList.remove('hidden'); return; }
    empty.classList.add('hidden');
    rows.forEach(modelo => {
        const tipo = currentLootTypes.find(t => t.id === modelo.loottype_id);
        const tipoLabel = tipo ? tipo.label : '—';
        const knifeHtml = modelo.require_knife ? `<span class="badge-knife"><i class="fa-solid fa-knife"></i> Sí</span>` : `<span class="badge-no">—</span>`;
        const animalTag = modelo.is_animal ? `<span class="animal-tag">(animal)</span>` : '';
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><div class="td-prop"><div class="prop-icon-box"><i class="fa-solid ${modelo.is_animal ? 'fa-paw' : 'fa-person-walking-dead'}"></i></div><div><div class="prop-name">${modelo.model}${animalTag}</div></div></div></td>
            <td><div class="tipo-badge"><i class="fa-solid fa-layer-group"></i><span>${tipoLabel}</span></div></td>
            <td>${knifeHtml}</td>
            <td><div class="td-actions">
                <button class="btn-action edit" data-id="${modelo.id}" title="Editar"><i class="fa-solid fa-pen"></i></button>
                <button class="btn-action delete" data-id="${modelo.id}" title="Eliminar"><i class="fa-solid fa-trash"></i></button>
            </div></td>`;
        tbody.appendChild(tr);
    });
    tbody.querySelectorAll('.btn-action.edit').forEach(btn => btn.addEventListener('click', () => openModeloModal('edit', parseInt(btn.dataset.id))));
    tbody.querySelectorAll('.btn-action.delete').forEach(btn => btn.addEventListener('click', () => showConfirm('¿Eliminar este modelo?', () => post('deleteModel', { id: parseInt(btn.dataset.id) }))));
}
document.getElementById('searchModelos').addEventListener('input', e => renderModelosTable(e.target.value));
document.getElementById('btnAddModelo').addEventListener('click', () => openModeloModal('create'));

// ============================================================
//  MODAL PROP / BOX helpers
// ============================================================
let modalMode    = 'prop';
let editingId    = null;
let savedCoords  = null;
let requiredItem = null;

function openModalEl() {
    const ov = document.getElementById('modalOverlay');
    const md = document.getElementById('propModal');
    ov.classList.remove('hidden'); md.classList.remove('hidden', 'closing');
    void ov.offsetHeight; void md.offsetHeight;
    ov.classList.add('visible'); md.classList.add('visible');
    // Cargar items del inventario al builder
    propBuilder.load();
}
function closeModalEl() {
    const ov = document.getElementById('modalOverlay');
    const md = document.getElementById('propModal');
    md.classList.remove('visible'); md.classList.add('closing');
    ov.classList.remove('visible');
    setTimeout(() => { md.classList.add('hidden'); md.classList.remove('closing'); ov.classList.add('hidden'); }, 220);
    resetModalEl();
}
function resetModalEl() {
    editingId = null; savedCoords = null; requiredItem = null;
    document.getElementById('propName').value  = '';
    document.getElementById('propModel').value = '';
    document.getElementById('coordsDisplay').classList.add('hidden');
    document.getElementById('coordsText').textContent = 'Sin coordenadas';
    document.getElementById('requiredItemGroup').classList.add('hidden');
    document.getElementById('btnPlaceProp').classList.add('hidden');
    document.getElementById('requiredItemInput').value = '';
    document.getElementById('requiredItemPreview').classList.add('hidden');
    document.getElementById('requiredItemPreview').innerHTML = '';
    propBuilder.reset();
}

// Sugerencias item requerido (BOX)
function buildRequiredItemSuggestions() {
    const input = document.getElementById('requiredItemInput');
    const dd    = document.getElementById('requiredItemSuggestions');
    let debounce = null;
    input.addEventListener('input', () => {
        clearTimeout(debounce);
        debounce = setTimeout(async () => {
            const q = input.value.trim();
            if (q.length < 2) { dd.classList.add('hidden'); return; }
            const items = await post('searchItems', { query: q }) || [];
            if (!items.length) { dd.classList.add('hidden'); return; }
            dd.innerHTML = '';
            items.forEach(item => {
                const row = document.createElement('div');
                row.className = 'suggestion-item';
                row.innerHTML = `<img src="${imgUrl(item.name)}" onerror="this.src='${defaultImgUrl()}'" /><div><div class="sug-label">${item.label}</div><div class="sug-name">${item.name}</div></div>`;
                row.addEventListener('mousedown', e => {
                    e.preventDefault();
                    requiredItem = item;
                    input.value = item.label;
                    dd.classList.add('hidden');
                    const prev = document.getElementById('requiredItemPreview');
                    prev.innerHTML = `<img src="${imgUrl(item.name)}" onerror="this.src='${defaultImgUrl()}'" /><span>${item.label}</span>`;
                    prev.classList.remove('hidden');
                });
                dd.appendChild(row);
            });
            dd.classList.remove('hidden');
        }, 200);
    });
    input.addEventListener('blur', () => setTimeout(() => dd.classList.add('hidden'), 180));
}
buildRequiredItemSuggestions();

function openPropModal(mode, id = null) {
    resetModalEl();
    modalMode = 'prop';
    editingId = id;
    document.getElementById('modalTitle').textContent = mode === 'create' ? 'AGREGAR PROP' : 'EDITAR PROP';
    document.getElementById('requiredItemGroup').classList.add('hidden');
    document.getElementById('coordsDisplay').classList.add('hidden');
    document.getElementById('btnPlaceProp').classList.add('hidden');
    if (mode === 'edit' && id !== null) {
        const prop = currentProps.find(p => p.id === id);
        if (!prop) return;
        document.getElementById('propName').value  = prop.name;
        document.getElementById('propModel').value = prop.model;
        propBuilder.setItems(prop.items || []);
    }
    openModalEl();
}

function openBoxModal(mode, id = null) {
    resetModalEl();
    modalMode = 'box';
    editingId = id;
    document.getElementById('modalTitle').textContent = mode === 'create' ? 'AGREGAR CAJA' : 'EDITAR CAJA';
    document.getElementById('requiredItemGroup').classList.remove('hidden');
    document.getElementById('coordsDisplay').classList.remove('hidden');
    document.getElementById('btnPlaceProp').classList.remove('hidden');
    if (mode === 'edit' && id !== null) {
        const box = currentBoxes.find(b => b.id === id);
        if (!box) return;
        document.getElementById('propName').value  = box.name;
        document.getElementById('propModel').value = box.model;
        savedCoords = box.coords;
        const c = box.coords || { x:0, y:0, z:0, w:0 };
        document.getElementById('coordsText').textContent = `vec4(${c.x.toFixed(2)}, ${c.y.toFixed(2)}, ${c.z.toFixed(2)}, ${c.w.toFixed(2)})`;
        if (box.required_item) {
            requiredItem = { name: box.required_item, label: box.required_item };
            document.getElementById('requiredItemInput').value = box.required_item;
            const prev = document.getElementById('requiredItemPreview');
            prev.innerHTML = `<img src="${imgUrl(box.required_item)}" onerror="this.src='${defaultImgUrl()}'" /><span>${box.required_item}</span>`;
            prev.classList.remove('hidden');
        }
        propBuilder.setItems(box.items || []);
    }
    openModalEl();
}

document.getElementById('btnPlaceProp').addEventListener('click', () => {
    const model = document.getElementById('propModel').value.trim();
    if (!model) return;
    closeModalEl();
    post('createBox', buildSaveData(true));
});

function buildSaveData(useGizmo = false) {
    const data = {
        name  : document.getElementById('propName').value.trim(),
        model : document.getElementById('propModel').value.trim(),
        items : propBuilder.getItems(),
    };
    if (modalMode === 'box') {
        data.required_item = requiredItem ? requiredItem.name : '';
        data.coords        = savedCoords  || { x:0, y:0, z:0, w:0 };
        data.useGizmo      = useGizmo;
    }
    if (editingId !== null) data.id = editingId;
    return data;
}

document.getElementById('btnSaveModal').addEventListener('click', () => {
    const data = buildSaveData();
    if (!data.name || !data.model) return;
    if (modalMode === 'prop') {
        editingId !== null ? post('updateProp', data) : post('createProp', data);
    } else {
        editingId !== null ? post('updateBox', data) : post('createBox', data);
    }
    closeModalEl();
});
document.getElementById('btnCancelModal').addEventListener('click', closeModalEl);
document.getElementById('btnCloseModal').addEventListener('click', closeModalEl);
document.getElementById('btnClearCoords').addEventListener('click', () => { savedCoords = null; document.getElementById('coordsText').textContent = 'Sin coordenadas'; });

// ============================================================
//  MODAL TIPO
// ============================================================
let tipoEditingId = null;

function openTipoModalEl() {
    const ov = document.getElementById('tipoModalOverlay');
    const md = document.getElementById('tipoModal');
    ov.classList.remove('hidden'); md.classList.remove('hidden', 'closing');
    void ov.offsetHeight; void md.offsetHeight;
    ov.classList.add('visible'); md.classList.add('visible');
    tipoBuilder.load();
}
function closeTipoModal() {
    const ov = document.getElementById('tipoModalOverlay');
    const md = document.getElementById('tipoModal');
    md.classList.remove('visible'); md.classList.add('closing');
    ov.classList.remove('visible');
    setTimeout(() => { md.classList.add('hidden'); md.classList.remove('closing'); ov.classList.add('hidden'); }, 220);
}

function openTipoModal(mode, id = null) {
    tipoEditingId = id;
    document.getElementById('tipoEditingId').value  = id || '';
    document.getElementById('tipoName').value        = '';
    document.getElementById('tipoLabel').value       = '';
    document.getElementById('tipoModalTitle').textContent = mode === 'create' ? 'AGREGAR TIPO' : 'EDITAR TIPO';
    tipoBuilder.reset();
    if (mode === 'edit' && id !== null) {
        const tipo = currentLootTypes.find(t => t.id === id);
        if (!tipo) return;
        document.getElementById('tipoName').value  = tipo.name;
        document.getElementById('tipoLabel').value = tipo.label;
        tipoBuilder.setItems(tipo.items || []);
    }
    openTipoModalEl();
}

document.getElementById('btnSaveTipoModal').addEventListener('click', () => {
    const idVal = document.getElementById('tipoEditingId').value;
    const data  = {
        name  : document.getElementById('tipoName').value.trim(),
        label : document.getElementById('tipoLabel').value.trim(),
        items : tipoBuilder.getItems(),
    };
    if (!data.name || !data.label) return;
    if (idVal) { data.id = parseInt(idVal); post('updateLootType', data); }
    else post('createLootType', data);
    closeTipoModal();
});
document.getElementById('btnCancelTipoModal').addEventListener('click', closeTipoModal);
document.getElementById('btnCloseTipoModal').addEventListener('click', closeTipoModal);
document.getElementById('tipoModalOverlay').addEventListener('click', closeTipoModal);

// ============================================================
//  MODAL MODELO
// ============================================================
function populateLootTypeSelect() {
    const sel = document.getElementById('modeloLootType');
    sel.innerHTML = '';
    currentLootTypes.forEach(t => {
        const opt = document.createElement('option');
        opt.value = t.id; opt.textContent = `${t.label} (${t.name})`;
        sel.appendChild(opt);
    });
}
function openModeloModal(mode, id = null) {
    document.getElementById('modeloEditingId').value      = id || '';
    document.getElementById('modeloModel').value          = '';
    document.getElementById('modeloIsAnimal').checked     = false;
    document.getElementById('modeloRequireKnife').checked = false;
    document.getElementById('modeloModalTitle').textContent = mode === 'create' ? 'AGREGAR MODELO' : 'EDITAR MODELO';
    populateLootTypeSelect();
    if (mode === 'edit' && id !== null) {
        const m = currentModels.find(x => x.id === id);
        if (!m) return;
        document.getElementById('modeloModel').value          = m.model;
        document.getElementById('modeloIsAnimal').checked     = m.is_animal;
        document.getElementById('modeloRequireKnife').checked = m.require_knife;
        document.getElementById('modeloLootType').value       = m.loottype_id;
    }
    const ov = document.getElementById('modeloModalOverlay');
    const md = document.getElementById('modeloModal');
    ov.classList.remove('hidden'); md.classList.remove('hidden', 'closing');
    void md.offsetHeight; ov.classList.add('visible'); md.classList.add('visible');
}
function closeModeloModal() {
    const ov = document.getElementById('modeloModalOverlay');
    const md = document.getElementById('modeloModal');
    md.classList.remove('visible'); md.classList.add('closing');
    ov.classList.remove('visible');
    setTimeout(() => { md.classList.add('hidden'); md.classList.remove('closing'); ov.classList.add('hidden'); }, 220);
}
document.getElementById('btnSaveModeloModal').addEventListener('click', () => {
    const idVal = document.getElementById('modeloEditingId').value;
    const data  = {
        model         : document.getElementById('modeloModel').value.trim().toLowerCase(),
        loottype_id   : parseInt(document.getElementById('modeloLootType').value),
        is_animal     : document.getElementById('modeloIsAnimal').checked,
        require_knife : document.getElementById('modeloRequireKnife').checked,
    };
    if (!data.model || !data.loottype_id) return;
    if (idVal) { data.id = parseInt(idVal); post('updateModel', data); }
    else post('createModel', data);
    closeModeloModal();
});
document.getElementById('btnCancelModeloModal').addEventListener('click', closeModeloModal);
document.getElementById('btnCloseModeloModal').addEventListener('click', closeModeloModal);
document.getElementById('modeloModalOverlay').addEventListener('click', closeModeloModal);

// ============================================================
//  LOOT UI
// ============================================================
const lootOverlay   = document.getElementById('lootOverlay');
const lootPanel     = document.getElementById('lootPanel');
const lootGrid      = document.getElementById('lootGrid');
const lootEmpty     = document.getElementById('lootEmpty');
const btnCloseLoot  = document.getElementById('btnCloseLoot');
const btnCollectAll = document.getElementById('btnCollectAll');
const lootItemCount = document.getElementById('lootItemCount');
const SPINNER_DURATION = 850;

function openLootUI(items, source) {
    lootItems = [...items];
    const icon  = document.getElementById('lootHeaderIcon');
    const title = document.getElementById('lootPanelTitle');
    icon.className  = source === 'box' ? 'fa-solid fa-toolbox header-icon' : 'fa-solid fa-box-open header-icon';
    title.textContent = source === 'box' ? 'OBJETOS ENCONTRADOS' : 'BOTÍN ENCONTRADO';
    lootGrid.innerHTML = ''; lootEmpty.classList.add('hidden'); lootGrid.style.display = 'flex';
    updateLootCount();
    lootOverlay.classList.remove('hidden'); lootPanel.classList.remove('hidden', 'closing');
    void lootOverlay.offsetHeight; void lootPanel.offsetHeight;
    lootOverlay.classList.add('visible'); lootPanel.classList.add('visible');
    buildCardsSequential(lootGrid, lootItems, false);
}
function closeLootUI(notify = true) {
    lootPanel.classList.remove('visible'); lootPanel.classList.add('closing');
    lootOverlay.classList.remove('visible');
    setTimeout(() => { lootPanel.classList.add('hidden'); lootPanel.classList.remove('closing'); lootOverlay.classList.add('hidden'); lootGrid.innerHTML = ''; lootItems = []; }, 260);
    if (notify) post('closeLoot');
}
function updateLootCount() {
    const n = lootItems.length;
    lootItemCount.textContent = n === 1 ? '1 item encontrado' : `${n} items encontrados`;
    btnCollectAll.disabled = n === 0;
    if (n === 0) { lootGrid.style.display = 'none'; lootEmpty.classList.remove('hidden'); btnCollectAll.disabled = true; }
}

function buildCardsSequential(grid, items, isPlayerBox) {
    grid.innerHTML = '';
    const cards = items.map(item => { const card = createCard(item, isPlayerBox); grid.appendChild(card); return { card, item }; });
    revealNext(cards, 0, isPlayerBox);
}
function revealNext(cards, index, isPlayerBox) {
    if (index >= cards.length) {
        if (isPlayerBox) {
            document.getElementById('btnCollectAllBox').disabled = false;
            const n = cards.length;
            document.getElementById('boxItemCount').textContent = n === 1 ? '1 item encontrado' : `${n} items encontrados`;
        }
        return;
    }
    const { card, item } = cards[index];
    card.classList.add('appeared');
    setTimeout(() => { revealCardImage(card, item, () => { setTimeout(() => revealNext(cards, index + 1, isPlayerBox), 70); }); }, SPINNER_DURATION);
}
function createCard(item, isPlayerBox) {
    const card = document.createElement('div');
    card.className = 'item-card';
    card.dataset.name = item.name; card.dataset.count = item.count;
    const badge = document.createElement('div'); badge.className = 'collect-badge'; badge.textContent = 'RECOGER'; card.appendChild(badge);
    const spinner = document.createElement('div'); spinner.className = 'item-spinner'; const ring = document.createElement('div'); ring.className = 'spinner-ring'; spinner.appendChild(ring); card.appendChild(spinner);
    const img = document.createElement('img'); img.className = 'item-img'; img.alt = item.name; card.appendChild(img);
    const nameEl = document.createElement('div'); nameEl.className = 'item-name'; nameEl.textContent = item.label || formatName(item.name); nameEl.title = nameEl.textContent; card.appendChild(nameEl);
    const countEl = document.createElement('div'); countEl.className = 'item-count'; countEl.innerHTML = `x<span>${item.count}</span>`; card.appendChild(countEl);
    card.addEventListener('click', () => {
        if (card.classList.contains('collected')) return;
        card.classList.add('collected');
        if (isPlayerBox) {
            post('collectBoxItem', { name: item.name, count: item.count });
        } else {
            post('collectLootItem', { name: item.name, count: item.count });
            lootItems = lootItems.filter(i => !(i.name === item.name && i.count === item.count));
            setTimeout(() => { card.remove(); updateLootCount(); }, 230);
        }
    });
    return card;
}
function revealCardImage(card, item, onDone) {
    const spinner = card.querySelector('.item-spinner');
    const img     = card.querySelector('.item-img');
    function reveal() { spinner.classList.add('hidden'); card.classList.add('revealed'); if (onDone) onDone(); }
    img.onload  = () => { img.classList.add('loaded'); reveal(); };
    img.onerror = () => { if (!img.dataset.usedDefault) { img.dataset.usedDefault = '1'; img.src = defaultImgUrl(); } else reveal(); };
    img.src = imgUrl(item.name);
}

btnCloseLoot.addEventListener('click', () => closeLootUI(true));
btnCollectAll.addEventListener('click', () => {
    if (!lootItems.length) return;
    btnCollectAll.disabled = true;
    [...lootGrid.querySelectorAll('.item-card:not(.collected)')].forEach((c, i) => setTimeout(() => c.classList.add('collected'), i * 50));
    post('collectAllLoot', { items: lootItems });
    lootItems = [];
});
lootGrid.addEventListener('wheel', e => { e.preventDefault(); lootGrid.scrollLeft += e.deltaY; }, { passive: false });

// ============================================================
//  BOX UI
// ============================================================
const boxOverlay       = document.getElementById('boxOverlay');
const boxPanel         = document.getElementById('boxPanel');
const boxGrid          = document.getElementById('boxGrid');
const boxEmpty         = document.getElementById('boxEmpty');
const btnCloseBoxUI    = document.getElementById('btnCloseBoxUI');
const btnCollectAllBox = document.getElementById('btnCollectAllBox');
const boxItemCount     = document.getElementById('boxItemCount');
let boxItems = [];

function openBoxUI(items, ownerName) {
    boxItems = [...items];
    document.getElementById('boxPanelTitle').textContent = 'CAJA DE ' + ownerName.toUpperCase();
    boxGrid.innerHTML = ''; boxGrid.classList.add('loading-grid');
    boxGrid.innerHTML = `<div class="loading-indicator"><div class="spinner-ring"></div><span>Revisando contenido...</span></div>`;
    boxEmpty.classList.add('hidden'); btnCollectAllBox.disabled = true; boxItemCount.textContent = 'Cargando...'; boxGrid.style.display = 'flex';
    boxOverlay.classList.remove('hidden'); boxPanel.classList.remove('hidden', 'closing');
    void boxOverlay.offsetHeight; void boxPanel.offsetHeight;
    boxOverlay.classList.add('visible'); boxPanel.classList.add('visible');
    setTimeout(() => {
        boxGrid.classList.remove('loading-grid'); boxGrid.innerHTML = '';
        buildCardsSequential(boxGrid, boxItems, true);
        boxGrid.addEventListener('wheel', e => { e.preventDefault(); boxGrid.scrollLeft += e.deltaY; }, { passive: false, once: true });
    }, 600);
}
function closeBoxUI(notify = true) {
    boxPanel.classList.remove('visible'); boxPanel.classList.add('closing');
    boxOverlay.classList.remove('visible');
    setTimeout(() => { boxPanel.classList.add('hidden'); boxPanel.classList.remove('closing'); boxOverlay.classList.add('hidden'); boxGrid.innerHTML = ''; boxItems = []; }, 260);
    if (notify) post('closeBoxUI');
}
btnCloseBoxUI.addEventListener('click', () => closeBoxUI(true));
btnCollectAllBox.addEventListener('click', () => {
    if (!boxItems.length) return;
    btnCollectAllBox.disabled = true;
    [...boxGrid.querySelectorAll('.item-card:not(.collected)')].forEach((c, i) => setTimeout(() => c.classList.add('collected'), i * 50));
    post('collectAllBox');
    boxItems = [];
    setTimeout(() => closeBoxUI(false), 350);
});

// GIZMO HINT
function setGizmoHint(visible) {
    const el = document.getElementById('gizmoHint');
    if (visible) { el.classList.remove('hidden'); void el.offsetHeight; el.classList.add('visible'); }
    else { el.classList.remove('visible'); setTimeout(() => el.classList.add('hidden'), 250); }
}

// OVERLAY CLICKS
document.getElementById('lootOverlay').addEventListener('click', () => closeLootUI(true));
document.getElementById('boxOverlay').addEventListener('click', () => closeBoxUI(true));
document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
        if (!lootPanel.classList.contains('hidden')) closeLootUI(true);
        else if (!boxPanel.classList.contains('hidden')) closeBoxUI(true);
    }
});

// ============================================================
//  MENSAJES NUI
// ============================================================
window.addEventListener('message', (event) => {
    const data = event.data;
    if (!data || !data.action) return;
    switch (data.action) {
        case 'openCreator':
            imagePath = data.imagePath || '';
            openCreator(data.props, data.boxes, data.lootTypes, data.models);
            break;
        case 'closeCreator': closeCreator(); break;
        case 'hideCreator':
            // Ocultar completamente sin llamar post (gizmo activo)
            document.getElementById('creatorPanel').classList.remove('visible');
            document.getElementById('creatorPanel').classList.add('closing');
            document.getElementById('creatorOverlay').classList.remove('visible');
            setTimeout(() => {
                document.getElementById('creatorPanel').classList.add('hidden');
                document.getElementById('creatorPanel').classList.remove('closing');
                document.getElementById('creatorOverlay').classList.add('hidden');
            }, 260);
            break;
        case 'returnToCreator':
            imagePath = imagePath || '';
            openCreator(currentProps, currentBoxes, currentLootTypes, currentModels);
            if (data.tab === 'box') document.querySelector('[data-tab="box"]').click();
            break;
        case 'propsUpdated':  currentProps     = data.props     || []; renderPropsTable();   break;
        case 'boxesUpdated':  currentBoxes     = data.boxes     || []; renderBoxesTable();   break;
        case 'lootTypesUpdated': currentLootTypes = data.lootTypes || []; renderTiposTable(); break;
        case 'modelsUpdated': currentModels    = data.models    || []; renderModelosTable(); break;
        case 'syncProps':     currentProps     = data.props     || []; break;
        case 'syncBoxes':     currentBoxes     = data.boxes     || []; break;
        case 'syncLootTypes': currentLootTypes = data.lootTypes || []; break;
        case 'syncModels':    currentModels    = data.models    || []; break;
        case 'openLoot':
            imagePath = data.imagePath || imagePath;
            openLootUI(data.items || [], data.source || 'prop');
            break;
        case 'openBoxUI':
            imagePath = data.imagePath || imagePath;
            openBoxUI(data.items || [], data.ownerName || 'Jugador');
            break;
        case 'closeLoot': closeLootUI(false); closeBoxUI(false); break;
        case 'showGizmoHint': setGizmoHint(data.visible); break;
    }
});
