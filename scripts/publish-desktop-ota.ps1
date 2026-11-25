<#
.SYNOPSIS
    Compila y publica en ~5 segundos un parche rápido OTA (~1.6 MB) de Kredia Desktop
    en Supabase Storage (bucket público 'desktop-updates'), SIN ejecutar jpackage ni Inno Setup.
.EXAMPLE
    $env:SUPABASE_SERVICE_ROLE_KEY = "eyJ..."
    .\scripts\publish-desktop-ota.ps1 -ReleaseNotes "Mejora de reportes y fix de cobranza"
#>
param(
    [string]$ReleaseNotes = "",
    [string]$SupabaseUrl = "https://fmcotpmydstyrwcmqazb.supabase.co",
    [string]$Bucket = "desktop-updates",
    [switch]$SkipBuild
)

$ErrorActionPreference = "Stop"
$RepoRoot = Split-Path -Parent $PSScriptRoot
$DesktopDir = Join-Path $RepoRoot "desktop"
$OtaDir = Join-Path $DesktopDir "dist\ota"

if (-not $SkipBuild) {
    Write-Host "==> 1/2 Compilando parche OTA (~1.6 MB) sin jpackage ni Inno Setup..." -ForegroundColor Cyan
    Push-Location $DesktopDir
    try {
        $gradleArgs = @("buildOtaPatch")
        if ($ReleaseNotes -and $ReleaseNotes.Trim().Length -gt 0) {
            $gradleArgs += "-PreleaseNotes=$ReleaseNotes"
        }
        & .\gradlew.bat @gradleArgs
        if ($LASTEXITCODE -ne 0) {
            throw "Gradle buildOtaPatch falló con código $LASTEXITCODE"
        }
    } finally {
        Pop-Location
    }
}

$ManifestPath = Join-Path $OtaDir "latest.json"
if (-not (Test-Path $ManifestPath)) {
    throw "No se encontró $ManifestPath. Ejecuta .\gradlew.bat buildOtaPatch primero."
}

$Manifest = Get-Content $ManifestPath -Raw -Encoding UTF8 | ConvertFrom-Json
$Version = $Manifest.latest_version
$JarName = "kredia-app-$Version.jar"
$JarPath = Join-Path $OtaDir $JarName
if (-not (Test-Path $JarPath)) {
    throw "No se encontró el paquete JAR: $JarPath"
}

$ServiceKey = $env:SUPABASE_SERVICE_ROLE_KEY
if (-not $ServiceKey) {
    $ServiceKey = Read-Host "Ingresa SUPABASE_SERVICE_ROLE_KEY para publicar en $Bucket"
}
if (-not $ServiceKey) {
    throw "Se requiere SUPABASE_SERVICE_ROLE_KEY para publicar el parche OTA en Supabase Storage."
}

$Base = $SupabaseUrl.TrimEnd("/")

function Upload-ToSupabaseStorage {
    param(
        [string]$LocalPath,
        [string]$ObjectName,
        [string]$ContentType,
        [string]$CacheControl
    )
    $UploadUrl = "$Base/storage/v1/object/$Bucket/$ObjectName"
    $Headers = @{
        "apikey"        = $ServiceKey
        "Authorization" = "Bearer $ServiceKey"
        "Content-Type"  = $ContentType
        "x-upsert"      = "true"
        "cache-control" = $CacheControl
    }
    Write-Host "    Subiendo $ObjectName ($([math]::Round((Get-Item $LocalPath).Length / 1KB, 1)) KB)..." -ForegroundColor Yellow
    Invoke-RestMethod -Method Post -Uri $UploadUrl -Headers $Headers -InFile $LocalPath | Out-Null
}

Write-Host "==> 2/2 Publicando v$Version en Supabase Storage ($Bucket)..." -ForegroundColor Cyan
Upload-ToSupabaseStorage -LocalPath $JarPath -ObjectName $JarName -ContentType "application/java-archive" -CacheControl "31536000"
Upload-ToSupabaseStorage -LocalPath $ManifestPath -ObjectName "latest.json" -ContentType "application/json" -CacheControl "60"

Write-Host ""
Write-Host "PUBLICACION OTA EXITOSA: Kredia Desktop v$Version" -ForegroundColor Green
Write-Host "  Manifiesto: $Base/storage/v1/object/public/$Bucket/latest.json"
Write-Host "  Paquete   : $Base/storage/v1/object/public/$Bucket/$JarName"
Write-Host "  SHA-256   : $($Manifest.core_jar_sha256)"
Write-Host "Todos los clientes con base >= v$($Manifest.min_shell_version) recibiran el parche automaticamente."
