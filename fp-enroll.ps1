# fp-enroll.ps1 — Captures multiple fingerprints and creates an enrollment FMD
# Streams JSON lines: progress/waiting/retry/enrolled/error events
param(
  [int]$NbCaptures = 4,
  [int]$Timeout    = 30000
)

$ErrorActionPreference = "Stop"

function Out-Json($obj) {
  $json = $obj | ConvertTo-Json -Compress
  [Console]::Out.WriteLine($json)
  [Console]::Out.Flush()
}

try {
  Add-Type -Path "C:\Program Files\DigitalPersona\U.are.U SDK\Windows\Lib\.NET\DPUruNet.dll"

  $readers = [DPUruNet.ReaderCollection]::GetReaders()
  if ($readers.Count -eq 0) {
    Out-Json @{ type="error"; message="Aucun lecteur biometrique detecte" }
    exit 1
  }

  $reader = $readers[0]
  $openResult = $reader.Open([DPUruNet.Constants+CapturePriority]::DP_PRIORITY_EXCLUSIVE)
  if ($openResult -ne [DPUruNet.Constants+ResultCode]::DP_SUCCESS) {
    Out-Json @{ type="error"; message="Impossible d'ouvrir le lecteur : $openResult" }
    exit 1
  }

  $fmds  = New-Object System.Collections.Generic.List[DPUruNet.Fmd]
  $count = 0

  while ($count -lt $NbCaptures) {
    Out-Json @{ type="waiting"; count=$count; total=$NbCaptures }

    $captureResult = $reader.Capture(
      [DPUruNet.Constants+Formats+Fid]::ANSI,
      [DPUruNet.Constants+CaptureProcessing]::DP_IMG_PROC_DEFAULT,
      $Timeout,
      500
    )

    if ($captureResult.ResultCode -ne [DPUruNet.Constants+ResultCode]::DP_SUCCESS) {
      Out-Json @{ type="error"; message="Capture echouee : $($captureResult.ResultCode)" }
      try { $reader.Dispose() } catch {}
      exit 1
    }

    if ($captureResult.Quality -ne [DPUruNet.Constants+CaptureQuality]::DP_QUALITY_GOOD) {
      Out-Json @{ type="retry"; quality="$($captureResult.Quality)"; message="Qualite insuffisante, reessayez" }
      continue
    }

    $fmdResult = [DPUruNet.FeatureExtraction]::CreateFmdFromFid($captureResult.Data, [DPUruNet.Constants+Formats+Fmd]::ANSI)
    if ($fmdResult.ResultCode -ne [DPUruNet.Constants+ResultCode]::DP_SUCCESS) {
      Out-Json @{ type="retry"; message="Extraction FMD echouee, reessayez" }
      continue
    }

    $fmds.Add($fmdResult.Data)
    $count++
    Out-Json @{ type="progress"; count=$count; total=$NbCaptures }
  }

  try { $reader.Dispose() } catch {}

  # CreateEnrollmentFmd is static
  $enrollResult = [DPUruNet.Enrollment]::CreateEnrollmentFmd([DPUruNet.Constants+Formats+Fmd]::ANSI, $fmds)

  if ($enrollResult.ResultCode -ne [DPUruNet.Constants+ResultCode]::DP_SUCCESS) {
    Out-Json @{ type="error"; message="Creation enrollment FMD echouee : $($enrollResult.ResultCode)" }
    exit 1
  }

  $fmdBase64 = [Convert]::ToBase64String($enrollResult.Data.Bytes)
  Out-Json @{ type="enrolled"; fmd=$fmdBase64 }

} catch {
  $msg = $_.Exception.Message
  Out-Json @{ type="error"; message=$msg }
  exit 1
}
