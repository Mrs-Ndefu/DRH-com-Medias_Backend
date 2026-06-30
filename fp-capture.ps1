# fp-capture.ps1 — Captures ONE fingerprint and outputs FMD as base64 JSON
# Output: {"success":true,"fmd":"base64..."} or {"success":false,"error":"..."}
param(
  [int]$Timeout = 30000
)

try {
  Add-Type -Path "C:\Program Files\DigitalPersona\U.are.U SDK\Windows\Lib\.NET\DPUruNet.dll" -ErrorAction Stop

  $readers = [DPUruNet.ReaderCollection]::GetReaders()
  if ($readers.Count -eq 0) {
    Write-Output '{"success":false,"error":"Aucun lecteur biometrique detecte"}'
    exit 1
  }

  $reader = $readers[0]
  $openResult = $reader.Open([DPUruNet.Constants+CapturePriority]::DP_PRIORITY_EXCLUSIVE)
  if ($openResult -ne [DPUruNet.Constants+ResultCode]::DP_SUCCESS) {
    Write-Output "{`"success`":false,`"error`":`"Impossible d ouvrir le lecteur : $openResult`"}"
    exit 1
  }

  $captureResult = $reader.Capture(
    [DPUruNet.Constants+Formats+Fid]::ANSI,
    [DPUruNet.Constants+CaptureProcessing]::DP_IMG_PROC_DEFAULT,
    $Timeout,
    500
  )
  try { $reader.Dispose() } catch {}

  if ($captureResult.ResultCode -ne [DPUruNet.Constants+ResultCode]::DP_SUCCESS) {
    Write-Output "{`"success`":false,`"error`":`"Capture echouee : $($captureResult.ResultCode)`"}"
    exit 1
  }
  if ($captureResult.Quality -ne [DPUruNet.Constants+CaptureQuality]::DP_QUALITY_GOOD) {
    Write-Output "{`"success`":false,`"quality`":`"$($captureResult.Quality)`",`"error`":`"Qualite insuffisante`"}"
    exit 1
  }

  # Static method call
  $fmdResult = [DPUruNet.FeatureExtraction]::CreateFmdFromFid($captureResult.Data, [DPUruNet.Constants+Formats+Fmd]::ANSI)
  if ($fmdResult.ResultCode -ne [DPUruNet.Constants+ResultCode]::DP_SUCCESS) {
    Write-Output "{`"success`":false,`"error`":`"Extraction FMD echouee : $($fmdResult.ResultCode)`"}"
    exit 1
  }

  $fmdBase64 = [Convert]::ToBase64String($fmdResult.Data.Bytes)
  Write-Output "{`"success`":true,`"fmd`":`"$fmdBase64`"}"

} catch {
  $msg = $_.Exception.Message -replace '"', "'"
  Write-Output "{`"success`":false,`"error`":`"$msg`"}"
  exit 1
}
