# Learning Management System (LMS)

A complete, production-ready Learning Management System with Discord OAuth2 authentication, built with Node.js, React, and MySQL.

## Features

### Authentication & Authorization
- Discord OAuth2 integration for seamless login
- JWT-based session management with refresh tokens
- Role-based access control (Admin, Instructor, Student)
- User profile management

### Course Management
- Create and manage courses with metadata (title, description, category, tags, thumbnail)
- Publish/unpublish status control
- Student enrollment with progress tracking
- Course announcements and updates
- Multi-instructor support

### Content Delivery
- Hierarchical structure: Courses → Modules → Lessons
- Rich text content support (Markdown/HTML)
- Video embedding (YouTube, Vimeo)
- File attachments and downloads
- Lesson completion tracking

### Assessment System
- **Quizzes**: Multiple choice, True/False, Short answer questions
- **Assignments**: File and text submissions with rubric-based grading
- **Gradebook**: Overall course grades with CSV export
- Auto-grading for objective questions
- Manual grading for subjective responses

### Dashboards
- **Student Dashboard**: Progress tracking, grades, upcoming deadlines
- **Instructor Dashboard**: Class analytics, submission statistics
- **Admin Dashboard**: System-wide metrics and user management

### Analytics
- Event logging and tracking
- Learning analytics per student and course
- Submission and quiz performance statistics
- System health monitoring

## Tech Stack

### Backend
- **Runtime**: Node.js
- **Language**: TypeScript
- **Framework**: Express.js
- **Database**: MySQL 8.0+
- **ORM**: Prisma
- **Authentication**: Discord OAuth2, JWT
- **Logging**: Pino
- **Validation**: Express middleware

### Frontend
- **Framework**: React 18
- **Language**: TypeScript
- **Routing**: React Router v6
- **UI Library**: Material-UI (MUI)
- **State Management**: Zustand
- **Build Tool**: Vite
- **HTTP Client**: Axios

### DevOps & Deployment
- **Containerization**: Docker
- **Orchestration**: Docker Compose
- **Reverse Proxy**: NGINX
- **Database**: MySQL
- **File Storage**: Local filesystem (extensible to S3/GCS/Azure)

## Project Structure

```
lms-system/
├── backend/                    # Node.js/TypeScript API
│   ├── src/
│   │   ├── index.ts
│   │   ├── middleware/        # Auth, error handling, rate limiting
│   │   ├── routes/            # API endpoints
│   │   ├── utils/             # Logger, API client
│   │   └── scripts/           # Database seeding
│   ├── prisma/                # Database schema
│   ├── package.json
│   ├── tsconfig.json
│   └── .env.example
├── frontend/                  # React SPA
│   ├── src/
│   │   ├── main.tsx
│   │   ├── App.tsx
│   │   ├── pages/            # Page components
│   │   ├── components/       # Reusable components
│   │   ├── store/            # Zustand state
│   │   └── utils/            # API client, helpers
│   ├── index.html
│   ├── vite.config.ts
│   ├── tsconfig.json
│   └── package.json
├── database/                  # Database schemas
│   └── schema.sql            # Complete MySQL schema
├── docker/
│   ├── Dockerfile.backend    # Backend container
│   ├── Dockerfile.frontend   # Frontend container
│   └── nginx.conf           # NGINX configuration
├── scripts/                   # Setup and deployment scripts
└── docs/                     # Documentation
```

## Installation & Setup

### Prerequisites
- Docker and Docker Compose
- Node.js 18+ (for local development)
- MySQL 8.0+ (if running without Docker)
- Discord Developer Application

### Quick Start with Docker

1. **Clone and Setup**
```bash
cd lms-system
cp backend/.env.example .env
```

2. **Configure Environment Variables**
Edit `.env` with your settings:
```env
DISCORD_CLIENT_ID=your_discord_client_id
DISCORD_CLIENT_SECRET=your_discord_client_secret
DISCORD_WEBHOOK_URL=your_webhook_url
JWT_SECRET=your-secure-secret-key
```

3. **Start Services**
```bash
docker-compose up -d
```

4. **Database Setup**
```bash
docker-compose exec backend npm run db:migrate
docker-compose exec backend npm run db:seed
```

5. **Access Application**
- Frontend: http://localhost:3001
- API: http://localhost:3000/api
- Database: localhost:3306

### Local Development

**Backend Setup**
```bash
cd backend
npm install
cp .env.example .env
npm run dev
```

**Frontend Setup**
```bash
cd frontend
npm install
npm run dev
```

## API Documentation

### Authentication
- `POST /api/auth/discord/login` - Get Discord login URL
- `POST /api/auth/discord/callback` - Handle Discord OAuth callback
- `POST /api/auth/refresh` - Refresh JWT token
- `POST /api/auth/logout` - Logout user
- `GET /api/auth/me` - Get current user
- `PUT /api/auth/profile` - Update user profile

### Courses
- `GET /api/courses` - List all courses
- `POST /api/courses` - Create course (instructor/admin)
- `GET /api/courses/:id` - Get course details
- `PUT /api/courses/:id` - Update course (instructor/admin)
- `POST /api/courses/:id/enroll` - Enroll in course
- `GET /api/courses/:id/analytics` - Get course analytics (instructor/admin)

### Lessons
- `GET /api/lessons/:id` - Get lesson
- `POST /api/lessons` - Create lesson (instructor/admin)
- `PUT /api/lessons/:id` - Update lesson (instructor/admin)
- `POST /api/lessons/:id/complete` - Mark lesson complete
- `GET /api/lessons/:id/completion` - Check completion status

### Quizzes
- `GET /api/quizzes/:id` - Get quiz with questions
- `POST /api/quizzes` - Create quiz (instructor/admin)
- `POST /api/quizzes/:quizId/questions` - Add question
- `POST /api/quizzes/:quizId/attempts` - Start quiz attempt
- `POST /api/quizzes/:attemptId/answers` - Submit answer
- `POST /api/quizzes/:attemptId/submit` - Submit quiz

### Assignments
- `GET /api/assignments/:id` - Get assignment
- `POST /api/assignments` - Create assignment (instructor/admin)
- `POST /api/assignments/:assignmentId/submit` - Submit assignment
- `POST /api/assignments/:submissionId/grade` - Grade submission
- `GET /api/assignments/:assignmentId/submissions` - Get submissions (instructor/admin)

### Grades
- `GET /api/grades/course/:courseId` - Get student grades
- `GET /api/grades/course/:courseId/gradebook` - Get gradebook (instructor/admin)
- `GET /api/grades/:courseId/export-csv` - Export gradebook as CSV

### Users & Admin
- `GET /api/users` - List users (admin)
- `GET /api/users/:id` - Get user profile
- `POST /api/users/:userId/roles/:roleId` - Assign role (admin)
- `DELETE /api/users/:userId/roles/:roleId` - Remove role (admin)
- `PATCH /api/users/:id/status` - Update user status (admin)

### Analytics
- `POST /api/analytics/events` - Log analytics event
- `GET /api/analytics/course/:courseId` - Get course analytics (instructor/admin)
- `GET /api/analytics/student/me` - Get student analytics
- `GET /api/analytics/admin/dashboard` - Get admin dashboard (admin)

## Deployment

### Production Deployment with Docker Compose

1. **Configure SSL/TLS**
   - Update `docker/nginx.conf` with SSL certificates
   - Uncomment SSL configuration block

2. **Production Environment Variables**
   ```env
   NODE_ENV=production
   JWT_SECRET=<generate-secure-random-key>
   JWT_REFRESH_SECRET=<generate-secure-random-key>
   DISCORD_CLIENT_ID=<your-production-discord-id>
   DISCORD_CLIENT_SECRET=<your-production-secret>
   ```

3. **Start Services**
   ```bash
   docker-compose -f docker-compose.yml up -d
   ```

4. **Database Migrations**
   ```bash
   docker-compose exec backend npx prisma migrate deploy
   ```

### Kubernetes Deployment

See `docs/kubernetes-deployment.md` for Helm charts and K8s configuration.

### AWS ECS/ECR Deployment

See `docs/aws-deployment.md` for AWS deployment guide.

## Database Schema

The system uses a comprehensive MySQL schema with:
- 19 main tables
- Proper relationships and constraints
- Indexes for performance
- Cascade rules for data integrity
- Soft deletes for audit trail

See `database/schema.sql` for complete schema.

## Security Features

- HTTPS/TLS encryption (configurable)
- JWT token-based authentication
- Rate limiting (100 requests per 15 minutes)
- SQL injection prevention (Prisma ORM)
- XSS protection (React escaping)
- CSRF tokens in forms
- Input validation and sanitization
- Secure password hashing (bcryptjs)
- Role-based access control
- Audit logging

## Performance Optimizations

- Server-side pagination (courses, users)
- Database query optimization with indexes
- Gzip compression (NGINX)
- Browser caching (static assets)
- JWT refresh token rotation
- Connection pooling (MySQL)
- Rate limiting middleware
- CDN-ready static file serving

## File Storage

The system supports multiple storage providers:
- **Local filesystem** (default): `./uploads`
- **AWS S3**: Configure `AWS_*` environment variables
- **Google Cloud Storage**: Configure `GCS_*` variables
- **Azure Blob Storage**: Configure `AZURE_*` variables

## Monitoring & Logging

- Structured logging with Pino
- Health check endpoints
- Docker health checks
- Application metrics
- Database query logging
- Error tracking and reporting

## Contributing

1. Follow TypeScript strict mode
2. Use consistent naming conventions
3. Write meaningful commit messages
4. Test all API endpoints
5. Update documentation

## License

MIT License - See LICENSE file for details

## Support & Documentation

- API Documentation: See `docs/API.md`
- Deployment Guide: See `docs/DEPLOYMENT.md`
- Architecture: See `docs/ARCHITECTURE.md`
- Development: See `docs/DEVELOPMENT.md`

## Environment Variables Reference

See `.env.example` for complete environment variable documentation.

## Troubleshooting

### Database Connection Issues
```bash
# Check database service
docker-compose logs db

# Rebuild containers
docker-compose down
docker-compose build --no-cache
docker-compose up -d
```

### Port Already in Use
```bash
# Change ports in docker-compose.yml or:
lsof -i :3000  # Find process using port
kill -9 <PID>  # Kill process
```

### Authentication Issues
- Verify Discord OAuth credentials
- Check CORS configuration
- Ensure JWT secrets are consistent
- Check token expiration

## Getting Help

For issues, questions, or suggestions:
1. Check existing documentation
2. Review error logs in containers
3. Open an issue with detailed reproduction steps

---

Built with ❤️ for educators and learners
