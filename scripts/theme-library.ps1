function Get-OneClickSkinStateRoot {
  return (Join-Path $env:LOCALAPPDATA 'CodexOneClickSkin')
}

function Get-OneClickSkinBundledRoot {
  return (Join-Path (Split-Path -Parent $PSScriptRoot) 'presets')
}

function Assert-OneClickSkinThemeId {
  param([Parameter(Mandatory = $true)][string]$ThemeId)
  if ($ThemeId -cnotmatch '^[A-Za-z0-9_-]{1,80}$') {
    throw 'Theme id may contain only ASCII letters, numbers, underscores, and hyphens (maximum 80 characters).'
  }
}

function Get-OneClickSkinThemeDirectory {
  param([Parameter(Mandatory = $true)][string]$ThemeId)
  Assert-OneClickSkinThemeId -ThemeId $ThemeId
  $stateThemes = Join-Path (Get-OneClickSkinStateRoot) 'themes'
  foreach ($root in @($stateThemes, (Get-OneClickSkinBundledRoot))) {
    $candidate = Join-Path $root $ThemeId
    if ((Test-Path -LiteralPath $candidate -PathType Container) -and
      (Test-DreamSkinPathWithin -Path $candidate -Root $root)) {
      return [System.IO.Path]::GetFullPath($candidate)
    }
  }
  throw "Theme not found: $ThemeId"
}

function Get-OneClickSkinThemeManifest {
  param([Parameter(Mandatory = $true)][string]$ThemeDirectory)
  $manifestPath = Join-Path $ThemeDirectory 'theme.json'
  if (-not (Test-Path -LiteralPath $manifestPath -PathType Leaf)) { throw "Missing theme.json: $ThemeDirectory" }
  try { $manifest = (Read-DreamSkinUtf8File -Path $manifestPath) | ConvertFrom-Json -ErrorAction Stop } catch {
    throw "Invalid theme.json: $manifestPath"
  }
  if ($null -eq $manifest -or $manifest -is [array] -or [int]$manifest.schemaVersion -ne 1) {
    throw "Unsupported theme manifest: $manifestPath"
  }
  Assert-OneClickSkinThemeId -ThemeId "$($manifest.id)"
  if (-not $manifest.name -or -not $manifest.image) { throw "Theme name or image is missing: $manifestPath" }
  if ([System.IO.Path]::GetFileName("$($manifest.image)") -cne "$($manifest.image)") {
    throw "Theme image must be a plain filename: $manifestPath"
  }
  $imagePath = Join-Path $ThemeDirectory "$($manifest.image)"
  if (-not (Test-Path -LiteralPath $imagePath -PathType Leaf)) { throw "Theme image not found: $imagePath" }
  return $manifest
}

function Get-OneClickSkinSelectedThemeId {
  $selectionPath = Join-Path (Get-OneClickSkinStateRoot) 'selection.json'
  if (-not (Test-Path -LiteralPath $selectionPath -PathType Leaf)) { return 'preset-codex-1907-deep' }
  try {
    $selection = (Read-DreamSkinUtf8File -Path $selectionPath) | ConvertFrom-Json -ErrorAction Stop
    Assert-OneClickSkinThemeId -ThemeId "$($selection.themeId)"
    $null = Get-OneClickSkinThemeDirectory -ThemeId "$($selection.themeId)"
    return "$($selection.themeId)"
  } catch {
    throw "Theme selection is unreadable; it was preserved for inspection: $selectionPath"
  }
}

function Set-OneClickSkinSelectedTheme {
  param([Parameter(Mandatory = $true)][string]$ThemeId)
  $themeDirectory = Get-OneClickSkinThemeDirectory -ThemeId $ThemeId
  $manifest = Get-OneClickSkinThemeManifest -ThemeDirectory $themeDirectory
  if ("$($manifest.id)" -cne $ThemeId) { throw "Theme directory and manifest id do not match: $ThemeId" }
  $stateRoot = Get-OneClickSkinStateRoot
  New-Item -ItemType Directory -Force -Path $stateRoot | Out-Null
  $selection = [pscustomobject]@{
    schemaVersion = 1
    themeId = $ThemeId
    updatedAt = (Get-Date).ToUniversalTime().ToString('o')
  }
  Write-DreamSkinUtf8FileAtomically -Path (Join-Path $stateRoot 'selection.json') `
    -Content (($selection | ConvertTo-Json -Depth 4) + "`r`n")
  return $themeDirectory
}

function Get-OneClickSkinThemes {
  $seen = @{}
  $result = @()
  foreach ($root in @((Join-Path (Get-OneClickSkinStateRoot) 'themes'), (Get-OneClickSkinBundledRoot))) {
    if (-not (Test-Path -LiteralPath $root -PathType Container)) { continue }
    foreach ($directory in Get-ChildItem -LiteralPath $root -Directory | Sort-Object Name) {
      if ($seen.ContainsKey($directory.Name)) { continue }
      try {
        $manifest = Get-OneClickSkinThemeManifest -ThemeDirectory $directory.FullName
        if ("$($manifest.id)" -cne $directory.Name) { continue }
        $seen[$directory.Name] = $true
        $result += [pscustomobject]@{
          Id = $directory.Name
          Name = "$($manifest.name)"
          Source = if (Test-DreamSkinPathWithin -Path $directory.FullName -Root (Get-OneClickSkinBundledRoot)) { '内置' } else { '自定义' }
          Directory = $directory.FullName
        }
      } catch {}
    }
  }
  return $result
}
