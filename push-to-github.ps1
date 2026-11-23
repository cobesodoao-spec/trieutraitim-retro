param(
  [string]$Token = "",
  [string]$RepoName = "trieutraitim-retro",
  [switch]$Private
)

$ErrorActionPreference = "Stop"
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

if ([string]::IsNullOrWhiteSpace($Token)) {
  Write-Host "==========================================================" -ForegroundColor Cyan
  Write-Host " ĐẨY WEB TRIỆU TRÁI TIM LÊN GITHUB & BẬT GITHUB PAGES" -ForegroundColor Cyan
  Write-Host "==========================================================" -ForegroundColor Cyan
  Write-Host "Lấy mã Token nhanh tại: https://github.com/settings/tokens/new?scopes=repo&description=TrieuTraiTim" -ForegroundColor Yellow
  $Token = (Read-Host "Dán GitHub Personal Access Token (ghp_...) vào đây").Trim()
}

if ([string]::IsNullOrWhiteSpace($Token)) {
  Write-Error "Bạn chưa nhập GitHub Token!"
  exit 1
}

$headers = @{
  "Authorization"        = "Bearer $Token"
  "Accept"               = "application/vnd.github+json"
  "X-GitHub-Api-Version" = "2022-11-28"
  "User-Agent"           = "TrieuTraiTim-DeployScript"
}

Write-Host "1. Đang kiểm tra tài khoản GitHub..." -ForegroundColor Green
$user = Invoke-RestMethod -Uri "https://api.github.com/user" -Headers $headers -Method Get
$owner = $user.login
Write-Host "   -> Xin chào @$owner!" -ForegroundColor Cyan

Write-Host "2. Đang kiểm tra / khởi tạo Repository '$RepoName'..." -ForegroundColor Green
$repoExists = $false
try {
  $repoInfo = Invoke-RestMethod -Uri "https://api.github.com/repos/$owner/$RepoName" -Headers $headers -Method Get
  $repoExists = $true
  Write-Host "   -> Đã tìm thấy repo $owner/$RepoName." -ForegroundColor Yellow
} catch {
  $createBody = @{
    name        = $RepoName
    description = "Web nghe nhạc giao diện xưa trieutraitim.info (2008) kèm AdminCP & Upload MP3"
    private     = [bool]$Private
    auto_init   = $true
  } | ConvertTo-Json
  $repoInfo = Invoke-RestMethod -Uri "https://api.github.com/user/repos" -Headers $headers -Method Post -Body ([Text.Encoding]::UTF8.GetBytes($createBody)) -ContentType "application/json; charset=utf-8"
  Start-Sleep -Seconds 2
  Write-Host "   -> Đã tạo mới repo: $($repoInfo.html_url)" -ForegroundColor Cyan
}

$branch = if ($repoInfo.default_branch) { $repoInfo.default_branch } else { "main" }
$root = Split-Path -Parent $MyInvocation.MyCommand.Path

$filesToUpload = @(
  "index.html",
  "styles.css",
  "data.js",
  "store.js",
  "synth.js",
  "app.js",
  "admin.html",
  "admin.css",
  "admin.js",
  "api.php",
  ".htaccess",
  ".user.ini",
  "site-db.json",
  "serve.ps1",
  "push-to-github.ps1",
  "trieutraitim-hostinger.zip",
  "README.md",
  ".nojekyll",
  "uploads/.htaccess"
)
Get-ChildItem -Path (Join-Path $root "uploads") -File -ErrorAction SilentlyContinue | Where-Object { $_.Name -ne ".htaccess" } | ForEach-Object {
  $filesToUpload += ("uploads/" + $_.Name)
}

Write-Host "3. Đang tải mã nguồn lên nhánh '$branch'..." -ForegroundColor Green
foreach ($relPath in $filesToUpload) {
  $fullPath = Join-Path $root $relPath
  if (-not (Test-Path $fullPath -PathType Leaf)) { continue }

  $bytes = [System.IO.File]::ReadAllBytes($fullPath)
  $b64 = [Convert]::ToBase64String($bytes)

  $existingSha = $null
  try {
    $existing = Invoke-RestMethod -Uri "https://api.github.com/repos/$owner/$RepoName/contents/${relPath}?ref=$branch" -Headers $headers -Method Get
    $existingSha = $existing.sha
  } catch {}

  $putObj = @{
    message = "Deploy $relPath"
    content = $b64
    branch  = $branch
  }
  if ($existingSha) { $putObj["sha"] = $existingSha }

  $putJson = $putObj | ConvertTo-Json -Compress
  $null = Invoke-RestMethod -Uri "https://api.github.com/repos/$owner/$RepoName/contents/$relPath" -Headers $headers -Method Put -Body ([Text.Encoding]::UTF8.GetBytes($putJson)) -ContentType "application/json; charset=utf-8"
  Write-Host "   [OK] $relPath"
}

if (-not $Private) {
  Write-Host "4. Đang kích hoạt GitHub Pages..." -ForegroundColor Green
  try {
    $pagesBody = @{
      source = @{
        branch = $branch
        path   = "/"
      }
    } | ConvertTo-Json -Compress
    $null = Invoke-RestMethod -Uri "https://api.github.com/repos/$owner/$RepoName/pages" -Headers $headers -Method Post -Body $pagesBody -ContentType "application/json"
    Write-Host "   -> Đã bật GitHub Pages thành công!" -ForegroundColor Cyan
  } catch {
    Write-Host "   -> GitHub Pages đã được bật sẵn hoặc đang khởi tạo." -ForegroundColor Yellow
  }
}

Write-Host ""
Write-Host "==========================================================" -ForegroundColor Green
Write-Host " HOÀN TẤT ĐẨY LÊN GITHUB!" -ForegroundColor Green
Write-Host " Repository : https://github.com/$owner/$RepoName" -ForegroundColor White
Write-Host " Web Online : https://$owner.github.io/$RepoName/" -ForegroundColor Cyan
Write-Host " AdminCP    : https://$owner.github.io/$RepoName/admin.html" -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Green
