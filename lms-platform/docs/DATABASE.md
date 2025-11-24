# Database Schema Documentation

Complete MySQL database schema for the LMS Platform.

## Entity Relationship Diagram

```
Users ─┬─ UserRoles ── Roles
       ├─ CourseEnrollments ── Courses ─┬─ Modules ── Lessons ─┬─ Files
       ├─ QuizAttempts ── Quizzes ─┬─ QuizQuestions          ├─ LessonCompletions
       ├─ AssignmentSubmissions    └─ QuizAnswers            └─ Quizzes
       ├─ Grades
       ├─ Notifications            Assignments ── AssignmentSubmissions
       └─ AnalyticsEvents
                                   Courses ─┬─ Announcements
                                            ├─ CoursePrerequisites
                                            └─ Assignments
```

## Tables

### users

Stores user account information from Discord OAuth.

| Column | Type | Description |
|--------|------|-------------|
| id | VARCHAR(36) PK | UUID primary key |
| discordId | VARCHAR(255) UNIQUE | Discord user ID |
| username | VARCHAR(255) | Discord username |
| discriminator | VARCHAR(10) | Discord discriminator |
| email | VARCHAR(255) UNIQUE | User email |
| avatar | VARCHAR(255) | Discord avatar hash |
| refreshToken | TEXT | JWT refresh token |
| createdAt | DATETIME | Account creation date |
| updatedAt | DATETIME | Last update date |

Indexes:
- PRIMARY KEY (id)
- UNIQUE INDEX (discordId)
- UNIQUE INDEX (email)

### roles

Defines user roles in the system.

| Column | Type | Description |
|--------|------|-------------|
| id | INT PK AUTO_INCREMENT | Role ID |
| name | VARCHAR(50) UNIQUE | Role name (student, instructor, admin) |
| description | TEXT | Role description |
| createdAt | DATETIME | Creation date |

### user_roles

Many-to-many relationship between users and roles.

| Column | Type | Description |
|--------|------|-------------|
| id | INT PK AUTO_INCREMENT | Record ID |
| userId | VARCHAR(36) FK | User ID |
| roleId | INT FK | Role ID |
| createdAt | DATETIME | Assignment date |

Foreign Keys:
- userId → users(id) ON DELETE CASCADE
- roleId → roles(id) ON DELETE CASCADE

### courses

Stores course information.

| Column | Type | Description |
|--------|------|-------------|
| id | VARCHAR(36) PK | Course UUID |
| title | VARCHAR(255) | Course title |
| description | TEXT | Course description |
| category | VARCHAR(100) | Course category |
| tags | TEXT | JSON array of tags |
| thumbnail | VARCHAR(500) | Thumbnail image URL |
| isPublished | BOOLEAN | Publication status |
| instructorId | VARCHAR(36) FK | Instructor user ID |
| createdAt | DATETIME | Creation date |
| updatedAt | DATETIME | Last update date |

Foreign Keys:
- instructorId → users(id) ON DELETE CASCADE

Indexes:
- INDEX (instructorId)
- INDEX (isPublished)

### modules

Course modules for organizing lessons.

| Column | Type | Description |
|--------|------|-------------|
| id | VARCHAR(36) PK | Module UUID |
| courseId | VARCHAR(36) FK | Parent course ID |
| title | VARCHAR(255) | Module title |
| description | TEXT | Module description |
| orderIndex | INT | Display order |
| createdAt | DATETIME | Creation date |
| updatedAt | DATETIME | Last update date |

Foreign Keys:
- courseId → courses(id) ON DELETE CASCADE

Indexes:
- INDEX (courseId)
- INDEX (orderIndex)

### lessons

Individual lessons within modules.

| Column | Type | Description |
|--------|------|-------------|
| id | VARCHAR(36) PK | Lesson UUID |
| moduleId | VARCHAR(36) FK | Parent module ID |
| title | VARCHAR(255) | Lesson title |
| content | LONGTEXT | Lesson content (Markdown/HTML) |
| videoUrl | VARCHAR(500) | Video URL |
| orderIndex | INT | Display order |
| duration | INT | Duration in minutes |
| createdAt | DATETIME | Creation date |
| updatedAt | DATETIME | Last update date |

Foreign Keys:
- moduleId → modules(id) ON DELETE CASCADE

Indexes:
- INDEX (moduleId)
- INDEX (orderIndex)

### course_enrollments

Student enrollments in courses.

| Column | Type | Description |
|--------|------|-------------|
| id | VARCHAR(36) PK | Enrollment UUID |
| userId | VARCHAR(36) FK | Student user ID |
| courseId | VARCHAR(36) FK | Course ID |
| enrolledAt | DATETIME | Enrollment date |
| completedAt | DATETIME | Completion date (nullable) |
| progress | FLOAT | Progress percentage (0-100) |

Foreign Keys:
- userId → users(id) ON DELETE CASCADE
- courseId → courses(id) ON DELETE CASCADE

Indexes:
- UNIQUE INDEX (userId, courseId)
- INDEX (userId)
- INDEX (courseId)

### lesson_completions

Tracks lesson completion by students.

| Column | Type | Description |
|--------|------|-------------|
| id | VARCHAR(36) PK | Completion UUID |
| lessonId | VARCHAR(36) FK | Lesson ID |
| userId | VARCHAR(36) FK | User ID |
| completedAt | DATETIME | Completion timestamp |

Foreign Keys:
- lessonId → lessons(id) ON DELETE CASCADE

Indexes:
- UNIQUE INDEX (lessonId, userId)
- INDEX (lessonId)
- INDEX (userId)

### quizzes

Quiz definitions.

| Column | Type | Description |
|--------|------|-------------|
| id | VARCHAR(36) PK | Quiz UUID |
| lessonId | VARCHAR(36) FK | Associated lesson ID |
| title | VARCHAR(255) | Quiz title |
| description | TEXT | Quiz description |
| timeLimit | INT | Time limit in minutes |
| passingScore | FLOAT | Minimum passing score (percentage) |
| maxAttempts | INT | Maximum attempts allowed |
| randomizeQuestions | BOOLEAN | Randomize question order |
| showCorrectAnswers | BOOLEAN | Show answers after completion |
| createdAt | DATETIME | Creation date |
| updatedAt | DATETIME | Last update date |

Foreign Keys:
- lessonId → lessons(id) ON DELETE CASCADE

### quiz_questions

Questions within quizzes.

| Column | Type | Description |
|--------|------|-------------|
| id | VARCHAR(36) PK | Question UUID |
| quizId | VARCHAR(36) FK | Parent quiz ID |
| questionText | TEXT | Question text |
| questionType | VARCHAR(50) | Type: multiple_choice, true_false, short_answer |
| options | TEXT | JSON array of options |
| correctAnswer | TEXT | JSON of correct answer(s) |
| explanation | TEXT | Answer explanation |
| points | FLOAT | Points for correct answer |
| orderIndex | INT | Display order |
| createdAt | DATETIME | Creation date |

Foreign Keys:
- quizId → quizzes(id) ON DELETE CASCADE

Indexes:
- INDEX (quizId)

### quiz_attempts

Student quiz attempts.

| Column | Type | Description |
|--------|------|-------------|
| id | VARCHAR(36) PK | Attempt UUID |
| quizId | VARCHAR(36) FK | Quiz ID |
| userId | VARCHAR(36) FK | Student ID |
| score | FLOAT | Earned score |
| maxScore | FLOAT | Maximum possible score |
| isPassed | BOOLEAN | Whether attempt passed |
| startedAt | DATETIME | Start timestamp |
| completedAt | DATETIME | Completion timestamp |

Foreign Keys:
- quizId → quizzes(id) ON DELETE CASCADE
- userId → users(id) ON DELETE CASCADE

Indexes:
- INDEX (quizId)
- INDEX (userId)

### quiz_answers

Individual answers within attempts.

| Column | Type | Description |
|--------|------|-------------|
| id | VARCHAR(36) PK | Answer UUID |
| attemptId | VARCHAR(36) FK | Attempt ID |
| questionId | VARCHAR(36) FK | Question ID |
| answer | TEXT | Student's answer (JSON) |
| isCorrect | BOOLEAN | Whether answer is correct |
| pointsEarned | FLOAT | Points earned |
| createdAt | DATETIME | Submission timestamp |

Foreign Keys:
- attemptId → quiz_attempts(id) ON DELETE CASCADE
- questionId → quiz_questions(id) ON DELETE CASCADE

### assignments

Assignment definitions.

| Column | Type | Description |
|--------|------|-------------|
| id | VARCHAR(36) PK | Assignment UUID |
| courseId | VARCHAR(36) FK | Parent course ID |
| title | VARCHAR(255) | Assignment title |
| description | TEXT | Assignment description |
| dueDate | DATETIME | Due date (nullable) |
| maxScore | FLOAT | Maximum score |
| allowLateSubmission | BOOLEAN | Allow late submissions |
| lateDeductionPercent | FLOAT | Late penalty percentage |
| createdAt | DATETIME | Creation date |
| updatedAt | DATETIME | Last update date |

Indexes:
- INDEX (courseId)

### assignment_submissions

Student assignment submissions.

| Column | Type | Description |
|--------|------|-------------|
| id | VARCHAR(36) PK | Submission UUID |
| assignmentId | VARCHAR(36) FK | Assignment ID |
| userId | VARCHAR(36) FK | Student ID |
| content | TEXT | Text content |
| fileUrl | VARCHAR(500) | Uploaded file URL |
| submittedAt | DATETIME | Submission timestamp |
| gradedAt | DATETIME | Grading timestamp |
| score | FLOAT | Earned score |
| feedback | TEXT | Instructor feedback |
| isLate | BOOLEAN | Whether submission is late |

Foreign Keys:
- assignmentId → assignments(id) ON DELETE CASCADE
- userId → users(id) ON DELETE CASCADE

Indexes:
- INDEX (assignmentId)
- INDEX (userId)

### grades

Overall course grades.

| Column | Type | Description |
|--------|------|-------------|
| id | VARCHAR(36) PK | Grade UUID |
| userId | VARCHAR(36) FK | Student ID |
| courseId | VARCHAR(36) FK | Course ID |
| overallGrade | FLOAT | Overall grade (0-100) |
| letterGrade | VARCHAR(2) | Letter grade (A-F) |
| createdAt | DATETIME | Creation date |
| updatedAt | DATETIME | Last update date |

Foreign Keys:
- userId → users(id) ON DELETE CASCADE
- courseId → courses(id) ON DELETE CASCADE

Indexes:
- UNIQUE INDEX (userId, courseId)
- INDEX (userId)
- INDEX (courseId)

### files

File attachments for lessons.

| Column | Type | Description |
|--------|------|-------------|
| id | VARCHAR(36) PK | File UUID |
| lessonId | VARCHAR(36) FK | Associated lesson ID |
| filename | VARCHAR(255) | Generated filename |
| originalName | VARCHAR(255) | Original filename |
| mimeType | VARCHAR(100) | File MIME type |
| size | INT | File size in bytes |
| url | VARCHAR(500) | File URL |
| uploadedAt | DATETIME | Upload timestamp |

Foreign Keys:
- lessonId → lessons(id) ON DELETE CASCADE

Indexes:
- INDEX (lessonId)

### announcements

Course announcements.

| Column | Type | Description |
|--------|------|-------------|
| id | VARCHAR(36) PK | Announcement UUID |
| courseId | VARCHAR(36) FK | Course ID |
| authorId | VARCHAR(36) FK | Author user ID |
| title | VARCHAR(255) | Announcement title |
| content | TEXT | Announcement content |
| createdAt | DATETIME | Creation timestamp |
| updatedAt | DATETIME | Last update timestamp |

Foreign Keys:
- courseId → courses(id) ON DELETE CASCADE
- authorId → users(id) ON DELETE CASCADE

Indexes:
- INDEX (courseId)
- INDEX (authorId)

### notifications

User notifications.

| Column | Type | Description |
|--------|------|-------------|
| id | VARCHAR(36) PK | Notification UUID |
| userId | VARCHAR(36) FK | User ID |
| title | VARCHAR(255) | Notification title |
| message | TEXT | Notification message |
| type | VARCHAR(50) | Type: enrollment, grade, announcement, deadline, system |
| isRead | BOOLEAN | Read status |
| metadata | TEXT | JSON metadata |
| createdAt | DATETIME | Creation timestamp |

Foreign Keys:
- userId → users(id) ON DELETE CASCADE

Indexes:
- INDEX (userId)
- INDEX (isRead)

### analytics_events

Analytics and tracking events.

| Column | Type | Description |
|--------|------|-------------|
| id | VARCHAR(36) PK | Event UUID |
| userId | VARCHAR(36) FK | User ID (nullable) |
| courseId | VARCHAR(36) FK | Course ID (nullable) |
| eventType | VARCHAR(100) | Event type |
| metadata | TEXT | JSON metadata |
| createdAt | DATETIME | Event timestamp |

Foreign Keys:
- userId → users(id) ON DELETE SET NULL
- courseId → courses(id) ON DELETE SET NULL

Indexes:
- INDEX (userId)
- INDEX (courseId)
- INDEX (eventType)
- INDEX (createdAt)

## Database Migrations

Migrations are managed by Prisma:

```bash
# Create new migration
npx prisma migrate dev --name migration_name

# Deploy migrations to production
npx prisma migrate deploy

# Reset database (development only)
npx prisma migrate reset
```

## Seeding

Initial data seeding creates default roles:

```bash
npm run seed
```

This creates:
- Student role
- Instructor role
- Admin role
- Demo user (optional)

## Optimization

### Recommended Indexes

All primary and foreign key indexes are created automatically. Additional indexes recommended for common queries are already included in the schema.

### Query Optimization

- Use `SELECT` with specific columns instead of `SELECT *`
- Utilize Prisma's `include` and `select` efficiently
- Implement pagination for large datasets
- Use database connection pooling

### Backup Strategy

- Daily full backups
- Point-in-time recovery enabled
- Transaction log backups every hour
- Off-site backup storage
