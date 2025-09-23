@echo off
REM Setup script for Codex to run NoStressPlanner on Windows
REM This script ensures proper environment setup and avoids common issues

echo 🚀 Setting up NoStressPlanner for Codex...

REM Check if we're in the right directory
if not exist "package.json" (
    echo ❌ Error: package.json not found. Please run this script from the project root.
    pause
    exit /b 1
)

REM Create .env.local from .env.example if it doesn't exist
if not exist ".env.local" (
    echo 📝 Creating .env.local from .env.example...
    copy .env.example .env.local >nul
    
    echo ✅ Created .env.local
    echo ⚠️  You may need to update environment variables in .env.local
) else (
    echo ✅ .env.local already exists
)

REM Install dependencies
echo 📦 Installing dependencies...
if exist "pnpm-lock.yaml" (
    if command -v pnpm >nul 2>&1 (
        pnpm install
    ) else (
        echo ⚠️  pnpm not found, installing with npm...
        npm install
    )
) else (
    npm install
)

REM Generate Prisma client
echo ⚙️ Generating Prisma client...
if command -v pnpm >nul 2>&1 (
    pnpm prisma generate
) else (
    npx prisma generate
)

echo ✅ Setup complete!
echo.
echo To run the development server:
echo   pnpm dev
echo.
echo To run the production build:
echo   pnpm build ^&^& pnpm start
echo.
echo For more information, see README.md
pause
