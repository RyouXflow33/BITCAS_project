# Copies the Pi's live congestion.json onto this laptop every 5 seconds.
# The desk reads assets/data/congestion.json. The camera page stays on the Pi.
# Leave this window open. Closing it stops the desk updates.

$Remote = "ianpajarito@100.103.30.96"
$RemoteDir = "/home/ianpajarito/BITCAS/assets/data"
$LocalDir = Join-Path (Split-Path $PSScriptRoot -Parent) "assets\data"
$LiveName = "congestion.json"
$Optional = @("traffic_history.jsonl", "traffic_hourly.jsonl", "crossings.jsonl")

if (-not (Test-Path $LocalDir)) {
    New-Item -ItemType Directory -Path $LocalDir | Out-Null
}

Write-Host "Copying Pi readings into $LocalDir"
Write-Host "Leave this window open. Close it to stop the copy."

while ($true) {
    $temp = Join-Path $LocalDir "$LiveName.sync"
    $dest = Join-Path $LocalDir $LiveName
    & scp -o BatchMode=yes -o ConnectTimeout=8 "${Remote}:${RemoteDir}/${LiveName}" $temp
    if ($LASTEXITCODE -eq 0 -and (Test-Path $temp)) {
        Move-Item -Force $temp $dest
        Write-Host "$(Get-Date -Format 'HH:mm:ss') congestion.json updated"
    } else {
        Write-Host "$(Get-Date -Format 'HH:mm:ss') Pi reading was not copied"
        if (Test-Path $temp) { Remove-Item $temp -Force }
    }

    foreach ($name in $Optional) {
        $optTemp = Join-Path $LocalDir "$name.sync"
        & scp -o BatchMode=yes -o ConnectTimeout=8 "${Remote}:${RemoteDir}/${name}" $optTemp 2>$null
        if ($LASTEXITCODE -eq 0 -and (Test-Path $optTemp)) {
            Move-Item -Force $optTemp (Join-Path $LocalDir $name)
        } elseif (Test-Path $optTemp) {
            Remove-Item $optTemp -Force
        }
    }

    Start-Sleep -Seconds 5
}
