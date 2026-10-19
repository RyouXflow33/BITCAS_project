<?php
// Copy this file to api/database.local.php and fill in your Hostinger MySQL details.
// Keep api/database.local.php out of git.
return [
    'host' => '127.0.0.1',
    'port' => 3306,
    'database' => 'u260832388_bitcas_db',
    'username' => 'u260832388_bitcas',
    'password' => 'Pajarit0333',
    // Shared secret checked in the X-API-Key header by api/save_data.php and api/upload_snapshot.php.
    'ingest_api_key' => 'CHANGE_THIS_INGEST_KEY'
];
