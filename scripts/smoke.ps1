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

# ---------------------------------------------------------------- 4.5 站内搜索
Write-Host ''
Write-Host '[4.5] 站内搜索与可见性对齐' -ForegroundColor Yellow

Test-Case '搜索命中：标题/摘要/正文均可匹配' {
  $res = Invoke-Api -Method GET -Path '/api/portal/articles/search?keyword=%E6%98%BE%E7%A4%BA%E5%99%A8&page=1&pageSize=9'
  Assert-Equal $res.code 0 '业务码应为 0'
  Assert-True ($res.data.total -ge 1) '关键词「显示器」应至少命中 1 篇演示文章'
  Assert-True (@($res.data.list).Count -ge 1) 'list 不能为空'
  "命中 $($res.data.total) 篇，首篇 = 「$(@($res.data.list)[0].title)」"
}

Test-Case '搜索结果不含富文本正文' {
  $res = Invoke-Api -Method GET -Path '/api/portal/articles/search?keyword=%E6%98%BE%E7%A4%BA%E5%99%A8'
  Assert-Equal $res.code 0 '业务码应为 0'
  Assert-True (@($res.data.list).Count -ge 1) 'list 不能为空（否则下面的字段断言无意义）'
  $first = @($res.data.list)[0]
  Assert-True (-not ($first.PSObject.Properties.Name -contains 'content')) '搜索结果不应返回正文 content'
  "字段数 = $(@($first.PSObject.Properties.Name).Count)"
}

Test-Case '搜索无命中返回空列表而不是错误' {
  $res = Invoke-Api -Method GET -Path '/api/portal/articles/search?keyword=zzz-no-such-article-zzz'
  Assert-Equal $res.code 0 '业务码应为 0（无命中不是错误）'
  Assert-True ($null -ne $res.data) '应返回 data 段'
  Assert-Equal $res.data.total 0 '不应命中任何文章'
  Assert-Equal @($res.data.list).Count 0 'list 应为空数组'
}

Test-Case '搜索关键词为空返回 40000' {
  $res = Invoke-Api -Method GET -Path '/api/portal/articles/search?keyword='
  Assert-Equal $res.__body.code 40000 '应返回参数校验错误 40000'
  # 断言消息确实来自关键词校验，而不是路由冲突：
  # 若 articles/:id 吞掉了 search，ParseIntPipe 的消息是
  # "Validation failed (numeric string is expected)"，不含「关键词」
  Assert-True ($res.__body.message -like '*关键词*') "错误消息应来自关键词校验，实际 = $($res.__body.message)"
}

Test-Case '搜索关键词全空格返回 40000' {
  $res = Invoke-Api -Method GET -Path '/api/portal/articles/search?keyword=%20%20%20'
  Assert-Equal $res.__body.code 40000 'trim 后为空应返回 40000'
  Assert-True ($res.__body.message -like '*关键词*') "错误消息应来自关键词校验，实际 = $($res.__body.message)"
}

Test-Case '可见性对齐：已上架未推荐文章可搜索、可打开、但不进首页' {
  $created = Invoke-Api -Method POST -Path '/api/admin/articles' -Token $script:adminToken -Body @{
    title       = '可见性对齐测试文章（可安全删除）'
    shortDesc   = '用于验证「上架即可见、推荐位只管首页展示」的规则。'
    coverType   = 'image'
    coverImages = @('https://picsum.photos/seed/visibility/1200/800')
    content     = '<p>可见性对齐测试正文关键字：可见性对齐样本</p>'
    isRecommend = $false
    isPublish   = $true
    sort        = 0
  }
  Assert-Equal $created.code 0 '创建测试文章失败'
  $id = $created.data.id

  try {
    # 注意：变量名不能用 $home —— PowerShell 的 $HOME 是只读自动变量，赋值会直接报错
    $homeList = Invoke-Api -Method GET -Path '/api/portal/articles?page=1&pageSize=50'
    $inHome = @($homeList.data.list) | Where-Object { $_.id -eq $id }
    Assert-True ($null -eq $inHome) '未推荐文章不应出现在首页列表'

    $search = Invoke-Api -Method GET -Path '/api/portal/articles/search?keyword=%E5%8F%AF%E8%A7%81%E6%80%A7%E5%AF%B9%E9%BD%90%E6%A0%B7%E6%9C%AC'
    $inSearch = @($search.data.list) | Where-Object { $_.id -eq $id }
    Assert-True ($null -ne $inSearch) '已上架文章应能被搜索命中（含正文匹配）'

    $detail = Invoke-Api -Method GET -Path "/api/portal/articles/$id"
    Assert-Equal $detail.code 0 '已上架未推荐文章详情应可打开（可见性对齐）'

    $offline = Invoke-Api -Method PATCH -Path "/api/admin/articles/$id/publish" -Token $script:adminToken -Body @{ value = $false }
    Assert-Equal $offline.code 0 '下架失败'

    $searchAfterOffline = Invoke-Api -Method GET -Path '/api/portal/articles/search?keyword=%E5%8F%AF%E8%A7%81%E6%80%A7%E5%AF%B9%E9%BD%90%E6%A0%B7%E6%9C%AC'
    $stillThere = @($searchAfterOffline.data.list) | Where-Object { $_.id -eq $id }
    Assert-True ($null -eq $stillThere) '下架后不应再被搜索命中'

    $detailOffline = Invoke-Api -Method GET -Path "/api/portal/articles/$id"
    Assert-Equal $detailOffline.__body.code 40400 '下架后详情应返回 40400'
    "测试文章 ID = $id（未推荐可搜索、下架后不可见）"
  } finally {
    [void](Invoke-Api -Method DELETE -Path "/api/admin/articles/$id" -Token $script:adminToken)
  }
}

# ---------------------------------------------------------------- 4.6 邮件订阅与验证码
Write-Host ''
Write-Host '[4.6] 邮件订阅与图形验证码' -ForegroundColor Yellow

$script:repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path

<#
  取验证码的正确答案。
  答案只存在服务端 Redis 里、接口不会返回，因此必须用本地辅助脚本按 captchaId 读出来，
  否则无法验证「正确验证码提交成功」这条主路径。辅助脚本不是产品接口。

  两个必须注意的坑（都实际踩过）：
  1. PowerShell 5.1 在 $ErrorActionPreference='Stop' 下，会把原生命令写到 stderr 的内容
     当成终止错误抛出。node 启动时会往 stderr 打一行 UNDICI 实验特性警告，
     于是「读答案」这一步直接抛异常、整组断言全废。这里临时把 ErrorActionPreference 降为 Continue。
  2. 同时用 --no-warnings 关掉警告，避免污染返回值。
#>
function Invoke-NodeHelper {
  param([string]$ScriptName, [string[]]$Arguments = @())
  $previous = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  try {
    $scriptPath = Join-Path $script:repoRoot "scripts\$ScriptName"
    $output = & node --no-warnings $scriptPath @Arguments 2>$null
    $exitCode = $LASTEXITCODE
  } finally {
    $ErrorActionPreference = $previous
  }
  return @{ output = $output; exitCode = $exitCode }
}

function Get-CaptchaAnswer {
  param([string]$CaptchaId)
  $result = Invoke-NodeHelper -ScriptName 'get-captcha-answer.mjs' -Arguments @($CaptchaId)
  if ($result.exitCode -ne 0) { throw "读取验证码答案失败（captchaId=$CaptchaId，exit=$($result.exitCode)）" }
  return ($result.output | Select-Object -First 1).Trim()
}

function Reset-SubscribeRate {
  param([string]$Ip = '127.0.0.1')
  [void](Invoke-NodeHelper -ScriptName 'reset-subscribe-rate.mjs' -Arguments @($Ip))
}

function New-CaptchaPair {
  $captcha = Invoke-Api -Method GET -Path '/api/portal/captcha'
  Assert-Equal $captcha.code 0 '获取验证码失败'
  return @{ captchaId = $captcha.data.captchaId; answer = (Get-CaptchaAnswer $captcha.data.captchaId) }
}

$script:smokeEmail = "smoke-subscribe-$((Get-Random -Minimum 10000 -Maximum 99999))@example.com"

Test-Case '获取图形验证码：返回 id 与可直接用于 img 的 data URI' {
  $res = Invoke-Api -Method GET -Path '/api/portal/captcha'
  Assert-Equal $res.code 0 '业务码应为 0'
  Assert-True ([bool]$res.data.captchaId) '未返回 captchaId'
  Assert-True ($res.data.imageBase64 -like 'data:image/svg+xml;base64,*') "imageBase64 前缀不正确，实际 = $($res.data.imageBase64.Substring(0, [Math]::Min(40, $res.data.imageBase64.Length)))"
  Assert-True ($res.data.imageBase64.Length -gt 200) 'imageBase64 过短，可能不是完整 SVG'
  "captchaId = $($res.data.captchaId.Substring(0, 8))...，data URI 长度 = $($res.data.imageBase64.Length)"
}

Test-Case '伪造 captchaId 提交被拒（40000）' {
  $res = Invoke-Api -Method POST -Path '/api/portal/subscriptions' -Body @{
    email = $script:smokeEmail; message = '顺手写点东西'; captchaId = 'not-a-real-captcha-id'; captchaCode = 'abcd'
  }
  Assert-Equal $res.__body.code 40000 '应返回 40000'
  Assert-True ($res.__body.message -like '*验证码*') "错误消息应提到验证码，实际 = $($res.__body.message)"
}

Test-Case '邮箱格式非法被拒（40000）' {
  $pair = New-CaptchaPair
  $res = Invoke-Api -Method POST -Path '/api/portal/subscriptions' -Body @{
    email = 'not-an-email'; captchaId = $pair.captchaId; captchaCode = $pair.answer
  }
  Assert-Equal $res.__body.code 40000 '非法邮箱应返回 40000'
}

Test-Case '正确验证码提交成功，且留言可留空' {
  Reset-SubscribeRate
  $pair = New-CaptchaPair
  $res = Invoke-Api -Method POST -Path '/api/portal/subscriptions' -Body @{
    email = $script:smokeEmail; captchaId = $pair.captchaId; captchaCode = $pair.answer
  }
  Assert-Equal $res.code 0 '订阅应成功'
  Assert-Equal $res.data.duplicated $false '首次提交不应是重复'
  # 留言留空也能提交
  $pair2 = New-CaptchaPair
  $res2 = Invoke-Api -Method POST -Path '/api/portal/subscriptions' -Body @{
    email = "blank-$script:smokeEmail"; captchaId = $pair2.captchaId; captchaCode = $pair2.answer
  }
  Assert-Equal $res2.code 0 '不填留言也应能提交'
  "订阅邮箱 = $script:smokeEmail（留言留空用例 = blank-$script:smokeEmail）"
}

Test-Case '重复邮箱幂等：返回 duplicated 且不新增记录' {
  $token = $script:adminToken
  $before = Invoke-Api -Method GET -Path "/api/admin/subscriptions?page=1&pageSize=1&email=$([uri]::EscapeDataString($script:smokeEmail))" -Token $token
  Assert-Equal $before.code 0 '订阅列表查询失败'
  $beforeTotal = $before.data.total

  $pair = New-CaptchaPair
  $res = Invoke-Api -Method POST -Path '/api/portal/subscriptions' -Body @{
    email = $script:smokeEmail; captchaId = $pair.captchaId; captchaCode = $pair.answer
  }
  Assert-Equal $res.code 0 '重复提交不应报错'
  Assert-Equal $res.data.duplicated $true '重复提交应返回 duplicated=true'

  $after = Invoke-Api -Method GET -Path "/api/admin/subscriptions?page=1&pageSize=1&email=$([uri]::EscapeDataString($script:smokeEmail))" -Token $token
  Assert-Equal $after.data.total $beforeTotal '重复提交不应新增记录'
  "该邮箱记录数：$beforeTotal -> $($after.data.total)"
}

Test-Case '验证码一次性：同一 captchaId 第二次提交必然失败' {
  $pair = New-CaptchaPair
  $email = "once-$script:smokeEmail"
  $first = Invoke-Api -Method POST -Path '/api/portal/subscriptions' -Body @{
    email = $email; captchaId = $pair.captchaId; captchaCode = $pair.answer
  }
  Assert-Equal $first.code 0 '首次提交应成功'
  $second = Invoke-Api -Method POST -Path '/api/portal/subscriptions' -Body @{
    email = "once2-$script:smokeEmail"; captchaId = $pair.captchaId; captchaCode = $pair.answer
  }
  Assert-Equal $second.__body.code 40000 '同一验证码第二次使用应失败'
}

Test-Case '同 IP 高频提交触发限流（42900）' {
  Reset-SubscribeRate
  $email = "rate-$script:smokeEmail"
  $codes = @()
  for ($i = 1; $i -le 6; $i += 1) {
    $pair = New-CaptchaPair
    $res = Invoke-Api -Method POST -Path '/api/portal/subscriptions' -Body @{
      email = $email; captchaId = $pair.captchaId; captchaCode = $pair.answer
    }
    $codes += if ($null -ne $res.__body) { $res.__body.code } else { $res.code }
  }
  $allowed = @($codes | Where-Object { $_ -eq 0 }).Count
  $limited = @($codes | Where-Object { $_ -eq 42900 }).Count
  Assert-Equal $allowed 5 '前 5 次应放行'
  Assert-Equal $limited 1 '第 6 次应被限流'
  Reset-SubscribeRate
  "6 次提交结果码 = $($codes -join ', ')（已在断言后清除限流计数，避免影响后续运行）"
}

Test-Case '订阅列表按邮箱筛选并支持删除' {
  $token = $script:adminToken
  $list = Invoke-Api -Method GET -Path "/api/admin/subscriptions?page=1&pageSize=20&email=$([uri]::EscapeDataString($script:smokeEmail))" -Token $token
  Assert-Equal $list.code 0 '列表查询失败'
  Assert-True ($list.data.total -ge 1) '应能按邮箱筛选到订阅记录'
  $first = @($list.data.list)[0]
  Assert-True ([bool]$first.sourceIp) '订阅记录应含来源 IP'
  Assert-True ($null -ne $first.createdAt) '订阅记录应含订阅时间'

  $deleted = Invoke-Api -Method DELETE -Path "/api/admin/subscriptions/$($first.id)" -Token $token
  Assert-Equal $deleted.code 0 '删除订阅失败'
  $after = Invoke-Api -Method GET -Path "/api/admin/subscriptions?page=1&pageSize=20&email=$([uri]::EscapeDataString($script:smokeEmail))" -Token $token
  Assert-True ($after.data.total -lt $list.data.total) '删除后记录数应减少'
  "已删除订阅 id=$($first.id)，该邮箱剩余 $($after.data.total) 条"
}

# ---------------------------------------------------------------- 4.7 分类管理
Write-Host ''
Write-Host '[4.7] 分类管理与前台分类接口' -ForegroundColor Yellow

$script:smokeCategoryId = $null
$script:smokeCategoryName = "冒烟分类-$((Get-Random -Minimum 1000 -Maximum 9999))"

Test-Case '分类列表返回数组且含文章数' {
  $res = Invoke-Api -Method GET -Path '/api/admin/categories' -Token $script:adminToken
  Assert-Equal $res.code 0 '业务码应为 0'
  Assert-True (@($res.data).Count -ge 1) '演示数据应已有分类'
  $withArticles = @($res.data) | Where-Object { $_.articleCount -gt 0 } | Select-Object -First 1
  Assert-True ($null -ne $withArticles) '至少应有一个分类挂有文章'
  "分类数 = $(@($res.data).Count)，示例：$($withArticles.name)（$($withArticles.articleCount) 篇）"
}

Test-Case '新增分类 → 重名冲突 → 改名 → 删除' {
  $created = Invoke-Api -Method POST -Path '/api/admin/categories' -Token $script:adminToken -Body @{
    name = $script:smokeCategoryName; sort = 5
  }
  Assert-Equal $created.code 0 '新增分类失败'
  $script:smokeCategoryId = $created.data.id
  Assert-Equal $created.data.name $script:smokeCategoryName '分类名不一致'

  $dup = Invoke-Api -Method POST -Path '/api/admin/categories' -Token $script:adminToken -Body @{ name = $script:smokeCategoryName }
  Assert-Equal $dup.__body.code 40900 '重名应返回 40900'

  $renamed = Invoke-Api -Method PUT -Path "/api/admin/categories/$($script:smokeCategoryId)" -Token $script:adminToken -Body @{ name = "$script:smokeCategoryName-改"; sort = 7 }
  Assert-Equal $renamed.code 0 '改名失败'
  Assert-Equal $renamed.data.sort 7 '排序未更新'

  $removed = Invoke-Api -Method DELETE -Path "/api/admin/categories/$($script:smokeCategoryId)" -Token $script:adminToken
  Assert-Equal $removed.code 0 '删除空分类失败'
  $script:smokeCategoryId = $null
  "分类 CRUD 全流程通过（名称 $script:smokeCategoryName）"
}

Test-Case '删除仍有文章的分类被拒（40900），并提示剩余文章数' {
  $cats = Invoke-Api -Method GET -Path '/api/admin/categories' -Token $script:adminToken
  $busy = @($cats.data) | Where-Object { $_.articleCount -gt 0 } | Select-Object -First 1
  Assert-True ($null -ne $busy) '需要一个挂有文章的分类才能验证'
  $res = Invoke-Api -Method DELETE -Path "/api/admin/categories/$($busy.id)" -Token $script:adminToken
  Assert-Equal $res.__body.code 40900 '被占用的分类不应被删除'
  Assert-True ($res.__body.message -match '\d') "错误消息应包含文章数量，实际 = $($res.__body.message)"
  "「$($busy.name)」（$($busy.articleCount) 篇）被拒绝删除：$($res.__body.message)"
}

Test-Case '前台分类接口：总览与按分类取文章（仅已上架）' {
  $portal = Invoke-Api -Method GET -Path '/api/portal/categories'
  Assert-Equal $portal.code 0 '前台分类接口失败'
  Assert-True (@($portal.data).Count -ge 1) '前台应返回分类'
  $target = @($portal.data) | Where-Object { $_.articleCount -gt 0 } | Select-Object -First 1
  Assert-True ($null -ne $target) '应有一个非空分类'

  $articles = Invoke-Api -Method GET -Path "/api/portal/categories/$($target.id)/articles?page=1&pageSize=9"
  Assert-Equal $articles.code 0 '按分类取文章失败'
  Assert-True ($articles.data.total -ge 1) '该分类下应有文章'
  $item = @($articles.data.list)[0]
  Assert-True (-not ($item.PSObject.Properties.Name -contains 'content')) '分类文章列表不应返回正文'
  Assert-Equal $item.categoryId $target.id '返回文章的 categoryId 应与分类一致'

  $missing = Invoke-Api -Method GET -Path '/api/portal/categories/999999/articles'
  Assert-Equal $missing.__body.code 40400 '不存在的分类应返回 40400'
  "分类「$($target.name)」返回 $($articles.data.total) 篇"
}

# ---------------------------------------------------------------- 4.8 操作日志与权限
Write-Host ''
Write-Host '[4.8] 操作日志与新增权限码' -ForegroundColor Yellow

Test-Case '操作日志记录了刚发生的分类新增操作' {
  # 再新增一次分类，确保日志里有一条确定的 create 记录
  $name = "日志验证分类-$((Get-Random -Minimum 1000 -Maximum 9999))"
  $created = Invoke-Api -Method POST -Path '/api/admin/categories' -Token $script:adminToken -Body @{ name = $name }
  Assert-Equal $created.code 0 '新增分类失败'

  $logs = Invoke-Api -Method GET -Path '/api/admin/operation-logs?page=1&pageSize=20&module=blog:category' -Token $script:adminToken
  Assert-Equal $logs.code 0 '操作日志查询失败'
  # 注意：新增走的是 POST /admin/categories，路径上没有 :id，
  # 因此 targetId 按设计为 null（拦截器只从路由参数取 targetId，不编造内容）。
  # 这里不断言 targetId，targetId 的正确性由下面的「改名」用例覆盖。
  $hit = @($logs.data.list) | Where-Object { $_.action -eq 'create' -and $_.result -eq 1 } | Select-Object -First 1
  Assert-True ($null -ne $hit) '应能查到刚才的分类新增日志'
  Assert-Equal $hit.result 1 '成功操作的 result 应为 1'
  Assert-Equal $hit.adminUsername 'admin' '操作人账号快照应为 admin'
  Assert-True ([bool]$hit.operationIp) '日志应记录来源 IP'
  Assert-Equal $hit.requestMethod 'POST' '应记录 HTTP 方法'

  # 带 :id 的路由必须能取到 targetId
  $renamed = Invoke-Api -Method PUT -Path "/api/admin/categories/$($created.data.id)" -Token $script:adminToken -Body @{ name = "$name-改" }
  Assert-Equal $renamed.code 0 '改名失败'
  $logs2 = Invoke-Api -Method GET -Path '/api/admin/operation-logs?page=1&pageSize=20&module=blog:category' -Token $script:adminToken
  $updateHit = @($logs2.data.list) | Where-Object { $_.action -eq 'update' -and $_.targetId -eq $created.data.id } | Select-Object -First 1
  Assert-True ($null -ne $updateHit) "带 :id 的操作应记录 targetId（期望 $($created.data.id)）"
  Assert-Equal $updateHit.targetType 'category' 'targetType 应为 category'

  [void](Invoke-Api -Method DELETE -Path "/api/admin/categories/$($created.data.id)" -Token $script:adminToken)
  "create 日志 id=$($hit.id)（targetId=null，符合设计）；update 日志 targetId=$($updateHit.targetId)，IP=$($hit.operationIp)"
}

Test-Case '失败的操作也会被记录（result=0 且带错误信息）' {
  # 重名的分类新增会失败（40900），拦截器应记下失败日志
  $cats = Invoke-Api -Method GET -Path '/api/admin/categories' -Token $script:adminToken
  $existing = @($cats.data)[0]
  Assert-True ($null -ne $existing) '需要一个已存在的分类'

  [void](Invoke-Api -Method POST -Path '/api/admin/categories' -Token $script:adminToken -Body @{ name = $existing.name })

  $logs = Invoke-Api -Method GET -Path '/api/admin/operation-logs?page=1&pageSize=20&module=blog:category&result=0' -Token $script:adminToken
  Assert-Equal $logs.code 0 '按结果筛选失败'
  Assert-True ($logs.data.total -ge 1) '应存在失败的操作日志'
  $failed = @($logs.data.list)[0]
  Assert-True ([bool]$failed.errorMessage) '失败日志应带错误信息'
  "失败日志：$($failed.module)/$($failed.action) result=$($failed.result)，错误 = $($failed.errorMessage)"
}

Test-Case '内容编辑：可读分类列表，但不能写分类' {
  $read = Invoke-Api -Method GET -Path '/api/admin/categories' -Token $script:editorToken
  Assert-Equal $read.code 0 '内容编辑应能读取分类列表（写文章要选分类）'

  $write = Invoke-Api -Method POST -Path '/api/admin/categories' -Token $script:editorToken -Body @{ name = '越权分类' }
  Assert-Equal $write.__body.code 40300 '内容编辑不应能新增分类'
  Assert-Equal $write.__httpStatus 403 'HTTP 状态码应为 403'
}

Test-Case '内容编辑：订阅列表与操作日志均被拒（40300）' {
  $subs = Invoke-Api -Method GET -Path '/api/admin/subscriptions' -Token $script:editorToken
  Assert-Equal $subs.__body.code 40300 '内容编辑不应能看订阅列表'
  $logs = Invoke-Api -Method GET -Path '/api/admin/operation-logs' -Token $script:editorToken
  Assert-Equal $logs.__body.code 40300 '内容编辑不应能看操作日志'
}

Test-Case '未登录访问新增接口一律 40100' {
  foreach ($path in @('/api/admin/categories', '/api/admin/subscriptions', '/api/admin/operation-logs')) {
    $res = Invoke-Api -Method GET -Path $path
    Assert-Equal $res.__body.code 40100 "未登录访问 $path 应返回 40100"
  }
}

Test-Case '清理本轮产生的测试数据（订阅与临时分类）' {
  <#
    为什么需要这一步：
    4.6 各用例用的是同一批带随机后缀的邮箱（smoke- / blank- / once- / rate- 前缀），
    而「删除订阅」用例只删了筛选结果里的第一条，其余几条会留在库里（实测漏留过 7 条）；
    4.8 的断言一旦失败还会跳过它自己的清理，漏留临时分类。
    这里按后缀与前缀统一兜底清理，让烟测可以反复运行而不污染数据。
  #>
  $suffix = ($script:smokeEmail -replace '^smoke-subscribe-', '')

  $subs = Invoke-Api -Method GET -Path '/api/admin/subscriptions?page=1&pageSize=100' -Token $script:adminToken
  $mySubscriptions = @($subs.data.list) | Where-Object { $_.email -like "*$suffix*" }
  foreach ($item in $mySubscriptions) {
    [void](Invoke-Api -Method DELETE -Path "/api/admin/subscriptions/$($item.id)" -Token $script:adminToken)
  }

  $cats = Invoke-Api -Method GET -Path '/api/admin/categories' -Token $script:adminToken
  $leftoverCategories = @($cats.data) | Where-Object {
    $_.name -like '日志验证分类-*' -or $_.name -like '冒烟分类-*' -or $_.name -like '越权分类*'
  }
  foreach ($item in $leftoverCategories) {
    [void](Invoke-Api -Method DELETE -Path "/api/admin/categories/$($item.id)" -Token $script:adminToken)
  }

  $after = Invoke-Api -Method GET -Path '/api/admin/subscriptions?page=1&pageSize=1' -Token $script:adminToken
  Assert-True ($after.code -eq 0) '清理后仍应能查询订阅列表'
  "已清理订阅 $($mySubscriptions.Count) 条、临时分类 $($leftoverCategories.Count) 个；库中剩余订阅 $($after.data.total) 条"
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
