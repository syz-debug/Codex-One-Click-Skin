[CmdletBinding()]
param([int]$Port = 9335)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'common-windows.ps1')
. (Join-Path $PSScriptRoot 'theme-library.ps1')
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

$themes = @(Get-OneClickSkinThemes)
$active = Get-OneClickSkinSelectedThemeId
$form = New-Object System.Windows.Forms.Form
$form.Text = 'Codex 一键换肤'
$form.StartPosition = 'CenterScreen'
$form.ClientSize = New-Object System.Drawing.Size(520, 330)
$form.FormBorderStyle = 'FixedDialog'
$form.MaximizeBox = $false
$form.MinimizeBox = $false
$form.Font = New-Object System.Drawing.Font('Microsoft YaHei UI', 10)

$title = New-Object System.Windows.Forms.Label
$title.Text = '选择皮肤'
$title.Location = New-Object System.Drawing.Point(22, 18)
$title.Size = New-Object System.Drawing.Size(460, 28)
$title.Font = New-Object System.Drawing.Font('Microsoft YaHei UI', 14, [System.Drawing.FontStyle]::Bold)
$form.Controls.Add($title)

$list = New-Object System.Windows.Forms.ListBox
$list.Location = New-Object System.Drawing.Point(22, 55)
$list.Size = New-Object System.Drawing.Size(476, 190)
$list.DisplayMember = 'DisplayName'
foreach ($theme in $themes) {
  $list.Items.Add([pscustomobject]@{ DisplayName = "$($theme.Name)  [$($theme.Source)]"; Id = $theme.Id }) | Out-Null
  if ($theme.Id -ceq $active) { $list.SelectedIndex = $list.Items.Count - 1 }
}
if ($list.SelectedIndex -lt 0 -and $list.Items.Count -gt 0) { $list.SelectedIndex = 0 }
$form.Controls.Add($list)

$apply = New-Object System.Windows.Forms.Button
$apply.Text = '应用所选皮肤'
$apply.Location = New-Object System.Drawing.Point(22, 265)
$apply.Size = New-Object System.Drawing.Size(140, 38)
$apply.Add_Click({
  if ($null -eq $list.SelectedItem) { return }
  $form.Hide()
  try { & (Join-Path $PSScriptRoot 'switch-theme.ps1') -ThemeId $list.SelectedItem.Id -Port $Port }
  catch { [System.Windows.Forms.MessageBox]::Show($_.Exception.Message, '换肤失败', 'OK', 'Error') | Out-Null }
  $form.Close()
})
$form.Controls.Add($apply)

$import = New-Object System.Windows.Forms.Button
$import.Text = '导入图片'
$import.Location = New-Object System.Drawing.Point(174, 265)
$import.Size = New-Object System.Drawing.Size(140, 38)
$import.Add_Click({
  $form.Hide()
  try { & (Join-Path $PSScriptRoot 'import-theme.ps1') -Port $Port }
  catch { [System.Windows.Forms.MessageBox]::Show($_.Exception.Message, '导入失败', 'OK', 'Error') | Out-Null }
  $form.Close()
})
$form.Controls.Add($import)

$official = New-Object System.Windows.Forms.Button
$official.Text = '恢复 Codex 原生'
$official.Location = New-Object System.Drawing.Point(326, 265)
$official.Size = New-Object System.Drawing.Size(172, 38)
$official.Add_Click({
  $form.Hide()
  try { & (Join-Path $PSScriptRoot 'restore-dream-skin.ps1') -Port $Port -RestoreBaseTheme -PromptRestart }
  catch { [System.Windows.Forms.MessageBox]::Show($_.Exception.Message, '恢复失败', 'OK', 'Error') | Out-Null }
  $form.Close()
})
$form.Controls.Add($official)

[void]$form.ShowDialog()
