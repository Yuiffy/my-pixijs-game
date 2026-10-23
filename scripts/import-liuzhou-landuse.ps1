param([switch]$Refresh)
$ErrorActionPreference = 'Stop'
$urbanRoot = Split-Path $PSScriptRoot -Parent
$urbanSource = Join-Path $urbanRoot 'tmp/liuzhou/urban-source.osm'
$urbanUrl = 'https://api.openstreetmap.org/api/0.6/map?bbox=109.408,24.307,109.418,24.318'
if ($Refresh -or !(Test-Path -LiteralPath $urbanSource)) {
    New-Item -ItemType Directory -Force (Split-Path $urbanSource -Parent) | Out-Null
    Invoke-WebRequest -Uri $urbanUrl -OutFile $urbanSource -TimeoutSec 60
}
[xml]$urbanOsm = Get-Content -LiteralPath $urbanSource -Raw
$urbanNodes = @{}
foreach ($urbanNode in $urbanOsm.osm.node) {
    $urbanNodes[$urbanNode.id] = @(
        [Math]::Round(([double]$urbanNode.lon - 109.41225) * 101458, 2),
        [Math]::Round((24.31415 - [double]$urbanNode.lat) * 111320, 2)
    )
}
$urbanFeatures = @()
foreach ($urbanWay in $urbanOsm.osm.way) {
    $urbanTags = @{}
    foreach ($urbanTag in $urbanWay.tag) { if ($urbanTag) { $urbanTags[$urbanTag.k] = $urbanTag.v } }
    if (!$urbanTags.landuse -and !$urbanTags.leisure -and $urbanTags.amenity -notin @('school', 'hospital', 'parking', 'marketplace') -and $urbanTags.place -ne 'square') { continue }
    $urbanPoints = @()
    foreach ($urbanRef in $urbanWay.nd) { if ($urbanNodes.ContainsKey($urbanRef.ref)) { $urbanPoints += ,$urbanNodes[$urbanRef.ref] } }
    if ($urbanPoints.Count -lt 4) { continue }
    $urbanFeatures += [ordered]@{
        id = $urbanWay.id; name = $urbanTags.name
        landuse = $urbanTags.landuse; leisure = $urbanTags.leisure
        amenity = $urbanTags.amenity; barrier = $urbanTags.barrier; place = $urbanTags.place
        points = $urbanPoints
    }
}
$urbanData = [ordered]@{
    attribution = '© OpenStreetMap contributors'; license = 'ODbL-1.0'
    fetched = (Get-Item -LiteralPath $urbanSource).LastWriteTime.ToString('yyyy-MM-dd')
    origin = @(109.41225, 24.31415); source = $urbanUrl; features = $urbanFeatures
}
$urbanTarget = Join-Path $urbanRoot 'src/components/liuzhou/urban-landuse.json'
[IO.File]::WriteAllText($urbanTarget, ($urbanData | ConvertTo-Json -Depth 12), [Text.UTF8Encoding]::new($false))
Copy-Item -LiteralPath $urbanTarget -Destination (Join-Path $urbanRoot 'public/games/liuzhou/urban-landuse.json') -Force
Write-Output "Imported $($urbanFeatures.Count) OSM land-use boundaries."
