# NoStressPlanner

Plan group activities without the fear of rejection. A modern web application built with Next.js that helps groups coordinate events and find the best time for everyone.

## Features

- **Anonymous Voting**: Vote on events without revealing your identity
- **Real-time Updates**: Live updates using Pusher for instant synchronization
- **Smart Scheduling**: Automatic availability calculation and conflict detection
- **Discord Integration**: Login with Discord for authenticated users
- **Mobile-First Design**: Responsive design that works on all devices
- **Event Management**: Create, join, and manage events with ease

## Tech Stack

- **Frontend**: Next.js 15, React, TypeScript, Tailwind CSS
- **Backend**: Next.js API Routes, Prisma ORM
- **Database**: PostgreSQL (Supabase)
- **Authentication**: NextAuth.js v5 with Discord provider
- **Real-time**: Pusher Channels
- **Deployment**: Vercel

## Getting Started

### Prerequisites

- Node.js 18+ 
- pnpm (recommended) or npm
- PostgreSQL database (or Supabase account)

### Installation

1. Clone the repository:
```bash
git clone https://github.com/its333/NoStressPlanner.git
cd NoStressPlanner
```

2. Install dependencies:
```bash
pnpm install
```

3. Set up environment variables:
```bash
cp .env.example .env.local
```

Fill in the required environment variables in `.env.local`:

```env
# Database
DATABASE_URL="your_postgresql_connection_string"
DIRECT_URL="your_direct_postgresql_connection_string"

# NextAuth
NEXTAUTH_SECRET="your_nextauth_secret"
NEXTAUTH_URL="http://localhost:3001"

# Discord OAuth
DISCORD_CLIENT_ID="your_discord_client_id"
DISCORD_CLIENT_SECRET="your_discord_client_secret"

# Pusher (for real-time updates)
PUSHER_APP_ID="your_pusher_app_id"
PUSHER_KEY="your_pusher_key"
PUSHER_SECRET="your_pusher_secret"
PUSHER_CLUSTER="your_pusher_cluster"
NEXT_PUBLIC_PUSHER_KEY="your_pusher_key"
NEXT_PUBLIC_PUSHER_CLUSTER="your_pusher_cluster"

# Cron (for scheduled tasks)
CRON_SECRET="your_cron_secret"
```

4. Set up the database:
```bash
npx prisma generate
npx prisma migrate dev --name init
```

5. Run the development server:
```bash
pnpm dev
```

Open [http://localhost:3001](http://localhost:3001) to view the application.

## Project Structure

```
├── app/                    # Next.js App Router
│   ├── (marketing)/       # Marketing pages
│   ├── api/               # API routes
│   ├── e/[token]/         # Event pages
│   ├── host/              # Host pages
│   └── attend/            # Attend pages
├── components/            # React components
├── lib/                   # Utility libraries
├── prisma/               # Database schema and migrations
└── styles/               # Global styles
```

## Key Features

### Event Flow
1. **Host creates event** → Sets dates, quorum, and requirements
2. **Quorum vote** → Attendees vote "I'm in!" or "I'm out"
3. **Auto-advancement** → When quorum is met, event moves to day selection
4. **Day blocking** → Attendees block unavailable days
5. **Results calculation** → System finds best available dates
6. **Final selection** → Host picks the final date

### Session Management
- **Event-specific sessions** → Each event has isolated session management
- **Anonymous support** → Users can participate without logging in
- **Cross-browser isolation** → Sessions are properly isolated between browsers
- **Automatic cleanup** → Stale sessions are automatically cleared

### Real-time Updates
- **Live voting** → See votes update in real-time
- **Phase transitions** → Automatic phase changes are broadcast
- **Day blocking** → Availability updates instantly
- **Final date selection** → Everyone sees the chosen date immediately

## Development

### Database Management
```bash
# Generate Prisma client
npx prisma generate

# Create migration
npx prisma migrate dev --name migration_name

# Deploy migrations (production)
npx prisma migrate deploy

# View database
npx prisma studio
```

### Testing
```bash
# Run unit tests
pnpm test:unit

# Run e2e tests
pnpm test:e2e

# Run all tests
pnpm test
```

### Building for Production
```bash
pnpm build
```

## Deployment

### Vercel (Recommended)
1. Connect your GitHub repository to Vercel
2. Add environment variables in Vercel dashboard
3. Deploy automatically on push to main branch

### Manual Deployment
1. Build the application: `pnpm build`
2. Deploy the `.next` folder to your hosting provider
3. Run database migrations: `npx prisma migrate deploy`

## Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Commit your changes: `git commit -m 'Add amazing feature'`
4. Push to the branch: `git push origin feature/amazing-feature`
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Support

If you encounter any issues or have questions, please open an issue on GitHub.

## Acknowledgments

- Built with [Next.js](https://nextjs.org/)
- Styled with [Tailwind CSS](https://tailwindcss.com/)
- Database management with [Prisma](https://prisma.io/)
- Real-time updates with [Pusher](https://pusher.com/)
- Authentication with [NextAuth.js](https://next-auth.js.org/)