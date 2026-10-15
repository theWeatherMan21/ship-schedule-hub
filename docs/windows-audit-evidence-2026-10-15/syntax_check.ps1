param([Parameter(Mandatory=$true)][string]$Path)
$t = $null; $e = $null
[void][System.Management.Automation.Language.Parser]::ParseFile($Path, [ref]$t, [ref]$e)
if (-not $e -or $e.Count -eq 0) { Write-Output 'SYNTAX OK' } else { foreach ($x in $e) { Write-Output ("L" + $x.Extent.StartLineNumber + " C" + $x.Extent.StartColumnNumber + " :: " + $x.Message) } }
