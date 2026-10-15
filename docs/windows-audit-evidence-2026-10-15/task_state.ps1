param([Parameter(Mandatory=$true)][string]$Name)
$t = Get-ScheduledTask -TaskName $Name -ErrorAction SilentlyContinue
if ($t) { $i = $t | Get-ScheduledTaskInfo; Write-Output ('state=' + $t.State + ' lastResult=' + $i.LastTaskResult + ' lastRun=' + $i.LastRunTime) } else { Write-Output 'not-found' }
