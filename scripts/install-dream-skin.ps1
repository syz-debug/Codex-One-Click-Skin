[CmdletBinding()]
param(
  [int]$Port = 9335,
  [switch]$NoShortcuts
)

$ErrorActionPreference = 'Stop'
$PortExplicit = $PSBoundParameters.ContainsKey('Port')
$SkillRoot = Split-Path -Parent $PSScriptRoot
. (Join-Path $PSScriptRoot 'common-windows.ps1')
. (Join-Path $PSScriptRoot 'theme-library.ps1')

$operationLock = Enter-DreamSkinOperationLock
try {
  Assert-DreamSkinPort -Port $Port
  $node = Get-DreamSkinNodeRuntime
  $registeredInstalls = @(Get-DreamSkinRegisteredCodexInstalls)
  if ($registeredInstalls.Count -eq 0) {
    throw 'The official OpenAI.Codex Store package is not installed or its identity cannot be validated.'
  }
  foreach ($registeredCodex in $registeredInstalls) {
    if ((Get-DreamSkinCodexProcesses -Codex $registeredCodex).Count -gt 0) {
      throw 'Close Codex before installing Dream Skin so config.toml cannot change during the transaction.'
    }
  }

  $legacyRoot = Join-Path $env:LOCALAPPDATA 'CodexQQ2007'
  if ((Test-Path -LiteralPath (Join-Path $legacyRoot 'state.json')) -or
    (Test-Path -LiteralPath (Join-Path $legacyRoot 'config.before-dream-skin.toml'))) {
    throw 'A previous Codex QQ 2007 installation still has active state or a config backup. Restore it with its original restore script before installing Codex One-Click Skin.'
  }

  $StateRoot = Get-OneClickSkinStateRoot
  $StatePath = Join-Path $StateRoot 'state.json'
  $existingState = Read-DreamSkinState -Path $StatePath
  $savedPathCandidate = Get-DreamSkinCodexStatePathCandidate -State $existingState
  $savedCodex = Resolve-DreamSkinCodexInstallFromState -State $existingState -RegisteredInstalls $registeredInstalls
  if ($null -ne $savedPathCandidate -and $null -eq $savedCodex -and
    (Get-DreamSkinCodexProcesses -Codex $savedPathCandidate).Count -gt 0) {
    throw 'The saved Codex path is still running but no longer matches a registered Store package. Close it manually before installing.'
  }
  New-Item -ItemType Directory -Force -Path $StateRoot | Out-Null
  $selectedThemeId = Get-OneClickSkinSelectedThemeId
  $null = Set-OneClickSkinSelectedTheme -ThemeId $selectedThemeId
  foreach ($theme in Get-OneClickSkinThemes) {
    & $node.Path (Join-Path $PSScriptRoot 'injector.mjs') --check-payload --theme-dir $theme.Directory `
      --library-dir (Join-Path $StateRoot 'themes') *> $null
    if ($LASTEXITCODE -ne 0) { throw "Bundled theme validation failed: $($theme.Id)" }
  }
  $ConfigPath = Join-Path $HOME '.codex\config.toml'
  $BackupPath = Join-Path $StateRoot 'config.before-dream-skin.toml'
  Install-DreamSkinBaseTheme -ConfigPath $ConfigPath -BackupPath $BackupPath

  if (-not $NoShortcuts) {
    $shell = New-Object -ComObject WScript.Shell
    $desktop = [Environment]::GetFolderPath('Desktop')
    $startMenu = Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs'
    $powershell = (Get-Command powershell.exe -ErrorAction Stop).Source
    $startScript = Join-Path $PSScriptRoot 'start-dream-skin.ps1'
    $pickerScript = Join-Path $PSScriptRoot 'theme-picker.ps1'
    $restoreScript = Join-Path $PSScriptRoot 'restore-dream-skin.ps1'
    $portArgument = if ($PortExplicit) { " -Port $Port" } else { '' }

    foreach ($folder in @($desktop, $startMenu)) {
      $shortcut = $shell.CreateShortcut((Join-Path $folder 'Codex 一键换肤 - 启动.lnk'))
      $shortcut.TargetPath = $powershell
      $shortcut.Arguments = "-NoProfile -ExecutionPolicy Bypass -File `"$startScript`"$portArgument -PromptRestart"
      $shortcut.WorkingDirectory = $SkillRoot
      $shortcut.Description = 'Launch the official Codex app with the selected interactive skin'
      $shortcut.Save()

      $picker = $shell.CreateShortcut((Join-Path $folder 'Codex 一键换肤.lnk'))
      $picker.TargetPath = $powershell
      $picker.Arguments = "-NoProfile -ExecutionPolicy Bypass -File `"$pickerScript`"$portArgument"
      $picker.WorkingDirectory = $SkillRoot
      $picker.Description = 'Choose, import, and apply a Codex skin'
      $picker.Save()
    }

    $restore = $shell.CreateShortcut((Join-Path $desktop 'Codex 一键换肤 - 恢复原生.lnk'))
    $restore.TargetPath = $powershell
    $restore.Arguments = "-NoProfile -ExecutionPolicy Bypass -File `"$restoreScript`"$portArgument -RestoreBaseTheme -PromptRestart"
    $restore.WorkingDirectory = $SkillRoot
    $restore.Description = 'Restore the official Codex appearance and close the skin session'
    $restore.Save()
  }

  if ($NoShortcuts) {
    Write-Host 'Codex One-Click Skin installed without shortcuts. Run start-dream-skin.ps1 to launch it.'
  } else {
    Write-Host 'Codex One-Click Skin installed. Use the desktop picker to select or import a theme.'
  }
} finally {
  Exit-DreamSkinOperationLock -Mutex $operationLock
}
