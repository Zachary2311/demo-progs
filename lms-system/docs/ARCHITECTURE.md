# System Architecture

## High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         End Users                                │
│              (Students, Instructors, Admins)                     │
└────────────────────────────┬────────────────────────────────────┘
                             │
┌────────────────────────────▼────────────────────────────────────┐
│                      NGINX (Reverse Proxy)                       │
│         (SSL/TLS, Rate Limiting, Load Balancing)                 │
└────────────────────────────┬────────────────────────────────────┘
         ┌──────────────────┬─────────────────────┐
         │                  │                     │
┌────────▼──────┐  ┌───────▼──────┐    ┌────────▼──────┐
│  React SPA    │  │ Express API  │    │   NGINX       │
│  (Frontend)   │  │ (Backend)    │    │  (Static)     │
└───────────────┘  └───────┬──────┘    └───────────────┘
                           │
                  ┌────────▼──────┐
                  │  Prisma ORM   │
                  │  & JWT Auth   │
                  └───────┬───────┘
                          │
         ┌────────────────┼────────────────┐
         │                │                │
    ┌────▼──────┐  ┌─────▼──────┐  ┌─────▼──────┐
    │  MySQL    │  │   Discord  │  │   S3/GCS   │
    │ Database  │  │   OAuth    │  │   Storage  │
    └───────────┘  └────────────┘  └────────────┘
```

## Technology Stack

### Frontend
- **Framework**: React 18 (Component-based UI)
- **Language**: TypeScript (Type safety)
- **Routing**: React Router v6 (Client-side navigation)
- **State**: Zustand (Lightweight state management)
- **UI**: Material-UI (Component library)
- **Build**: Vite (Fast bundling)
- **HTTP**: Axios (API calls with interceptors)

### Backend
- **Runtime**: Node.js 18+ (JavaScript runtime)
- **Framework**: Express.js (Minimalist web framework)
- **Language**: TypeScript (Type safety)
- **Database**: MySQL 8.0+ (Relational database)
- **ORM**: Prisma (Type-safe database access)
- **Auth**: JWT + Discord OAuth2
- **Logging**: Pino (Structured logging)
- **Validation**: Express middleware

### Infrastructure
- **Containerization**: Docker (Container images)
- **Orchestration**: Docker Compose (Container orchestration)
- **Reverse Proxy**: NGINX (Load balancing, SSL)
- **Database**: MySQL (Data persistence)
- **Storage**: Local/S3/GCS/Azure (File storage)

## Database Architecture

### Core Tables

```
Users
├── Roles (admin, instructor, student)
├── Enrolled Courses
├── Sessions (JWT tokens)
└── Analytics Events

Courses
├── Modules
│  └── Lessons
│     ├── Lesson Completions
│     ├── Quizzes
│     │  ├── Questions
│     │  │  ├── Options
│     │  │  └── Answers
│     │  └── Attempts
│     └── Files
├── Assignments
│  ├── Submissions
│  │  ├── Files
│  │  └── Grades
│  └── Files
├── Announcements
├── Instructors (multiple)
└── Enrollments

Grades (Aggregated from submissions & quizzes)
```

### Key Relationships

- **One-to-Many**: User → Enrollments, Courses → Modules
- **Many-to-Many**: Users ↔ Roles, Courses ↔ Instructors
- **Polymorphic**: Grades (from submissions or quiz attempts)
- **Soft Deletes**: Users, Courses, Files (deleted_at field)

## API Architecture

### Request Flow

```
1. Client Request
   └→ NGINX (Rate Limiting, SSL)
       └→ Express Middleware
           ├→ Auth Middleware (JWT Verification)
           ├→ Validation Middleware
           └→ Route Handler
               └→ Prisma ORM
                   └→ MySQL Database
```

### Authentication Flow

```
User → Discord OAuth → Discord API → Exchange Code → JWT Tokens → Stored in Session
     → Create/Update User in DB → Return Access & Refresh Tokens

Subsequent Requests:
User (Access Token in Header) → Express Auth Middleware → Verify JWT → Grant Access

Token Refresh:
Expired Token → Client sends Refresh Token → Backend verifies → Issue new Access Token
```

### API Endpoints Organization

```
/api/
├── /auth/          (Login, logout, profile)
├── /courses/       (CRUD, enrollment, analytics)
├── /modules/       (Lesson organization)
├── /lessons/       (Content delivery)
├── /quizzes/       (Assessments)
├── /assignments/   (Assignments)
├── /grades/        (Grading, gradebook)
├── /users/         (User management - admin)
├── /analytics/     (Event tracking, dashboards)
└── /files/         (File upload/download)
```

## Frontend Architecture

### Component Hierarchy

```
App
├── PrivateRoute (Auth protection)
│   └── Layout (Nav, Sidebar)
│       ├── DashboardPage
│       ├── CoursesPage
│       ├── CourseDetailPage
│       ├── LessonPage
│       ├── QuizPage
│       ├── AssignmentPage
│       ├── GradeBookPage
│       ├── ProfilePage
│       ├── InstructorDashboard
│       └── AdminDashboard
└── LoginPage
```

### State Management

```
Zustand Store (AuthStore)
├── user (current logged-in user)
├── accessToken (JWT)
├── refreshToken (refresh JWT)
├── isAuthenticated (boolean flag)
└── Actions (setUser, setTokens, logout)

Local Component State
├── Form inputs
├── UI state (modals, tabs)
└── Loading/error states
```

### Data Fetching

```
React Component
└→ useEffect hook
   └→ apiClient (Axios instance)
       ├→ Request interceptor (add JWT token)
       ├→ HTTP request to backend
       └→ Response interceptor
           ├→ Check for 401 (expired token)
           ├→ If expired: refresh token
           └→ Retry original request
```

## Security Architecture

### Authentication & Authorization

```
Discord OAuth2 Flow:
1. User clicks "Login with Discord"
2. Redirected to Discord authorization page
3. User grants permissions
4. Discord redirects back with code
5. Backend exchanges code for access token
6. Backend fetches user info from Discord
7. Create/update user in database
8. Generate JWT tokens
9. Store refresh token in database
10. Return tokens to client
11. Client stores in localStorage
12. Subsequent requests include JWT in Authorization header
```

### Authorization Levels

```
Public Endpoints
├── GET /courses (published courses only)
└── GET /auth/login

Authenticated Endpoints
├── GET /auth/me
├── POST /lessons/:id/complete
├── POST /assignments/:id/submit
└── GET /grades (own grades)

Instructor/Admin Only
├── POST /courses (create)
├── POST /assignments/:id/grade
├── GET /courses/:id/analytics
└── GET /grades/course/:id/gradebook

Admin Only
├── GET /users (all)
├── POST /users/:id/roles/:roleId
├── PATCH /users/:id/status
└── GET /analytics/admin/dashboard
```

## Data Flow Examples

### Course Enrollment Flow

```
Student clicks "Enroll"
  ↓
Frontend: POST /courses/:id/enroll
  ↓
Backend Auth Middleware: Verify JWT
  ↓
Backend Route Handler:
  ├→ Check if course exists
  ├→ Check if already enrolled
  ├→ Create CourseEnrollment record
  └→ Return enrollment data
  ↓
Frontend: Update UI, show confirmation
```

### Quiz Submission Flow

```
Student clicks "Submit Quiz"
  ↓
Frontend loops through answers:
  └→ POST /quizzes/:attemptId/answers
  ↓
Backend stores each answer in QuizAnswer table
  ↓
Frontend: POST /quizzes/:attemptId/submit
  ↓
Backend:
  ├→ Fetch attempt with all answers
  ├→ Calculate score (for auto-gradable questions)
  ├→ Create Grade record
  └→ Return results
  ↓
Frontend: Show results with explanation
```

### Grade Calculation

```
For Each Course:
  └→ Get all submissions and quiz attempts
     └→ Calculate weighted score:
        ├→ Quiz average: 40%
        ├→ Assignment average: 60%
        └→ Determine letter grade (A-F)
  └→ Store in Grade table
```

## Scalability Considerations

### Horizontal Scaling

```
Load Balancer
├→ Backend Instance 1 (Node.js)
├→ Backend Instance 2 (Node.js)
├→ Backend Instance 3 (Node.js)
└→ Shared Database (MySQL)
```

### Database Optimization

- **Indexes**: On frequently queried columns (user_id, course_id)
- **Query optimization**: Select only needed fields
- **Connection pooling**: Reuse database connections
- **Read replicas**: For analytics queries

### Caching Strategy

- **Frontend**: Browser cache for static assets (30 days)
- **API**: HTTP caching headers for courses list (5 minutes)
- **Database**: Query result caching (Redis optional)

### File Storage

- **Local**: Development/small deployments
- **S3**: Production, scalable, CDN-ready
- **Content Delivery**: CloudFront/Cloudflare in front of S3

## Deployment Architecture

### Docker Compose Setup

```
Docker Host
├── MySQL Container (port 3306)
├── Backend Container (port 3000)
├── Frontend Container (port 3001)
└── NGINX Container (port 80/443)

All containers on shared network: lms-network
Volume mounts: mysql_data, uploads
```

### Production Deployment

```
Cloud Provider (AWS/Azure/GCP)
├── Load Balancer (SSL/TLS termination)
├── Kubernetes Cluster
│  ├── Backend pods (replicated)
│  ├── Frontend pods (replicated)
│  ├── NGINX ingress controller
│  └── Database (managed MySQL)
├── Persistent Volumes (file storage)
├── Auto-scaling policies
└── Monitoring/logging (ELK, Prometheus)
```

## Performance Optimization

### Backend

- **Query optimization**: Use `select()` to fetch only needed fields
- **Connection pooling**: Reuse MySQL connections
- **Caching**: Cache frequently accessed data
- **Pagination**: Server-side pagination (10-50 items per page)
- **Compression**: GZIP for HTTP responses
- **Rate limiting**: Prevent abuse (100 req/15min)

### Frontend

- **Code splitting**: Lazy load routes and components
- **Bundle optimization**: Tree-shaking, minification
- **Image optimization**: Lazy loading, compression
- **Caching**: Browser cache for assets
- **Compression**: GZIP for JavaScript bundles

### Database

- **Indexes**: On all foreign keys and frequently searched fields
- **Query analysis**: Use EXPLAIN to optimize slow queries
- **Archiving**: Move old analytics data to archive tables
- **Maintenance**: Regular ANALYZE TABLE, OPTIMIZE TABLE

## Error Handling & Recovery

### Backend Error Flow

```
Error occurs
  ↓
Logged to Pino logger (with context)
  ↓
Error handler middleware catches it
  ↓
Return appropriate HTTP status code
  └→ 400: Bad request (validation)
  └→ 401: Unauthorized (auth failed)
  └→ 403: Forbidden (permission denied)
  └→ 404: Not found
  └→ 429: Too many requests (rate limited)
  └→ 500: Server error (uncaught exception)
  ↓
Client receives error response
```

### Client Error Handling

```
API call fails
  ↓
Axios interceptor catches error
  ↓
If 401 → Attempt token refresh
  ├→ Success: Retry original request
  └→ Fail: Redirect to login
  ↓
If other error → Display user-friendly message
```

## Monitoring & Observability

### Logging

- **Application logs**: Pino (JSON format)
- **Access logs**: NGINX access log
- **Error logs**: NGINX error log, application errors
- **Query logs**: MySQL slow query log (optional)

### Metrics

- **Application**: Request count, response time, error rate
- **Database**: Connection count, query latency
- **Infrastructure**: CPU, memory, disk usage

### Health Checks

- **Liveness**: `/health` endpoint (service running?)
- **Readiness**: Database connectivity check
- **Dependency checks**: Discord API, S3 availability

---

For detailed API documentation, see `docs/API.md`
For deployment guide, see `docs/DEPLOYMENT.md`
