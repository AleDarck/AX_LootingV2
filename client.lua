-- ============================================================
--  AX_LootingV2 - client.lua
--  Framework: New ESX 1.13.4 | lua54
-- ============================================================

local ESX = exports['es_extended']:getSharedObject()

-- ============================================================
--  ESTADO LOCAL
-- ============================================================

local isCreatorOpen   = false
local isGizmoActive   = false  -- true cuando el gizmo esta activo
local isLootUIOpen    = false
local isSearching     = false

-- Cache local de configuracion del servidor
local cachedProps      = {}
local cachedBoxes      = {}
local cachedLootTypes  = {}
local cachedModels     = {}

-- Lookup rapido: hash del modelo => modelCfg (para peds/animales)
local modelHashLookup  = {}

local function rebuildModelLookup()
    modelHashLookup = {}
    for _, m in ipairs(cachedModels) do
        local hash = GetHashKey(m.model)
        modelHashLookup[hash] = m
    end
end

-- Maletines/cajas de jugadores abatidos
local spawnedBoxes = {}
local activeBoxId  = nil

-- Gizmo state
local gizmoActive   = false
local gizmoEntity   = nil
local gizmoCoords   = vector3(0, 0, 0)
local gizmoHeading  = 0.0
local gizmoModel    = ''
local gizmoCallback = nil

-- ============================================================
--  HELPERS
-- ============================================================

local function getPlayerCoords()
    return GetEntityCoords(PlayerPedId())
end

-- ============================================================
--  SINCRONIZACION DE CONFIG
-- ============================================================

TriggerServerEvent('AX_LootingV2:server:requestConfig')

RegisterNetEvent('AX_LootingV2:client:syncProps', function(props)
    cachedProps = props or {}
end)

RegisterNetEvent('AX_LootingV2:client:syncBoxes', function(boxes)
    cachedBoxes = boxes or {}
end)

RegisterNetEvent('AX_LootingV2:client:syncLootTypes', function(lootTypes)
    cachedLootTypes = lootTypes or {}
end)

RegisterNetEvent('AX_LootingV2:client:syncModels', function(models)
    cachedModels = models or {}
    rebuildModelLookup()
end)

RegisterNetEvent('AX_LootingV2:client:propsUpdated', function(props)
    cachedProps = props or {}
    SendNUIMessage({ action = 'propsUpdated', props = cachedProps })
end)

RegisterNetEvent('AX_LootingV2:client:boxesUpdated', function(boxes)
    cachedBoxes = boxes or {}
    SendNUIMessage({ action = 'boxesUpdated', boxes = cachedBoxes })
end)

RegisterNetEvent('AX_LootingV2:client:lootTypesUpdated', function(lootTypes)
    cachedLootTypes = lootTypes or {}
    SendNUIMessage({ action = 'lootTypesUpdated', lootTypes = cachedLootTypes })
end)

RegisterNetEvent('AX_LootingV2:client:modelsUpdated', function(models)
    cachedModels = models or {}
    rebuildModelLookup()
    SendNUIMessage({ action = 'modelsUpdated', models = cachedModels })
end)

-- ============================================================
--  CREATOR NUI
-- ============================================================

RegisterNetEvent('AX_LootingV2:client:openCreator', function(props, boxes, lootTypes, models)
    cachedProps     = props      or {}
    cachedBoxes     = boxes      or {}
    cachedLootTypes = lootTypes  or {}
    cachedModels    = models     or {}
    rebuildModelLookup()
    isCreatorOpen = true
    SetNuiFocus(true, true)
    SendNUIMessage({
        action     = 'openCreator',
        props      = cachedProps,
        boxes      = cachedBoxes,
        lootTypes  = cachedLootTypes,
        models     = cachedModels,
        imagePath  = Config.InventoryImagePath,
    })
end)

RegisterNUICallback('closeCreator', function(_, cb)
    isCreatorOpen = false
    SetNuiFocus(false, false)
    cb('ok')
end)

-- PROPS ---
RegisterNUICallback('createProp', function(data, cb)
    TriggerServerEvent('AX_LootingV2:server:createProp', data)
    cb('ok')
end)

RegisterNUICallback('updateProp', function(data, cb)
    TriggerServerEvent('AX_LootingV2:server:updateProp', data.id, data)
    cb('ok')
end)

RegisterNUICallback('deleteProp', function(data, cb)
    TriggerServerEvent('AX_LootingV2:server:deleteProp', data.id)
    cb('ok')
end)

-- BOXES ---
RegisterNUICallback('createBox', function(data, cb)
    -- Ocultar creator completamente, iniciar gizmo
    isCreatorOpen = false
    isGizmoActive = true
    SetNuiFocus(false, false)
    SendNUIMessage({ action = 'hideCreator' })

    local pendingData = data
    startGizmo(data.model, function(x, y, z, w)
        pendingData.coords = { x = x, y = y, z = z, w = w }
        TriggerServerEvent('AX_LootingV2:server:createBox', pendingData)
        isGizmoActive = false
        isCreatorOpen = true
        SetNuiFocus(true, true)
        SendNUIMessage({ action = 'returnToCreator', tab = 'box' })
    end)
    cb('ok')
end)

RegisterNUICallback('updateBox', function(data, cb)
    if data.useGizmo then
        isCreatorOpen = false
        isGizmoActive = true
        SetNuiFocus(false, false)
        SendNUIMessage({ action = 'hideCreator' })

        local pendingData = data
        startGizmo(data.model, function(x, y, z, w)
            pendingData.coords = { x = x, y = y, z = z, w = w }
            TriggerServerEvent('AX_LootingV2:server:updateBox', pendingData.id, pendingData)
            isGizmoActive = false
            isCreatorOpen = true
            SetNuiFocus(true, true)
            SendNUIMessage({ action = 'returnToCreator', tab = 'box' })
        end)
    else
        TriggerServerEvent('AX_LootingV2:server:updateBox', data.id, data)
    end
    cb('ok')
end)

RegisterNUICallback('deleteBox', function(data, cb)
    TriggerServerEvent('AX_LootingV2:server:deleteBox', data.id)
    cb('ok')
end)

RegisterNUICallback('gotoBox', function(data, cb)
    local boxId = data.id
    for _, b in ipairs(cachedBoxes) do
        if b.id == boxId then
            local c = b.coords
            SetEntityCoords(PlayerPedId(), c.x, c.y, c.z + 0.5, false, false, false, false)
            break
        end
    end
    cb('ok')
end)

-- LOOT TYPES ---
RegisterNUICallback('createLootType', function(data, cb)
    TriggerServerEvent('AX_LootingV2:server:createLootType', data)
    cb('ok')
end)

RegisterNUICallback('updateLootType', function(data, cb)
    TriggerServerEvent('AX_LootingV2:server:updateLootType', data.id, data)
    cb('ok')
end)

RegisterNUICallback('deleteLootType', function(data, cb)
    TriggerServerEvent('AX_LootingV2:server:deleteLootType', data.id)
    cb('ok')
end)

-- MODELS ---
RegisterNUICallback('createModel', function(data, cb)
    TriggerServerEvent('AX_LootingV2:server:createModel', data)
    cb('ok')
end)

RegisterNUICallback('updateModel', function(data, cb)
    TriggerServerEvent('AX_LootingV2:server:updateModel', data.id, data)
    cb('ok')
end)

RegisterNUICallback('deleteModel', function(data, cb)
    TriggerServerEvent('AX_LootingV2:server:deleteModel', data.id)
    cb('ok')
end)

-- Sugerencias de items (ox_inventory)
RegisterNUICallback('searchItems', function(data, cb)
    local query   = tostring(data.query or ''):lower()
    local results = {}
    if #query < 2 then cb(results) return end

    local allItems = exports['ox_inventory']:Items()
    local count    = 0
    for name, item in pairs(allItems or {}) do
        if count >= 80 then break end
        local label = (item.label or ''):lower()
        if name:find(query, 1, true) or label:find(query, 1, true) then
            table.insert(results, {
                name  = name,
                label = item.label or name,
            })
            count = count + 1
        end
    end
    cb(results)
end)

-- Obtener todos los items para el inventario del modal
RegisterNUICallback('getAllItems', function(data, cb)
    local allItems = exports['ox_inventory']:Items()
    local results  = {}
    for name, item in pairs(allItems or {}) do
        table.insert(results, {
            name  = name,
            label = item.label or name,
        })
    end
    -- Ordenar por label
    table.sort(results, function(a, b)
        return a.label:lower() < b.label:lower()
    end)
    cb(results)
end)

-- ============================================================
--  GIZMO 3D - Colocacion de props
-- ============================================================

function startGizmo(modelName, onConfirm)
    gizmoModel    = modelName
    gizmoCallback = onConfirm

    local playerCoords = getPlayerCoords()
    gizmoCoords  = playerCoords + vector3(2.0, 0.0, 0.0)
    gizmoHeading = GetEntityHeading(PlayerPedId())

    local model = GetHashKey(gizmoModel)
    RequestModel(model)
    CreateThread(function()
        while not HasModelLoaded(model) do Wait(10) end

        gizmoEntity = CreateObject(model,
            gizmoCoords.x, gizmoCoords.y, gizmoCoords.z,
            false, false, true)
        SetEntityHeading(gizmoEntity, gizmoHeading)
        SetEntityAlpha(gizmoEntity, 180, false)
        SetEntityCollision(gizmoEntity, false, false)
        FreezeEntityPosition(gizmoEntity, true)
        SetModelAsNoLongerNeeded(model)

        gizmoActive = true
        SendNUIMessage({ action = 'showGizmoHint', visible = true })
    end)
end

local function stopGizmo(confirm)
    if not gizmoActive then return end
    gizmoActive = false
    SendNUIMessage({ action = 'showGizmoHint', visible = false })

    if DoesEntityExist(gizmoEntity) then
        DeleteEntity(gizmoEntity)
    end

    if confirm and gizmoCallback then
        gizmoCallback(gizmoCoords.x, gizmoCoords.y, gizmoCoords.z, gizmoHeading)
    end
    gizmoEntity   = nil
    gizmoCallback = nil
end

local function updateGizmoPosition()
    if not gizmoActive or not DoesEntityExist(gizmoEntity) then return end
    SetEntityCoordsNoOffset(gizmoEntity, gizmoCoords.x, gizmoCoords.y, gizmoCoords.z, false, false, false)
    SetEntityHeading(gizmoEntity, gizmoHeading)
end

CreateThread(function()
    while true do
        if gizmoActive then
            local step  = Config.Gizmo.moveStep
            local rStep = Config.Gizmo.rotateStep

            if IsControlPressed(0, 32) then
                local rad = math.rad(GetEntityHeading(PlayerPedId()))
                gizmoCoords = gizmoCoords + vector3(-math.sin(rad) * step, math.cos(rad) * step, 0.0)
            end
            if IsControlPressed(0, 33) then
                local rad = math.rad(GetEntityHeading(PlayerPedId()))
                gizmoCoords = gizmoCoords + vector3(math.sin(rad) * step, -math.cos(rad) * step, 0.0)
            end
            if IsControlPressed(0, 34) then
                local rad = math.rad(GetEntityHeading(PlayerPedId()))
                gizmoCoords = gizmoCoords + vector3(-math.cos(rad) * step, -math.sin(rad) * step, 0.0)
            end
            if IsControlPressed(0, 35) then
                local rad = math.rad(GetEntityHeading(PlayerPedId()))
                gizmoCoords = gizmoCoords + vector3(math.cos(rad) * step, math.sin(rad) * step, 0.0)
            end
            if IsControlJustPressed(0, 44) then
                gizmoCoords = gizmoCoords + vector3(0.0, 0.0, step)
            end
            if IsControlJustPressed(0, 38) then
                gizmoCoords = gizmoCoords + vector3(0.0, 0.0, -step)
            end
            if IsControlJustPressed(0, 98) then
                gizmoHeading = (gizmoHeading + rStep) % 360.0
            end
            if IsControlJustPressed(0, 99) then
                gizmoHeading = (gizmoHeading - rStep + 360.0) % 360.0
            end
            if IsControlJustPressed(0, 191) then
                stopGizmo(true)
            end
            if IsControlJustPressed(0, 200) then
                stopGizmo(false)
                isGizmoActive = false
                isCreatorOpen = true
                SetNuiFocus(true, true)
                SendNUIMessage({ action = 'returnToCreator', tab = 'box' })
            end

            updateGizmoPosition()

            SetTextFont(4)
            SetTextProportional(true)
            SetTextScale(0.35, 0.35)
            SetTextColour(255, 255, 255, 220)
            SetTextEntry('STRING')
            AddTextComponentString('WASD: Mover  |  Q/E: Subir/Bajar  |  Num4/6: Rotar  |  ENTER: Confirmar  |  ESC: Cancelar')
            DrawText(0.5, 0.92)

            Wait(0)
        else
            Wait(200)
        end
    end
end)

-- ============================================================
--  CERRAR CREATOR CON ESC
-- ============================================================

CreateThread(function()
    while true do
        Wait(0)
        if isCreatorOpen and not isGizmoActive then
            if IsControlJustPressed(0, 200) then
                isCreatorOpen = false
                SetNuiFocus(false, false)
                SendNUIMessage({ action = 'closeCreator' })
            end
        else
            Wait(200)
        end
    end
end)

-- ============================================================
--  LOOTING DE PROPS DEL MUNDO
-- ============================================================

local propModelLookup = {}

local function rebuildPropLookup()
    propModelLookup = {}
    for _, p in ipairs(cachedProps) do
        local hash = GetHashKey(p.model)
        if not propModelLookup[hash] then
            propModelLookup[hash] = p
        end
    end
end

CreateThread(function()
    while true do
        Wait(2000)
        rebuildPropLookup()
    end
end)

local nearbyLootProp = nil

CreateThread(function()
    while true do
        if isLootUIOpen or isSearching then
            nearbyLootProp = nil
            Wait(600)
        else
            local playerCoords = getPlayerCoords()
            local found        = nil
            local objects      = GetGamePool('CObject')
            for _, obj in ipairs(objects) do
                local dist = #(playerCoords - GetEntityCoords(obj))
                if dist <= Config.DrawDistance then
                    local hash = GetEntityModel(obj)
                    local cfg  = propModelLookup[hash]
                    if cfg then
                        found = { entity = obj, propCfg = cfg, coords = GetEntityCoords(obj) }
                        break
                    end
                end
            end
            nearbyLootProp = found
            Wait(600)
        end
    end
end)

CreateThread(function()
    while true do
        if nearbyLootProp and not isLootUIOpen and not isSearching then
            ESX.ShowHelpNotification('[E] para buscar en el objeto')
            if IsControlJustPressed(0, 38) then
                local prop = nearbyLootProp
                isSearching = true
                exports['AX_ProgressBar']:Progress({
                    duration        = Config.ProgressBar.duration,
                    label           = Config.ProgressBar.label,
                    useWhileDead    = false,
                    canCancel       = true,
                    controlDisables = {
                        disableMovement    = true,
                        disableCarMovement = true,
                        disableMouse       = false,
                        disableCombat      = true,
                    },
                    animation = {
                        animDict = Config.ProgressBar.animDict,
                        anim     = Config.ProgressBar.anim,
                        flags    = Config.ProgressBar.flags,
                    },
                }, function(cancelled)
                    isSearching = false
                    if cancelled then return end
                    if not DoesEntityExist(prop.entity) then return end
                    local dist = #(getPlayerCoords() - GetEntityCoords(prop.entity))
                    if dist > Config.DrawDistance + 1.0 then
                        ESX.ShowNotification('Te alejaste demasiado.','error')
                        return
                    end
                    local c = GetEntityCoords(prop.entity)
                    TriggerServerEvent('AX_LootingV2:server:requestPropLoot', prop.propCfg.id, c.x, c.y, c.z)
                end)
            end
            Wait(0)
        else
            Wait(500)
        end
    end
end)

-- ============================================================
--  LOOTING DE BOXES (coords fijas)
-- ============================================================

local nearbyConfigBox = nil

CreateThread(function()
    while true do
        if isLootUIOpen or isSearching then
            nearbyConfigBox = nil
            Wait(600)
        else
            local playerCoords = getPlayerCoords()
            local found        = nil
            for _, b in ipairs(cachedBoxes) do
                local c    = b.coords
                local dist = #(playerCoords - vector3(c.x, c.y, c.z))
                if dist <= Config.DrawDistance then
                    found = { boxCfg = b }
                    break
                end
            end
            nearbyConfigBox = found
            Wait(600)
        end
    end
end)

CreateThread(function()
    while true do
        if nearbyConfigBox and not isLootUIOpen and not isSearching then
            ESX.ShowHelpNotification('[E] para buscar en la caja')
            if IsControlJustPressed(0, 38) then
                local box = nearbyConfigBox
                isSearching = true
                exports['AX_ProgressBar']:Progress({
                    duration        = Config.ProgressBar.duration,
                    label           = Config.ProgressBar.label,
                    useWhileDead    = false,
                    canCancel       = true,
                    controlDisables = {
                        disableMovement    = true,
                        disableCarMovement = true,
                        disableMouse       = false,
                        disableCombat      = true,
                    },
                    animation = {
                        animDict = Config.ProgressBar.animDict,
                        anim     = Config.ProgressBar.anim,
                        flags    = Config.ProgressBar.flags,
                    },
                }, function(cancelled)
                    isSearching = false
                    if cancelled then return end
                    local c = box.boxCfg.coords
                    TriggerServerEvent('AX_LootingV2:server:requestBoxLoot', box.boxCfg.id, c.x, c.y, c.z)
                end)
            end
            Wait(0)
        else
            Wait(500)
        end
    end
end)

-- ============================================================
--  LOOTINGBOX - Cajas de jugadores abatidos
-- ============================================================

RegisterNetEvent('AX_LootingV2:client:spawnPlayerBox', function(boxId, ownerName, ownerId)
    local coords = getPlayerCoords()
    local model  = Config.PlayerBox.prop
    RequestModel(model)
    CreateThread(function()
        while not HasModelLoaded(model) do Wait(10) end

        local heading = GetEntityHeading(PlayerPedId())
        local rad     = math.rad(heading)
        local offsetX = -math.sin(rad) * 1.2
        local offsetY =  math.cos(rad) * 1.2
        local box = CreateObject(model, coords.x + offsetX, coords.y + offsetY, coords.z - 0.5, true, true, true)
        PlaceObjectOnGroundProperly(box)
        FreezeEntityPosition(box, true)
        SetEntityCollision(box, true, true)

        local attempts = 0
        while not NetworkGetEntityIsNetworked(box) and attempts < 50 do
            Wait(100)
            attempts = attempts + 1
        end

        local netId = NetworkGetNetworkIdFromEntity(box)
        spawnedBoxes[boxId] = { entity = box, ownerName = ownerName, ownerId = ownerId }
        TriggerServerEvent('AX_LootingV2:server:boxSpawned', boxId, ownerName, ownerId, netId)
        SetModelAsNoLongerNeeded(model)
    end)
end)

RegisterNetEvent('AX_LootingV2:client:registerBoxByNetId', function(boxId, ownerName, ownerId, netId)
    CreateThread(function()
        local entity   = nil
        local attempts = 0
        while attempts < 30 do
            entity = NetworkGetEntityFromNetworkId(netId)
            if entity and entity ~= 0 and DoesEntityExist(entity) then break end
            Wait(200)
            attempts = attempts + 1
        end
        if entity and DoesEntityExist(entity) then
            spawnedBoxes[boxId] = { entity = entity, ownerName = ownerName, ownerId = ownerId }
        end
    end)
end)

RegisterNetEvent('AX_LootingV2:client:removeBox', function(boxId)
    local data = spawnedBoxes[boxId]
    if data and DoesEntityExist(data.entity) then DeleteEntity(data.entity) end
    spawnedBoxes[boxId] = nil
end)

RegisterNetEvent('AX_LootingV2:client:deleteBox', function(boxId)
    if isLootUIOpen and activeBoxId == boxId then
        isLootUIOpen = false
        activeBoxId  = nil
        SetNuiFocus(false, false)
        SendNUIMessage({ action = 'closeLoot' })
    end
    CreateThread(function()
        Wait(400)
        local data = spawnedBoxes[boxId]
        if data and DoesEntityExist(data.entity) then
            for i = 1, 20 do
                if DoesEntityExist(data.entity) then
                    SetEntityAlpha(data.entity, math.floor(255 * (1 - i/20)), false)
                end
                Wait(60)
            end
            if DoesEntityExist(data.entity) then DeleteEntity(data.entity) end
        end
        spawnedBoxes[boxId] = nil
    end)
end)

local nearbyPlayerBox = nil

CreateThread(function()
    while true do
        if isLootUIOpen or isSearching then
            nearbyPlayerBox = nil
            Wait(500)
        else
            local playerCoords = getPlayerCoords()
            local found        = nil
            for boxId, data in pairs(spawnedBoxes) do
                if DoesEntityExist(data.entity) then
                    local dist = #(playerCoords - GetEntityCoords(data.entity))
                    if dist <= Config.DrawDistance then
                        found = { boxId = boxId, data = data }
                        break
                    end
                end
            end
            nearbyPlayerBox = found
            Wait(500)
        end
    end
end)

CreateThread(function()
    while true do
        if nearbyPlayerBox and not isLootUIOpen and not isSearching then
            local myId   = GetPlayerServerId(PlayerId())
            local isMine = nearbyPlayerBox.data.ownerId == myId
            local isDead = LocalPlayer.state.isDead or false

            ESX.ShowHelpNotification('[E] para registrar la caja')

            if IsControlJustPressed(0, 38) then
                if isMine and isDead then
                    ESX.ShowNotification('No puedes registrar tu propia caja mientras estás abatido.', 'error') 
                else
                    local currentBoxId = nearbyPlayerBox.boxId
                    isSearching = true
                    exports['AX_ProgressBar']:Progress({
                        duration        = Config.BagProgressBar.duration,
                        label           = Config.BagProgressBar.label,
                        useWhileDead    = false,
                        canCancel       = true,
                        controlDisables = {
                            disableMovement    = true,
                            disableCarMovement = true,
                            disableMouse       = false,
                            disableCombat      = true,
                        },
                        animation = {
                            animDict = Config.BagProgressBar.animDict,
                            anim     = Config.BagProgressBar.anim,
                            flags    = Config.BagProgressBar.flags,
                        },
                    }, function(cancelled)
                        isSearching = false
                        if not cancelled then
                            TriggerServerEvent('AX_LootingV2:server:requestBoxPlayerLoot', currentBoxId)
                        end
                    end)
                end
            end
            Wait(0)
        else
            Wait(500)
        end
    end
end)

-- ============================================================
--  LOOT UI (props y cajas del creator)
-- ============================================================

RegisterNetEvent('AX_LootingV2:client:openLootUI', function(items, lootSource)
    isLootUIOpen = true
    activeBoxId  = nil
    SetNuiFocus(true, true)
    SendNUIMessage({
        action      = 'openLoot',
        items       = items,
        imagePath   = Config.InventoryImagePath,
        revealDelay = Config.CardRevealDelay,
        source      = lootSource,
    })
end)

RegisterNetEvent('AX_LootingV2:client:propOnCooldown', function(secondsLeft)
    local mins = math.floor(secondsLeft / 60)
    local secs = secondsLeft % 60
    if mins > 0 then
        ESX.ShowNotification(string.format('Este objeto fue revisado. Vuelve en %d min %d seg.', mins, secs), 'warning')
    else
        ESX.ShowNotification(string.format('Este objeto fue revisado. Vuelve en %d seg.', secs), 'warning')
    end
end)

RegisterNUICallback('closeLoot', function(_, cb)
    isLootUIOpen = false
    SetNuiFocus(false, false)
    cb('ok')
end)

RegisterNUICallback('collectLootItem', function(data, cb)
    if data and data.name and data.count then
        TriggerServerEvent('AX_LootingV2:server:collectLootItem', data.name, data.count)
    end
    cb('ok')
end)

RegisterNUICallback('collectAllLoot', function(data, cb)
    if data and data.items then
        TriggerServerEvent('AX_LootingV2:server:collectAllLoot', data.items)
    end
    isLootUIOpen = false
    SetNuiFocus(false, false)
    cb('ok')
end)

-- ============================================================
--  BOX UI (cajas de jugadores abatidos)
-- ============================================================

RegisterNetEvent('AX_LootingV2:client:openBoxUI', function(items, boxId, ownerName)
    activeBoxId  = boxId
    isLootUIOpen = true
    SetNuiFocus(true, true)
    SendNUIMessage({
        action      = 'openBoxUI',
        items       = items,
        imagePath   = Config.InventoryImagePath,
        revealDelay = Config.CardRevealDelay,
        ownerName   = ownerName,
        boxId       = boxId,
    })
end)

RegisterNUICallback('closeBoxUI', function(_, cb)
    if activeBoxId then
        TriggerServerEvent('AX_LootingV2:server:leaveBox', activeBoxId)
    end
    isLootUIOpen = false
    activeBoxId  = nil
    SetNuiFocus(false, false)
    cb('ok')
end)

RegisterNUICallback('collectBoxItem', function(data, cb)
    if activeBoxId and data and data.name and data.count then
        TriggerServerEvent('AX_LootingV2:server:collectBoxItem', activeBoxId, data.name, data.count)
    end
    cb('ok')
end)

RegisterNUICallback('collectAllBox', function(_, cb)
    local bid = activeBoxId
    activeBoxId  = nil
    isLootUIOpen = false
    SetNuiFocus(false, false)
    if bid then
        TriggerServerEvent('AX_LootingV2:server:collectAllBox', bid)
    end
    cb('ok')
end)

-- ============================================================
--  LOOTING DE PEDS / ANIMALES
-- ============================================================

local activePedNetId = nil
local nearbyPed      = nil

CreateThread(function()
    while true do
        if isLootUIOpen or isSearching then
            nearbyPed = nil
            Wait(500)
        else
            local playerPed    = PlayerPedId()
            local playerCoords = getPlayerCoords()
            local found        = nil
            local peds         = GetGamePool('CPed')
            for _, ped in ipairs(peds) do
                if ped ~= playerPed
                    and IsPedDeadOrDying(ped, true)
                    and not IsPedAPlayer(ped)
                    and GetEntityAlpha(ped) > 10
                then
                    local dist = #(playerCoords - GetEntityCoords(ped))
                    if dist <= Config.DrawDistance then
                        local hash     = GetEntityModel(ped)
                        local modelCfg = modelHashLookup[hash]
                        if modelCfg then
                            local netId = NetworkGetNetworkIdFromEntity(ped)
                            if netId and netId ~= 0 then
                                found = {
                                    entity    = ped,
                                    netId     = netId,
                                    modelName = modelCfg.model,
                                    modelCfg  = modelCfg,
                                }
                                break
                            end
                        end
                    end
                end
            end
            nearbyPed = found
            Wait(500)
        end
    end
end)

CreateThread(function()
    while true do
        if nearbyPed and not isLootUIOpen and not isSearching then
            local label = nearbyPed.modelCfg.is_animal
                and '[E] para deshuesar el animal'
                or  '[E] para buscar en el cuerpo'

            ESX.ShowHelpNotification(label)

            if IsControlJustPressed(0, 38) then
                local ped = nearbyPed

                if ped.modelCfg.is_animal and ped.modelCfg.require_knife then
                    local requiredWeapon = joaat('weapon_knife')
                    if not HasPedGotWeapon(PlayerPedId(), requiredWeapon, false) then
                        ESX.ShowNotification('Necesitas una Knife para deshuesar el animal.', 'warning')
                        Wait(0)
                    else
                        isSearching = true
                        exports['AX_ProgressBar']:Progress({
                            duration        = Config.PedProgressBar.duration,
                            label           = 'Desollando...',
                            useWhileDead    = false,
                            canCancel       = true,
                            controlDisables = {
                                disableMovement    = true,
                                disableCarMovement = true,
                                disableMouse       = false,
                                disableCombat      = true,
                            },
                            animation = {
                                animDict = Config.PedProgressBar.animDict,
                                anim     = Config.PedProgressBar.anim,
                                flags    = Config.PedProgressBar.flags,
                            },
                        }, function(cancelled)
                            isSearching = false
                            if cancelled then return end
                            if not DoesEntityExist(ped.entity) then
                                ESX.ShowNotification('El cuerpo ya no está aquí.', 'error')
                                return
                            end
                            local dist = #(getPlayerCoords() - GetEntityCoords(ped.entity))
                            if dist > Config.DrawDistance + 1.0 then
                                ESX.ShowNotification('Te alejaste demasiado.', 'error')
                                return
                            end
                            activePedNetId = ped.netId
                            TriggerServerEvent('AX_LootingV2:server:requestPedLoot', ped.netId, ped.modelName)
                        end)
                        Wait(0)
                    end
                else
                    isSearching = true
                    exports['AX_ProgressBar']:Progress({
                        duration        = Config.PedProgressBar.duration,
                        label           = Config.PedProgressBar.label,
                        useWhileDead    = false,
                        canCancel       = true,
                        controlDisables = {
                            disableMovement    = true,
                            disableCarMovement = true,
                            disableMouse       = false,
                            disableCombat      = true,
                        },
                        animation = {
                            animDict = Config.PedProgressBar.animDict,
                            anim     = Config.PedProgressBar.anim,
                            flags    = Config.PedProgressBar.flags,
                        },
                    }, function(cancelled)
                        isSearching = false
                        if cancelled then return end
                        if not DoesEntityExist(ped.entity) then
                            ESX.ShowNotification('El cuerpo ya no está aquí.', 'error')
                            return
                        end
                        local dist = #(getPlayerCoords() - GetEntityCoords(ped.entity))
                        if dist > Config.DrawDistance + 1.0 then
                            ESX.ShowNotification('Te alejaste demasiado.', 'error')
                            return
                        end
                        activePedNetId = ped.netId
                        TriggerServerEvent('AX_LootingV2:server:requestPedLoot', ped.netId, ped.modelName)
                    end)
                    Wait(0)
                end
            else
                Wait(0)
            end
        else
            Wait(500)
        end
    end
end)

RegisterNetEvent('AX_LootingV2:client:deletePed', function(netId)
    if isLootUIOpen then
        isLootUIOpen   = false
        activePedNetId = nil
        SetNuiFocus(false, false)
        SendNUIMessage({ action = 'closeLoot' })
    end
    CreateThread(function()
        Wait(400)
        local entity = NetToEnt(netId)
        if not entity or not DoesEntityExist(entity) then return end
        for i = 1, 20 do
            if DoesEntityExist(entity) then
                SetEntityAlpha(entity, math.floor(255 * (1 - i/20)), false)
            end
            Wait(60)
        end
        if DoesEntityExist(entity) then DeleteEntity(entity) end
    end)
end)

RegisterNUICallback('closePedLoot', function(_, cb)
    if activePedNetId then
        TriggerServerEvent('AX_LootingV2:server:leavePed', activePedNetId)
    end
    isLootUIOpen   = false
    activePedNetId = nil
    SetNuiFocus(false, false)
    cb('ok')
end)

RegisterNUICallback('collectPedItem', function(data, cb)
    if activePedNetId and data and data.name and data.count then
        TriggerServerEvent('AX_LootingV2:server:collectPedItem', activePedNetId, data.name, data.count)
    end
    cb('ok')
end)

RegisterNUICallback('collectAllPed', function(data, cb)
    if activePedNetId then
        TriggerServerEvent('AX_LootingV2:server:collectAllPed', activePedNetId, data and data.items or {})
    end
    isLootUIOpen   = false
    activePedNetId = nil
    SetNuiFocus(false, false)
    cb('ok')
end)

-- ============================================================
--  CERRAR LOOT UI CON ESC
-- ============================================================

CreateThread(function()
    while true do
        Wait(0)
        if isLootUIOpen then
            if IsControlJustPressed(0, 200) then
                isLootUIOpen = false
                activeBoxId  = nil
                SetNuiFocus(false, false)
                SendNUIMessage({ action = 'closeLoot' })
            end
        else
            Wait(200)
        end
    end
end)
