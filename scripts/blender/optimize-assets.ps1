param([string[]]$Assets = @('apartment', 'sui'))
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
$rawDir = Join-Path $projectRoot 'tmp/after-hours-raw'
New-Item -ItemType Directory -Path $rawDir -Force | Out-Null
foreach ($assetName in $Assets) {
    $runtimeFile = Join-Path $projectRoot "public/games/after-hours/$assetName.glb"
    $rawFile = Join-Path $rawDir "$assetName.glb"
    Copy-Item -LiteralPath $runtimeFile -Destination $rawFile
    # Preserve named articulation pivots. No decoder dependency is needed.
    & pnpm dlx '@gltf-transform/cli@4.2.1' optimize $rawFile $runtimeFile --compress false --flatten false --join false --instance false --palette false --simplify false --texture-compress false
    if ($LASTEXITCODE -ne 0) { throw "glTF optimization failed for $assetName" }
}
$manifestPath = Join-Path $projectRoot 'public/games/after-hours/manifest.json'
$manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
foreach ($asset in $manifest.assets) {
    $runtimeFile = Join-Path $projectRoot "public/games/after-hours/$($asset.file)"
    $sourceName = [IO.Path]::GetFileNameWithoutExtension($asset.file)
    $asset.source = "assets/after-hours/$sourceName.blend"
    $asset | Add-Member -MemberType NoteProperty -Name runtime_bytes -Value (Get-Item -LiteralPath $runtimeFile).Length -Force
}
$manifest | Add-Member -MemberType NoteProperty -Name optimization -Value 'glTF Transform 4.2.1 dedup, weld, prune; named pivots preserved; no geometry decoder required' -Force
$manifest | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $manifestPath -Encoding utf8NoBOM
