param(
  [string]$ApiBase = "http://localhost:8787",
  [string]$MemberUsername = "member",
  [string]$MemberPassword = "member123"
)

$ErrorActionPreference = "Stop"

function Invoke-Api {
  param(
    [Parameter(Mandatory = $true)][ValidateSet("GET", "POST", "PUT", "PATCH", "DELETE")][string]$Method,
    [Parameter(Mandatory = $true)][string]$Path,
    [hashtable]$Headers,
    [object]$Body
  )

  $uri = "$ApiBase$Path"
  $params = @{
    Uri = $uri
    Method = $Method
  }

  if ($Headers) { $params.Headers = $Headers }
  if ($null -ne $Body) {
    $params.ContentType = "application/json"
    $params.Body = ($Body | ConvertTo-Json -Depth 30)
  }

  $status = 0
  $raw = ""
  try {
    $res = Invoke-WebRequest @params
    $status = [int]$res.StatusCode
    $raw = [string]$res.Content
  } catch {
    $resp = $_.Exception.Response
    if (-not $resp) { throw }
    $status = [int]$resp.StatusCode
    if ($_.ErrorDetails -and $_.ErrorDetails.Message) {
      $raw = [string]$_.ErrorDetails.Message
    } else {
      try {
        $reader = New-Object System.IO.StreamReader($resp.GetResponseStream())
        $raw = $reader.ReadToEnd()
        $reader.Close()
      } catch {
        $raw = ""
      }
    }
  }

  $json = $null
  if ($raw) {
    try { $json = $raw | ConvertFrom-Json } catch { $json = $null }
  }

  return [PSCustomObject]@{
    Status = $status
    Json = $json
    Raw = $raw
  }
}

function Test-Case {
  param(
    [Parameter(Mandatory = $true)][string]$Name,
    [Parameter(Mandatory = $true)][int]$ExpectedStatus,
    [string]$ExpectedCode,
    [Parameter(Mandatory = $true)][scriptblock]$Run
  )

  try {
    $result = & $Run
    $ok = ($result.Status -eq $ExpectedStatus)
    if ($ExpectedCode) {
      $actualCode = if ($result.Json -and $result.Json.code) { [string]$result.Json.code } else { "" }
      $ok = $ok -and ($actualCode -eq $ExpectedCode)
    }

    if ($ok) {
      Write-Host "[PASS] $Name" -ForegroundColor Green
    } else {
      $actualCodeText = if ($result.Json -and $result.Json.code) { [string]$result.Json.code } else { "(none)" }
      Write-Host "[FAIL] $Name | expected status=$ExpectedStatus code=$ExpectedCode | actual status=$($result.Status) code=$actualCodeText" -ForegroundColor Red
      if ($result.Raw) { Write-Host "       body: $($result.Raw)" -ForegroundColor DarkGray }
    }
  } catch {
    Write-Host "[FAIL] $Name | exception: $($_.Exception.Message)" -ForegroundColor Red
  }
}

Write-Host "PixChi API auth/permission smoke test" -ForegroundColor Cyan
Write-Host "API Base: $ApiBase" -ForegroundColor Cyan

# Quick health check
try {
  $health = Invoke-Api -Method GET -Path "/api/health"
  if ($health.Status -ne 200) {
    Write-Host "[WARN] /api/health returned $($health.Status). Continue anyway..." -ForegroundColor Yellow
  }
} catch {
  Write-Host "[ERROR] API unreachable at $ApiBase. Please start API first (npm run dev:api)." -ForegroundColor Red
  exit 1
}

Test-Case -Name "1) Guest -> /api/projects => 401 UNAUTHORIZED" -ExpectedStatus 401 -ExpectedCode "UNAUTHORIZED" -Run {
  Invoke-Api -Method GET -Path "/api/projects"
}

Test-Case -Name "2) Guest -> /api/palette/pro/groups => 403 FORBIDDEN" -ExpectedStatus 403 -ExpectedCode "FORBIDDEN" -Run {
  Invoke-Api -Method GET -Path "/api/palette/pro/groups"
}

$login = Invoke-Api -Method POST -Path "/api/auth/login" -Body @{ username = $MemberUsername; password = $MemberPassword }
if ($login.Status -ne 200 -or -not $login.Json -or -not $login.Json.accessToken) {
  Write-Host "[ERROR] member login failed. status=$($login.Status) body=$($login.Raw)" -ForegroundColor Red
  exit 1
}
$accessToken = [string]$login.Json.accessToken

Test-Case -Name "3) Member -> /api/projects => 200" -ExpectedStatus 200 -Run {
  Invoke-Api -Method GET -Path "/api/projects" -Headers @{ Authorization = "Bearer $accessToken" }
}

Test-Case -Name "4) Member -> /api/palette/pro/groups => 403 FORBIDDEN" -ExpectedStatus 403 -ExpectedCode "FORBIDDEN" -Run {
  Invoke-Api -Method GET -Path "/api/palette/pro/groups" -Headers @{ Authorization = "Bearer $accessToken" }
}

Test-Case -Name "5) Invalid token -> /api/projects => 401 UNAUTHORIZED" -ExpectedStatus 401 -ExpectedCode "UNAUTHORIZED" -Run {
  Invoke-Api -Method GET -Path "/api/projects" -Headers @{ Authorization = "Bearer abc.def.ghi" }
}

$logout = Invoke-Api -Method POST -Path "/api/auth/logout" -Body @{ refreshToken = [string]$login.Json.refreshToken }
if ($logout.Status -eq 200) {
  Write-Host "[PASS] 6) Logout refresh token" -ForegroundColor Green
} else {
  Write-Host "[WARN] 6) Logout refresh token failed: status=$($logout.Status)" -ForegroundColor Yellow
}

Write-Host "Done." -ForegroundColor Cyan
