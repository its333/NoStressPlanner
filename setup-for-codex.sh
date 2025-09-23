#!/bin/bash

# Setup script for Codex to run NoStressPlanner
# This script ensures proper environment setup and avoids common issues

echo "🚀 Setting up NoStressPlanner for Codex..."

# Check if we're in the right directory
if [ ! -f "package.json" ]; then
    echo "❌ Error: package.json not found. Please run this script from the project root."
    exit 1
fi

# Create .env.local from .env.example if it doesn't exist
if [ ! -f ".env.local" ]; then
    echo "📝 Creating .env.local from .env.example..."
    cp .env.example .env.local
    
    # Generate a random NextAuth secret
    NEXTAUTH_SECRET=$(openssl rand -base64 32 2>/dev/null || echo "fallback-secret-$(date +%s)")
    sed -i.bak "s/your-nextauth-secret-here/$NEXTAUTH_SECRET/" .env.local
    rm .env.local.bak 2>/dev/null || true
    
    echo "✅ Created .env.local with generated secrets"
    echo "⚠️  You may need to update other environment variables in .env.local"
else
    echo "✅ .env.local already exists"
fi

# Install dependencies
echo "📦 Installing dependencies..."
if command -v pnpm &> /dev/null; then
    pnpm install
else
    echo "⚠️  pnpm not found, installing with npm..."
    npm install
fi

# Generate Prisma client
echo "⚙️ Generating Prisma client..."
if command -v pnpm &> /dev/null; then
    pnpm prisma generate
else
    npx prisma generate
fi

# Check if DATABASE_URL is set
if grep -q "your-" .env.local; then
    echo "⚠️  Warning: Some environment variables in .env.local still have placeholder values"
    echo "   You may need to set up a database and update the DATABASE_URL"
    echo "   For development, you can use a local PostgreSQL instance or a cloud service like Supabase"
fi

echo "✅ Setup complete!"
echo ""
echo "To run the development server:"
echo "  pnpm dev"
echo ""
echo "To run the production build:"
echo "  pnpm build && pnpm start"
echo ""
echo "For more information, see README.md"
