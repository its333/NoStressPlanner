#!/bin/bash

# Replit run script for NoStressPlanner
echo "🚀 Starting NoStressPlanner on Replit..."

# Check if pnpm is installed
if ! command -v pnpm &> /dev/null; then
    echo "📦 Installing pnpm..."
    npm install -g pnpm
fi

# Install dependencies
echo "📦 Installing dependencies..."
pnpm install

# Check if .env.local exists, if not create from example
if [ ! -f .env.local ]; then
    echo "⚙️ Creating .env.local from example..."
    cp .env.example .env.local
    echo "📝 Please update .env.local with your actual environment variables!"
    echo "🔑 You'll need to set up:"
    echo "   - DATABASE_URL (Supabase PostgreSQL)"
    echo "   - NEXTAUTH_SECRET (generate with: openssl rand -base64 32)"
    echo "   - DISCORD_CLIENT_ID and DISCORD_CLIENT_SECRET"
    echo "   - PUSHER credentials"
    echo ""
fi

# Generate Prisma client
echo "🗄️ Generating Prisma client..."
pnpm prisma generate

# Run database migrations (if DATABASE_URL is set)
if [ ! -z "$DATABASE_URL" ]; then
    echo "🗄️ Running database migrations..."
    pnpm prisma migrate deploy
else
    echo "⚠️ DATABASE_URL not set, skipping migrations"
    echo "   Run 'pnpm prisma migrate dev --name init' after setting up your database"
fi

# Start the development server
echo "🌐 Starting development server..."
echo "📍 Your app will be available at: https://$REPL_SLUG.$REPL_OWNER.repl.co"
echo "🔧 Local development: http://localhost:3001"
echo ""
pnpm dev:replit
