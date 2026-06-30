# fp-identify.ps1 — Identifies a probe FMD against a gallery (all static methods)
# Input (stdin): {"probe":"base64...","gallery":[{"id":1,"fmd":"base64..."},...]
# Output: {"success":true,"agent_id":N} or {"success":false,"error":"..."}

$ErrorActionPreference = "Stop"

function Out-Json($obj) {
  [Console]::Out.WriteLine(($obj | ConvertTo-Json -Compress))
  [Console]::Out.Flush()
}

try {
  Add-Type -Path "C:\Program Files\DigitalPersona\U.are.U SDK\Windows\Lib\.NET\DPUruNet.dll"

  $inputJson = [Console]::In.ReadToEnd()
  $data      = $inputJson | ConvertFrom-Json

  $probeBase64 = $data.probe
  $gallery     = $data.gallery

  if (-not $probeBase64) {
    Out-Json @{ success=$false; error="Probe FMD manquant" }
    exit 1
  }
  if ($gallery.Count -eq 0) {
    Out-Json @{ success=$false; error="Aucun agent avec empreinte enregistree" }
    exit 1
  }

  # Import probe FMD from base64 (static method)
  $probeBytes  = [Convert]::FromBase64String($probeBase64)
  $probeResult = [DPUruNet.Importer]::ImportFmd($probeBytes, [DPUruNet.Constants+Formats+Fmd]::ANSI, [DPUruNet.Constants+Formats+Fmd]::ANSI)
  if ($probeResult.ResultCode -ne [DPUruNet.Constants+ResultCode]::DP_SUCCESS) {
    Out-Json @{ success=$false; error="Import FMD sonde echoue : $($probeResult.ResultCode)" }
    exit 1
  }
  $probeFmd = $probeResult.Data

  # Build gallery
  $galleryFmds = New-Object System.Collections.Generic.List[DPUruNet.Fmd]
  $agentIds    = New-Object System.Collections.Generic.List[int]

  foreach ($entry in $gallery) {
    try {
      $bytes        = [Convert]::FromBase64String($entry.fmd)
      $importResult = [DPUruNet.Importer]::ImportFmd($bytes, [DPUruNet.Constants+Formats+Fmd]::ANSI, [DPUruNet.Constants+Formats+Fmd]::ANSI)
      if ($importResult.ResultCode -eq [DPUruNet.Constants+ResultCode]::DP_SUCCESS) {
        $galleryFmds.Add($importResult.Data)
        $agentIds.Add([int]$entry.id)
      }
    } catch {}
  }

  if ($galleryFmds.Count -eq 0) {
    Out-Json @{ success=$false; error="Aucun FMD de galerie valide" }
    exit 1
  }

  # Identify (static) — threshold 21474 ≈ 1/100 000 false match rate
  $identifyResult = [DPUruNet.Comparison]::Identify($probeFmd, 0, $galleryFmds, 21474, 1)

  if ($identifyResult.ResultCode -ne [DPUruNet.Constants+ResultCode]::DP_SUCCESS) {
    Out-Json @{ success=$false; error="Identification echouee : $($identifyResult.ResultCode)" }
    exit 1
  }

  $indexes = $identifyResult.Indexes
  if ($indexes -eq $null -or $indexes.Length -eq 0) {
    Out-Json @{ success=$false; error="Agent non reconnu" }
    exit 1
  }

  # Indexes is Int32[][] — indexes[0][0] = gallery position of first candidate
  $matchIndex     = $indexes[0][0]
  $matchedAgentId = $agentIds[$matchIndex]
  Out-Json @{ success=$true; agent_id=$matchedAgentId }

} catch {
  Out-Json @{ success=$false; error=$_.Exception.Message }
  exit 1
}
