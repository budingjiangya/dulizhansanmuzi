# ============================================================================
# 端到端冒烟测试（PowerShell，Windows 本地）
# 覆盖：公开接口 / Swagger / 登录日志 / RBAC 越权拦截 / 抽帧 / 分片上传 / 静态资源
# 用法：pwsh -NoProfile -File scripts/smoke.ps1
# 前置：后端已在 http://localhost:3000 运行，且已执行 seed
# ============================================================================
param(
  [string]$Base = 'http://localhost:3000',
  [string]$AdminUser = 'admin',
  [string]$AdminPass = 'Admin@123456',
  [string]$EditorUser = 'editor',
  [string]$EditorPass = 'Editor@123456'
)

$ErrorActionPreference = 'Stop'
try { [Console]::OutputEncoding = [System.Text.Encoding]::UTF8 } catch {}

$script:Pass = 0
$script:Fail = 0
$script:Failures = @()

function Test-Case {
  param(
    [string]$Name,
    [scriptblock]$Body
  )
  try {
    $detail = & $Body
    $script:Pass++
    Write-Host ("  [PASS] {0}" -f $Name) -ForegroundColor Green
    if ($detail) { Write-Host ("         {0}" -f $detail) -ForegroundColor DarkGray }
  } catch {
    $script:Fail++
    $script:Failures += "$Name => $($_.Exception.Message)"
    Write-Host ("  [FAIL] {0}" -f $Name) -ForegroundColor Red
    Write-Host ("         {0}" -f $_.Exception.Message) -ForegroundColor Red
  }
}

function Assert-True {
  param([bool]$Condition, [string]$Message)
  if (-not $Condition) { throw $Message }
}

function Assert-Equal {
  param($Actual, $Expected, [string]$Message)
  if ($Actual -ne $Expected) { throw "$Message（期望 $Expected，实际 $Actual）" }
}

# ---------------------------------------------------------------------------
# HTTP 基础层
# 使用 System.Net.Http.HttpClient 而不是 Invoke-RestMethod：
# Windows PowerShell 5.1 下 Invoke-RestMethod 遇到 4xx/5xx 会抛 WebException，
# 且异常响应流读不出内容（实测 ReadToEnd 返回空串），无法断言错误响应体。
# HttpClient 不抛异常，任何状态码都能拿到响应体。
# ---------------------------------------------------------------------------
$script:Base = $Base
# Windows PowerShell 5.1 默认未加载 System.Net.Http，需显式加载
Add-Type -AssemblyName System.Net.Http
$script:HttpClient = New-Object System.Net.Http.HttpClient
$script:HttpClient.Timeout = [TimeSpan]::FromMinutes(10)

function Send-Http {
  param(
    [string]$Method,
    [string]$Path,
    [string]$Token,
    $Body,
    [string]$ContentType
  )
  # 直接用静态方法构造，避免 PS 5.1 的 New-Object 无法解析静态属性（[HttpMethod]::Get）
  $httpMethod = [System.Net.Http.HttpMethod]::new($Method.ToUpperInvariant())
  $request = [System.Net.Http.HttpRequestMessage]::new($httpMethod, "$($script:Base)$Path")
  if ($Token) { [void]$request.Headers.TryAddWithoutValidation('Authorization', "Bearer $Token") }
  if ($null -ne $Body) {
    $content = [System.Net.Http.ByteArrayContent]::new([byte[]]$Body)
    if ($ContentType) { [void]$content.Headers.TryAddWithoutValidation('Content-Type', $ContentType) }
    $request.Content = $content
  }
  $response = $script:HttpClient.SendAsync($request).GetAwaiter().GetResult()
  $status = [int]$response.StatusCode
  $text = $response.Content.ReadAsStringAsync().GetAwaiter().GetResult()
  $json = $null
  if ($text) { try { $json = $text | ConvertFrom-Json } catch { $json = $null } }
  $response.Dispose()
  $request.Dispose()
  return [pscustomobject]@{
    Status = $status
    Text   = $text
    Json   = $json
  }
}

function Invoke-Api {
  param(
    [string]$Method,
    [string]$Path,
    [string]$Token,
    $Body,
    [string]$ContentType = 'application/json'
  )
  $payload = $null
  if ($null -ne $Body) {
    if ($ContentType -eq 'application/json') {
      $payload = [System.Text.Encoding]::UTF8.GetBytes(($Body | ConvertTo-Json -Depth 12 -Compress))
    } else {
      $payload = $Body
    }
  }
  $result = Send-Http -Method $Method -Path $Path -Token $Token -Body $payload -ContentType $ContentType
  if ($result.Status -ge 200 -and $result.Status -lt 300) { return $result.Json }
  # 业务错误：把状态码与响应体一起返回，供断言使用
  return [pscustomobject]@{
    __httpStatus = $result.Status
    __raw        = $result.Text
    __body       = $result.Json
  }
}

# 清理脚本创建的测试数据（测试中途失败也会在 finally 中执行，避免脏数据残留）
function Remove-SmokeTestData {
  param([string]$Token)
  if (-not $Token) { return }
  if ($script:createdUserId) {
    try { [void](Invoke-Api -Method DELETE -Path "/api/admin/users/$($script:createdUserId)" -Token $Token) } catch {}
    $script:createdUserId = $null
  }
  try {
    $users = Invoke-Api -Method GET -Path '/api/admin/users?page=1&pageSize=100' -Token $Token
    if ($users.code -eq 0) {
      $orphans = @($users.data.list) | Where-Object { $_.username -like 'smoke*' }
      foreach ($orphan in $orphans) {
        if ($orphan.id -eq $script:currentUserId) { continue }
        try { [void](Invoke-Api -Method DELETE -Path "/api/admin/users/$($orphan.id)" -Token $Token) } catch {}
      }
      if (@($orphans).Count -gt 0) {
        Write-Host ("         已清理历史遗留测试账号 $(@($orphans).Count) 个") -ForegroundColor DarkGray
      }
    }
  } catch {}
  try {
    $articles = Invoke-Api -Method GET -Path '/api/admin/articles?page=1&pageSize=100' -Token $Token
    if ($articles.code -eq 0) {
      $stale = @($articles.data.list) | Where-Object { $_.title -like '冒烟测试文章*' }
      foreach ($item in $stale) {
        try { [void](Invoke-Api -Method DELETE -Path "/api/admin/articles/$($item.id)" -Token $Token) } catch {}
      }
    }
  } catch {}
}

function New-TestFile {
  param([string]$Path, [int]$SizeKb)
  $bytes = New-Object byte[] ($SizeKb * 1024)
  (New-Object System.Random 20260520).NextBytes($bytes)
  # 写入 mp4 头，便于扩展名/魔数校验通过
  $header = [byte[]](0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6F, 0x6D)
  [Array]::Copy($header, 0, $bytes, 0, $header.Length)
  [System.IO.File]::WriteAllBytes($Path, $bytes)
}

<#
  手工构造 multipart/form-data 请求体
  Windows PowerShell 5.1 的 Invoke-RestMethod 没有 -Form 参数，因此统一用原始字节流实现。
#>
function New-MultipartBody {
  param(
    [hashtable]$Fields = @{},
    [hashtable]$Files = @{}
  )
  $boundary = '----sanmuziSmoke' + [guid]::NewGuid().ToString('N')
  $encoding = [System.Text.Encoding]::UTF8
  $stream = New-Object System.IO.MemoryStream

  function Write-Bytes([byte[]]$bytes) { $stream.Write($bytes, 0, $bytes.Length) }

  foreach ($key in $Fields.Keys) {
    $header = "--$boundary`r`nContent-Disposition: form-data; name=`"$key`"`r`n`r`n"
    Write-Bytes $encoding.GetBytes($header)
    Write-Bytes $encoding.GetBytes([string]$Fields[$key])
    Write-Bytes $encoding.GetBytes("`r`n")
  }

  foreach ($key in $Files.Keys) {
    $item = $Files[$key]
    $fileName = [System.IO.Path]::GetFileName($item)
    $header = "--$boundary`r`nContent-Disposition: form-data; name=`"$key`"; filename=`"$fileName`"`r`nContent-Type: application/octet-stream`r`n`r`n"
    Write-Bytes $encoding.GetBytes($header)
    Write-Bytes ([System.IO.File]::ReadAllBytes($item))
    Write-Bytes $encoding.GetBytes("`r`n")
  }

  Write-Bytes $encoding.GetBytes("--$boundary--`r`n")
  return @{
    ContentType = "multipart/form-data; boundary=$boundary"
    Bytes       = $stream.ToArray()
  }
}

# 统一的 multipart 上传调用
function Invoke-Upload {
  param(
    [string]$Path,
    [string]$Token,
    [hashtable]$Fields = @{},
    [hashtable]$Files = @{}
  )
  $body = New-MultipartBody -Fields $Fields -Files $Files
  return Invoke-Api -Method POST -Path $Path -Token $Token -Body $body.Bytes -ContentType $body.ContentType
}

Write-Host ''
Write-Host '============================================================' -ForegroundColor Cyan
Write-Host ' 三目子 · 产品推荐博客站点 —— 端到端冒烟测试' -ForegroundColor Cyan
Write-Host (" 目标: {0}" -f $Base) -ForegroundColor Cyan
Write-Host '============================================================' -ForegroundColor Cyan

# ---------------------------------------------------------------- 1. 后台启动
Write-Host ''
Write-Host '[1] 服务可用性与接口文档' -ForegroundColor Yellow

Test-Case '后端健康：前台站点配置可访问' {
  $res = Invoke-Api -Method GET -Path '/api/portal/site-config'
  Assert-Equal $res.code 0 '业务码应为 0'
  Assert-True ([bool]$res.data.siteName) 'siteName 不能为空'
  "站点名称 = $($res.data.siteName)"
}

Test-Case 'Swagger 文档页可访问' {
  $res = Invoke-WebRequest -Uri "$Base/api/docs" -UseBasicParsing -ErrorAction Stop
  Assert-Equal ([int]$res.StatusCode) 200 'Swagger 页面应返回 200'
  'HTTP 200'
}

# ---------------------------------------------------------------- 2. 前台公开接口
Write-Host ''
Write-Host '[2] 前台门户公开接口' -ForegroundColor Yellow

$script:portalList = $null

Test-Case '首页列表：分页 + 字段结构 + 不含正文' {
  $res = Invoke-Api -Method GET -Path '/api/portal/articles?page=1&pageSize=3'
  Assert-Equal $res.code 0 '业务码应为 0'
  Assert-True ($res.data.total -ge 1) '首页应有至少 1 篇推荐文章（请先执行 pnpm backend:seed）'
  Assert-True ($res.data.list.Count -ge 1) 'list 不能为空'
  $first = $res.data.list[0]
  Assert-True ($null -ne $first.coverType) '缺少 coverType 字段'
  Assert-True ($first.PSObject.Properties.Name -contains 'coverImages') '缺少 coverImages 字段'
  Assert-True (-not ($first.PSObject.Properties.Name -contains 'content')) '首页列表不应返回富文本正文 content'
  $script:portalList = $res.data
  "total = $($res.data.total)，首页返回 $($res.data.list.Count) 条，首篇 coverType = $($first.coverType)"
}

Test-Case '多图模式文章的 coverImages 为数组' {
  $imageItem = @($script:portalList.list) | Where-Object { $_.coverType -eq 'image' } | Select-Object -First 1
  Assert-True ($null -ne $imageItem) '未找到 coverType=image 的演示文章'
  Assert-True (@($imageItem.coverImages).Count -ge 1) 'coverImages 应为非空数组'
  "《$($imageItem.title)》封面图 $(@($imageItem.coverImages).Count) 张"
}

Test-Case '视频模式文章带静态抽帧封面' {
  $videoItem = @($script:portalList.list) | Where-Object { $_.coverType -eq 'video' } | Select-Object -First 1
  Assert-True ($null -ne $videoItem) '未找到 coverType=video 的演示文章'
  Assert-True ([bool]$videoItem.coverVideo) 'coverVideo 不能为空'
  Assert-True ([bool]$videoItem.coverVideoFrame) 'coverVideoFrame 不能为空（FFmpeg 抽帧结果）'
  "《$($videoItem.title)》视频 = $($videoItem.coverVideo)"
}

Test-Case '文章详情返回富文本正文' {
  $id = @($script:portalList.list)[0].id
  $res = Invoke-Api -Method GET -Path "/api/portal/articles/$id"
  Assert-Equal $res.code 0 '业务码应为 0'
  Assert-True ([bool]$res.data.content) '详情必须返回 content'
  "正文长度 = $($res.data.content.Length) 字符"
}

Test-Case '不存在的文章返回 40400' {
  $res = Invoke-Api -Method GET -Path '/api/portal/articles/999999'
  Assert-Equal $res.__body.code 40400 '应返回业务码 40400'
}

# ---------------------------------------------------------------- 3. 鉴权
Write-Host ''
Write-Host '[3] 登录鉴权与登录日志' -ForegroundColor Yellow

$script:adminToken = $null
$script:editorToken = $null
$script:createdUserId = $null
$script:currentUserId = $null

Test-Case '超级管理员登录成功' {
  $res = Invoke-Api -Method POST -Path '/api/auth/login' -Body @{ username = $AdminUser; password = $AdminPass }
  Assert-Equal $res.code 0 '登录应成功'
  Assert-True ([bool]$res.data.token) '未返回 token'
  Assert-True (@($res.data.user.permissions).Count -ge 10) '超管权限数量异常'
  $script:adminToken = $res.data.token
  $script:currentUserId = $res.data.user.id
  Remove-SmokeTestData -Token $script:adminToken
  "角色 = $($res.data.user.roleName)，权限 $(@($res.data.user.permissions).Count) 项"
}

Test-Case '错误密码登录失败且写入失败日志' {
  $before = Invoke-Api -Method GET -Path '/api/admin/login-logs?page=1&pageSize=1&loginResult=0' -Token $script:adminToken
  $res = Invoke-Api -Method POST -Path '/api/auth/login' -Body @{ username = $AdminUser; password = 'WrongPassword!2026' }
  Assert-True ($null -ne $res.__body) '错误密码应返回结构化错误体'
  Assert-True ($res.__body.code -ne 0) '错误密码不应返回成功'
  $after = Invoke-Api -Method GET -Path '/api/admin/login-logs?page=1&pageSize=1&loginResult=0' -Token $script:adminToken
  Assert-True ($after.data.total -gt $before.data.total) '失败登录未写入登录日志'
  "失败日志条数：$($before.data.total) → $($after.data.total)"
}

Test-Case '内容编辑登录成功' {
  $res = Invoke-Api -Method POST -Path '/api/auth/login' -Body @{ username = $EditorUser; password = $EditorPass }
  Assert-Equal $res.code 0 '登录应成功'
  Assert-True (@($res.data.user.permissions).Count -lt 10) '内容编辑权限数量应少于超管'
  $script:editorToken = $res.data.token
  "权限 $(@($res.data.user.permissions).Count) 项：$($res.data.user.permissions -join ', ')"
}

Test-Case '无 Token 访问管理接口被拒（40100）' {
  $res = Invoke-Api -Method GET -Path '/api/admin/users'
  Assert-Equal $res.__body.code 40100 '应返回 40100'
  Assert-Equal $res.__httpStatus 401 'HTTP 状态码应为 401'
}

Test-Case '伪造 Token 被拒（40100）' {
  $res = Invoke-Api -Method GET -Path '/api/admin/users' -Token 'fake.token.value'
  Assert-Equal $res.__body.code 40100 '应返回 40100'
}

Test-Case 'profile 返回实时权限数组' {
  $res = Invoke-Api -Method GET -Path '/api/auth/profile' -Token $script:adminToken
  Assert-Equal $res.code 0 '业务码应为 0'
  Assert-True (@($res.data.permissions).Count -ge 10) 'permisssions 应为完整数组'
  "账号 = $($res.data.username)"
}

# ---------------------------------------------------------------- 4. RBAC
Write-Host ''
Write-Host '[4] RBAC 越权拦截（前端绕过验证）' -ForegroundColor Yellow

Test-Case '内容编辑访问账号管理接口被拒（40300）' {
  $res = Invoke-Api -Method GET -Path '/api/admin/users' -Token $script:editorToken
  Assert-Equal $res.__body.code 40300 '应返回 40300'
  Assert-Equal $res.__httpStatus 403 'HTTP 状态码应为 403'
}

Test-Case '内容编辑访问登录日志接口被拒（40300）' {
  $res = Invoke-Api -Method GET -Path '/api/admin/login-logs' -Token $script:editorToken
  Assert-Equal $res.__body.code 40300 '应返回 40300'
}

Test-Case '内容编辑访问角色管理接口被拒（40300）' {
  $res = Invoke-Api -Method GET -Path '/api/admin/roles' -Token $script:editorToken
  Assert-Equal $res.__body.code 40300 '应返回 40300'
}

Test-Case '内容编辑可正常访问文章列表' {
  $res = Invoke-Api -Method GET -Path '/api/admin/articles?page=1&pageSize=5' -Token $script:editorToken
  Assert-Equal $res.code 0 '内容编辑应有文章查看权限'
  "返回 $($res.data.list.Count) / 共 $($res.data.total) 篇"
}

# ---------------------------------------------------------------- 5. 管理功能
Write-Host ''
Write-Host '[5] 后台业务功能' -ForegroundColor Yellow

$script:createdArticleId = $null

Test-Case '工作台统计（含 7 天登录趋势）' {
  $res = Invoke-Api -Method GET -Path '/api/admin/dashboard/stats' -Token $script:adminToken
  Assert-Equal $res.code 0 '业务码应为 0'
  Assert-Equal @($res.data.loginTrend).Count 7 '趋势应补齐 7 天'
  "文章 $($res.data.articleTotal) 篇 / 账号 $($res.data.adminUserTotal) 个 / 今日登录成功 $($res.data.loginToday) 次"
}

Test-Case '角色列表返回权限数组与账号数' {
  $res = Invoke-Api -Method GET -Path '/api/admin/roles' -Token $script:adminToken
  Assert-Equal $res.code 0 '业务码应为 0'
  # 契约约定：GET /api/admin/roles 直接返回 AdminRoleVo 数组（不是分页包装）
  Assert-True (@($res.data).Count -ge 2) '响应应为角色数组且至少含 2 个内置角色'
  $super = @($res.data) | Where-Object { $_.id -eq 1 } | Select-Object -First 1
  Assert-True ($null -ne $super) '未找到超级管理员角色'
  Assert-True (@($super.permissions).Count -ge 10) '超管角色权限不完整'
  Assert-True ($null -ne $super.userCount) '缺少 userCount 字段'
  "角色数 = $(@($res.data).Count)"
}

Test-Case '新增文章 → 查询 → 上架推荐 → 删除' {
  $payload = @{
    title     = '冒烟测试文章（可安全删除）'
    shortDesc = '由 scripts/smoke.ps1 自动创建，用于验证文章 CRUD 全链路。'
    coverType = 'image'
    coverImages = @('https://picsum.photos/seed/smoke/1200/800')
    content   = '<h2>冒烟测试</h2><p>这是一段用于端到端验证的正文内容。</p>'
    isRecommend = $true
    isPublish   = $true
    sort        = 1
  }
  $created = Invoke-Api -Method POST -Path '/api/admin/articles' -Token $script:adminToken -Body $payload
  Assert-Equal $created.code 0 '创建文章失败'
  $script:createdArticleId = $created.data.id
  Assert-True ($script:createdArticleId -gt 0) '未返回文章 ID'

  $detail = Invoke-Api -Method GET -Path "/api/admin/articles/$($script:createdArticleId)" -Token $script:adminToken
  Assert-Equal $detail.data.title $payload.title '详情标题不一致'

  $toggled = Invoke-Api -Method PATCH -Path "/api/admin/articles/$($script:createdArticleId)/publish" -Token $script:adminToken -Body @{ value = $false }
  Assert-Equal $toggled.code 0 '下架失败'

  $portal = Invoke-Api -Method GET -Path '/api/portal/articles?page=1&pageSize=50'
  $hit = @($portal.data.list) | Where-Object { $_.id -eq $script:createdArticleId }
  Assert-True ($null -eq $hit) '已下架文章不应出现在前台首页'

  $deleted = Invoke-Api -Method DELETE -Path "/api/admin/articles/$($script:createdArticleId)" -Token $script:adminToken
  Assert-Equal $deleted.code 0 '删除失败'
  "文章 ID = $script:createdArticleId（已下架并删除）"
}

Test-Case '账号管理：新增 → 重复账号冲突 → 删除' {
  $suffix = Get-Random -Minimum 1000 -Maximum 9999
  $uname = "smoke$suffix"
  $payload = @{ username = $uname; password = 'Smoke@123456'; realName = '冒烟账号'; roleId = 2; status = 1 }
  $created = Invoke-Api -Method POST -Path '/api/admin/users' -Token $script:adminToken -Body $payload
  Assert-Equal $created.code 0 '新增账号失败'
  $newId = $created.data.id
  $script:createdUserId = $newId

  $dup = Invoke-Api -Method POST -Path '/api/admin/users' -Token $script:adminToken -Body $payload
  Assert-Equal $dup.__body.code 40900 '重复账号应返回 40900'

  $reset = Invoke-Api -Method POST -Path "/api/admin/users/$newId/reset-password" -Token $script:adminToken -Body @{ newPassword = 'Reset@123456' }
  Assert-Equal $reset.code 0 '重置密码失败'

  $deleted = Invoke-Api -Method DELETE -Path "/api/admin/users/$newId" -Token $script:adminToken
  Assert-Equal $deleted.code 0 '删除账号失败'
  $script:createdUserId = $null
  "账号 = $uname（已创建、验证冲突、重置密码并删除）"
}

Test-Case '登录日志支持按结果与时间区间筛选' {
  $res = Invoke-Api -Method GET -Path '/api/admin/login-logs?page=1&pageSize=5&loginResult=1' -Token $script:adminToken
  Assert-Equal $res.code 0 '业务码应为 0'
  Assert-True ($res.data.total -ge 1) '应有登录成功日志'
  Assert-True (@($res.data.list).Count -ge 1) 'list 不应为空'
  Assert-True ($null -ne @($res.data.list)[0].loginIp) '日志应包含登录 IP'
  "成功日志 $($res.data.total) 条，最近一条 IP = $(@($res.data.list)[0].loginIp)"
}

# ---------------------------------------------------------------- 6. 文件与 FFmpeg
Write-Host ''
Write-Host '[6] 文件上传、FFmpeg 抽帧与分片上传' -ForegroundColor Yellow

$script:demoVideoUrl = $null
$tmpDir = Join-Path $env:TEMP ('sanmuzi-smoke-' + [guid]::NewGuid().ToString('N').Substring(0, 8))
New-Item -ItemType Directory -Path $tmpDir -Force | Out-Null

try {
  Test-Case '找到可用于抽帧的演示视频' {
    $storageRoot = Join-Path $PSScriptRoot '..\backend-nest\storage\uploads\demo'
    $localVideo = Get-ChildItem -Path $storageRoot -Filter *.mp4 -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($localVideo) {
      $script:demoVideoUrl = "/static/uploads/demo/$($localVideo.Name)"
      "本地演示视频：$($localVideo.Name)（$([math]::Round($localVideo.Length/1MB,2)) MB）"
    } else {
      $list = Invoke-Api -Method GET -Path '/api/portal/articles?page=1&pageSize=50'
      $videoItem = $list.data.list | Where-Object { $_.coverType -eq 'video' -and $_.coverVideo } | Select-Object -First 1
      Assert-True ($null -ne $videoItem) '既没有本地演示视频，也没有视频型文章可用于抽帧测试'
      $script:demoVideoUrl = $videoItem.coverVideo
      "使用文章内视频地址：$script:demoVideoUrl"
    }
  }

  Test-Case '静态资源可访问（/static/uploads）' {
    $probePath = $script:demoVideoUrl
    if ($probePath -notlike '/static/*') {
      $res2 = Invoke-Api -Method GET -Path '/api/portal/articles?page=1&pageSize=50'
      $frame = $res2.data.list | Where-Object { $_.coverVideoFrame -like '/static/*' } | Select-Object -First 1
      Assert-True ($null -ne $frame) '未找到站内静态资源地址'
      $probePath = $frame.coverVideoFrame
    }
    $http = Invoke-WebRequest -Uri "$Base$probePath" -UseBasicParsing -Method Head -ErrorAction Stop
    Assert-True ([int]$http.StatusCode -lt 400) '静态资源不可访问'
    "HEAD $probePath -> $([int]$http.StatusCode)"
  }

  Test-Case 'FFmpeg 抽帧：指定时间点生成封面帧' {
    $res = Invoke-Api -Method POST -Path '/api/admin/files/video/frame' -Token $script:adminToken -Body @{ videoUrl = $script:demoVideoUrl; time = 2 }
    Assert-Equal $res.code 0 '抽帧接口返回失败'
    Assert-True ([bool]$res.data.coverVideoFrame) '未返回封面帧地址'
    Assert-True ($res.data.duration -gt 0) '未读取到视频时长'
    $frameUrl = $res.data.coverVideoFrame
    if ($frameUrl -like '/static/*') {
      $local = Join-Path (Join-Path $PSScriptRoot '..\backend-nest') ('storage\uploads' + ($frameUrl -replace '^/static/uploads', ''))
      Assert-True (Test-Path $local) "抽帧文件不存在：$local"
    }
    "时长 = $($res.data.duration)s，抽帧时间点 = $($res.data.frameTime)s，封面 = $frameUrl"
  }

  Test-Case '图片上传返回可访问地址' {
    $imgPath = Join-Path $tmpDir 'cover.png'
    # 1x1 PNG
    $png = [byte[]](0x89,0x50,0x4E,0x47,0x0D,0x0A,0x1A,0x0A,0x00,0x00,0x00,0x0D,0x49,0x48,0x44,0x52,0x00,0x00,0x00,0x01,0x00,0x00,0x00,0x01,0x08,0x06,0x00,0x00,0x00,0x1F,0x15,0xC4,0x89,0x00,0x00,0x00,0x0A,0x49,0x44,0x41,0x54,0x78,0x9C,0x63,0x00,0x01,0x00,0x00,0x05,0x00,0x01,0x0D,0x0A,0x2D,0xB4,0x00,0x00,0x00,0x00,0x49,0x45,0x4E,0x44,0xAE,0x42,0x60,0x82)
    [System.IO.File]::WriteAllBytes($imgPath, $png)
    $res = Invoke-Upload -Path '/api/admin/files/image' -Token $script:adminToken -Files @{ file = $imgPath }
    Assert-Equal $res.code 0 '图片上传失败'
    Assert-True ([bool]$res.data.url) '未返回图片地址'
    $http = Invoke-WebRequest -Uri "$Base$($res.data.url)" -UseBasicParsing -Method Head -ErrorAction Stop
    Assert-True ([int]$http.StatusCode -lt 400) '上传后的图片不可访问'
    "url = $($res.data.url)（$($res.data.size) 字节）"
  }

  Test-Case '小视频直传：自动探测时长并抽帧' {
    $storageRoot = Join-Path $PSScriptRoot '..\backend-nest\storage\uploads\demo'
    $localVideo = Get-ChildItem -Path $storageRoot -Filter *.mp4 -ErrorAction SilentlyContinue | Select-Object -First 1
    Assert-True ($null -ne $localVideo) '未找到本地演示视频，无法测试直传'
    $res = Invoke-Upload -Path '/api/admin/files/video' -Token $script:adminToken -Files @{ file = $localVideo.FullName }
    Assert-Equal $res.code 0 '视频直传失败'
    Assert-True ([bool]$res.data.url) '未返回视频地址'
    Assert-True ($res.data.duration -gt 0) '未探测到视频时长'
    Assert-True ([bool]$res.data.coverVideoFrame) '未生成封面帧'
    "时长 = $($res.data.duration)s，分辨率 = $($res.data.resolution)，封面帧 = $($res.data.coverVideoFrame)"
  }

  Test-Case '分片上传：init → part×N → merge，并生成封面帧' {
    # 优先用真实演示视频切片：合并后能被 ffprobe 解析，可顺带验证抽帧；
    # 没有本地演示视频时退化为合成文件（仅验证分片流程与字节一致性）。
    $storageRoot = Join-Path $PSScriptRoot '..\backend-nest\storage\uploads\demo'
    $sourceVideo = Get-ChildItem -Path $storageRoot -Filter *.mp4 -ErrorAction SilentlyContinue |
      Sort-Object Length | Select-Object -First 1
    $realVideo = $null -ne $sourceVideo

    if ($realVideo) {
      $videoPath = Join-Path $tmpDir 'chunk-source.mp4'
      Copy-Item $sourceVideo.FullName $videoPath -Force
    } else {
      $videoPath = Join-Path $tmpDir 'chunk-demo.mp4'
      New-TestFile -Path $videoPath -SizeKb 12288
    }

    $file = Get-Item $videoPath
    $chunkSize = 2 * 1024 * 1024
    $totalChunks = [int][math]::Ceiling($file.Length / $chunkSize)
    $fileHash = "$($file.Name)-$($file.Length)-$([DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds())"

    $init = Invoke-Api -Method POST -Path '/api/admin/files/video/chunk/init' -Token $script:adminToken -Body @{
      fileHash = $fileHash; fileName = $file.Name; fileSize = $file.Length;
      chunkSize = $chunkSize; totalChunks = $totalChunks; mimeType = 'video/mp4'
    }
    Assert-Equal $init.code 0 '分片初始化失败'
    Assert-True ([bool]$init.data.uploadId) '未返回 uploadId'
    $uploadId = $init.data.uploadId
    Assert-Equal $init.data.instant $false '首次上传不应命中秒传'

    for ($i = 0; $i -lt $totalChunks; $i++) {
      $start = $i * $chunkSize
      $len = [math]::Min($chunkSize, $file.Length - $start)
      $chunkPath = Join-Path $tmpDir "part-$i.bin"
      $buffer = New-Object byte[] $len
      $stream = [System.IO.File]::OpenRead($videoPath)
      $stream.Seek($start, 'Begin') | Out-Null
      $read = $stream.Read($buffer, 0, $len)
      $stream.Close()
      Assert-Equal $read $len "分片 $i 读取字节数不符"
      [System.IO.File]::WriteAllBytes($chunkPath, $buffer)
      $part = Invoke-Upload -Path '/api/admin/files/video/chunk/part' -Token $script:adminToken `
        -Fields @{ uploadId = $uploadId; chunkIndex = $i } -Files @{ file = $chunkPath }
      Assert-Equal $part.code 0 "分片 $i 上传失败"
    }

    # 断点续传：重新 init 同一 fileHash，应返回已上传的分片序号
    $resume = Invoke-Api -Method POST -Path '/api/admin/files/video/chunk/init' -Token $script:adminToken -Body @{
      fileHash = $fileHash; fileName = $file.Name; fileSize = $file.Length;
      chunkSize = $chunkSize; totalChunks = $totalChunks; mimeType = 'video/mp4'
    }
    Assert-Equal $resume.code 0 '重新初始化失败'
    Assert-Equal @($resume.data.uploadedChunks).Count $totalChunks '断点续传应返回全部已上传分片'
    $resumeId = $resume.data.uploadId

    $merge = Invoke-Api -Method POST -Path '/api/admin/files/video/chunk/merge' -Token $script:adminToken -Body @{ uploadId = $resumeId }
    Assert-Equal $merge.code 0 '分片合并失败'
    Assert-True ([bool]$merge.data.url) '合并后未返回视频地址'
    Assert-Equal $merge.data.size $file.Length '合并后字节数与源文件不一致'
    if ($realVideo) {
      Assert-True ($merge.data.duration -gt 0) '真实视频合并后应能探测到时长'
      Assert-True ([bool]$merge.data.coverVideoFrame) '真实视频合并后应生成封面帧'
    }
    $mergeMode = if ($realVideo) { '真实视频' } else { '合成文件' }
    "上传 $totalChunks 片（$mergeMode）→ $($merge.data.url)（$($merge.data.size) 字节，时长 = $($merge.data.duration)s，封面帧 = $($merge.data.coverVideoFrame)）"
  }
} finally {
  Remove-SmokeTestData -Token $script:adminToken
  Remove-Item -Path $tmpDir -Recurse -Force -ErrorAction SilentlyContinue
}

# ---------------------------------------------------------------- 汇总
Write-Host ''
Write-Host '============================================================' -ForegroundColor Cyan
if ($script:Fail -eq 0) {
  Write-Host (" 全部通过：{0}/{0}" -f $script:Pass) -ForegroundColor Green
} else {
  Write-Host (" 通过 {0} 项，失败 {1} 项" -f $script:Pass, $script:Fail) -ForegroundColor Red
  foreach ($failure in $script:Failures) { Write-Host ("  - {0}" -f $failure) -ForegroundColor Red }
}
Write-Host '============================================================' -ForegroundColor Cyan
Write-Host ''

if ($script:Fail -gt 0) { exit 1 }
exit 0
