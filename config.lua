Config = {}

-- ============================================================
--  GENERAL
-- ============================================================

Config.DrawDistance     = 3.0    -- metros para detectar props y cajas
Config.PropCooldown     = 600    -- segundos de cooldown por instancia de prop (10 min)

-- ============================================================
--  PROGRESS BAR - Looting de props
-- ============================================================
Config.ProgressBar = {
    duration = 5000,
    label    = 'Buscando objetos...',
    animDict = 'amb@prop_human_bum_bin@base',
    anim     = 'base',
    flags    = 49,
}

Config.PedProgressBar = {
    duration = 4000,
    label    = 'Revisando cuerpo...',
    animDict = 'anim@amb@clubhouse@tutorial@bkr_tut_ig3@',
    anim     = 'machinic_loop_mechandplayer',
    flags    = 1,
}

Config.BagProgressBar = {
    duration = 5000,
    label    = 'Registrando caja...',
    animDict = 'anim@amb@clubhouse@tutorial@bkr_tut_ig3@',
    anim     = 'machinic_loop_mechandplayer',
    flags    = 1,
}

-- ============================================================
--  IMAGENES (ox_inventory)
-- ============================================================
Config.InventoryImagePath = 'nui://ox_inventory/web/images/'

-- ============================================================
--  LOOTINGBAG (Caja de jugador abatido)
-- ============================================================
Config.PlayerBox = {
    prop           = 'v_ind_meatboxsml',
    despawnMinutes  = 45,
    despawnIfEmpty  = 20,
    despawnUntouched = 35,
    protectedItems = {
        'medallon',
        -- agrega aquí cualquier item que no quieras que caiga a la caja
        -- 'driver_license',
        -- 'phone',
    },
}

-- ============================================================
--  ANIMACION - Reveal de items en UI
-- ============================================================
Config.CardRevealDelay = 180  -- ms entre aparicion de cada card

-- ============================================================
--  DISCORD WEBHOOK
-- ============================================================
Config.DiscordWebhook = 'https://discord.com/api/webhooks/1478532917213794612/9fLQKjUXdYIz6xdC2_yKBg_OtKjTZOi0gmg7ZDzkM3pMwaFpnckFQ9BtmTgI8RYlZ1Dd'

-- ============================================================
--  STAFF GROUPS que pueden usar /lootcreator
-- ============================================================
Config.StaffGroups = { 'admin' }

-- ============================================================
--  GIZMO 3D - Velocidades de ajuste
-- ============================================================
Config.Gizmo = {
    moveStep   = 0.05,   -- metros por pulsacion
    rotateStep = 5.0,    -- grados por pulsacion
}
