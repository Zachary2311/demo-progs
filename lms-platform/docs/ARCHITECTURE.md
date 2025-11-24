# System Architecture

Overview of the LMS Platform architecture.

## High-Level Architecture

```
┌─────────────────────────────────────────────────────────┐
│                      Frontend (React)                    │
│  ┌────────────┐  ┌────────────┐  ┌────────────┐        │
│  │  Student   │  │ Instructor │  │   Admin    │        │
│  │ Dashboard  │  │  Dashboard │  │ Dashboard  │        │
│  └────────────┘  └────────────┘  └────────────┘        │
│         │                │                │              │
│         └────────────────┴────────────────┘              │
│                         │                                │
│                 React Router                             │
│                         │                                │
│            TanStack Query (State)                        │
└────────────────────┬────────────────────────────────────┘
                     │ HTTPS/REST API
┌────────────────────┴────────────────────────────────────┐
│               Backend (Node.js + Express)                │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐             │
│  │   Auth   │  │  Courses │  │Analytics │             │
│  │   API    │  │    API   │  │   API    │             │
│  └──────────┘  └──────────┘  └──────────┘             │
│         │              │              │                  │
│    ┌────┴──────────────┴──────────────┴────┐           │
│    │        Middleware Layer                 │           │
│    │  • Authentication (JWT)                 │           │
│    │  • Authorization (RBAC)                 │           │
│    │  • Rate Limiting                        │           │
│    │  • Validation                           │           │
│    └────┬────────────────────────────────┬──┘           │
│         │                                │               │
│    ┌────┴────┐                      ┌───┴────┐         │
│    │ Prisma  │                      │ Discord│         │
│    │   ORM   │                      │  OAuth │         │
│    └────┬────┘                      └────────┘         │
└─────────┼──────────────────────────────────────────────┘
          │
┌─────────┴──────────────────┐
│      MySQL Database        │
│  • Users & Roles           │
│  • Courses & Content       │
│  • Quizzes & Assignments   │
│  • Analytics & Grades      │
└────────────────────────────┘
```

## Technology Stack

### Frontend Layer

**Framework:** React 18 with TypeScript
- Component-based UI architecture
- Hooks for state and side effects
- Strong typing with TypeScript

**Routing:** React Router v6
- Client-side routing
- Protected routes for authenticated users
- Role-based route access

**State Management:** TanStack Query
- Server state caching
- Automatic refetching
- Optimistic updates
- Background synchronization

**Styling:** Tailwind CSS
- Utility-first CSS framework
- Responsive design
- Dark mode support
- Custom theme configuration

**Build Tool:** Vite
- Fast development server
- Hot Module Replacement (HMR)
- Optimized production builds
- Code splitting

### Backend Layer

**Runtime:** Node.js 18+ with TypeScript
- Non-blocking I/O
- Event-driven architecture
- Strong typing

**Framework:** Express.js
- Minimal and flexible
- Robust middleware ecosystem
- RESTful API design

**ORM:** Prisma
- Type-safe database client
- Auto-generated types
- Migration management
- Query optimization

**Authentication:**
- Discord OAuth2 for login
- JWT for session management
- Refresh token rotation
- Role-based access control

**File Storage:**
- Local filesystem (default)
- Support for cloud storage (S3, GCS)
- Multer for upload handling

### Database Layer

**Database:** MySQL 8.0
- Relational data model
- ACID compliance
- Transaction support
- Full-text search

**Schema Management:** Prisma Migrate
- Version-controlled migrations
- Type-safe schema
- Automatic migration generation

### Infrastructure

**Containerization:** Docker
- Isolated environments
- Consistent deployments
- Easy scaling

**Orchestration:** Docker Compose
- Multi-container applications
- Service dependencies
- Environment configuration

**Web Server:** Nginx
- Reverse proxy
- Static file serving
- Load balancing
- SSL termination

## Data Flow

### Authentication Flow

```
1. User clicks "Login with Discord"
2. Frontend requests Discord OAuth URL from backend
3. Backend returns OAuth URL
4. User redirects to Discord
5. User authorizes application
6. Discord redirects to backend callback
7. Backend exchanges code for Discord access token
8. Backend fetches user info from Discord
9. Backend creates/updates user in database
10. Backend generates JWT tokens
11. Backend redirects to frontend with tokens
12. Frontend stores tokens and fetches user profile
13. User is authenticated
```

### Course Enrollment Flow

```
1. Student browses published courses
2. Student clicks "Enroll" on a course
3. Frontend sends enrollment request to backend
4. Backend validates user and course
5. Backend creates enrollment record
6. Backend sends notification to user
7. Backend sends Discord webhook (if enabled)
8. Backend returns enrollment confirmation
9. Frontend updates UI
10. Frontend refetches enrolled courses
```

### Quiz Submission Flow

```
1. Student starts quiz (creates attempt)
2. Frontend displays questions
3. Student answers questions
4. Student submits answers
5. Backend validates attempt
6. Backend grades objective questions
7. Backend calculates score
8. Backend updates progress
9. Backend creates analytics event
10. Backend returns results
11. Frontend displays score and feedback
```

## Security Architecture

### Authentication & Authorization

**OAuth2 Flow:**
- Secure Discord integration
- Authorization code grant type
- State parameter for CSRF protection

**JWT Strategy:**
- Short-lived access tokens (15 minutes)
- Long-lived refresh tokens (7 days)
- Secure token storage
- Token rotation on refresh

**Role-Based Access Control:**
- Role assignment at user level
- Middleware checks for route protection
- Granular permissions per role

### Data Protection

**Input Validation:**
- Express Validator for request validation
- Sanitization of user inputs
- Type checking with TypeScript

**SQL Injection Prevention:**
- Prisma ORM with parameterized queries
- No raw SQL queries
- Input sanitization

**XSS Protection:**
- Content Security Policy headers
- Output encoding
- React's built-in XSS protection

**CSRF Protection:**
- CSRF tokens for state-changing operations
- SameSite cookie attribute
- Origin validation

### Network Security

**HTTPS:**
- SSL/TLS encryption
- Certificate management
- HTTP to HTTPS redirection

**Rate Limiting:**
- Global API rate limits
- Per-endpoint limits
- IP-based throttling

**CORS:**
- Configured allowed origins
- Credentials support
- Method restrictions

## Scalability

### Horizontal Scaling

**Frontend:**
- Static files served via CDN
- Multiple frontend instances
- Load balancing

**Backend:**
- Stateless API design
- Multiple backend instances
- Session stored in JWT (not server)

**Database:**
- Read replicas
- Connection pooling
- Query optimization

### Caching Strategy

**Browser Caching:**
- Static assets cached with long TTL
- Index.html with no-cache

**API Caching:**
- TanStack Query client-side cache
- Stale-while-revalidate pattern
- Background refetching

**Database Caching:**
- MySQL query cache
- Prisma connection pooling
- Index optimization

## Monitoring & Logging

### Application Logging

**Backend Logging:**
- Pino for structured logging
- Log levels (debug, info, warn, error)
- Request/response logging
- Error stack traces

**Database Logging:**
- Query logging in development
- Slow query log
- Error logging

### Monitoring

**Health Checks:**
- `/health` endpoint
- Database connectivity check
- Service status monitoring

**Analytics:**
- Custom event tracking
- User behavior analytics
- Performance metrics

### Error Tracking

**Error Handling:**
- Global error middleware
- Structured error responses
- Error logging and alerts

## Deployment Architecture

### Development Environment

```
Developer → Localhost:3000 (Frontend)
         → Localhost:3001 (Backend)
         → Localhost:3306 (MySQL)
```

### Production Environment

```
Internet
    ↓
HTTPS (443)
    ↓
Nginx Reverse Proxy
    ├─→ Frontend Container (Port 80)
    └─→ Backend Container (Port 3001)
            ↓
        MySQL Container (Port 3306)
```

### Container Architecture

**Services:**
1. **mysql** - MySQL database
2. **backend** - Node.js API server
3. **frontend** - React app served by Nginx
4. **nginx-proxy** - Reverse proxy (production)

**Volumes:**
- `mysql_data` - Database persistence
- `backend_uploads` - File uploads

**Networks:**
- `lms_network` - Internal communication

## API Design

### RESTful Principles

**Resources:**
- Nouns for endpoints (`/courses`, `/users`)
- Plural nouns for collections
- Nested resources for relationships

**HTTP Methods:**
- GET - Retrieve resources
- POST - Create resources
- PUT - Update resources
- DELETE - Remove resources

**Status Codes:**
- 2xx - Success
- 4xx - Client errors
- 5xx - Server errors

**Response Format:**
```json
{
  "data": {},
  "pagination": {},
  "error": ""
}
```

### API Versioning

- Version in URL path (future: `/api/v2/...`)
- Backward compatibility
- Deprecation notices

## Performance Optimization

### Frontend

- Code splitting with React.lazy
- Image optimization
- Bundle size optimization
- Tree shaking
- Minification

### Backend

- Database query optimization
- Efficient Prisma queries
- Response compression (gzip)
- Connection pooling
- Async/await patterns

### Database

- Proper indexing
- Query optimization
- Normalized schema
- Efficient joins

## Future Enhancements

### Planned Features

1. **Real-time Communication**
   - WebSocket integration
   - Live chat
   - Real-time notifications

2. **Advanced Analytics**
   - Learning paths visualization
   - Predictive analytics
   - A/B testing

3. **Content Delivery**
   - CDN integration
   - Video streaming optimization
   - Progressive web app (PWA)

4. **AI Integration**
   - Automated grading
   - Content recommendations
   - Chatbot support

### Scalability Improvements

1. **Microservices**
   - Service decomposition
   - API gateway
   - Service mesh

2. **Caching Layer**
   - Redis for session storage
   - CDN for static assets
   - API response caching

3. **Message Queue**
   - Async task processing
   - Email notifications
   - Background jobs

## Conclusion

This architecture provides a solid foundation for a scalable, secure, and maintainable learning management system. The modular design allows for easy feature additions and modifications while maintaining code quality and performance.
