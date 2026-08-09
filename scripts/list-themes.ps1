[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'common-windows.ps1')
. (Join-Path $PSScriptRoot 'theme-library.ps1')

$active = Get-OneClickSkinSelectedThemeId
Get-OneClickSkinThemes | Select-Object @{ Name = 'Active'; Expression = { if ($_.Id -ceq $active) { '*' } else { '' } } }, Name, Id, Source
