# Compiles Injector.cs in memory and hands stdin to it. Started by windows.js.
$ErrorActionPreference = 'Stop'
$source = Get-Content -Raw -LiteralPath (Join-Path $PSScriptRoot 'Injector.cs')
Add-Type -TypeDefinition $source -Language CSharp
[Thock.Injector]::Run()
