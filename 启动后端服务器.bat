@echo off
cd /d "C:\Users\chenl\OfficeAddinApps\ProofRead-Backend"
echo ========================================
echo   启动 ProofRead 后端服务器
echo   端口: 3001
echo   数据库: PostgreSQL (localhost:5432)
echo ========================================
echo.
echo 正在启动服务器...请勿关闭此窗口
echo.
npm run dev
pause
