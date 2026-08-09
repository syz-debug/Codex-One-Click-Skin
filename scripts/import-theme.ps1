[CmdletBinding()]
param(
  [string]$ImagePath,
  [string]$Name,
  [ValidateSet('auto', 'light', 'dark')][string]$Appearance = 'auto',
  [ValidateSet('auto', 'left', 'right', 'center', 'none')][string]$SafeArea = 'auto',
  [double]$FocusX = 0.5,
  [double]$FocusY = 0.5,
  [int]$Port = 9335,
  [switch]$NoApply
)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'common-windows.ps1')
. (Join-Path $PSScriptRoot 'theme-library.ps1')

if (-not $ImagePath) {
  Add-Type -AssemblyName System.Windows.Forms
  $dialog = New-Object System.Windows.Forms.OpenFileDialog
  $dialog.Title = '选择 Codex 皮肤图片'
  $dialog.Filter = '图片文件|*.jpg;*.jpeg;*.png;*.webp|JPEG|*.jpg;*.jpeg|PNG|*.png|WebP|*.webp'
  $dialog.Multiselect = $false
  if ($dialog.ShowDialog() -ne [System.Windows.Forms.DialogResult]::OK) {
    Write-Host 'Import cancelled.'
    exit 0
  }
  $ImagePath = $dialog.FileName
}

$ImagePath = [System.IO.Path]::GetFullPath($ImagePath)
if (-not (Test-Path -LiteralPath $ImagePath -PathType Leaf)) { throw "Image not found: $ImagePath" }
$source = Get-Item -LiteralPath $ImagePath
if ($source.Length -le 0 -or $source.Length -gt 16MB) { throw 'Image must be non-empty and no larger than 16 MB.' }
$extension = $source.Extension.ToLowerInvariant()
if ($extension -notin @('.jpg', '.jpeg', '.png', '.webp')) { throw "Unsupported image type: $extension" }
if ([double]::IsNaN($FocusX) -or [double]::IsNaN($FocusY) -or $FocusX -lt 0 -or $FocusX -gt 1 -or $FocusY -lt 0 -or $FocusY -gt 1) {
  throw 'FocusX and FocusY must be numbers between 0 and 1.'
}
if (-not $Name) { $Name = [System.IO.Path]::GetFileNameWithoutExtension($source.Name) }
$Name = "$Name".Trim()
if (-not $Name -or $Name.Length -gt 80 -or $Name -match '[\x00-\x1f]') { throw 'Theme name must contain 1 to 80 printable characters.' }

$stateRoot = Get-OneClickSkinStateRoot
$themesRoot = Join-Path $stateRoot 'themes'
New-Item -ItemType Directory -Force -Path $themesRoot | Out-Null
$themeId = 'img-{0}-{1}' -f (Get-Date -Format 'yyyyMMddHHmmss'), ([guid]::NewGuid().ToString('N').Substring(0, 8))
$themeDirectory = Join-Path $themesRoot $themeId
New-Item -ItemType Directory -Path $themeDirectory | Out-Null
$committed = $false
try {
  $imageName = "background$extension"
  Copy-Item -LiteralPath $ImagePath -Destination (Join-Path $themeDirectory $imageName) -ErrorAction Stop
  $manifest = [ordered]@{
    schemaVersion = 1
    id = $themeId
    name = $Name
    mode = 'classic'
    brandSubtitle = 'CODEX ONE-CLICK SKIN'
    tagline = 'Make something wonderful.'
    projectPrefix = '选择项目 · '
    projectLabel = '◉  选择项目'
    statusText = 'ONE-CLICK SKIN ONLINE'
    quote = 'CODEX 2026'
    image = $imageName
    appearance = $Appearance
    art = [ordered]@{ focusX = $FocusX; focusY = $FocusY; safeArea = $SafeArea; taskMode = 'auto' }
    colors = [ordered]@{}
    explicitColorKeys = @()
  }
  Write-DreamSkinUtf8FileAtomically -Path (Join-Path $themeDirectory 'theme.json') `
    -Content (($manifest | ConvertTo-Json -Depth 8) + "`r`n")
  $node = Get-DreamSkinNodeRuntime
  & $node.Path (Join-Path $PSScriptRoot 'injector.mjs') --check-payload --theme-dir $themeDirectory `
    --library-dir $themesRoot
  if ($LASTEXITCODE -ne 0) { throw 'Imported image failed theme validation.' }
  $null = Set-OneClickSkinSelectedTheme -ThemeId $themeId
  $committed = $true
} finally {
  if (-not $committed -and (Test-DreamSkinPathWithin -Path $themeDirectory -Root $themesRoot)) {
    Remove-Item -LiteralPath $themeDirectory -Recurse -Force -ErrorAction SilentlyContinue
  }
}

Write-Host "Imported theme: $Name ($themeId)"
if (-not $NoApply) {
  & (Join-Path $PSScriptRoot 'start-dream-skin.ps1') -Port $Port -ThemeId $themeId -PromptRestart
}
