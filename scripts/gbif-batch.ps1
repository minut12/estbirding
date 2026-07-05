param(
  [string]$Mode = "backfill",
  [int]$Offset = 0,
  [int]$BatchSize = 25,
  [int]$PageCap = 10
)
$ErrorActionPreference = "Stop"

# Secret resolution: prefer the env var (so A1b automation can set it), else
# prompt securely. Hidden input never lands in a $env: line or PSReadLine history.
$secret = $env:VAATLUSTE_WEBHOOK_SECRET
if (-not $secret) {
  $sec = Read-Host -AsSecureString "Enter VAATLUSTE_WEBHOOK_SECRET (hidden; from Supabase -> Edge Functions -> Secrets)"
  $secret = [Runtime.InteropServices.Marshal]::PtrToStringAuto(
    [Runtime.InteropServices.Marshal]::SecureStringToBSTR($sec))
}
if (-not $secret) { Write-Error "No secret provided."; exit 1 }

$uri  = "https://eenwcyuyugyrjgpivxrq.supabase.co/functions/v1/gbif-bulk-refresh"
$body = @{ mode = $Mode; offset = $Offset; batch_size = $BatchSize; page_cap = $PageCap } | ConvertTo-Json -Compress
Write-Host "POST $uri  mode=$Mode offset=$Offset batch_size=$BatchSize page_cap=$PageCap"

try {
  $resp = Invoke-RestMethod -Method Post -Uri $uri `
    -Headers @{ "x-webhook-secret" = $secret } `
    -ContentType "application/json" -Body $body
  $resp | ConvertTo-Json -Depth 6
}
catch {
  $status = if ($_.Exception.Response) { [int]$_.Exception.Response.StatusCode } else { "n/a" }
  $detail = $_.ErrorDetails.Message
  if (-not $detail -and $_.Exception.Response) {
    $detail = (New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())).ReadToEnd()
  }
  Write-Host "HTTP $status"
  if ($detail) { Write-Host $detail }
}
