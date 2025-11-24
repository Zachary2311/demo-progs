# API Documentation

Complete API reference for the LMS Platform.

## Base URL

```
Development: http://localhost:3001/api
Production: https://yourdomain.com/api
```

## Authentication

All authenticated endpoints require a Bearer token in the Authorization header:

```
Authorization: Bearer <access_token>
```

### Get Access Token

1. Redirect user to Discord OAuth URL (GET `/auth/discord/login`)
2. User authorizes on Discord
3. Discord redirects to callback URL with token
4. Frontend receives tokens and stores them

### Refresh Token

When access token expires:

```http
POST /api/auth/refresh
Content-Type: application/json

{
  "refreshToken": "your_refresh_token"
}
```

## Endpoints

### Authentication

#### Get Discord Login URL

```http
GET /api/auth/discord/login
```

Response:
```json
{
  "url": "https://discord.com/api/oauth2/authorize?..."
}
```

#### Discord OAuth Callback

```http
GET /api/auth/discord/callback?code=<code>
```

Redirects to frontend with tokens in URL parameters.

#### Logout

```http
POST /api/auth/logout
Authorization: Bearer <token>
```

#### Get Profile

```http
GET /api/auth/profile
Authorization: Bearer <token>
```

Response:
```json
{
  "id": "uuid",
  "discordId": "123456789",
  "username": "username",
  "email": "user@example.com",
  "avatar": "avatar_hash",
  "roles": ["student", "instructor"],
  "createdAt": "2024-01-01T00:00:00.000Z"
}
```

### Courses

#### List Courses

```http
GET /api/courses?page=1&limit=10&category=programming&search=python
Authorization: Bearer <token>
```

Query Parameters:
- `page` (optional): Page number
- `limit` (optional): Items per page
- `category` (optional): Filter by category
- `search` (optional): Search query
- `published` (optional): Filter by published status

Response:
```json
{
  "data": [
    {
      "id": "uuid",
      "title": "Course Title",
      "description": "Course description",
      "category": "programming",
      "thumbnail": "url",
      "isPublished": true,
      "instructor": {
        "id": "uuid",
        "username": "instructor_name"
      },
      "_count": {
        "enrollments": 45,
        "modules": 5
      }
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 10,
    "total": 100,
    "totalPages": 10
  }
}
```

#### Get Course

```http
GET /api/courses/:id
Authorization: Bearer <token>
```

Response: Detailed course with modules and lessons.

#### Create Course

```http
POST /api/courses
Authorization: Bearer <token>
Content-Type: application/json

{
  "title": "Course Title",
  "description": "Course description",
  "category": "programming",
  "tags": ["python", "beginner"],
  "thumbnail": "image_url"
}
```

Role Required: `instructor` or `admin`

#### Update Course

```http
PUT /api/courses/:id
Authorization: Bearer <token>
Content-Type: application/json

{
  "title": "Updated Title",
  "isPublished": true
}
```

#### Delete Course

```http
DELETE /api/courses/:id
Authorization: Bearer <token>
```

#### Enroll in Course

```http
POST /api/courses/:id/enroll
Authorization: Bearer <token>
```

#### Unenroll from Course

```http
DELETE /api/courses/:id/enroll
Authorization: Bearer <token>
```

#### Get Enrolled Courses

```http
GET /api/courses/enrolled?page=1&limit=10
Authorization: Bearer <token>
```

### Modules

#### Create Module

```http
POST /api/courses/modules
Authorization: Bearer <token>
Content-Type: application/json

{
  "courseId": "uuid",
  "title": "Module Title",
  "description": "Module description",
  "orderIndex": 0
}
```

#### Update Module

```http
PUT /api/courses/modules/:id
Authorization: Bearer <token>
Content-Type: application/json

{
  "title": "Updated Title",
  "orderIndex": 1
}
```

#### Delete Module

```http
DELETE /api/courses/modules/:id
Authorization: Bearer <token>
```

### Lessons

#### Create Lesson

```http
POST /api/courses/lessons
Authorization: Bearer <token>
Content-Type: application/json

{
  "moduleId": "uuid",
  "title": "Lesson Title",
  "content": "Lesson content in Markdown",
  "videoUrl": "https://youtube.com/watch?v=...",
  "orderIndex": 0,
  "duration": 30
}
```

#### Get Lesson

```http
GET /api/courses/lessons/:id
Authorization: Bearer <token>
```

#### Update Lesson

```http
PUT /api/courses/lessons/:id
Authorization: Bearer <token>
```

#### Delete Lesson

```http
DELETE /api/courses/lessons/:id
Authorization: Bearer <token>
```

#### Mark Lesson Complete

```http
POST /api/courses/lessons/:id/complete
Authorization: Bearer <token>
```

### Quizzes

#### Create Quiz

```http
POST /api/quizzes
Authorization: Bearer <token>
Content-Type: application/json

{
  "lessonId": "uuid",
  "title": "Quiz Title",
  "description": "Quiz description",
  "timeLimit": 30,
  "passingScore": 70,
  "maxAttempts": 3,
  "questions": [
    {
      "questionText": "What is 2+2?",
      "questionType": "multiple_choice",
      "options": ["2", "3", "4", "5"],
      "correctAnswer": "4",
      "explanation": "2+2 equals 4",
      "points": 1
    }
  ]
}
```

Question Types:
- `multiple_choice`
- `true_false`
- `short_answer`

#### Get Quiz

```http
GET /api/quizzes/:id
Authorization: Bearer <token>
```

#### Start Quiz

```http
POST /api/quizzes/:id/start
Authorization: Bearer <token>
```

Returns attempt ID to use for submission.

#### Submit Quiz

```http
POST /api/quizzes/:id/submit
Authorization: Bearer <token>
Content-Type: application/json

{
  "attemptId": "uuid",
  "answers": [
    {
      "questionId": "uuid",
      "answer": "4"
    }
  ]
}
```

#### Get Quiz Attempts

```http
GET /api/quizzes/:id/attempts
Authorization: Bearer <token>
```

### Assignments

#### Create Assignment

```http
POST /api/assignments
Authorization: Bearer <token>
Content-Type: application/json

{
  "courseId": "uuid",
  "title": "Assignment Title",
  "description": "Assignment description",
  "dueDate": "2024-12-31T23:59:59Z",
  "maxScore": 100,
  "allowLateSubmission": true,
  "lateDeductionPercent": 10
}
```

#### Get Assignments

```http
GET /api/assignments?courseId=uuid
Authorization: Bearer <token>
```

#### Submit Assignment

```http
POST /api/assignments/:id/submit
Authorization: Bearer <token>
Content-Type: application/json

{
  "content": "Assignment text content",
  "fileUrl": "https://..."
}
```

#### Grade Submission

```http
POST /api/assignments/submissions/:id/grade
Authorization: Bearer <token>
Content-Type: application/json

{
  "score": 85,
  "feedback": "Great work! Minor improvements needed..."
}
```

Role Required: `instructor` or `admin`

#### Get Submissions

```http
GET /api/assignments/submissions?assignmentId=uuid&courseId=uuid
Authorization: Bearer <token>
```

### Analytics

#### Student Dashboard

```http
GET /api/analytics/dashboard/student
Authorization: Bearer <token>
```

Response:
```json
{
  "enrolledCourses": 5,
  "completedLessons": 23,
  "averageGrade": 87.5,
  "upcomingAssignments": [...],
  "courses": [...],
  "grades": [...]
}
```

#### Instructor Dashboard

```http
GET /api/analytics/dashboard/instructor
Authorization: Bearer <token>
```

Role Required: `instructor` or `admin`

#### Admin Dashboard

```http
GET /api/analytics/dashboard/admin
Authorization: Bearer <token>
```

Role Required: `admin`

#### Course Analytics

```http
GET /api/analytics/course/:courseId
Authorization: Bearer <token>
```

Role Required: `instructor` or `admin`

Response:
```json
{
  "enrollments": 45,
  "averageProgress": 67.3,
  "completionRate": 23.5,
  "averageQuizScore": 78.2,
  "submissionRate": 89.4,
  "studentProgress": [...]
}
```

#### Log Event

```http
POST /api/analytics/events
Authorization: Bearer <token>
Content-Type: application/json

{
  "eventType": "lesson_view",
  "courseId": "uuid",
  "metadata": {
    "lessonId": "uuid"
  }
}
```

### File Upload

#### Upload File

```http
POST /api/upload
Authorization: Bearer <token>
Content-Type: multipart/form-data

file: <binary>
lessonId: uuid (optional)
```

Response:
```json
{
  "id": "uuid",
  "filename": "generated_filename.pdf",
  "originalName": "original.pdf",
  "mimeType": "application/pdf",
  "size": 1024567,
  "url": "http://localhost:3001/uploads/generated_filename.pdf"
}
```

#### Delete File

```http
DELETE /api/upload/:id
Authorization: Bearer <token>
```

## Error Responses

All errors follow this format:

```json
{
  "error": "Error message",
  "details": [] // Optional validation errors
}
```

### Status Codes

- `200` - Success
- `201` - Created
- `400` - Bad Request
- `401` - Unauthorized
- `403` - Forbidden
- `404` - Not Found
- `429` - Too Many Requests
- `500` - Internal Server Error

## Rate Limiting

Default limits:
- General API: 100 requests per 15 minutes
- Authentication: 5 requests per 15 minutes

Headers included in response:
```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1234567890
```

## Pagination

List endpoints support pagination:

Query Parameters:
- `page`: Page number (default: 1)
- `limit`: Items per page (default: 10, max: 100)

Response includes pagination metadata:
```json
{
  "data": [...],
  "pagination": {
    "page": 1,
    "limit": 10,
    "total": 100,
    "totalPages": 10
  }
}
```

## Swagger Documentation

Interactive API documentation available at:
```
http://localhost:3001/api-docs
```
