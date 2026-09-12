$ErrorActionPreference = "Stop"
$projectRoot = Split-Path -Parent $PSScriptRoot
Set-Location $projectRoot

$secureSecret = Read-Host "Enter Zhihu Access Secret (input is hidden)" -AsSecureString
$secretPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureSecret)

try {
    $plainSecret = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($secretPointer)
    if ([string]::IsNullOrWhiteSpace($plainSecret)) {
        throw "Access Secret cannot be empty."
    }

    $env:ZHIHU_ACCESS_SECRET = $plainSecret
    $env:ZHIHU_DATA_MODE = "auto"
    npm start
    if ($LASTEXITCODE -ne 0) {
        throw "npm start exited with code $LASTEXITCODE."
    }
}
catch {
    Write-Host "`nStartup failed: $($_.Exception.Message)" -ForegroundColor Red
    Read-Host "Press Enter to close"
}
finally {
    Remove-Item Env:ZHIHU_ACCESS_SECRET -ErrorAction SilentlyContinue
    if ($secretPointer -ne [IntPtr]::Zero) {
        [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($secretPointer)
    }
    $plainSecret = $null
}
