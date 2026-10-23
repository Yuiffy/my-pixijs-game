$ErrorActionPreference = 'Stop'
$taskRoot = Split-Path $PSScriptRoot -Parent
$taskSource = Join-Path $taskRoot 'tmp/liuzhou/map.osm'
if (!(Test-Path -LiteralPath $taskSource)) {
    New-Item -ItemType Directory -Force (Split-Path $taskSource -Parent) | Out-Null
    Invoke-WebRequest -Uri 'https://api.openstreetmap.org/api/0.6/map?bbox=109.408,24.307,109.418,24.318' -OutFile $taskSource -TimeoutSec 60
}
[xml]$taskOsm = Get-Content -LiteralPath $taskSource -Raw
$taskNodes = @{}
foreach ($taskNode in $taskOsm.osm.node) {
    $taskNodes[$taskNode.id] = @(
        [Math]::Round(([double]$taskNode.lon - 109.41225) * 101458.0, 2),
        [Math]::Round((24.31415 - [double]$taskNode.lat) * 111320.0, 2)
    )
}
$taskFeatures = @()
foreach ($taskWay in $taskOsm.osm.way) {
    $taskTags = @{}
    foreach ($taskTag in $taskWay.tag) { if ($taskTag) { $taskTags[$taskTag.k] = $taskTag.v } }
    if (!$taskTags.highway -and !$taskTags.building -and !$taskTags.name) { continue }
    $taskPoints = @()
    foreach ($taskRef in $taskWay.nd) { $taskPoints += ,$taskNodes[$taskRef.ref] }
    if (!($taskPoints | Where-Object { [Math]::Abs($_[0]) -lt 650 -and $_[1] -gt -440 -and $_[1] -lt 820 })) { continue }
    $taskFeatures += [ordered]@{ id = $taskWay.id; name = $taskTags.name; highway = $taskTags.highway; building = $taskTags.building; bridge = $taskTags.bridge; points = $taskPoints }
}
$taskOutput = [ordered]@{
    attribution = '© OpenStreetMap contributors'; license = 'ODbL-1.0'; fetched = '2026-10-23'
    origin = @(109.41225, 24.31415); units = 'metres; x east, z south'
    source = 'https://api.openstreetmap.org/api/0.6/map?bbox=109.408,24.307,109.418,24.318'
    features = $taskFeatures
}
$taskTarget = Join-Path $taskRoot 'src/components/liuzhou/map.json'
New-Item -ItemType Directory -Force (Split-Path $taskTarget -Parent) | Out-Null
[IO.File]::WriteAllText($taskTarget, ($taskOutput | ConvertTo-Json -Depth 12 -Compress), [Text.UTF8Encoding]::new($false))
$taskPublic = Join-Path $taskRoot 'public/games/liuzhou/map.json'
New-Item -ItemType Directory -Force (Split-Path $taskPublic -Parent) | Out-Null
Copy-Item -LiteralPath $taskTarget -Destination $taskPublic -Force
Write-Output "Imported $($taskFeatures.Count) OSM ways."
