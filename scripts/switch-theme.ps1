[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][string]$ThemeId,
  [int]$Port = 9335,
  [switch]$NoApply,
  [switch]$RestartExisting
)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'common-windows.ps1')
. (Join-Path $PSScriptRoot 'theme-library.ps1')

$operationLock = Enter-DreamSkinOperationLock
try {
  $themeDirectory = Get-OneClickSkinThemeDirectory -ThemeId $ThemeId
  $manifest = Get-OneClickSkinThemeManifest -ThemeDirectory $themeDirectory
  if ("$($manifest.id)" -cne $ThemeId) { throw "Theme directory and manifest id do not match: $ThemeId" }
  $node = Get-DreamSkinNodeRuntime
  & $node.Path (Join-Path $PSScriptRoot 'injector.mjs') --check-payload --theme-dir $themeDirectory `
    --library-dir (Join-Path (Get-OneClickSkinStateRoot) 'themes')
  if ($LASTEXITCODE -ne 0) { throw "Theme validation failed: $ThemeId" }
  $null = Set-OneClickSkinSelectedTheme -ThemeId $ThemeId
} finally {
  Exit-DreamSkinOperationLock -Mutex $operationLock
}

if ($NoApply) {
  Write-Host "Selected theme: $ThemeId"
  exit 0
}

$startArgs = @{ Port = $Port; ThemeId = $ThemeId; PromptRestart = $true }
if ($RestartExisting) { $startArgs.RestartExisting = $true; [void]$startArgs.Remove('PromptRestart') }
& (Join-Path $PSScriptRoot 'start-dream-skin.ps1') @startArgs
