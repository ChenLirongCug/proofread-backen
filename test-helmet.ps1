# 测试helmet是否移除X-Powered-By响应头

Write-Host "📋 测试helmet安全中间件..." -ForegroundColor Cyan

$response = Invoke-WebRequest -Uri "http://localhost:3001/health" -UseBasicParsing

Write-Host "`n✅ 服务器响应成功!" -ForegroundColor Green
Write-Host "状态码: $($response.StatusCode)" -ForegroundColor Yellow

Write-Host "`n=== HTTP响应头 ===" -ForegroundColor Cyan
$response.Headers.GetEnumerator() | ForEach-Object {
    Write-Host "  $($_.Key): $($_.Value)" -ForegroundColor White
}

Write-Host "`n=== 安全检查 ===" -ForegroundColor Cyan

# 检查X-Powered-By
if ($response.Headers.ContainsKey('X-Powered-By')) {
    Write-Host "  ❌ X-Powered-By: $($response.Headers['X-Powered-By'])" -ForegroundColor Red
    Write-Host "     风险: 泄露技术栈信息" -ForegroundColor Yellow
} else {
    Write-Host "  ✅ X-Powered-By 已移除" -ForegroundColor Green
}

# 检查helmet添加的安全头
$helmetHeaders = @(
    'X-Content-Type-Options',
    'X-Frame-Options',
    'X-DNS-Prefetch-Control',
    'Strict-Transport-Security'
)

Write-Host "`n=== Helmet安全头 ===" -ForegroundColor Cyan
foreach ($header in $helmetHeaders) {
    if ($response.Headers.ContainsKey($header)) {
        Write-Host "  ✅ $header : $($response.Headers[$header])" -ForegroundColor Green
    } else {
        Write-Host "  ⚠️  $header : 未设置" -ForegroundColor Yellow
    }
}

Write-Host "`n测试完成!" -ForegroundColor Cyan
