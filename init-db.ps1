# PostgreSQL Database Initialization Script for Windows PowerShell

Write-Host ""
Write-Host "======================================================"
Write-Host "   PostgreSQL Database Initialization Tool"
Write-Host "======================================================"
Write-Host ""

# Set defaults
$DB_HOST = "localhost"
$DB_PORT = "5432"
$DB_NAME = "proofread_db"
$DB_USER = "proofread_user"
$DB_PASSWORD = "ProofRead123!@#"

# Try to read from .env
$envFile = ".env"
if (Test-Path $envFile) {
    Write-Host "Reading .env file..." -ForegroundColor Yellow
    Get-Content $envFile | ForEach-Object {
        $line = $_
        if ($line -match "^([^=]+)=(.+)$") {
            $key = $matches[1].Trim()
            $value = $matches[2].Trim()
            
            switch ($key) {
                "DB_HOST" { $DB_HOST = $value }
                "DB_PORT" { $DB_PORT = $value }
                "DB_NAME" { $DB_NAME = $value }
                "DB_USER" { $DB_USER = $value }
                "DB_PASSWORD" { $DB_PASSWORD = $value }
            }
        }
    }
}

Write-Host "Configuration:" -ForegroundColor Yellow
Write-Host "  Database: $DB_HOST`:$DB_PORT"
Write-Host "  Database Name: $DB_NAME"
Write-Host "  User: $DB_USER"
Write-Host ""

# Check if psql is available
$psqlVersion = $null
try {
    $psqlVersion = psql --version 2>&1
    Write-Host "PostgreSQL installed: $psqlVersion" -ForegroundColor Green
}
catch {
    # Try to find PostgreSQL in default location
    $psqlPaths = @(
        "C:\Program Files\PostgreSQL\18\bin\psql.exe",
        "C:\Program Files\PostgreSQL\17\bin\psql.exe",
        "C:\Program Files\PostgreSQL\16\bin\psql.exe",
        "C:\Program Files\PostgreSQL\15\bin\psql.exe",
        "C:\Program Files\PostgreSQL\14\bin\psql.exe"
    )
    
    $psqlFound = $false
    foreach ($psqlPath in $psqlPaths) {
        if (Test-Path $psqlPath) {
            $binDir = Split-Path -Parent $psqlPath
            $env:PATH = "$binDir;$env:PATH"
            Write-Host "Found PostgreSQL at: $binDir" -ForegroundColor Green
            $psqlVersion = & $psqlPath --version 2>&1
            Write-Host "PostgreSQL installed: $psqlVersion" -ForegroundColor Green
            $psqlFound = $true
            break
        }
    }
    
    if (-not $psqlFound) {
        Write-Host "ERROR: PostgreSQL not found. Please install it first." -ForegroundColor Red
        Write-Host "Download from: https://www.postgresql.org/download/windows/"
        exit 1
    }
}

# Prompt for postgres password
$postgres_password = Read-Host "Enter postgres user password"

# Create SQL initialization script
$sqlScript = @"
-- Create user
CREATE USER "$DB_USER" WITH PASSWORD '$DB_PASSWORD';

-- Create database
CREATE DATABASE "$DB_NAME" OWNER "$DB_USER";

-- Grant privileges
GRANT ALL PRIVILEGES ON DATABASE "$DB_NAME" TO "$DB_USER";
"@

# Create table creation script (separate, to avoid connection switching issue)
$sqlTables = @"
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    account VARCHAR(255) UNIQUE NOT NULL,
    user_type VARCHAR(50) DEFAULT 'free',
    account_status VARCHAR(50) DEFAULT 'active',
    registration_ip VARCHAR(50),
    token_balance BIGINT DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_users_account ON users(account);

CREATE TABLE IF NOT EXISTS token_logs (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    deduction_amount BIGINT NOT NULL,
    remaining_balance BIGINT NOT NULL,
    business_type VARCHAR(100) NOT NULL,
    business_id VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_token_logs_user_id ON token_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_token_logs_created_at ON token_logs(created_at);

CREATE TABLE IF NOT EXISTS payment_orders (
    id SERIAL PRIMARY KEY,
    order_number VARCHAR(50) UNIQUE NOT NULL,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    recharge_amount DECIMAL(10, 2) NOT NULL,
    token_amount BIGINT NOT NULL,
    order_status VARCHAR(50) DEFAULT 'pending',
    payment_channel VARCHAR(50) DEFAULT 'wechat_native',
    wechat_prepay_id VARCHAR(255),
    wechat_transaction_id VARCHAR(255),
    code_url VARCHAR(1000),
    expired_at TIMESTAMP NOT NULL,
    paid_at TIMESTAMP,
    closed_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_payment_orders_number ON payment_orders(order_number);
CREATE INDEX IF NOT EXISTS idx_payment_orders_user_id ON payment_orders(user_id);
CREATE INDEX IF NOT EXISTS idx_payment_orders_status ON payment_orders(order_status);

CREATE TABLE IF NOT EXISTS recharge_logs (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    order_number VARCHAR(50) NOT NULL,
    recharge_amount DECIMAL(10, 2) NOT NULL,
    token_amount BIGINT NOT NULL,
    payment_status VARCHAR(50) NOT NULL,
    payment_channel VARCHAR(50) DEFAULT 'wechat_native',
    wechat_transaction_id VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_recharge_logs_user_id ON recharge_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_recharge_logs_order_number ON recharge_logs(order_number);

CREATE TABLE IF NOT EXISTS login_logs (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    login_ip VARCHAR(45),
    login_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    logout_time TIMESTAMP,
    session_id VARCHAR(255)
);
CREATE INDEX IF NOT EXISTS idx_login_logs_user_id ON login_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_login_logs_login_time ON login_logs(login_time);
"@

# Save SQL to file
$sqlScript | Out-File -FilePath "init-db-setup.sql" -Encoding UTF8 -Force
$sqlTables | Out-File -FilePath "init-db-tables.sql" -Encoding UTF8 -Force

Write-Host "Initializing database..." -ForegroundColor Cyan

# Step 1: Create user and database with postgres user
$env:PGPASSWORD = $postgres_password
$result1 = & psql -h $DB_HOST -p $DB_PORT -U postgres -f "init-db-setup.sql" 2>&1

if ($LASTEXITCODE -ne 0) {
    Write-Host ""
    Write-Host "ERROR: User/Database creation failed" -ForegroundColor Red
    Write-Host "Output: $result1"
    Write-Host ""
    Write-Host "Tips:" -ForegroundColor Yellow
    Write-Host "1. Check if PostgreSQL service is running"
    Write-Host "2. Verify postgres password"
    Write-Host "3. Check .env configuration"
    Write-Host ""
    
    # Clean up
    Remove-Item "init-db-setup.sql" -Force -ErrorAction SilentlyContinue
    Remove-Item "init-db-tables.sql" -Force -ErrorAction SilentlyContinue
    exit 1
}

Write-Host "Created user and database successfully" -ForegroundColor Green

# Step 2: Create tables with new user
$env:PGPASSWORD = $DB_PASSWORD
$result2 = & psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME -f "init-db-tables.sql" 2>&1

if ($LASTEXITCODE -eq 0) {
    Write-Host ""
    Write-Host "======================================================"
    Write-Host "   SUCCESS! Database initialized"
    Write-Host "======================================================"
    Write-Host ""
    Write-Host "Database: $DB_NAME"
    Write-Host "User: $DB_USER"
    Write-Host "Address: $DB_HOST`:$DB_PORT"
    Write-Host ""
    Write-Host "Next: Run 'npm run dev' to start the backend"
    Write-Host ""
    
    # Clean up
    Remove-Item "init-db-setup.sql" -Force -ErrorAction SilentlyContinue
    Remove-Item "init-db-tables.sql" -Force -ErrorAction SilentlyContinue
}
else {
    Write-Host ""
    Write-Host "ERROR: Table creation failed" -ForegroundColor Red
    Write-Host "Output: $result2"
    Write-Host ""
    Write-Host "Tips:" -ForegroundColor Yellow
    Write-Host "1. Database user/database may have been created"
    Write-Host "2. Check user password in .env"
    Write-Host "3. Try connecting manually:"
    Write-Host "   psql -h $DB_HOST -U $DB_USER -d $DB_NAME"
    Write-Host ""
    
    # Clean up
    Remove-Item "init-db-setup.sql" -Force -ErrorAction SilentlyContinue
    Remove-Item "init-db-tables.sql" -Force -ErrorAction SilentlyContinue
}

