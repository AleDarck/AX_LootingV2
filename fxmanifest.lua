fx_version 'cerulean'
game 'gta5'
lua54 'yes'
author 'AX_Scripts'
description 'AX_LootingV2 - Sistema de Looting con Creator para Staff'
version '2.0.0'

shared_scripts {
    'config.lua',
}

client_scripts {
    'client.lua',
}

server_scripts {
    '@oxmysql/lib/MySQL.lua',
    'server.lua',
}

ui_page 'html/index.html'

files {
    'html/index.html',
    'html/style.css',
    'html/script.js',
}

dependencies {
    'es_extended',
    'oxmysql',
    'ox_inventory',
    'AX_ProgressBar',
}
