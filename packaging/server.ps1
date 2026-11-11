# A tiny static file server for the packaged game (Windows PowerShell, nothing to install):
# serves the "game" folder next to this script on http://localhost:<port>/ and opens the browser.
param([int]$Port = 8765)

$root = Join-Path $PSScriptRoot "game"
if (-not (Test-Path $root)) { Write-Host "The 'game' folder is missing next to this script."; exit 1 }

$mime = @{
  ".html" = "text/html; charset=utf-8"; ".js" = "text/javascript; charset=utf-8"; ".mjs" = "text/javascript; charset=utf-8"
  ".css" = "text/css; charset=utf-8"; ".json" = "application/json; charset=utf-8"; ".png" = "image/png"
  ".jpg" = "image/jpeg"; ".jpeg" = "image/jpeg"; ".webp" = "image/webp"; ".svg" = "image/svg+xml"
  ".woff" = "font/woff"; ".woff2" = "font/woff2"; ".ttf" = "font/ttf"; ".wasm" = "application/wasm"
  ".mp3" = "audio/mpeg"; ".ogg" = "audio/ogg"; ".wav" = "audio/wav"; ".txt" = "text/plain; charset=utf-8"
}

$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$Port/")
try { $listener.Start() } catch {
  Write-Host "Could not listen on port $Port (is the game already running?): $($_.Exception.Message)"
  exit 1
}
$url = "http://localhost:$Port/"
Write-Host "Void Fantasy is running at $url"
Write-Host "Close this window to stop it."
if (-not $env:VOID_NO_BROWSER) { Start-Process $url }

$rootFull = [System.IO.Path]::GetFullPath($root)
while ($listener.IsListening) {
  $ctx = $listener.GetContext()
  try {
    $path = [System.Uri]::UnescapeDataString($ctx.Request.Url.AbsolutePath.TrimStart("/"))
    if ($path -eq "") { $path = "index.html" }
    $file = [System.IO.Path]::GetFullPath((Join-Path $root $path))
    # (never outside the game folder)
    if (-not $file.StartsWith($rootFull) -or -not (Test-Path $file -PathType Leaf)) {
      $ctx.Response.StatusCode = 404
    } else {
      $ext = [System.IO.Path]::GetExtension($file).ToLower()
      $ctx.Response.ContentType = if ($mime.ContainsKey($ext)) { $mime[$ext] } else { "application/octet-stream" }
      $bytes = [System.IO.File]::ReadAllBytes($file)
      $ctx.Response.ContentLength64 = $bytes.Length
      $ctx.Response.OutputStream.Write($bytes, 0, $bytes.Length)
    }
  } catch {
    $ctx.Response.StatusCode = 500
  } finally {
    $ctx.Response.Close()
  }
}
