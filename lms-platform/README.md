# LMS Platform - Complete Learning Management System

A full-featured, production-ready Learning Management System with Discord OAuth2 authentication, built with Node.js, TypeScript, React, and MySQL.

## Features

### Authentication & Authorization
- **Discord OAuth2 Integration** - Secure login with Discord accounts
- **JWT-based Sessions** - Access and refresh token management
- **Role-Based Access Control** - Student, Instructor, and Admin roles
- **Auto-account Creation** - First-time Discord login automatically creates user accounts

### Course Management
- Create and manage courses with rich descriptions
- Organize content into modules and lessons
- Course publishing and enrollment management
- Progress tracking per student
- Course announcements
- Prerequisites support

### Content Delivery
- **Hierarchical Structure** - Courses → Modules → Lessons
- **Rich Content** - Markdown/HTML content support
- **Video Integration** - YouTube, Vimeo, and direct video uploads
- **File Attachments** - PDFs, images, ZIP files
- **Completion Tracking** - Monitor student progress through lessons

### Assessment System
- **Quizzes**
  - Multiple choice, True/False, and short answer questions
  - Auto-grading for objective questions
  - Randomized question pools
  - Timed quizzes with retry limits
  - Review screens with explanations

- **Assignments**
  - File and text submissions
  - Due dates with late submission policies
  - Rubric-based grading
  - Instructor feedback

- **Gradebook**
  - Overall grades per course
  - Weighted scoring
  - Letter grades (A-F)
  - CSV/Excel export

### Analytics & Dashboards
- **Student Dashboard** - Progress tracking, grades, upcoming deadlines
- **Instructor Dashboard** - Class performance, submission statistics
- **Admin Dashboard** - System-wide metrics and analytics

### File Management
- Local filesystem storage
- Support for images, videos, PDFs, and archives
- Configurable file size limits and allowed types

### Notifications
- In-app notification system
- Discord webhook integration
- Notifications for enrollments, grades, deadlines, and announcements

## Technology Stack

### Backend
- **Runtime:** Node.js 18+ with TypeScript
- **Framework:** Express.js
- **Database:** MySQL 8.0 with Prisma ORM
- **Authentication:** Discord OAuth2 + JWT
- **File Upload:** Multer
- **Logging:** Pino
- **API Documentation:** Swagger/OpenAPI

### Frontend
- **Framework:** React 18 with TypeScript
- **Build Tool:** Vite
- **Styling:** Tailwind CSS
- **State Management:** TanStack Query (React Query)
- **Routing:** React Router v6
- **Markdown:** React Markdown

### DevOps
- **Containerization:** Docker & Docker Compose
- **Web Server:** Nginx
- **Reverse Proxy:** Nginx (for production)

## Prerequisites

- Node.js 18+ and npm
- MySQL 8.0+ (or Docker)
- Discord Application (for OAuth2)

## Quick Start

See [QUICK_START.md](QUICK_START.md) for a 5-minute setup guide!

**TL;DR:**
```bash
# 1. Configure Discord OAuth2 (get Client ID and Secret)
# 2. Set environment variables
cp .env.example .env
# Edit .env with your Discord credentials

# 3. Start with Docker Compose
docker-compose up -d

# 4. Seed database
docker-compose exec backend npm run seed

# 5. Open http://localhost
```

### Detailed Setup

#### 1. Set Up Discord OAuth2

1. Go to [Discord Developer Portal](https://discord.com/developers/applications)
2. Create a new application
3. Navigate to OAuth2 settings
4. Add redirect URI: `http://localhost:3001/api/auth/discord/callback`
5. Copy your Client ID and Client Secret

#### 2. Configure Environment Variables

```bash
cp .env.example .env
```

Edit `.env` and set:
- Discord Client ID and Secret
- Strong JWT secrets (min 32 characters)
- MySQL credentials
- Other configuration options

#### 3. Run with Docker Compose (Recommended)

```bash
docker-compose up -d
docker-compose exec backend npm run seed
```

See [docs/DOCKER.md](docs/DOCKER.md) for detailed Docker instructions.

#### 4. Run with Standalone Dockerfiles

```bash
# See docs/DOCKER.md for complete standalone instructions
docker network create lms-network
docker run -d --name lms-mysql --network lms-network mysql:8.0
docker build -t lms-backend ./backend
docker build -t lms-frontend ./frontend
docker run -d --name lms-backend --network lms-network lms-backend
docker run -d --name lms-frontend -p 80:80 lms-frontend
```

#### 5. Run Locally (Development)

#### Backend Setup

```bash
cd backend

# Install dependencies
npm install

# Set up environment variables
cp .env.example .env
# Edit .env with your configuration

# Run database migrations
npx prisma migrate dev

# Seed the database
npm run seed

# Start development server
npm run dev
```

#### Frontend Setup

```bash
cd frontend

# Install dependencies
npm install

# Set up environment variables
cp .env.example .env
# Edit .env with your configuration

# Start development server
npm run dev
```

## Database Schema

The system uses the following main tables:

- **users** - User accounts and Discord information
- **roles** - User roles (student, instructor, admin)
- **user_roles** - User-role assignments
- **courses** - Course information
- **modules** - Course modules
- **lessons** - Lesson content
- **quizzes** - Quiz definitions
- **quiz_questions** - Quiz questions
- **quiz_attempts** - Quiz attempt records
- **assignments** - Assignment definitions
- **assignment_submissions** - Student submissions
- **grades** - Overall course grades
- **course_enrollments** - Student course enrollments
- **notifications** - User notifications
- **analytics_events** - Event tracking

## Documentation

### Quick Links
- **[Quick Start Guide](QUICK_START.md)** - Get running in 5 minutes
- **[Docker Guide](docs/DOCKER.md)** - Complete Docker deployment instructions
- **[UI Screenshots](docs/SCREENSHOTS.md)** - Visual guide to all pages
- **[API Documentation](docs/API.md)** - Complete API reference
- **[Database Schema](docs/DATABASE.md)** - Database structure and migrations
- **[System Architecture](docs/ARCHITECTURE.md)** - Technical architecture details
- **[Deployment Guide](docs/DEPLOYMENT.md)** - Production deployment

### Interactive API Documentation
Once the backend is running, visit http://localhost:3001/api-docs for the complete Swagger API documentation.

### Key Endpoints

#### Authentication
- `GET /api/auth/discord/login` - Get Discord OAuth URL
- `GET /api/auth/discord/callback` - OAuth callback
- `POST /api/auth/refresh` - Refresh access token
- `POST /api/auth/logout` - Logout user
- `GET /api/auth/profile` - Get user profile

#### Courses
- `GET /api/courses` - List courses
- `POST /api/courses` - Create course (instructor)
- `GET /api/courses/:id` - Get course details
- `POST /api/courses/:id/enroll` - Enroll in course
- `GET /api/courses/enrolled` - Get enrolled courses

#### Analytics
- `GET /api/analytics/dashboard/student` - Student dashboard
- `GET /api/analytics/dashboard/instructor` - Instructor dashboard
- `GET /api/analytics/dashboard/admin` - Admin dashboard

## User Roles

### Student
- Enroll in published courses
- View course content and lessons
- Take quizzes and submit assignments
- Track their progress
- View their grades

### Instructor
- Create and manage courses
- Build lessons with content and videos
- Create quizzes and assignments
- Grade student submissions
- View class analytics

### Admin
- Manage all users and courses
- Assign roles to users
- Override grades
- Access system-wide analytics
- Full system control

## Development

### Project Structure

```
lms-platform/
├── backend/
│   ├── src/
│   │   ├── config/       # Configuration files
│   │   ├── controllers/  # Route controllers
│   │   ├── middleware/   # Express middleware
│   │   ├── routes/       # API routes
│   │   ├── services/     # Business logic
│   │   ├── types/        # TypeScript types
│   │   ├── utils/        # Utility functions
│   │   └── index.ts      # Entry point
│   ├── prisma/
│   │   ├── schema.prisma # Database schema
│   │   └── seed.ts       # Database seeding
│   ├── uploads/          # File uploads
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── components/   # React components
│   │   ├── contexts/     # React contexts
│   │   ├── hooks/        # Custom hooks
│   │   ├── pages/        # Page components
│   │   ├── services/     # API services
│   │   ├── types/        # TypeScript types
│   │   └── utils/        # Utility functions
│   └── package.json
├── deployment/           # Deployment configs
├── docs/                 # Documentation
├── docker-compose.yml    # Docker Compose config
└── README.md
```

### Running Tests

```bash
# Backend tests
cd backend
npm test

# Frontend tests
cd frontend
npm test
```

### Building for Production

```bash
# Build backend
cd backend
npm run build

# Build frontend
cd frontend
npm run build
```

## Deployment

### Using Docker Compose

The simplest deployment method is using Docker Compose:

```bash
# Production mode with NGINX reverse proxy
docker-compose --profile production up -d
```

### Manual Deployment

1. Set up MySQL database
2. Configure environment variables
3. Build and deploy backend
4. Build and deploy frontend
5. Configure NGINX reverse proxy
6. Set up SSL certificates (Let's Encrypt recommended)

See `docs/DEPLOYMENT.md` for detailed deployment instructions.

## Security Features

- **Rate Limiting** - Protection against brute force attacks
- **Input Validation** - All inputs validated and sanitized
- **SQL Injection Protection** - Prisma ORM with parameterized queries
- **XSS Protection** - Content sanitization
- **CSRF Protection** - CSRF tokens
- **Helmet.js** - Security headers
- **JWT Authentication** - Secure token-based auth
- **File Upload Validation** - Type and size restrictions

## Contributing

Contributions are welcome! Please follow these steps:

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Write or update tests
5. Submit a pull request

## License

MIT License - see LICENSE file for details

## Support

For issues, questions, or contributions:
- Create an issue in the repository
- Check the documentation in `/docs`
- Review the API documentation at `/api-docs`

## Acknowledgments

- Discord for OAuth2 authentication
- Prisma for database management
- React and the amazing React ecosystem
- All open-source contributors

---

**Built with ❤️ for education**
