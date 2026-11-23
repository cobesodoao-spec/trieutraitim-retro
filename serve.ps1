$port = 8123
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$uploadsDir = Join-Path $root "uploads"
$dbFile = Join-Path $root "site-db.json"
$legacyDbFile = Join-Path (Join-Path $root "data") "site-db.json"

if ((-not (Test-Path $dbFile)) -and (Test-Path $legacyDbFile)) {
  Copy-Item -Force $legacyDbFile $dbFile
}
if (-not (Test-Path $uploadsDir)) { New-Item -ItemType Directory -Force -Path $uploadsDir | Out-Null }

$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://127.0.0.1:$port/")
$listener.Start()
Write-Host "Serving Triệu Trái Tim Retro + Admin API at http://127.0.0.1:$port/"
Write-Host "Admin CP URL: http://127.0.0.1:$port/admin.html"

$mimeTypes = @{
  ".html" = "text/html; charset=utf-8"
  ".css"  = "text/css; charset=utf-8"
  ".js"   = "application/javascript; charset=utf-8"
  ".json" = "application/json; charset=utf-8"
  ".png"  = "image/png"
  ".jpg"  = "image/jpeg"
  ".jpeg" = "image/jpeg"
  ".gif"  = "image/gif"
  ".svg"  = "image/svg+xml"
  ".ico"  = "image/x-icon"
  ".mp3"  = "audio/mpeg"
  ".wav"  = "audio/wav"
  ".ogg"  = "audio/ogg"
  ".m4a"  = "audio/mp4"
  ".aac"  = "audio/aac"
  ".flac" = "audio/flac"
}

function Send-JsonResponse($response, [int]$statusCode, [string]$jsonText) {
  $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
  $bytes = $utf8NoBom.GetBytes($jsonText)
  $response.StatusCode = $statusCode
  $response.ContentType = "application/json; charset=utf-8"
  $response.Headers["Cache-Control"] = "no-store"
  $response.ContentLength64 = $bytes.Length
  $response.OutputStream.Write($bytes, 0, $bytes.Length)
}

function Get-QueryParam($url, [string]$key) {
  $q = $url.Query
  if ([string]::IsNullOrEmpty($q)) { return "" }
  $trimmed = $q.TrimStart("?")
  foreach ($pair in ($trimmed -split "&")) {
    if ([string]::IsNullOrEmpty($pair)) { continue }
    $kv = $pair -split "=", 2
    if ([Uri]::UnescapeDataString($kv[0]) -eq $key) {
      if ($kv.Length -gt 1) { return [Uri]::UnescapeDataString($kv[1]) }
      return ""
    }
  }
  return ""
}

function Sanitize-FileName([string]$rawName) {
  if ([string]::IsNullOrWhiteSpace($rawName)) { return "track.mp3" }
  $base = [System.IO.Path]::GetFileName($rawName)
  $ext = [System.IO.Path]::GetExtension($base).ToLowerInvariant()
  $allowed = @(".mp3", ".wav", ".ogg", ".m4a", ".aac", ".flac")
  if ($allowed -notcontains $ext) { $ext = ".mp3" }
  $stem = [System.IO.Path]::GetFileNameWithoutExtension($base)
  # Giữ ký tự chữ/số/khoảng trắng cơ bản và thay ký tự lạ bằng dấu gạch ngang
  $cleanStem = [regex]::Replace($stem, '[^\p{L}\p{N}\s\-_]', '')
  $cleanStem = [regex]::Replace($cleanStem.Trim(), '\s+', '-')
  if ([string]::IsNullOrWhiteSpace($cleanStem)) { $cleanStem = "nhac-xua" }
  if ($cleanStem.Length -gt 60) { $cleanStem = $cleanStem.Substring(0, 60) }
  $stamp = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
  return "$stamp-$cleanStem$ext"
}

try {
  while ($listener.IsListening) {
    $ctx = $listener.GetContext()
    try {
      $req = $ctx.Request
      $res = $ctx.Response
      $method = $req.HttpMethod.ToUpperInvariant()
      $localPath = [Uri]::UnescapeDataString($req.Url.LocalPath)

      # ==================== API ROUTES ====================
      if ($localPath -eq "/api/ping") {
        Send-JsonResponse $res 200 '{"ok":true}'
        $res.OutputStream.Close()
        continue
      }

      if ($localPath -eq "/api/data" -and $method -eq "GET") {
        if (Test-Path $dbFile -PathType Leaf) {
          $utf8 = New-Object System.Text.UTF8Encoding($false)
          $rawJson = [System.IO.File]::ReadAllText($dbFile, $utf8)
          Send-JsonResponse $res 200 ("{""initialized"":true,""db"":" + $rawJson + "}")
        } else {
          Send-JsonResponse $res 200 '{"initialized":false,"db":null}'
        }
        $res.OutputStream.Close()
        continue
      }

      if ($localPath -eq "/api/data" -and $method -eq "POST") {
        $utf8 = New-Object System.Text.UTF8Encoding($false)
        $reader = New-Object System.IO.StreamReader($req.InputStream, $utf8)
        $bodyText = $reader.ReadToEnd()
        $reader.Close()

        # Kiểm tra JSON hợp lệ trước khi ghi
        $null = $bodyText | ConvertFrom-Json
        [System.IO.File]::WriteAllText($dbFile, $bodyText, $utf8)
        Send-JsonResponse $res 200 '{"ok":true}'
        $res.OutputStream.Close()
        continue
      }

      if ($localPath -eq "/api/upload-mp3" -and $method -eq "POST") {
        $origName = Get-QueryParam $req.Url "filename"
        $safeFile = Sanitize-FileName $origName
        $destPath = Join-Path $uploadsDir $safeFile

        $fs = [System.IO.File]::Create($destPath)
        try {
          $req.InputStream.CopyTo($fs)
        } finally {
          $fs.Close()
        }

        $relUrl = "uploads/$safeFile"
        $payload = @{
          ok       = $true
          url      = $relUrl
          filename = $safeFile
        } | ConvertTo-Json -Compress
        Send-JsonResponse $res 200 $payload
        $res.OutputStream.Close()
        continue
      }

      if ($localPath -eq "/api/upload-mp3" -and $method -eq "DELETE") {
        $relFile = Get-QueryParam $req.Url "file"
        if ($relFile -and $relFile.StartsWith("uploads/")) {
          $onlyName = [System.IO.Path]::GetFileName($relFile)
          $target = Join-Path $uploadsDir $onlyName
          if (Test-Path $target -PathType Leaf) {
            Remove-Item -Force $target
          }
        }
        Send-JsonResponse $res 200 '{"ok":true}'
        $res.OutputStream.Close()
        continue
      }

      if ($localPath -eq "/api/uploads-list" -and $method -eq "GET") {
        $files = Get-ChildItem -Path $uploadsDir -File | Sort-Object LastWriteTime -Descending
        $items = @()
        foreach ($f in $files) {
          $items += @{
            filename = $f.Name
            url      = "uploads/" + $f.Name
            size     = $f.Length
            modified = $f.LastWriteTime.ToString("yyyy-MM-dd HH:mm:ss")
          }
        }
        $payload = @{ ok = $true; files = $items } | ConvertTo-Json -Compress -Depth 4
        Send-JsonResponse $res 200 $payload
        $res.OutputStream.Close()
        continue
      }

      # ==================== STATIC FILE + RANGE STREAMING ====================
      $reqRel = $localPath.TrimStart("/")
      if ([string]::IsNullOrEmpty($reqRel)) { $reqRel = "index.html" }
      $candidate = [System.IO.Path]::GetFullPath((Join-Path $root ($reqRel -replace "/", "\")))
      $rootFull = [System.IO.Path]::GetFullPath($root)

      if (-not $candidate.StartsWith($rootFull, [System.StringComparison]::OrdinalIgnoreCase)) {
        $res.StatusCode = 403
        $res.OutputStream.Close()
        continue
      }

      if (Test-Path $candidate -PathType Leaf) {
        $ext = [System.IO.Path]::GetExtension($candidate).ToLowerInvariant()
        if ($mimeTypes.ContainsKey($ext)) {
          $res.ContentType = $mimeTypes[$ext]
        } else {
          $res.ContentType = "application/octet-stream"
        }

        $fileInfo = New-Object System.IO.FileInfo($candidate)
        $totalLen = $fileInfo.Length
        $res.Headers["Accept-Ranges"] = "bytes"

        $rangeHeader = $req.Headers["Range"]
        if (-not [string]::IsNullOrEmpty($rangeHeader) -and $rangeHeader -match "^bytes=(\d*)-(\d*)$" -and $totalLen -gt 0) {
          $startStr = $Matches[1]
          $endStr = $Matches[2]
          $start = if ([string]::IsNullOrEmpty($startStr)) { 0L } else { [int64]$startStr }
          $end = if ([string]::IsNullOrEmpty($endStr)) { $totalLen - 1 } else { [int64]$endStr }
          if ($end -ge $totalLen) { $end = $totalLen - 1 }

          if ($start -le $end -and $start -lt $totalLen) {
            $chunkLen = $end - $start + 1
            $res.StatusCode = 206
            $res.Headers["Content-Range"] = "bytes $start-$end/$totalLen"
            $res.ContentLength64 = $chunkLen

            $fs = [System.IO.File]::Open($candidate, [System.IO.FileMode]::Open, [System.IO.FileAccess]::Read, [System.IO.FileShare]::ReadWrite)
            try {
              $null = $fs.Seek($start, [System.IO.SeekOrigin]::Begin)
              $buf = New-Object byte[] 65536
              $rem = $chunkLen
              while ($rem -gt 0) {
                $toRead = [int][Math]::Min([int64]$buf.Length, $rem)
                $read = $fs.Read($buf, 0, $toRead)
                if ($read -le 0) { break }
                $res.OutputStream.Write($buf, 0, $read)
                $rem -= $read
              }
            } finally {
              $fs.Close()
            }
            $res.OutputStream.Close()
            continue
          }
        }

        $res.StatusCode = 200
        $res.ContentLength64 = $totalLen
        $fsFull = [System.IO.File]::Open($candidate, [System.IO.FileMode]::Open, [System.IO.FileAccess]::Read, [System.IO.FileShare]::ReadWrite)
        try {
          $fsFull.CopyTo($res.OutputStream)
        } finally {
          $fsFull.Close()
        }
      } else {
        $res.StatusCode = 404
      }
      $res.OutputStream.Close()
    } catch {
      try { $ctx.Response.OutputStream.Close() } catch {}
    }
  }
} finally {
  $listener.Stop()
}
