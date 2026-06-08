'use strict';
// ============================================================
//  AX_LootingV2 - script.js
// ============================================================

// ============================================================
//  ESTADO GLOBAL
// ============================================================
let imagePath    = '';
let currentProps = [];
let currentBoxes = [];
let currentLootTypes = [];
let currentModels    = [];

// Loot UI state
let lootItems    = [];
let lootIsBox    = false;   // true = caja de jugador abatido

// Modal state
let modalMode    = 'prop';  // 'prop' | 'box'
let editingId    = null;
let itemSlots    = [];
let savedCoords  = null;    // { x, y, z, w } para BOX
let requiredItem = null;    // { name, label } para BOX

// Confirm dialog callback
let confirmCallback = null;

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

function formatName(name) {
    if (!name) return 'Desconocido';
    return name.replace(/[-_]/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function imgUrl(name) {
    return `${imagePath}${name}.png`;
}

function showConfirm(text, cb) {
    document.getElementById('confirmText').textContent = text;
    confirmCallback = cb;
    document.getElementById('confirmOverlay').classList.add('visible');
    document.getElementById('confirmOverlay').classList.remove('hidden');
    const dlg = document.getElementById('confirmDialog');
    dlg.classList.remove('hidden');
    void dlg.offsetHeight;
    dlg.classList.add('visible');
}

function hideConfirm() {
    const dlg = document.getElementById('confirmDialog');
    dlg.classList.remove('visible');
    document.getElementById('confirmOverlay').classList.remove('visible');
    setTimeout(() => {
        dlg.classList.add('hidden');
        document.getElementById('confirmOverlay').classList.add('hidden');
    }, 220);
}

// ============================================================
//  SUGERENCIAS DE ITEMS
// ============================================================
async function fetchItemSuggestions(query) {
    if (!query || query.length < 2) return [];
    const result = await post('searchItems', { query });
    return Array.isArray(result) ? result : [];
}

function buildSuggestionsDropdown(container, inputEl, onSelect) {
    let ddEl = container.querySelector('.suggestions-dropdown');
    if (!ddEl) {
        ddEl = document.createElement('div');
        ddEl.className = 'suggestions-dropdown hidden';
        container.appendChild(ddEl);
    }

    let debounceTimer = null;
    inputEl.addEventListener('input', () => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(async () => {
            const q = inputEl.value.trim();
            if (q.length < 2) { ddEl.classList.add('hidden'); return; }
            const items = await fetchItemSuggestions(q);
            if (!items.length) { ddEl.classList.add('hidden'); return; }
            ddEl.innerHTML = '';
            items.forEach(item => {
                const row = document.createElement('div');
                row.className = 'suggestion-item';
                row.innerHTML = `
                    <img src="${imgUrl(item.name)}" onerror="this.style.opacity=0.2" />
                    <div>
                        <div class="sug-label">${item.label}</div>
                        <div class="sug-name">${item.name}</div>
                    </div>`;
                row.addEventListener('mousedown', (e) => {
                    e.preventDefault();
                    onSelect(item);
                    ddEl.classList.add('hidden');
                    inputEl.value = item.label;
                });
                ddEl.appendChild(row);
            });
            ddEl.classList.remove('hidden');
        }, 200);
    });

    inputEl.addEventListener('blur', () => {
        setTimeout(() => ddEl.classList.add('hidden'), 180);
    });
}

// ============================================================
//  CREATOR: ABRIR / CERRAR
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

    const overlay = document.getElementById('creatorOverlay');
    const panel   = document.getElementById('creatorPanel');

    overlay.classList.remove('hidden');
    panel.classList.remove('hidden', 'closing');
    void overlay.offsetHeight;
    void panel.offsetHeight;
    overlay.classList.add('visible');
    panel.classList.add('visible');
}

function closeCreator() {
    const overlay = document.getElementById('creatorOverlay');
    const panel   = document.getElementById('creatorPanel');
    panel.classList.remove('visible');
    panel.classList.add('closing');
    overlay.classList.remove('visible');
    setTimeout(() => {
        panel.classList.add('hidden');
        panel.classList.remove('closing');
        overlay.classList.add('hidden');
    }, 260);
    post('closeCreator');
}

// ============================================================
//  TABS
// ============================================================
document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const tab = btn.dataset.tab;
        document.querySelectorAll('.tab-content').forEach(tc => tc.classList.add('hidden'));
        const map = { looting: 'tabLooting', box: 'tabBox', tipos: 'tabTipos', modelos: 'tabModelos' };
        if (map[tab]) document.getElementById(map[tab]).classList.remove('hidden');
    });
});

// ============================================================
//  TABLA PROPS
// ============================================================
function renderPropsTable(filter = '') {
    const tbody  = document.getElementById('propsTableBody');
    const empty  = document.getElementById('propsEmpty');
    const fl     = filter.toLowerCase();
    const rows   = currentProps.filter(p =>
        !fl || p.name.toLowerCase().includes(fl) || p.model.toLowerCase().includes(fl)
    );

    tbody.innerHTML = '';
    if (!rows.length) {
        empty.classList.remove('hidden');
        return;
    }
    empty.classList.add('hidden');

    rows.forEach(prop => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>
                <div class="td-prop">
                    <div class="prop-icon-box"><i class="fa-solid fa-box-open"></i></div>
                    <div>
                        <div class="prop-name">${prop.name}</div>
                        <div class="prop-model">${prop.model}</div>
                    </div>
                </div>
            </td>
            <td><div class="td-items">${buildItemPills(prop.items)}</div></td>
            <td>
                <div class="td-actions">
                    <button class="btn-action edit" data-id="${prop.id}" title="Editar"><i class="fa-solid fa-pen"></i></button>
                    <button class="btn-action delete" data-id="${prop.id}" title="Eliminar"><i class="fa-solid fa-trash"></i></button>
                </div>
            </td>`;
        tbody.appendChild(tr);
    });

    tbody.querySelectorAll('.btn-action.edit').forEach(btn => {
        btn.addEventListener('click', () => openPropModal('edit', parseInt(btn.dataset.id)));
    });
    tbody.querySelectorAll('.btn-action.delete').forEach(btn => {
        btn.addEventListener('click', () => {
            showConfirm('¿Eliminar este prop?', () => {
                post('deleteProp', { id: parseInt(btn.dataset.id) });
            });
        });
    });
}

function buildItemPills(items) {
    if (!items || !items.length) return '<span style="color:var(--text-muted);font-size:11px">—</span>';
    return items.slice(0, 5).map(item => `
        <div class="item-pill">
            <img src="${imgUrl(item.name)}" onerror="this.style.opacity=0.2" />
            <span class="pill-range">x${item.min}-${item.max}</span>
            <span>${item.probability}%</span>
        </div>`).join('') + (items.length > 5 ? `<span style="color:var(--text-muted);font-size:10px">+${items.length-5}</span>` : '');
}

document.getElementById('searchProps').addEventListener('input', e => {
    renderPropsTable(e.target.value);
});

document.getElementById('btnAddProp').addEventListener('click', () => openPropModal('create'));

// ============================================================
//  TABLA BOXES
// ============================================================
function renderBoxesTable(filter = '') {
    const tbody = document.getElementById('boxesTableBody');
    const empty = document.getElementById('boxesEmpty');
    const fl    = filter.toLowerCase();
    const rows  = currentBoxes.filter(b =>
        !fl || b.name.toLowerCase().includes(fl) || b.model.toLowerCase().includes(fl)
    );

    tbody.innerHTML = '';
    if (!rows.length) {
        empty.classList.remove('hidden');
        return;
    }
    empty.classList.add('hidden');

    rows.forEach(box => {
        const c     = box.coords || { x:0, y:0, z:0, w:0 };
        const hasRi = box.required_item && box.required_item !== '';
        const riHtml = hasRi
            ? `<img src="${imgUrl(box.required_item)}" onerror="this.style.opacity=0.2" /><span>${box.required_item}</span>`
            : `<span class="no-item">—</span>`;

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>
                <div class="td-prop">
                    <div class="prop-icon-box"><i class="fa-solid fa-toolbox"></i></div>
                    <div>
                        <div class="prop-name">${box.name}</div>
                        <div class="prop-model">${box.model}</div>
                    </div>
                </div>
            </td>
            <td><div class="td-itemn">${riHtml}</div></td>
            <td><div class="td-items">${buildItemPills(box.items)}</div></td>
            <td>
                <div class="td-actions">
                    <button class="btn-action goto" data-id="${box.id}" title="Ir"><i class="fa-solid fa-location-arrow"></i></button>
                    <button class="btn-action edit" data-id="${box.id}" title="Editar"><i class="fa-solid fa-pen"></i></button>
                    <button class="btn-action delete" data-id="${box.id}" title="Eliminar"><i class="fa-solid fa-trash"></i></button>
                </div>
            </td>`;
        tbody.appendChild(tr);
    });

    tbody.querySelectorAll('.btn-action.goto').forEach(btn => {
        btn.addEventListener('click', () => post('gotoBox', { id: parseInt(btn.dataset.id) }));
    });
    tbody.querySelectorAll('.btn-action.edit').forEach(btn => {
        btn.addEventListener('click', () => openBoxModal('edit', parseInt(btn.dataset.id)));
    });
    tbody.querySelectorAll('.btn-action.delete').forEach(btn => {
        btn.addEventListener('click', () => {
            showConfirm('¿Eliminar esta caja?', () => {
                post('deleteBox', { id: parseInt(btn.dataset.id) });
            });
        });
    });
}

document.getElementById('searchBoxes').addEventListener('input', e => {
    renderBoxesTable(e.target.value);
});

document.getElementById('btnAddBox').addEventListener('click', () => openBoxModal('create'));

// ============================================================
//  MODAL: ABRIR / CERRAR
// ============================================================
function openModal() {
    const overlay = document.getElementById('modalOverlay');
    const modal   = document.getElementById('propModal');
    overlay.classList.remove('hidden');
    modal.classList.remove('hidden', 'closing');
    void overlay.offsetHeight;
    void modal.offsetHeight;
    overlay.classList.add('visible');
    modal.classList.add('visible');
}

function closeModal() {
    const overlay = document.getElementById('modalOverlay');
    const modal   = document.getElementById('propModal');
    modal.classList.remove('visible');
    modal.classList.add('closing');
    overlay.classList.remove('visible');
    setTimeout(() => {
        modal.classList.add('hidden');
        modal.classList.remove('closing');
        overlay.classList.add('hidden');
    }, 220);
    resetModal();
}

function resetModal() {
    editingId    = null;
    itemSlots    = [];
    savedCoords  = null;
    requiredItem = null;
    document.getElementById('propName').value       = '';
    document.getElementById('propModel').value      = '';
    document.getElementById('itemSlotsList').innerHTML = '';
    document.getElementById('coordsDisplay').classList.add('hidden');
    document.getElementById('coordsText').textContent = 'Sin coordenadas';
    document.getElementById('requiredItemGroup').classList.add('hidden');
    document.getElementById('btnPlaceProp').classList.add('hidden');
    document.getElementById('requiredItemInput').value = '';
    document.getElementById('requiredItemPreview').classList.add('hidden');
    document.getElementById('requiredItemPreview').innerHTML = '';
    updateProbTotal();
}

// ============================================================
//  MODAL PROP
// ============================================================
function openPropModal(mode, id = null) {
    resetModal();
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
        (prop.items || []).forEach(item => addItemSlot(item));
    }
    openModal();
}

// ============================================================
//  MODAL BOX
// ============================================================
function openBoxModal(mode, id = null) {
    resetModal();
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
        document.getElementById('coordsText').textContent =
            `vec4(${c.x.toFixed(2)}, ${c.y.toFixed(2)}, ${c.z.toFixed(2)}, ${c.w.toFixed(2)})`;

        if (box.required_item) {
            requiredItem = { name: box.required_item, label: box.required_item };
            document.getElementById('requiredItemInput').value = box.required_item;
            const prev = document.getElementById('requiredItemPreview');
            prev.innerHTML = `<img src="${imgUrl(box.required_item)}" onerror="this.style.opacity=0.2"/><span>${box.required_item}</span>`;
            prev.classList.remove('hidden');
        }
        (box.items || []).forEach(item => addItemSlot(item));
    }

    // Sugerencias para item requerido
    const riInput = document.getElementById('requiredItemInput');
    const riWrap  = document.querySelector('#requiredItemGroup .item-search-wrap');
    buildSuggestionsDropdown(riWrap, riInput, (item) => {
        requiredItem = item;
        const prev = document.getElementById('requiredItemPreview');
        prev.innerHTML = `<img src="${imgUrl(item.name)}" onerror="this.style.opacity=0.2"/><span>${item.label}</span>`;
        prev.classList.remove('hidden');
    });

    openModal();
}

// Boton COLOCAR del modal BOX — cierra modal, inicia gizmo en cliente
document.getElementById('btnPlaceProp').addEventListener('click', () => {
    const model = document.getElementById('propModel').value.trim();
    if (!model) return;
    // Cerrar modal temporalmente, lanzar gizmo via NUI message al cliente
    closeModal();
    // El cliente reconectará el creator cuando el gizmo termine
    post('createBox', buildSaveData(true));  // useGizmo=true
});

// ============================================================
//  ITEM SLOTS
// ============================================================
let slotCounter = 0;

function addItemSlot(data = {}) {
    slotCounter++;
    const id = slotCounter;
    itemSlots.push({ id, name: data.name || '', min: data.min || 1, max: data.max || 1, probability: data.probability || 0 });

    const wrap = document.getElementById('itemSlotsList');
    const div  = document.createElement('div');
    div.className  = 'item-slot';
    div.dataset.slotId = id;

    div.innerHTML = `
        <div class="slot-header">
            <span class="slot-label">SLOT ${itemSlots.length}</span>
            <button class="btn-icon-only btn-danger-icon btn-remove-slot" data-slot-id="${id}">
                <i class="fa-solid fa-xmark"></i>
            </button>
        </div>
        <div class="slot-item-row">
            <div class="slot-item-preview">
                <img class="slot-preview-img" src="${data.name ? imgUrl(data.name) : ''}" style="${data.name ? '' : 'display:none'}" />
            </div>
            <div class="slot-item-search" style="flex:1;position:relative;">
                <input class="form-input slot-name-input" type="text" placeholder="Buscar item..." value="${data.name || ''}" autocomplete="off" data-slot-id="${id}" />
                <div class="suggestions-dropdown hidden"></div>
            </div>
        </div>
        <div class="slot-fields">
            <div></div>
            <div class="slot-field-wrap">
                <div class="slot-field-label">MIN</div>
                <input class="slot-input slot-min" type="number" min="1" value="${data.min || 1}" data-slot-id="${id}" />
            </div>
            <div class="slot-field-wrap">
                <div class="slot-field-label">MAX</div>
                <input class="slot-input slot-max" type="number" min="1" value="${data.max || 1}" data-slot-id="${id}" />
            </div>
            <div class="slot-field-wrap">
                <div class="slot-field-label">%</div>
                <input class="slot-input slot-prob" type="number" min="0" max="100" value="${data.probability || 0}" data-slot-id="${id}" />
            </div>
        </div>`;

    wrap.appendChild(div);

    // Sugerencias de items en el slot
    const nameInput = div.querySelector('.slot-name-input');
    const searchWrap = div.querySelector('.slot-item-search');
    buildSuggestionsDropdown(searchWrap, nameInput, (item) => {
        const slot = itemSlots.find(s => s.id === id);
        if (slot) { slot.name = item.name; slot.label = item.label; }
        const previewImg = div.querySelector('.slot-preview-img');
        previewImg.src = imgUrl(item.name);
        previewImg.style.display = '';
    });

    nameInput.addEventListener('input', () => {
        const slot = itemSlots.find(s => s.id === id);
        if (slot) slot.name = nameInput.value.trim();
    });

    div.querySelector('.slot-min').addEventListener('input', e => {
        const slot = itemSlots.find(s => s.id === id);
        if (slot) slot.min = parseInt(e.target.value) || 1;
    });
    div.querySelector('.slot-max').addEventListener('input', e => {
        const slot = itemSlots.find(s => s.id === id);
        if (slot) slot.max = parseInt(e.target.value) || 1;
    });
    div.querySelector('.slot-prob').addEventListener('input', e => {
        const slot = itemSlots.find(s => s.id === id);
        if (slot) slot.probability = parseInt(e.target.value) || 0;
        updateProbTotal();
    });

    div.querySelector('.btn-remove-slot').addEventListener('click', () => {
        itemSlots = itemSlots.filter(s => s.id !== id);
        div.remove();
        updateProbTotal();
        renumberSlots();
    });

    updateProbTotal();
}

function renumberSlots() {
    document.querySelectorAll('.item-slot').forEach((el, i) => {
        const lbl = el.querySelector('.slot-label');
        if (lbl) lbl.textContent = `SLOT ${i + 1}`;
    });
}

function updateProbTotal() {
    const total = itemSlots.reduce((acc, s) => acc + (s.probability || 0), 0);
    const el    = document.getElementById('probTotal');
    el.textContent = `Total: ${total}%`;
    el.className   = 'prob-total' + (total > 100 ? ' over' : total === 100 ? ' full' : '');
}

document.getElementById('btnAddItemSlot').addEventListener('click', () => addItemSlot());

// ============================================================
//  GUARDAR MODAL
// ============================================================
function buildSaveData(useGizmo = false) {
    const data = {
        name     : document.getElementById('propName').value.trim(),
        model    : document.getElementById('propModel').value.trim(),
        items    : itemSlots.filter(s => s.name).map(s => ({
            name        : s.name,
            min         : s.min  || 1,
            max         : s.max  || 1,
            probability : s.probability || 0,
        })),
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
        if (editingId !== null) {
            post('updateProp', data);
        } else {
            post('createProp', data);
        }
    } else {
        // BOX sin gizmo (editar sin cambiar coords, o create con coords ya guardadas)
        if (editingId !== null) {
            post('updateBox', data);
        } else {
            // Si no tiene coords, el COLOCAR ya lo manejó
            post('createBox', data);
        }
    }
    closeModal();
});

document.getElementById('btnCancelModal').addEventListener('click', closeModal);
document.getElementById('btnCloseModal').addEventListener('click', closeModal);

// Borrar coords del BOX
document.getElementById('btnClearCoords').addEventListener('click', () => {
    savedCoords = null;
    document.getElementById('coordsText').textContent = 'Sin coordenadas';
});

// ============================================================
//  CONFIRMACION
// ============================================================
document.getElementById('confirmYes').addEventListener('click', () => {
    if (confirmCallback) { confirmCallback(); confirmCallback = null; }
    hideConfirm();
});
document.getElementById('confirmNo').addEventListener('click', hideConfirm);
document.getElementById('confirmOverlay').addEventListener('click', hideConfirm);

// ============================================================
//  TABLA TIPOS
// ============================================================
function renderTiposTable(filter = '') {
    const tbody = document.getElementById('tiposTableBody');
    const empty = document.getElementById('tiposEmpty');
    const fl    = filter.toLowerCase();
    const rows  = currentLootTypes.filter(t =>
        !fl || t.name.toLowerCase().includes(fl) || t.label.toLowerCase().includes(fl)
    );

    tbody.innerHTML = '';
    if (!rows.length) { empty.classList.remove('hidden'); return; }
    empty.classList.add('hidden');

    rows.forEach(tipo => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>
                <div class="td-prop">
                    <div class="prop-icon-box"><i class="fa-solid fa-layer-group"></i></div>
                    <div>
                        <div class="prop-name">${tipo.label}</div>
                        <div class="prop-model">${tipo.name}</div>
                    </div>
                </div>
            </td>
            <td><div class="td-items">${buildItemPills(tipo.items)}</div></td>
            <td>
                <div class="td-actions">
                    <button class="btn-action edit" data-id="${tipo.id}" title="Editar"><i class="fa-solid fa-pen"></i></button>
                    <button class="btn-action delete" data-id="${tipo.id}" title="Eliminar"><i class="fa-solid fa-trash"></i></button>
                </div>
            </td>`;
        tbody.appendChild(tr);
    });

    tbody.querySelectorAll('.btn-action.edit').forEach(btn => {
        btn.addEventListener('click', () => openTipoModal('edit', parseInt(btn.dataset.id)));
    });
    tbody.querySelectorAll('.btn-action.delete').forEach(btn => {
        btn.addEventListener('click', () => {
            showConfirm('¿Eliminar este tipo? Se eliminarán también los modelos asociados.', () => {
                post('deleteLootType', { id: parseInt(btn.dataset.id) });
            });
        });
    });
}

document.getElementById('searchTipos').addEventListener('input', e => renderTiposTable(e.target.value));
document.getElementById('btnAddTipo').addEventListener('click', () => openTipoModal('create'));

// ============================================================
//  TABLA MODELOS
// ============================================================
function renderModelosTable(filter = '') {
    const tbody = document.getElementById('modelosTableBody');
    const empty = document.getElementById('modelosEmpty');
    const fl    = filter.toLowerCase();
    const rows  = currentModels.filter(m => !fl || m.model.toLowerCase().includes(fl));

    tbody.innerHTML = '';
    if (!rows.length) { empty.classList.remove('hidden'); return; }
    empty.classList.add('hidden');

    rows.forEach(modelo => {
        const tipo  = currentLootTypes.find(t => t.id === modelo.loottype_id);
        const tipoLabel = tipo ? tipo.label : '—';
        const tipoName  = tipo ? tipo.name  : '';
        const knifeHtml = modelo.require_knife
            ? `<span class="badge-knife"><i class="fa-solid fa-knife"></i> Sí</span>`
            : `<span class="badge-no">—</span>`;
        const animalTag = modelo.is_animal ? `<span class="animal-tag">(animal)</span>` : '';

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>
                <div class="td-prop">
                    <div class="prop-icon-box">
                        <i class="fa-solid ${modelo.is_animal ? 'fa-paw' : 'fa-person-walking-dead'}"></i>
                    </div>
                    <div>
                        <div class="prop-name">${modelo.model}${animalTag}</div>
                    </div>
                </div>
            </td>
            <td>
                <div class="tipo-badge">
                    <i class="fa-solid fa-layer-group"></i>
                    <span>${tipoLabel}</span>
                </div>
            </td>
            <td>${knifeHtml}</td>
            <td>
                <div class="td-actions">
                    <button class="btn-action edit" data-id="${modelo.id}" title="Editar"><i class="fa-solid fa-pen"></i></button>
                    <button class="btn-action delete" data-id="${modelo.id}" title="Eliminar"><i class="fa-solid fa-trash"></i></button>
                </div>
            </td>`;
        tbody.appendChild(tr);
    });

    tbody.querySelectorAll('.btn-action.edit').forEach(btn => {
        btn.addEventListener('click', () => openModeloModal('edit', parseInt(btn.dataset.id)));
    });
    tbody.querySelectorAll('.btn-action.delete').forEach(btn => {
        btn.addEventListener('click', () => {
            showConfirm('¿Eliminar este modelo?', () => {
                post('deleteModel', { id: parseInt(btn.dataset.id) });
            });
        });
    });
}

document.getElementById('searchModelos').addEventListener('input', e => renderModelosTable(e.target.value));
document.getElementById('btnAddModelo').addEventListener('click', () => openModeloModal('create'));

// ============================================================
//  MODAL TIPO
// ============================================================
let tipoItemSlots  = [];
let tipoSlotCount  = 0;

function openTipoModal(mode, id = null) {
    tipoItemSlots = [];
    tipoSlotCount = 0;
    document.getElementById('tipoEditingId').value  = id || '';
    document.getElementById('tipoName').value        = '';
    document.getElementById('tipoLabel').value       = '';
    document.getElementById('tipoItemSlotsList').innerHTML = '';
    updateTipoProbTotal();
    document.getElementById('tipoModalTitle').textContent = mode === 'create' ? 'AGREGAR TIPO' : 'EDITAR TIPO';

    if (mode === 'edit' && id !== null) {
        const tipo = currentLootTypes.find(t => t.id === id);
        if (!tipo) return;
        document.getElementById('tipoName').value  = tipo.name;
        document.getElementById('tipoLabel').value = tipo.label;
        (tipo.items || []).forEach(item => addTipoItemSlot(item));
    }

    const overlay = document.getElementById('tipoModalOverlay');
    const modal   = document.getElementById('tipoModal');
    overlay.classList.remove('hidden');
    modal.classList.remove('hidden', 'closing');
    void modal.offsetHeight;
    overlay.classList.add('visible');
    modal.classList.add('visible');
}

function closeTipoModal() {
    const overlay = document.getElementById('tipoModalOverlay');
    const modal   = document.getElementById('tipoModal');
    modal.classList.remove('visible'); modal.classList.add('closing');
    overlay.classList.remove('visible');
    setTimeout(() => { modal.classList.add('hidden'); modal.classList.remove('closing'); overlay.classList.add('hidden'); }, 220);
}

function addTipoItemSlot(data = {}) {
    tipoSlotCount++;
    const id = tipoSlotCount;
    tipoItemSlots.push({ id, name: data.name || '', min: data.min || 1, max: data.max || 1, probability: data.probability || 0 });

    const wrap = document.getElementById('tipoItemSlotsList');
    const div  = document.createElement('div');
    div.className = 'item-slot';
    div.dataset.slotId = id;
    div.innerHTML = `
        <div class="slot-header">
            <span class="slot-label">SLOT ${tipoItemSlots.length}</span>
            <button class="btn-icon-only btn-danger-icon btn-remove-tipo-slot" data-slot-id="${id}"><i class="fa-solid fa-xmark"></i></button>
        </div>
        <div class="slot-item-row">
            <div class="slot-item-preview">
                <img class="slot-preview-img" src="${data.name ? imgUrl(data.name) : ''}" style="${data.name ? '' : 'display:none'}" />
            </div>
            <div class="slot-item-search" style="flex:1;position:relative;">
                <input class="form-input slot-name-input" type="text" placeholder="Buscar item..." value="${data.name || ''}" autocomplete="off" data-slot-id="${id}" />
                <div class="suggestions-dropdown hidden"></div>
            </div>
        </div>
        <div class="slot-fields">
            <div></div>
            <div class="slot-field-wrap">
                <div class="slot-field-label">MIN</div>
                <input class="slot-input slot-min" type="number" min="1" value="${data.min || 1}" data-slot-id="${id}" />
            </div>
            <div class="slot-field-wrap">
                <div class="slot-field-label">MAX</div>
                <input class="slot-input slot-max" type="number" min="1" value="${data.max || 1}" data-slot-id="${id}" />
            </div>
            <div class="slot-field-wrap">
                <div class="slot-field-label">%</div>
                <input class="slot-input slot-prob" type="number" min="0" max="100" value="${data.probability || 0}" data-slot-id="${id}" />
            </div>
        </div>`;
    wrap.appendChild(div);

    const nameInput  = div.querySelector('.slot-name-input');
    const searchWrap = div.querySelector('.slot-item-search');
    buildSuggestionsDropdown(searchWrap, nameInput, (item) => {
        const slot = tipoItemSlots.find(s => s.id === id);
        if (slot) slot.name = item.name;
        const img = div.querySelector('.slot-preview-img');
        img.src = imgUrl(item.name); img.style.display = '';
    });
    nameInput.addEventListener('input', () => {
        const slot = tipoItemSlots.find(s => s.id === id);
        if (slot) slot.name = nameInput.value.trim();
    });
    div.querySelector('.slot-min').addEventListener('input', e => {
        const slot = tipoItemSlots.find(s => s.id === id);
        if (slot) slot.min = parseInt(e.target.value) || 1;
    });
    div.querySelector('.slot-max').addEventListener('input', e => {
        const slot = tipoItemSlots.find(s => s.id === id);
        if (slot) slot.max = parseInt(e.target.value) || 1;
    });
    div.querySelector('.slot-prob').addEventListener('input', e => {
        const slot = tipoItemSlots.find(s => s.id === id);
        if (slot) slot.probability = parseInt(e.target.value) || 0;
        updateTipoProbTotal();
    });
    div.querySelector('.btn-remove-tipo-slot').addEventListener('click', () => {
        tipoItemSlots = tipoItemSlots.filter(s => s.id !== id);
        div.remove();
        updateTipoProbTotal();
        renumberTipoSlots();
    });
    updateTipoProbTotal();
}

function renumberTipoSlots() {
    document.querySelectorAll('#tipoItemSlotsList .item-slot').forEach((el, i) => {
        const lbl = el.querySelector('.slot-label');
        if (lbl) lbl.textContent = `SLOT ${i + 1}`;
    });
}

function updateTipoProbTotal() {
    const total = tipoItemSlots.reduce((acc, s) => acc + (s.probability || 0), 0);
    const el    = document.getElementById('tipoProbTotal');
    el.textContent = `Total: ${total}%`;
    el.className   = 'prob-total' + (total > 100 ? ' over' : total === 100 ? ' full' : '');
}

document.getElementById('btnAddTipoItemSlot').addEventListener('click', () => addTipoItemSlot());

document.getElementById('btnSaveTipoModal').addEventListener('click', () => {
    const idVal = document.getElementById('tipoEditingId').value;
    const data  = {
        name  : document.getElementById('tipoName').value.trim(),
        label : document.getElementById('tipoLabel').value.trim(),
        items : tipoItemSlots.filter(s => s.name).map(s => ({
            name: s.name, min: s.min || 1, max: s.max || 1, probability: s.probability || 0,
        })),
    };
    if (!data.name || !data.label) return;
    if (idVal) {
        data.id = parseInt(idVal);
        post('updateLootType', data);
    } else {
        post('createLootType', data);
    }
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
        opt.value       = t.id;
        opt.textContent = `${t.label} (${t.name})`;
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

    const overlay = document.getElementById('modeloModalOverlay');
    const modal   = document.getElementById('modeloModal');
    overlay.classList.remove('hidden');
    modal.classList.remove('hidden', 'closing');
    void modal.offsetHeight;
    overlay.classList.add('visible');
    modal.classList.add('visible');
}

function closeModeloModal() {
    const overlay = document.getElementById('modeloModalOverlay');
    const modal   = document.getElementById('modeloModal');
    modal.classList.remove('visible'); modal.classList.add('closing');
    overlay.classList.remove('visible');
    setTimeout(() => { modal.classList.add('hidden'); modal.classList.remove('closing'); overlay.classList.add('hidden'); }, 220);
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
    if (idVal) {
        data.id = parseInt(idVal);
        post('updateModel', data);
    } else {
        post('createModel', data);
    }
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
    lootIsBox = false;

    const icon  = document.getElementById('lootHeaderIcon');
    const title = document.getElementById('lootPanelTitle');
    icon.className  = source === 'box' ? 'fa-solid fa-toolbox header-icon' : 'fa-solid fa-box-open header-icon';
    title.textContent = source === 'box' ? 'OBJETOS ENCONTRADOS' : 'BOTÍN ENCONTRADO';

    lootGrid.innerHTML = '';
    lootEmpty.classList.add('hidden');
    lootGrid.style.display = 'flex';
    updateLootCount();

    lootOverlay.classList.remove('hidden');
    lootPanel.classList.remove('hidden', 'closing');
    void lootOverlay.offsetHeight;
    void lootPanel.offsetHeight;
    lootOverlay.classList.add('visible');
    lootPanel.classList.add('visible');

    buildCardsSequential(lootGrid, lootItems, false);
}

function closeLootUI(notify = true) {
    lootPanel.classList.remove('visible');
    lootPanel.classList.add('closing');
    lootOverlay.classList.remove('visible');
    setTimeout(() => {
        lootPanel.classList.add('hidden');
        lootPanel.classList.remove('closing');
        lootOverlay.classList.add('hidden');
        lootGrid.innerHTML = '';
        lootItems = [];
    }, 260);
    if (notify) post('closeLoot');
}

function updateLootCount() {
    const n = lootItems.length;
    lootItemCount.textContent = n === 1 ? '1 item encontrado' : `${n} items encontrados`;
    btnCollectAll.disabled = n === 0;
    if (n === 0) showLootEmpty();
}

function showLootEmpty() {
    lootGrid.style.display = 'none';
    lootEmpty.classList.remove('hidden');
    btnCollectAll.disabled = true;
}

function buildCardsSequential(grid, items, isPlayerBox) {
    grid.innerHTML = '';
    const cards = items.map(item => {
        const card = createCard(item, isPlayerBox);
        grid.appendChild(card);
        return { card, item };
    });
    revealNext(cards, 0, isPlayerBox);
}

function revealNext(cards, index, isPlayerBox) {
    if (index >= cards.length) {
        if (isPlayerBox) {
            // Todos cargados: habilitar recoger todo
            document.getElementById('btnCollectAllBox').disabled = false;
            const n = cards.length;
            document.getElementById('boxItemCount').textContent =
                n === 1 ? '1 item encontrado' : `${n} items encontrados`;
        }
        return;
    }
    const { card, item } = cards[index];
    card.classList.add('appeared');
    setTimeout(() => {
        revealCardImage(card, item, () => {
            setTimeout(() => revealNext(cards, index + 1, isPlayerBox), 70);
        });
    }, SPINNER_DURATION);
}

function createCard(item, isPlayerBox) {
    const card = document.createElement('div');
    card.className   = 'item-card';
    card.dataset.name  = item.name;
    card.dataset.count = item.count;

    const badge = document.createElement('div');
    badge.className   = 'collect-badge';
    badge.textContent = 'RECOGER';
    card.appendChild(badge);

    const spinner = document.createElement('div');
    spinner.className = 'item-spinner';
    const ring = document.createElement('div');
    ring.className = 'spinner-ring';
    spinner.appendChild(ring);
    card.appendChild(spinner);

    const img = document.createElement('img');
    img.className = 'item-img';
    img.alt = item.name;
    card.appendChild(img);

    const nameEl = document.createElement('div');
    nameEl.className   = 'item-name';
    nameEl.textContent = item.label || formatName(item.name);
    nameEl.title       = nameEl.textContent;
    card.appendChild(nameEl);

    const countEl = document.createElement('div');
    countEl.className = 'item-count';
    countEl.innerHTML = `x<span>${item.count}</span>`;
    card.appendChild(countEl);

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

    function reveal() {
        spinner.classList.add('hidden');
        card.classList.add('revealed');
        if (onDone) onDone();
    }

    img.onload  = () => { img.classList.add('loaded'); reveal(); };
    img.onerror = () => {
        if (!img.dataset.usedDefault) {
            img.dataset.usedDefault = '1';
            img.src = `${imagePath}default.png`;
        } else reveal();
    };
    img.src = imgUrl(item.name);
}

btnCloseLoot.addEventListener('click', () => closeLootUI(true));
btnCollectAll.addEventListener('click', () => {
    if (!lootItems.length) return;
    btnCollectAll.disabled = true;
    [...lootGrid.querySelectorAll('.item-card:not(.collected)')].forEach((c, i) => {
        setTimeout(() => c.classList.add('collected'), i * 50);
    });
    post('collectAllLoot', { items: lootItems });
    lootItems = [];
});

lootGrid.addEventListener('wheel', e => { e.preventDefault(); lootGrid.scrollLeft += e.deltaY; }, { passive: false });

// ============================================================
//  BOX UI (caja de jugador abatido)
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
    boxGrid.innerHTML = '';
    boxGrid.classList.add('loading-grid');
    boxGrid.innerHTML = `<div class="loading-indicator"><div class="spinner-ring"></div><span>Revisando contenido...</span></div>`;
    boxEmpty.classList.add('hidden');
    btnCollectAllBox.disabled = true;
    boxItemCount.textContent  = 'Cargando...';
    boxGrid.style.display     = 'flex';

    boxOverlay.classList.remove('hidden');
    boxPanel.classList.remove('hidden', 'closing');
    void boxOverlay.offsetHeight;
    void boxPanel.offsetHeight;
    boxOverlay.classList.add('visible');
    boxPanel.classList.add('visible');

    // Pequena pausa antes de revelar items (simula carga)
    setTimeout(() => {
        boxGrid.classList.remove('loading-grid');
        boxGrid.innerHTML = '';
        buildCardsSequential(boxGrid, boxItems, true);
        boxGrid.addEventListener('wheel', e => { e.preventDefault(); boxGrid.scrollLeft += e.deltaY; }, { passive: false, once: true });
    }, 600);
}

function closeBoxUI(notify = true) {
    boxPanel.classList.remove('visible');
    boxPanel.classList.add('closing');
    boxOverlay.classList.remove('visible');
    setTimeout(() => {
        boxPanel.classList.add('hidden');
        boxPanel.classList.remove('closing');
        boxOverlay.classList.add('hidden');
        boxGrid.innerHTML = '';
        boxItems = [];
    }, 260);
    if (notify) post('closeBoxUI');
}

btnCloseBoxUI.addEventListener('click', () => closeBoxUI(true));
btnCollectAllBox.addEventListener('click', () => {
    if (!boxItems.length) return;
    btnCollectAllBox.disabled = true;
    [...boxGrid.querySelectorAll('.item-card:not(.collected)')].forEach((c, i) => {
        setTimeout(() => c.classList.add('collected'), i * 50);
    });
    post('collectAllBox');
    boxItems = [];
    setTimeout(() => closeBoxUI(false), 350);
});

// ============================================================
//  GIZMO HINT
// ============================================================
function setGizmoHint(visible) {
    const el = document.getElementById('gizmoHint');
    if (visible) {
        el.classList.remove('hidden');
        void el.offsetHeight;
        el.classList.add('visible');
    } else {
        el.classList.remove('visible');
        setTimeout(() => el.classList.add('hidden'), 250);
    }
}

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

        case 'closeCreator':
            closeCreator();
            break;

        case 'returnToCreator':
            imagePath = imagePath || '';
            openCreator(currentProps, currentBoxes, currentLootTypes, currentModels);
            if (data.tab === 'box') document.querySelector('[data-tab="box"]').click();
            break;

        case 'propsUpdated':
            currentProps = data.props || [];
            renderPropsTable();
            break;

        case 'boxesUpdated':
            currentBoxes = data.boxes || [];
            renderBoxesTable();
            if (window._pendingGizmoCoords) {
                savedCoords = window._pendingGizmoCoords;
                const c = savedCoords;
                document.getElementById('coordsText').textContent =
                    `vec4(${c.x.toFixed(2)}, ${c.y.toFixed(2)}, ${c.z.toFixed(2)}, ${c.w.toFixed(2)})`;
                window._pendingGizmoCoords = null;
            }
            break;

        case 'lootTypesUpdated':
            currentLootTypes = data.lootTypes || [];
            renderTiposTable();
            break;

        case 'modelsUpdated':
            currentModels = data.models || [];
            renderModelosTable();
            break;

        case 'syncProps':
            currentProps = data.props || [];
            break;

        case 'syncBoxes':
            currentBoxes = data.boxes || [];
            break;

        case 'syncLootTypes':
            currentLootTypes = data.lootTypes || [];
            break;

        case 'syncModels':
            currentModels = data.models || [];
            break;

        case 'openLoot':
            imagePath = data.imagePath || imagePath;
            openLootUI(data.items || [], data.source || 'prop');
            break;

        case 'openBoxUI':
            imagePath = data.imagePath || imagePath;
            openBoxUI(data.items || [], data.ownerName || 'Jugador');
            break;

        case 'closeLoot':
            closeLootUI(false);
            closeBoxUI(false);
            break;

        case 'showGizmoHint':
            setGizmoHint(data.visible);
            break;
    }
});

// ============================================================
//  CERRAR CON OVERLAY CLICK
// ============================================================
document.getElementById('creatorOverlay').addEventListener('click', closeCreator);
document.getElementById('btnCloseCreator').addEventListener('click', closeCreator);
document.getElementById('lootOverlay').addEventListener('click', () => closeLootUI(true));
document.getElementById('boxOverlay').addEventListener('click', () => closeBoxUI(true));

// ESC desde NUI es manejado por el cliente Lua; aquí lo dejamos por si acaso
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        if (!lootPanel.classList.contains('hidden')) closeLootUI(true);
        else if (!boxPanel.classList.contains('hidden'))  closeBoxUI(true);
    }
});
