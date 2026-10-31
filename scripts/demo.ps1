<#
.SYNOPSIS
  Run the SETU backend against an isolated, reproducible demo event log.

.DESCRIPTION
  The live evidence log at packages/server/data/log.jsonl is never modified.
  'reset' starts the backend with SETU_LOG_DIR pointed at packages/server/data/demo
  and archives any previous demo log under data/backups before clearing it.
  'seed' submits the demo flood at the synthetic bridge and verifies the
  flood -> blocked bridge -> cut-off settlement -> refused route chain.
  'restore' stops the demo backend and brings the live evidence log back on 8080.

.EXAMPLE
  .\scripts\demo.ps1 -Action reset
  .\scripts\demo.ps1 -Action seed
  .\scripts\demo.ps1 -Action status
  .\scripts\demo.ps1 -Action restore
#>
[CmdletBinding()]
param(
  [ValidateSet('reset', 'seed', 'status', 'restore')]
  [string]$Action = 'status',

  [string]$DemoDir,

  [int]$Port = 8080,

  [switch]$Force
)

$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
$serverDir = Join-Path $root 'packages\server'
$dataDir = Join-Path $serverDir 'data'
$backupDir = Join-Path $dataDir 'backups'
if (-not $DemoDir) { $DemoDir = Join-Path $dataDir 'demo' }

$dataFull = [IO.Path]::GetFullPath($dataDir)
$demoFull = [IO.Path]::GetFullPath($DemoDir)
$backupFull = [IO.Path]::GetFullPath($backupDir)

if (-not $demoFull.StartsWith($dataFull, [StringComparison]::OrdinalIgnoreCase)) {
  throw "DemoDir must live under $dataFull (got $demoFull). Refusing to touch anything else."
}
if ($demoFull -eq $dataFull -or $demoFull -eq $backupFull) {
  throw "DemoDir must be a dedicated subdirectory, not $demoFull."
}

$baseUrl = "http://localhost:$Port"

function Get-Health {
  try {
    Invoke-RestMethod -Uri "$baseUrl/api/v1/health" -TimeoutSec 3
  } catch {
    $null
  }
}

function Wait-Healthy {
  for ($i = 0; $i -lt 40; $i++) {
    $h = Get-Health
    if ($h -and $h.ok) { return $h }
    Start-Sleep -Milliseconds 500
  }
  throw "Backend did not become healthy on $baseUrl. See $serverDir\server.out.log"
}

function Stop-DemoBackend {
  # Scope termination strictly to the selected port. Never kill every SETU
  # src/run.ts process: a separate demo/test port must not terminate the live
  # canonical demo backend.
  $pids = @(Get-NetTCPConnection -LocalPort $Port -ErrorAction SilentlyContinue |
    Select-Object -ExpandProperty OwningProcess -Unique) |
    Where-Object { $_ -and $_ -gt 0 } | Select-Object -Unique

  # Get-NetTCPConnection can omit a Node listener briefly; use netstat only as
  # a port-scoped fallback, never as a global process search.
  if (-not $pids) {
    $pids = @(netstat -ano | Select-String (":$Port\s") | ForEach-Object {
      $parts = ($_.Line.Trim() -split '\s+')
      if ($parts.Count -ge 5) { $parts[-1] }
    }) | Where-Object { $_ -and $_ -match '^\d+$' -and $_ -gt 0 } | Select-Object -Unique
  }
  if (-not $pids) { return }
  foreach ($procId in $pids) {
    if ($procId -gt 0) { taskkill /PID $procId /T /F 2>$null | Out-Null }
  }
  for ($i = 0; $i -lt 30; $i++) {
    if (-not (Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue)) { return }
    Start-Sleep -Milliseconds 500
  }
  throw "Port $Port is still in use."
}

function Start-DemoBackend([string]$LogDir) {
  New-Item -ItemType Directory -Path $LogDir -Force | Out-Null
  # Set variables inside cmd explicitly; this avoids relying on the parent
  # PowerShell environment when Start-Process creates the detached server.
  $startCommand = 'set "SETU_LOG_DIR={0}" && set "SETU_PORT={1}" && node_modules\.bin\tsx.cmd src/run.ts > server.out.log 2>&1' -f $LogDir, $Port
  Start-Process -FilePath 'C:\windows\system32\cmd.exe' `
    -ArgumentList '/c', $startCommand `
    -WorkingDirectory $serverDir -WindowStyle Hidden
  return Wait-Healthy
}

function Get-Snapshot {
  Invoke-RestMethod -Uri "$baseUrl/api/v1/projections" -TimeoutSec 10
}

function Get-DemoState {
  $health = Get-Health
  if (-not $health) { return [pscustomobject]@{ running = $false; port = $Port } }
  $snapshot = Get-Snapshot
  $bridge = $snapshot.roads.features | Where-Object { $_.properties.roadId -eq 'syn-bridge-1' }
  $settlement = $snapshot.settlements.features | Where-Object { $_.properties.settlementId -eq 'syn-settlement-1' }
  $route = $snapshot.routes.features | Where-Object { $_.properties.routeId -eq 'syn-evac-1' }
  [pscustomobject]@{
    running = $true
    port = $Port
    eventCount = $health.eventCount
    projectionVersion = $health.projectionVersion
    bridge = $bridge.properties.status
    settlement = $settlement.properties.accessibility
    route = $route.properties.status
    refusal = $route.properties.refusal
  }
}

switch ($Action) {
  'reset' {
    Stop-DemoBackend
    New-Item -ItemType Directory -Path $DemoDir -Force | Out-Null
    $logPath = Join-Path $DemoDir 'log.jsonl'
    if (Test-Path $logPath) {
      New-Item -ItemType Directory -Path $backupDir -Force | Out-Null
      $stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
      $backup = Join-Path $backupDir "demo-log-$stamp.jsonl"
      Copy-Item $logPath $backup
      Remove-Item $logPath
      Write-Output "Archived previous demo log: $backup"
    }
    $health = Start-DemoBackend $DemoDir
    $state = Get-DemoState
    if ($health.eventCount -ne 0 -or $health.projectionVersion -ne 0) {
      throw "Demo log is not clean: eventCount=$($health.eventCount), version=$($health.projectionVersion)"
    }
    # With no observation yet, the projection deliberately reports the bridge
    # as unknown rather than inventing an open/passable claim. The synthetic
    # route is still active until the first flood report is applied.
    if ($state.bridge -ne 'unknown' -or $state.settlement -ne 'accessible' -or $state.route -ne 'active') {
      throw "Unexpected initial demo state: bridge=$($state.bridge), settlement=$($state.settlement), route=$($state.route)"
    }
    Write-Output "DEMO_READY logDir=$DemoDir"
    $state | ConvertTo-Json -Depth 8
  }

  'seed' {
    $health = Wait-Healthy
    if ($health.eventCount -gt 0 -and -not $Force) {
      throw "Demo log already has $($health.eventCount) event(s). Run -Action reset first, or pass -Force to add another."
    }

    $clientEventId = [guid]::NewGuid().ToString()
    $payload = @{
      events = @(
        @{
          clientEventId = $clientEventId
          type = 'flood_report'
          occurredAt = (Get-Date).ToUniversalTime().ToString('o')
          reporterId = 'demo-field-01'
          deviceId = 'demo-device-01'
          location = @{ lat = 26.8005; lng = 94.5005; accuracyM = 10 }
          severity = 3
          depthCm = 50
        }
      )
    } | ConvertTo-Json -Depth 10

    $first = Invoke-RestMethod -Uri "$baseUrl/api/v1/events:batch" -Method Post `
      -ContentType 'application/json' -Body $payload -TimeoutSec 30
    $ack = $first.acks[0]
    if ($ack.result -ne 'accepted') {
      throw "Demo flood was not accepted: $($ack | ConvertTo-Json -Compress -Depth 6)"
    }

    # Idempotency check: the exact same submission must return the same event id.
    $second = Invoke-RestMethod -Uri "$baseUrl/api/v1/events:batch" -Method Post `
      -ContentType 'application/json' -Body $payload -TimeoutSec 30
    $duplicate = $second.acks[0]
    if ($duplicate.eventId -ne $ack.eventId) {
      throw "Duplicate submission produced a different event id: $($ack.eventId) vs $($duplicate.eventId)"
    }

    $state = Get-DemoState
    if ($state.bridge -ne 'blocked') { throw "Bridge did not become blocked (got $($state.bridge))" }
    if ($state.settlement -ne 'cut_off') { throw "Settlement did not become cut off (got $($state.settlement))" }
    if ($state.route -ne 'unavailable') { throw "Route did not become unavailable (got $($state.route))" }
    if (-not $state.refusal -or $state.refusal.blockingFeatureIds -notcontains 'syn-bridge-1') {
      throw "Route refusal did not identify syn-bridge-1: $($state.refusal | ConvertTo-Json -Compress -Depth 6)"
    }

    $evidence = [pscustomobject]@{
      clientEventId = $clientEventId
      eventId = $ack.eventId
      acceptedAtVersion = $ack.acceptedAtVersion
      duplicateResult = $duplicate.result
      duplicateEventId = $duplicate.eventId
      eventCount = $state.eventCount
      projectionVersion = $state.projectionVersion
      bridge = $state.bridge
      settlement = $state.settlement
      route = $state.route
      refusal = $state.refusal
      verifiedAt = (Get-Date).ToUniversalTime().ToString('o')
    }
    $evidencePath = Join-Path $DemoDir 'demo-verification.json'
    $evidence | ConvertTo-Json -Depth 10 | Set-Content -Path $evidencePath -Encoding utf8
    Write-Output "DEMO_VERIFIED evidence=$evidencePath"
    $evidence | ConvertTo-Json -Depth 10
  }

  'status' {
    $state = Get-DemoState
    $state | ConvertTo-Json -Depth 10
  }

  'restore' {
    Stop-DemoBackend
    $health = Start-DemoBackend $dataDir
    Write-Output "LIVE_LOG_RESTORED logDir=$dataDir"
    $health | ConvertTo-Json -Depth 6
  }
}
