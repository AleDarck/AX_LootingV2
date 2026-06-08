-- ============================================================
--  AX_LootingV2 - server.lua
--  Framework: New ESX 1.13.4 | oxmysql | lua54
-- ============================================================

local ESX = exports['es_extended']:getSharedObject()

-- ============================================================
--  ESTADO EN MEMORIA
-- ============================================================

-- propCooldowns[propKey] = os.time() del ultimo saqueo
-- propKey = "propId_instanceHash"  (propId de DB + coords hash para distinguir instancias)
local propCooldowns = {}

-- boxStates[boxId] = { inUseBy, items, isEmpty, ownerId, spawnedAt, lastTouched }
local boxStates    = {}
local boxCounter   = 0

-- ownerActiveBox[playerId] = boxId activo de ese jugador
local ownerActiveBox = {}

-- ============================================================
--  DB: Crear tablas si no existen
-- ============================================================

MySQL.ready(function()
    MySQL.query([[
        CREATE TABLE IF NOT EXISTS `ax_lootingv2_props` (
            `id`            INT AUTO_INCREMENT PRIMARY KEY,
            `name`          VARCHAR(100) NOT NULL,
            `model`         VARCHAR(100) NOT NULL,
            `cooldown`      INT NOT NULL DEFAULT 600,
            `items`         LONGTEXT NOT NULL DEFAULT '[]',
            `created_at`    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    ]])

    MySQL.query([[
        CREATE TABLE IF NOT EXISTS `ax_lootingv2_boxes` (
            `id`            INT AUTO_INCREMENT PRIMARY KEY,
            `name`          VARCHAR(100) NOT NULL,
            `model`         VARCHAR(100) NOT NULL,
            `coords`        VARCHAR(200) NOT NULL,
            `required_item` VARCHAR(100) DEFAULT NULL,
            `items`         LONGTEXT NOT NULL DEFAULT '[]',
            `created_at`    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    ]])

    MySQL.query([[
        CREATE TABLE IF NOT EXISTS `ax_lootingv2_loottypes` (
            `id`            INT AUTO_INCREMENT PRIMARY KEY,
            `name`          VARCHAR(100) NOT NULL UNIQUE,
            `label`         VARCHAR(100) NOT NULL,
            `items`         LONGTEXT NOT NULL DEFAULT '[]',
            `created_at`    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    ]])

    MySQL.query([[
        CREATE TABLE IF NOT EXISTS `ax_lootingv2_models` (
            `id`            INT AUTO_INCREMENT PRIMARY KEY,
            `model`         VARCHAR(100) NOT NULL UNIQUE,
            `loottype_id`   INT NOT NULL,
            `is_animal`     TINYINT(1) NOT NULL DEFAULT 0,
            `require_knife` TINYINT(1) NOT NULL DEFAULT 0,
            `created_at`    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (`loottype_id`) REFERENCES `ax_lootingv2_loottypes`(`id`) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    ]])
end)

-- ============================================================
--  CACHE DE CONFIGURACION (recargado al iniciar y tras cambios)
-- ============================================================

local cachedProps      = {}  -- { id, name, model, cooldown, items[] }
local cachedBoxes      = {}  -- { id, name, model, coords{x,y,z,w}, required_item, items[] }
local cachedLootTypes  = {}  -- { id, name, label, items[] }
local cachedModels     = {}  -- { id, model, loottype_id, is_animal, require_knife }

-- lookup rapido: model_string => modelCfg
local modelLookup = {}

local function reloadProps(cb)
    MySQL.query('SELECT * FROM ax_lootingv2_props', {}, function(rows)
        cachedProps = {}
        for _, row in ipairs(rows or {}) do
            table.insert(cachedProps, {
                id       = row.id,
                name     = row.name,
                model    = row.model,
                cooldown = row.cooldown,
                items    = json.decode(row.items) or {},
            })
        end
        if cb then cb() end
    end)
end

local function reloadBoxes(cb)
    MySQL.query('SELECT * FROM ax_lootingv2_boxes', {}, function(rows)
        cachedBoxes = {}
        for _, row in ipairs(rows or {}) do
            table.insert(cachedBoxes, {
                id            = row.id,
                name          = row.name,
                model         = row.model,
                coords        = json.decode(row.coords) or {},
                required_item = row.required_item,
                items         = json.decode(row.items) or {},
            })
        end
        if cb then cb() end
    end)
end

local function reloadLootTypes(cb)
    MySQL.query('SELECT * FROM ax_lootingv2_loottypes ORDER BY name', {}, function(rows)
        cachedLootTypes = {}
        for _, row in ipairs(rows or {}) do
            table.insert(cachedLootTypes, {
                id    = row.id,
                name  = row.name,
                label = row.label,
                items = json.decode(row.items) or {},
            })
        end
        if cb then cb() end
    end)
end

local function reloadModels(cb)
    MySQL.query('SELECT * FROM ax_lootingv2_models ORDER BY model', {}, function(rows)
        cachedModels = {}
        modelLookup  = {}
        for _, row in ipairs(rows or {}) do
            local entry = {
                id            = row.id,
                model         = row.model,
                loottype_id   = row.loottype_id,
                is_animal     = row.is_animal == 1,
                require_knife = row.require_knife == 1,
            }
            table.insert(cachedModels, entry)
            modelLookup[row.model] = entry
        end
        if cb then cb() end
    end)
end

MySQL.ready(function()
    reloadProps()
    reloadBoxes()
    reloadLootTypes()
    reloadModels()
end)

-- ============================================================
--  HELPERS
-- ============================================================

local function isStaff(src)
    local xPlayer = ESX.GetPlayerFromId(src)
    if not xPlayer then return false end
    local group = xPlayer.getGroup()
    for _, g in ipairs(Config.StaffGroups) do
        if g == group then return true end
    end
    return false
end

local function generateLoot(items)
    -- items = [ { name, min, max, probability } ]
    local result = {}
    if not items or #items == 0 then return result end

    local roll       = math.random(1, 100)
    local cumulative = 0
    local chosen     = nil

    for _, slot in ipairs(items) do
        cumulative = cumulative + (slot.probability or 0)
        if roll <= cumulative and not chosen then
            chosen = slot
        end
    end

    if chosen then
        local count = math.random(
            math.max(1, chosen.min or 1),
            math.max(1, chosen.max or 1)
        )
        table.insert(result, { name = chosen.name, count = count })
    end

    -- Ademas hacer N pasadas adicionales para items fijos (loop)
    -- Cada slot con prob tiene una chance independiente en cada pasada
    -- Sistema: una pasada por cada slot, cada uno con su prob individual
    result = {}
    for _, slot in ipairs(items) do
        local r = math.random(1, 100)
        if r <= (slot.probability or 0) then
            local count = math.random(
                math.max(1, slot.min or 1),
                math.max(1, slot.max or 1)
            )
            local merged = false
            for _, existing in ipairs(result) do
                if existing.name == slot.name then
                    existing.count = existing.count + count
                    merged = true
                    break
                end
            end
            if not merged then
                table.insert(result, { name = slot.name, count = count })
            end
        end
    end

    return result
end

local function enrichWithLabels(items)
    local enriched = {}
    for _, item in ipairs(items) do
        local label  = item.name
        local oxItem = exports['ox_inventory']:Items(item.name)
        if oxItem and oxItem.label then label = oxItem.label end
        table.insert(enriched, {
            name     = item.name,
            count    = item.count,
            label    = label,
            metadata = item.metadata or {},
        })
    end
    return enriched
end

local function sendDiscordLog(title, color, fields)
    if not Config.DiscordWebhook or Config.DiscordWebhook == 'TU_WEBHOOK_AQUI' then return end
    PerformHttpRequest(Config.DiscordWebhook, function() end, 'POST',
        json.encode({
            username = 'AX LootingV2',
            embeds = {{
                title  = title,
                color  = color,
                fields = fields,
                footer = { text = 'AX_LootingV2 • ' .. os.date('%d/%m/%Y %H:%M:%S') },
            }},
        }),
        { ['Content-Type'] = 'application/json' }
    )
end

local function isProtectedItem(name)
    for _, v in ipairs(Config.PlayerBox.protectedItems) do
        if v == name then return true end
    end
    return false
end

-- ============================================================
--  COMANDO /lootcreator
-- ============================================================

RegisterCommand('lootcreator', function(src)
    if not isStaff(src) then
        TriggerClientEvent('esx:showNotification', src, 'No tienes permisos para usar este comando.')
        return
    end
    TriggerClientEvent('AX_LootingV2:client:openCreator', src, cachedProps, cachedBoxes, cachedLootTypes, cachedModels)
end, false)

-- ============================================================
--  CREATOR: PROPS
-- ============================================================

RegisterNetEvent('AX_LootingV2:server:createProp', function(data)
    local src = source
    if not isStaff(src) then return end

    local name     = tostring(data.name     or ''):sub(1, 100)
    local model    = tostring(data.model    or ''):sub(1, 100)
    local cooldown = math.floor(tonumber(data.cooldown) or 600)
    local items    = data.items or {}

    if name == '' or model == '' then return end

    MySQL.insert(
        'INSERT INTO ax_lootingv2_props (name, model, cooldown, items) VALUES (?, ?, ?, ?)',
        { name, model, cooldown, json.encode(items) },
        function(insertId)
            reloadProps(function()
                TriggerClientEvent('AX_LootingV2:client:propsUpdated', src, cachedProps)
                -- Notificar a todos los clientes para actualizar su cache local
                TriggerClientEvent('AX_LootingV2:client:syncProps', -1, cachedProps)
            end)
        end
    )
end)

RegisterNetEvent('AX_LootingV2:server:updateProp', function(id, data)
    local src = source
    if not isStaff(src) then return end

    local name     = tostring(data.name     or ''):sub(1, 100)
    local model    = tostring(data.model    or ''):sub(1, 100)
    local cooldown = math.floor(tonumber(data.cooldown) or 600)
    local items    = data.items or {}

    MySQL.update(
        'UPDATE ax_lootingv2_props SET name=?, model=?, cooldown=?, items=? WHERE id=?',
        { name, model, cooldown, json.encode(items), id },
        function()
            reloadProps(function()
                TriggerClientEvent('AX_LootingV2:client:propsUpdated', src, cachedProps)
                TriggerClientEvent('AX_LootingV2:client:syncProps', -1, cachedProps)
            end)
        end
    )
end)

RegisterNetEvent('AX_LootingV2:server:deleteProp', function(id)
    local src = source
    if not isStaff(src) then return end

    MySQL.query('DELETE FROM ax_lootingv2_props WHERE id=?', { id }, function()
        reloadProps(function()
            TriggerClientEvent('AX_LootingV2:client:propsUpdated', src, cachedProps)
            TriggerClientEvent('AX_LootingV2:client:syncProps', -1, cachedProps)
        end)
    end)
end)

-- ============================================================
--  CREATOR: BOXES
-- ============================================================

RegisterNetEvent('AX_LootingV2:server:createBox', function(data)
    local src = source
    if not isStaff(src) then return end

    local name          = tostring(data.name          or ''):sub(1, 100)
    local model         = tostring(data.model         or ''):sub(1, 100)
    local coords        = data.coords        or { x=0, y=0, z=0, w=0 }
    local required_item = data.required_item ~= '' and tostring(data.required_item):sub(1, 100) or nil
    local items         = data.items         or {}

    if name == '' or model == '' then return end

    MySQL.insert(
        'INSERT INTO ax_lootingv2_boxes (name, model, coords, required_item, items) VALUES (?, ?, ?, ?, ?)',
        { name, model, json.encode(coords), required_item, json.encode(items) },
        function(insertId)
            reloadBoxes(function()
                TriggerClientEvent('AX_LootingV2:client:boxesUpdated', src, cachedBoxes)
                TriggerClientEvent('AX_LootingV2:client:syncBoxes', -1, cachedBoxes)
            end)
        end
    )
end)

RegisterNetEvent('AX_LootingV2:server:updateBox', function(id, data)
    local src = source
    if not isStaff(src) then return end

    local name          = tostring(data.name          or ''):sub(1, 100)
    local model         = tostring(data.model         or ''):sub(1, 100)
    local coords        = data.coords        or { x=0, y=0, z=0, w=0 }
    local required_item = data.required_item ~= '' and tostring(data.required_item):sub(1, 100) or nil
    local items         = data.items         or {}

    MySQL.update(
        'UPDATE ax_lootingv2_boxes SET name=?, model=?, coords=?, required_item=?, items=? WHERE id=?',
        { name, model, json.encode(coords), required_item, json.encode(items), id },
        function()
            reloadBoxes(function()
                TriggerClientEvent('AX_LootingV2:client:boxesUpdated', src, cachedBoxes)
                TriggerClientEvent('AX_LootingV2:client:syncBoxes', -1, cachedBoxes)
            end)
        end
    )
end)

RegisterNetEvent('AX_LootingV2:server:deleteBox', function(id)
    local src = source
    if not isStaff(src) then return end

    MySQL.query('DELETE FROM ax_lootingv2_boxes WHERE id=?', { id }, function()
        reloadBoxes(function()
            TriggerClientEvent('AX_LootingV2:client:boxesUpdated', src, cachedBoxes)
            TriggerClientEvent('AX_LootingV2:client:syncBoxes', -1, cachedBoxes)
        end)
    end)
end)

-- El cliente solicita la config actual (al iniciar)
RegisterNetEvent('AX_LootingV2:server:requestConfig', function()
    local src = source
    TriggerClientEvent('AX_LootingV2:client:syncProps',      src, cachedProps)
    TriggerClientEvent('AX_LootingV2:client:syncBoxes',      src, cachedBoxes)
    TriggerClientEvent('AX_LootingV2:client:syncLootTypes',  src, cachedLootTypes)
    TriggerClientEvent('AX_LootingV2:client:syncModels',     src, cachedModels)
end)

-- ============================================================
--  LOOTING DE PROPS (instancias del mundo)
-- ============================================================

-- propKey identifica una instancia especifica: "propId_x.1_y.1_z.1"
local function makePropKey(propId, x, y, z)
    return string.format('%d_%.1f_%.1f_%.1f', propId, x, y, z)
end

RegisterNetEvent('AX_LootingV2:server:requestPropLoot', function(propId, x, y, z)
    local src    = source
    local player = ESX.GetPlayerFromId(src)
    if not player then return end

    -- Buscar config del prop
    local propCfg = nil
    for _, p in ipairs(cachedProps) do
        if p.id == propId then propCfg = p break end
    end
    if not propCfg then return end

    local propKey  = makePropKey(propId, x, y, z)
    local now      = os.time()
    local lastTime = propCooldowns[propKey]
    local cooldown = propCfg.cooldown or Config.PropCooldown

    if lastTime and (now - lastTime) < cooldown then
        local remaining = cooldown - (now - lastTime)
        TriggerClientEvent('AX_LootingV2:client:propOnCooldown', src, remaining)
        return
    end

    local loot = generateLoot(propCfg.items)
    if #loot == 0 then
        TriggerClientEvent('esx:showNotification', src, 'No encontraste nada.')
        return
    end

    propCooldowns[propKey] = now
    TriggerClientEvent('AX_LootingV2:client:openLootUI', src, enrichWithLabels(loot), 'prop')
end)

-- ============================================================
--  LOOTING DE BOXES (coords fijas del creator)
-- ============================================================

-- boxLootStates[boxId] = { inUseBy, lastLooted }
local boxLootStates = {}

RegisterNetEvent('AX_LootingV2:server:requestBoxLoot', function(boxId, x, y, z)
    local src    = source
    local player = ESX.GetPlayerFromId(src)
    if not player then return end

    local boxCfg = nil
    for _, b in ipairs(cachedBoxes) do
        if b.id == boxId then boxCfg = b break end
    end
    if not boxCfg then return end

    -- Cooldown por instancia (mismo boxId = misma coords siempre)
    local now      = os.time()
    local state    = boxLootStates[boxId]
    if state and state.lastLooted then
        local elapsed  = now - state.lastLooted
        local cooldown = Config.PropCooldown
        if elapsed < cooldown then
            TriggerClientEvent('AX_LootingV2:client:propOnCooldown', src, cooldown - elapsed)
            return
        end
    end

    -- Verificar item requerido
    if boxCfg.required_item and boxCfg.required_item ~= '' then
        local hasItem = exports['ox_inventory']:GetItemCount(src, boxCfg.required_item)
        if not hasItem or hasItem < 1 then
            local oxItem = exports['ox_inventory']:Items(boxCfg.required_item)
            local label  = (oxItem and oxItem.label) or boxCfg.required_item
            TriggerClientEvent('esx:showNotification', src, 'Necesitas: ' .. label)
            return
        end
        exports['ox_inventory']:RemoveItem(src, boxCfg.required_item, 1)
    end

    local loot = generateLoot(boxCfg.items)
    if #loot == 0 then
        TriggerClientEvent('esx:showNotification', src, 'No encontraste nada.')
        return
    end

    boxLootStates[boxId] = { lastLooted = now }
    TriggerClientEvent('AX_LootingV2:client:openLootUI', src, enrichWithLabels(loot), 'box')
end)

-- El cliente recoge un item del loot abierto
RegisterNetEvent('AX_LootingV2:server:collectLootItem', function(itemName, itemCount)
    local src    = source
    local player = ESX.GetPlayerFromId(src)
    if not player then return end

    itemName  = tostring(itemName):lower():gsub('[^%a%d_%-]', '')
    itemCount = math.floor(tonumber(itemCount) or 1)
    if itemCount <= 0 or itemName == '' then return end

    if itemName == 'money' then
        player.addMoney(itemCount)
    else
        player.addInventoryItem(itemName, itemCount)
    end
end)

RegisterNetEvent('AX_LootingV2:server:collectAllLoot', function(items)
    local src    = source
    local player = ESX.GetPlayerFromId(src)
    if not player then return end

    if type(items) ~= 'table' or #items > 50 then return end

    for _, item in ipairs(items) do
        if type(item) == 'table' and item.name and item.count then
            local name  = tostring(item.name):lower():gsub('[^%a%d_%-]', '')
            local count = math.floor(tonumber(item.count) or 1)
            if count > 0 and name ~= '' then
                if name == 'money' then
                    player.addMoney(count)
                else
                    player.addInventoryItem(name, count)
                end
            end
        end
    end
end)

-- ============================================================
--  CREATOR: LOOT TYPES
-- ============================================================

local function broadcastLootTypes(src)
    TriggerClientEvent('AX_LootingV2:client:lootTypesUpdated', src, cachedLootTypes)
    TriggerClientEvent('AX_LootingV2:client:syncLootTypes', -1, cachedLootTypes)
end

RegisterNetEvent('AX_LootingV2:server:createLootType', function(data)
    local src = source
    if not isStaff(src) then return end

    local name  = tostring(data.name  or ''):lower():gsub('[^%a%d_]', ''):sub(1, 100)
    local label = tostring(data.label or ''):sub(1, 100)
    local items = data.items or {}

    if name == '' or label == '' then return end

    MySQL.insert(
        'INSERT INTO ax_lootingv2_loottypes (name, label, items) VALUES (?, ?, ?)',
        { name, label, json.encode(items) },
        function()
            reloadLootTypes(function() broadcastLootTypes(src) end)
        end
    )
end)

RegisterNetEvent('AX_LootingV2:server:updateLootType', function(id, data)
    local src = source
    if not isStaff(src) then return end

    local name  = tostring(data.name  or ''):lower():gsub('[^%a%d_]', ''):sub(1, 100)
    local label = tostring(data.label or ''):sub(1, 100)
    local items = data.items or {}

    MySQL.update(
        'UPDATE ax_lootingv2_loottypes SET name=?, label=?, items=? WHERE id=?',
        { name, label, json.encode(items), id },
        function() reloadLootTypes(function() broadcastLootTypes(src) end) end
    )
end)

RegisterNetEvent('AX_LootingV2:server:deleteLootType', function(id)
    local src = source
    if not isStaff(src) then return end

    -- Borrar modelos asociados primero (cascade lo hace, pero tambien recargamos)
    MySQL.query('DELETE FROM ax_lootingv2_loottypes WHERE id=?', { id }, function()
        reloadLootTypes(function()
            reloadModels(function()
                broadcastLootTypes(src)
                TriggerClientEvent('AX_LootingV2:client:modelsUpdated', src, cachedModels)
                TriggerClientEvent('AX_LootingV2:client:syncModels', -1, cachedModels)
            end)
        end)
    end)
end)

-- ============================================================
--  CREATOR: MODELS
-- ============================================================

local function broadcastModels(src)
    TriggerClientEvent('AX_LootingV2:client:modelsUpdated', src, cachedModels)
    TriggerClientEvent('AX_LootingV2:client:syncModels', -1, cachedModels)
end

RegisterNetEvent('AX_LootingV2:server:createModel', function(data)
    local src = source
    if not isStaff(src) then return end

    local model         = tostring(data.model       or ''):lower():gsub('[^%a%d_]', ''):sub(1, 100)
    local loottype_id   = math.floor(tonumber(data.loottype_id)   or 0)
    local is_animal     = data.is_animal     and 1 or 0
    local require_knife = data.require_knife and 1 or 0

    if model == '' or loottype_id == 0 then return end

    MySQL.insert(
        'INSERT INTO ax_lootingv2_models (model, loottype_id, is_animal, require_knife) VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE loottype_id=VALUES(loottype_id), is_animal=VALUES(is_animal), require_knife=VALUES(require_knife)',
        { model, loottype_id, is_animal, require_knife },
        function() reloadModels(function() broadcastModels(src) end) end
    )
end)

RegisterNetEvent('AX_LootingV2:server:updateModel', function(id, data)
    local src = source
    if not isStaff(src) then return end

    local model         = tostring(data.model       or ''):lower():gsub('[^%a%d_]', ''):sub(1, 100)
    local loottype_id   = math.floor(tonumber(data.loottype_id)   or 0)
    local is_animal     = data.is_animal     and 1 or 0
    local require_knife = data.require_knife and 1 or 0

    MySQL.update(
        'UPDATE ax_lootingv2_models SET model=?, loottype_id=?, is_animal=?, require_knife=? WHERE id=?',
        { model, loottype_id, is_animal, require_knife, id },
        function() reloadModels(function() broadcastModels(src) end) end
    )
end)

RegisterNetEvent('AX_LootingV2:server:deleteModel', function(id)
    local src = source
    if not isStaff(src) then return end

    MySQL.query('DELETE FROM ax_lootingv2_models WHERE id=?', { id }, function()
        reloadModels(function() broadcastModels(src) end)
    end)
end)

-- ============================================================
--  LOOTING DE PEDS / ANIMALES
-- ============================================================

-- pedStates[netIdStr] = { inUseBy, lockedAt, items, isEmpty }
local pedStates = {}

RegisterNetEvent('AX_LootingV2:server:requestPedLoot', function(netId, modelName)
    local src    = source
    local player = ESX.GetPlayerFromId(src)
    if not player then return end

    local modelCfg = modelLookup[modelName]
    if not modelCfg then
        -- Fallback: buscar si es animal por heuristica del nombre (a_c_)
        TriggerClientEvent('esx:showNotification', src, 'Este cuerpo no tiene loot configurado.')
        return
    end

    -- Verificar knife si es animal con require_knife
    if modelCfg.is_animal and modelCfg.require_knife then
        local hasKnife = exports['ox_inventory']:GetItemCount(src, 'weapon_knife')
        if not hasKnife or hasKnife < 1 then
            TriggerClientEvent('esx:showNotification', src, 'Necesitas una Knife para deshuesar el animal.')
            return
        end
    end

    -- Buscar el tipo de loot
    local lootTypeCfg = nil
    for _, lt in ipairs(cachedLootTypes) do
        if lt.id == modelCfg.loottype_id then lootTypeCfg = lt break end
    end
    if not lootTypeCfg then
        TriggerClientEvent('esx:showNotification', src, 'Tipo de loot no encontrado.')
        return
    end

    local netIdStr = tostring(netId)
    local state    = pedStates[netIdStr]

    -- Cuerpo ya vaciado
    if state and state.isEmpty then
        TriggerClientEvent('esx:showNotification', src, 'Este cuerpo ya fue saqueado.')
        return
    end

    -- En uso por otro jugador (con auto-liberacion tras 30s)
    if state and state.inUseBy and state.inUseBy ~= src then
        local now = os.time()
        if state.lockedAt and (now - state.lockedAt) > 30 then
            state.inUseBy  = nil
            state.lockedAt = nil
        else
            TriggerClientEvent('esx:showNotification', src, 'Alguien más está revisando este cuerpo.')
            return
        end
    end

    -- Primer acceso: generar loot
    if not state then
        local loot = generateLoot(lootTypeCfg.items)
        if #loot == 0 then
            TriggerClientEvent('esx:showNotification', src, 'No encontraste nada.')
            return
        end
        pedStates[netIdStr] = {
            inUseBy  = src,
            lockedAt = os.time(),
            items    = loot,
            isEmpty  = false,
        }
        TriggerClientEvent('AX_LootingV2:client:openPedLootUI', src, enrichWithLabels(loot), netId)
        return
    end

    -- Reabrir con loot existente
    state.inUseBy  = src
    state.lockedAt = os.time()
    TriggerClientEvent('AX_LootingV2:client:openPedLootUI', src, enrichWithLabels(state.items), netId)
end)

RegisterNetEvent('AX_LootingV2:server:leavePed', function(netId)
    local src   = source
    local state = pedStates[tostring(netId)]
    if state and state.inUseBy == src then
        state.inUseBy  = nil
        state.lockedAt = nil
    end
end)

RegisterNetEvent('AX_LootingV2:server:collectPedItem', function(netId, itemName, itemCount)
    local src    = source
    local player = ESX.GetPlayerFromId(src)
    if not player then return end

    local netIdStr = tostring(netId)
    local state    = pedStates[netIdStr]
    if not state or state.isEmpty then return end

    itemName  = tostring(itemName):lower():gsub('[^%a%d_%-]', '')
    itemCount = math.floor(tonumber(itemCount) or 1)
    if itemCount <= 0 or itemName == '' then return end

    local found = false
    for i, item in ipairs(state.items) do
        if item.name == itemName and item.count == itemCount then
            table.remove(state.items, i)
            found = true
            break
        end
    end
    if not found then return end

    if itemName == 'money' then
        player.addMoney(itemCount)
        TriggerClientEvent('esx:showNotification', src, 'Recogiste $' .. itemCount)
    else
        player.addInventoryItem(itemName, itemCount)
        TriggerClientEvent('esx:showNotification', src, 'Recogiste ' .. itemCount .. 'x ' .. itemName)
    end

    if #state.items == 0 then
        state.isEmpty = true
        state.inUseBy = nil
        TriggerClientEvent('AX_LootingV2:client:deletePed', src, netId)
    end
end)

RegisterNetEvent('AX_LootingV2:server:collectAllPed', function(netId, items)
    local src    = source
    local player = ESX.GetPlayerFromId(src)
    if not player then return end

    local netIdStr = tostring(netId)
    local state    = pedStates[netIdStr]
    if not state or state.isEmpty then return end
    if type(items) ~= 'table' or #items > 30 then return end

    for _, item in ipairs(state.items) do
        if item.name == 'money' then
            player.addMoney(item.count)
        else
            player.addInventoryItem(item.name, item.count)
        end
    end

    state.items   = {}
    state.isEmpty = true
    state.inUseBy = nil

    TriggerClientEvent('esx:showNotification', src, 'Recogiste todos los items.')
    TriggerClientEvent('AX_LootingV2:client:deletePed', src, netId)
end)

-- ============================================================
--  LOOTINGBOX - Caja de jugador abatido
-- ============================================================

AddEventHandler('AX_LootingV2:internal:playerDied', function(src)
    local player = ESX.GetPlayerFromId(src)
    if not player then return end

    -- Si ya tiene una caja activa con items, no crear otra
    local existingId = ownerActiveBox[src]
    if existingId and boxStates[existingId] and not boxStates[existingId].isEmpty then
        return
    end

    local oxItems = exports['ox_inventory']:GetInventoryItems(src) or {}
    local items   = {}

    for _, item in ipairs(oxItems) do
        local count = item.count or 0
        if count > 0 and not isProtectedItem(item.name) and item.name ~= 'money' then
            table.insert(items, {
                name     = item.name,
                count    = count,
                metadata = item.metadata or {},
            })
        end
    end

    local money = player.getMoney()
    if money > 0 then
        table.insert(items, { name = 'money', count = money, metadata = {} })
    end

    if #items == 0 then return end

    -- Quitar items del jugador
    for _, item in ipairs(items) do
        if item.name == 'money' then
            player.removeMoney(item.count)
        else
            exports['ox_inventory']:RemoveItem(src, item.name, item.count, item.metadata)
        end
    end

    boxCounter = boxCounter + 1
    local boxId = 'pbox_' .. boxCounter
    local now   = os.time()

    boxStates[boxId] = {
        inUseBy     = nil,
        items       = items,
        isEmpty     = false,
        ownerId     = src,
        spawnedAt   = now,
        lastTouched = nil,
    }
    ownerActiveBox[src] = boxId

    -- Log Discord
    local itemsList = ''
    for _, item in ipairs(items) do
        itemsList = itemsList .. '• ' .. item.name .. ' x' .. item.count .. '\n'
    end
    sendDiscordLog('💀 Caja creada por muerte', 15548997, {
        { name = '👤 Jugador abatido', value = player.getName() .. ' (' .. player.identifier .. ')', inline = true  },
        { name = '🆔 ID Servidor',     value = tostring(src),                                          inline = true  },
        { name = '📦 ID Caja',         value = boxId,                                                  inline = true  },
        { name = '🗃 Contenido',       value = itemsList ~= '' and itemsList or 'Vacío',               inline = false },
    })

    -- Spawn de la caja en el cliente del dueño (quien spawnea notifica al servidor con netId)
    TriggerClientEvent('AX_LootingV2:client:spawnPlayerBox', src, boxId, player.getName(), src)

    -- Despawn si nadie la toca
    SetTimeout(Config.PlayerBox.despawnUntouched * 60 * 1000, function()
        local st = boxStates[boxId]
        if st and not st.isEmpty and not st.lastTouched then
            boxStates[boxId]        = nil
            ownerActiveBox[src]     = nil
            TriggerClientEvent('AX_LootingV2:client:removeBox', -1, boxId)
        end
    end)
end)

-- El cliente que spawneó la caja notifica el netId al servidor
RegisterNetEvent('AX_LootingV2:server:boxSpawned', function(boxId, ownerName, ownerId, netId)
    local src = source
    if boxStates[boxId] then
        boxStates[boxId].netId = netId
    end
    -- Registrar en todos los demas clientes
    for _, pid in ipairs(GetPlayers()) do
        local p = tonumber(pid)
        if p ~= src then
            TriggerClientEvent('AX_LootingV2:client:registerBoxByNetId', p, boxId, ownerName, ownerId, netId)
        end
    end
end)

RegisterNetEvent('AX_LootingV2:server:requestBoxPlayerLoot', function(boxId)
    local src    = source
    local player = ESX.GetPlayerFromId(src)
    if not player then return end

    local state  = boxStates[boxId]
    local isDead = Player(src).state.isDead or false

    if not state then
        TriggerClientEvent('esx:showNotification', src, 'Esta caja ya no existe.')
        return
    end
    if state.isEmpty then
        TriggerClientEvent('esx:showNotification', src, 'Esta caja ya fue vaciada.')
        return
    end
    if state.ownerId == src and isDead then
        TriggerClientEvent('esx:showNotification', src, 'No puedes registrar tu propia caja mientras estás abatido.')
        return
    end
    if state.inUseBy and state.inUseBy ~= src then
        TriggerClientEvent('esx:showNotification', src, 'Alguien más está registrando esta caja.')
        return
    end

    state.inUseBy     = src
    state.lastTouched = os.time()

    local ownerPlayer = ESX.GetPlayerFromId(state.ownerId)
    local ownerName   = ownerPlayer and ownerPlayer.getName() or 'Desconocido'

    TriggerClientEvent('AX_LootingV2:client:openBoxUI', src, enrichWithLabels(state.items), boxId, ownerName)
end)

RegisterNetEvent('AX_LootingV2:server:leaveBox', function(boxId)
    local src   = source
    local state = boxStates[boxId]
    if state and state.inUseBy == src then
        state.inUseBy = nil
    end
end)

RegisterNetEvent('AX_LootingV2:server:collectBoxItem', function(boxId, itemName, itemCount)
    local src    = source
    local player = ESX.GetPlayerFromId(src)
    if not player then return end

    local state = boxStates[boxId]
    if not state or state.isEmpty then return end

    itemName  = tostring(itemName):lower():gsub('[^%a%d_%-]', '')
    itemCount = math.floor(tonumber(itemCount) or 1)
    if itemCount <= 0 or itemName == '' then return end

    local found    = false
    local metadata = {}
    for i, item in ipairs(state.items) do
        if item.name == itemName and item.count == itemCount then
            metadata = item.metadata or {}
            table.remove(state.items, i)
            found = true
            break
        end
    end
    if not found then return end

    if itemName == 'money' then
        player.addMoney(itemCount)
        TriggerClientEvent('esx:showNotification', src, 'Recogiste $' .. itemCount)
    else
        exports['ox_inventory']:AddItem(src, itemName, itemCount, metadata)
        TriggerClientEvent('esx:showNotification', src, 'Recogiste ' .. itemCount .. 'x ' .. itemName)
    end

    sendDiscordLog('🎒 Item recogido de la caja', 3447003, {
        { name = '👤 Jugador',     value = player.getName() .. ' (' .. player.identifier .. ')', inline = true },
        { name = '🆔 ID Servidor', value = tostring(src),                                         inline = true },
        { name = '📦 Caja',        value = tostring(boxId),                                       inline = true },
        { name = '🗃 Item',        value = itemName,                                               inline = true },
        { name = '🔢 Cantidad',    value = tostring(itemCount),                                    inline = true },
        { name = '👻 Dueño',       value = tostring(state.ownerId),                               inline = true },
    })

    if #state.items == 0 then
        state.isEmpty = true
        state.inUseBy = nil
        ownerActiveBox[state.ownerId] = nil
        TriggerClientEvent('AX_LootingV2:client:deleteBox', -1, boxId)

        -- Despawn tras 20 min si quedan items (pero aqui ya no quedan, se borra inmediatamente)
    else
        -- Quedan items: despawn en 20 min desde el ultimo toque
        state.lastTouched = os.time()
        SetTimeout(Config.PlayerBox.despawnIfEmpty * 60 * 1000, function()
            local st = boxStates[boxId]
            if st and not st.isEmpty then
                boxStates[boxId]                  = nil
                ownerActiveBox[st.ownerId]        = nil
                TriggerClientEvent('AX_LootingV2:client:removeBox', -1, boxId)
            end
        end)
    end
end)

RegisterNetEvent('AX_LootingV2:server:collectAllBox', function(boxId)
    local src    = source
    local player = ESX.GetPlayerFromId(src)
    if not player then return end

    local state = boxStates[boxId]
    if not state or state.isEmpty then return end

    local itemsList = ''
    for _, item in ipairs(state.items) do
        itemsList = itemsList .. '• ' .. item.name .. ' x' .. item.count .. '\n'
    end

    for _, item in ipairs(state.items) do
        local name     = item.name
        local count    = item.count
        local metadata = item.metadata or {}
        if count > 0 and name ~= '' then
            if name == 'money' then
                player.addMoney(count)
            else
                exports['ox_inventory']:AddItem(src, name, count, metadata)
            end
        end
    end

    sendDiscordLog('🎒 Caja vaciada completa', 15158332, {
        { name = '👤 Jugador',         value = player.getName() .. ' (' .. player.identifier .. ')', inline = true  },
        { name = '🆔 ID Servidor',     value = tostring(src),                                         inline = true  },
        { name = '📦 Caja',            value = tostring(boxId),                                       inline = true  },
        { name = '👻 Dueño',           value = tostring(state.ownerId),                               inline = true  },
        { name = '📋 Items recogidos', value = itemsList ~= '' and itemsList or 'Ninguno',            inline = false },
    })

    state.items   = {}
    state.isEmpty = true
    state.inUseBy = nil
    ownerActiveBox[state.ownerId] = nil

    TriggerClientEvent('esx:showNotification', src, 'Recogiste todos los items.')
    TriggerClientEvent('AX_LootingV2:client:deleteBox', -1, boxId)
end)

-- Limpiar estado cuando el jugador se desconecta
AddEventHandler('playerDropped', function()
    local src = source
    ownerActiveBox[src] = nil
    for _, state in pairs(boxStates) do
        if state.inUseBy == src then state.inUseBy = nil end
    end
end)

-- Limpiar caja activa cuando el jugador es revivido
AddEventHandler('esx_ambulancejob:PlayerNotDead', function(playerId)
    playerId = tonumber(playerId)
    if ownerActiveBox[playerId] then
        ownerActiveBox[playerId] = nil
    end
end)

-- esx_ambulancejob dispara esto cuando el jugador muere definitivamente
AddEventHandler('esx_ambulancejob:setDeadPlayer', function(playerId)
    TriggerEvent('AX_LootingV2:internal:playerDied', tonumber(playerId))
end)
