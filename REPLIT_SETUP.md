# Replit Setup Guide for NoStressPlanner

This guide will help you set up NoStressPlanner on Replit.

## Quick Start

1. **Import the project** to Replit from GitHub: `https://github.com/its333/NoStressPlanner.git`

2. **Set up environment variables** in Replit's Secrets tab:
   - Go to the Secrets tab in your Replit
   - Add the following environment variables:

### Required Environment Variables

```bash
# Database (Required)
DATABASE_URL="postgresql://username:password@host:port/database"
DIRECT_URL="postgresql://username:password@host:port/database"

# NextAuth (Required)
NEXTAUTH_SECRET="your-nextauth-secret-here"
NEXTAUTH_URL="https://your-repl-name.your-username.repl.co"

# Discord OAuth (Required for login)
DISCORD_CLIENT_ID="your-discord-client-id"
DISCORD_CLIENT_SECRET="your-discord-client-secret"

# Pusher (Required for real-time updates)
PUSHER_APP_ID="your-pusher-app-id"
PUSHER_KEY="your-pusher-key"
PUSHER_SECRET="your-pusher-secret"
PUSHER_CLUSTER="your-pusher-cluster"
NEXT_PUBLIC_PUSHER_KEY="your-pusher-key"
NEXT_PUBLIC_PUSHER_CLUSTER="your-pusher-cluster"

# Cron (Required for scheduled tasks)
CRON_SECRET="your-cron-secret-here"
```

## Setting Up External Services

### 1. Database (Supabase)

1. Go to [Supabase](https://supabase.com/)
2. Create a new project
3. Go to Settings → Database
4. Copy the connection string
5. Add it to your Replit secrets as `DATABASE_URL` and `DIRECT_URL`

### 2. Discord OAuth

1. Go to [Discord Developer Portal](https://discord.com/developers/applications)
2. Create a new application
3. Go to OAuth2 → General
4. Add redirect URI: `https://your-repl-name.your-username.repl.co/api/auth/callback/discord`
5. Copy Client ID and Client Secret to Replit secrets

### 3. Pusher (Real-time Updates)

1. Go to [Pusher Dashboard](https://dashboard.pusher.com/)
2. Create a new app
3. Copy the credentials to your Replit secrets

### 4. Generate Secrets

Run these commands in Replit's shell to generate secure secrets:

```bash
# Generate NEXTAUTH_SECRET
openssl rand -base64 32

# Generate CRON_SECRET
openssl rand -base64 32
```

## Running the Application

1. **Install dependencies** (automatic on first run):
   ```bash
   pnpm install
   ```

2. **Set up the database**:
   ```bash
   pnpm prisma generate
   pnpm prisma migrate deploy
   ```

3. **Start the development server**:
   ```bash
   pnpm dev
   ```

## Replit-Specific Features

### Automatic Setup
The `.replit` file is configured to:
- Use Node.js 18
- Install pnpm automatically
- Set up the development environment
- Configure debugging support

### Database Setup
The `replit.nix` file includes:
- PostgreSQL 14 for local development
- Redis for caching
- All necessary Node.js packages

### Development Tools
- TypeScript language server
- Debugging support
- Hot reloading
- Automatic dependency installation

## Troubleshooting

### Common Issues

1. **Database Connection Error**
   - Check your `DATABASE_URL` in Replit secrets
   - Ensure your Supabase project is active
   - Verify the connection string format

2. **Discord Login Not Working**
   - Check your Discord OAuth redirect URI
   - Ensure `DISCORD_CLIENT_ID` and `DISCORD_CLIENT_SECRET` are correct
   - Verify `NEXTAUTH_URL` matches your Replit URL

3. **Real-time Updates Not Working**
   - Check your Pusher credentials
   - Ensure `NEXT_PUBLIC_PUSHER_KEY` and `NEXT_PUBLIC_PUSHER_CLUSTER` are set
   - Verify Pusher app is active

4. **Build Errors**
   - Run `pnpm install` to ensure all dependencies are installed
   - Check that all environment variables are set
   - Run `pnpm prisma generate` to generate Prisma client

### Getting Help

- Check the main [README.md](README.md) for general setup
- Review the [AGENTS.md](AGENTS.md) for technical details
- Open an issue on GitHub if you encounter problems

## Production Deployment

For production deployment on Replit:

1. **Set production environment variables**
2. **Run database migrations**: `pnpm prisma migrate deploy`
3. **Build the application**: `pnpm build`
4. **Start production server**: `pnpm start`

## Security Notes

- Never commit `.env.local` or `.env` files
- Use Replit's Secrets tab for environment variables
- Keep your database credentials secure
- Use strong, randomly generated secrets
