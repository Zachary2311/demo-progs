# LMS Platform - Page Screenshots & UI Guide

Visual guide to all pages and features of the LMS Platform.

## Authentication Pages

### 1. Login Page (`/login`)

**Layout:**
```
┌────────────────────────────────────────────────────────┐
│                                                        │
│                    🎓 LMS Platform                     │
│           Learn, grow, and achieve your goals          │
│                                                        │
│    ┌──────────────────────────────────────────┐      │
│    │  [Discord Icon] Login with Discord        │      │
│    └──────────────────────────────────────────┘      │
│                                                        │
│         Sign in with your Discord account              │
│              to get started                            │
│                                                        │
└────────────────────────────────────────────────────────┘
```

**Features:**
- Centered login card with gradient background (blue to purple)
- Large Discord button with icon
- Clean, minimal design
- Responsive layout

**Colors:**
- Background: Gradient (Primary blue to purple)
- Card: White with shadow
- Button: Indigo (#5865F2 - Discord brand color)

---

### 2. Auth Callback Page (`/auth/callback`)

**Layout:**
```
┌────────────────────────────────────────────────────────┐
│                                                        │
│                    [Spinner Icon]                      │
│                                                        │
│                 Completing login...                    │
│                                                        │
└────────────────────────────────────────────────────────┘
```

**Features:**
- Loading spinner animation
- Brief message during OAuth flow
- Auto-redirects to dashboard

---

## Student Pages

### 3. Student Dashboard (`/student/dashboard`)

**Layout:**
```
┌────────────────────────────────────────────────────────┐
│ LMS Platform    [Dashboard] [My Courses] [Browse]     │
│                                    John Doe    [Logout]│
├────────────────────────────────────────────────────────┤
│                                                        │
│  My Dashboard                                          │
│                                                        │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐    │
│  │ 📚 Enrolled │ │ ✅ Completed│ │ ⭐ Average  │    │
│  │   Courses   │ │   Lessons   │ │    Grade    │    │
│  │      5      │ │     23      │ │    87.5%    │    │
│  └─────────────┘ └─────────────┘ └─────────────┘    │
│                                                        │
│  My Courses                                            │
│  ┌────────────────────────────────────────────┐      │
│  │ [Thumbnail]  Introduction to Python         │      │
│  │              Learn Python basics            │      │
│  │              ████████░░ 75% Complete        │      │
│  └────────────────────────────────────────────┘      │
│  ┌────────────────────────────────────────────┐      │
│  │ [Thumbnail]  Web Development Fundamentals   │      │
│  │              HTML, CSS, JavaScript          │      │
│  │              ████░░░░░░ 40% Complete        │      │
│  └────────────────────────────────────────────┘      │
│                                                        │
│  Upcoming Assignments                                  │
│  ┌────────────────────────────────────────────┐      │
│  │ Python Final Project                        │      │
│  │ Introduction to Python          Due: Dec 25 │      │
│  └────────────────────────────────────────────┘      │
│                                                        │
└────────────────────────────────────────────────────────┘
```

**Features:**
- Three stat cards showing key metrics
- Course grid with progress bars
- Upcoming assignments list
- Thumbnail images for courses
- Clean, card-based design

**Colors:**
- Primary stats: Blue, Green, Yellow backgrounds
- Course cards: White with hover effect
- Progress bars: Blue gradient

---

### 4. Course Catalog (`/student/courses`)

**Layout:**
```
┌────────────────────────────────────────────────────────┐
│ LMS Platform    Dashboard [My Courses] [Browse Courses]│
├────────────────────────────────────────────────────────┤
│                                                        │
│  Course Catalog                                        │
│                                                        │
│  [Search courses...                              ]    │
│                                                        │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐           │
│  │[Image]   │  │[Image]   │  │[Image]   │           │
│  │Python 101│  │Web Dev   │  │Data Sci  │           │
│  │          │  │          │  │          │           │
│  │Learn the │  │Build web │  │Analyze   │           │
│  │basics of │  │apps with │  │data with │           │
│  │Python    │  │React     │  │pandas    │           │
│  │          │  │          │  │          │           │
│  │Instructor│  │Instructor│  │Instructor│           │
│  │45 students│ │32 students│ │28 students│          │
│  │          │  │          │  │          │           │
│  │[Details] │  │[Details] │  │[Details] │           │
│  │[Enroll]  │  │[Enroll]  │  │[Enroll]  │           │
│  └──────────┘  └──────────┘  └──────────┘           │
│                                                        │
└────────────────────────────────────────────────────────┘
```

**Features:**
- Search bar for filtering courses
- Grid layout (3 columns on desktop, responsive)
- Course cards with thumbnails
- Instructor name and enrollment count
- View details and enroll buttons
- Hover effects on cards

---

### 5. Course Detail Page (`/student/courses/:id`)

**Layout:**
```
┌────────────────────────────────────────────────────────┐
│ LMS Platform                                           │
├────────────────────────────────────────────────────────┤
│                                                        │
│  Introduction to Python Programming                    │
│  Learn the fundamentals of Python, from basics to      │
│  advanced concepts. Perfect for beginners.             │
│  Instructor: John Smith                                │
│                                                        │
│  ┌────────────────────────────────────────────────┐  │
│  │ Module 1: Python Basics                         │  │
│  │ Introduction to Python syntax and fundamentals  │  │
│  ├────────────────────────────────────────────────┤  │
│  │ 1 📄 Introduction to Python        ▶           │  │
│  │ 2 📄 Variables and Data Types      ▶           │  │
│  │ 3 📄 Control Flow                  ▶           │  │
│  │ 4 📹 Working with Lists (15 min)   ▶           │  │
│  └────────────────────────────────────────────────┘  │
│                                                        │
│  ┌────────────────────────────────────────────────┐  │
│  │ Module 2: Functions and Modules                 │  │
│  │ Learn to write reusable code                    │  │
│  ├────────────────────────────────────────────────┤  │
│  │ 1 📄 Defining Functions            ▶           │  │
│  │ 2 📄 Function Parameters           ▶           │  │
│  │ 3 📹 Importing Modules (20 min)    ▶           │  │
│  └────────────────────────────────────────────────┘  │
│                                                        │
└────────────────────────────────────────────────────────┘
```

**Features:**
- Course header with title and description
- Collapsible module sections
- Lesson list with icons (document/video)
- Duration for video lessons
- Click to navigate to lesson
- Clean hierarchical structure

---

### 6. Lesson View (`/student/lessons/:id`)

**Layout:**
```
┌────────────────────────────────────────────────────────┐
│ LMS Platform                                           │
├────────────────────────────────────────────────────────┤
│                                                        │
│  Introduction to Python Variables                      │
│                                                        │
│  ┌────────────────────────────────────────────────┐  │
│  │                                                  │  │
│  │         [YouTube Video Player]                   │  │
│  │                                                  │  │
│  └────────────────────────────────────────────────┘  │
│                                                        │
│  Variables in Python                                   │
│  ─────────────────────                                │
│  Variables are containers for storing data values.     │
│                                                        │
│  Creating Variables:                                   │
│  ```python                                             │
│  x = 5                                                 │
│  y = "Hello"                                           │
│  z = 3.14                                              │
│  ```                                                   │
│                                                        │
│  Attachments                                           │
│  ┌────────────────────────────────────────────────┐  │
│  │ 📄 python_variables_cheatsheet.pdf              │  │
│  │ 📄 practice_exercises.pdf                       │  │
│  └────────────────────────────────────────────────┘  │
│                                                        │
│  ┌────────────────────────────────────────────────┐  │
│  │         ✓ Mark as Complete                      │  │
│  └────────────────────────────────────────────────┘  │
│                                                        │
└────────────────────────────────────────────────────────┘
```

**Features:**
- Video player (YouTube/Vimeo embedded or native player)
- Rich text content with markdown support
- Code syntax highlighting
- File attachments section
- Mark as complete button
- Responsive video container

---

### 7. Quiz View (`/student/quizzes/:id`)

**Layout:**
```
┌────────────────────────────────────────────────────────┐
│ LMS Platform                                           │
├────────────────────────────────────────────────────────┤
│                                                        │
│  Python Basics Quiz                                    │
│                                                        │
│  Test your knowledge of Python fundamentals            │
│                                                        │
│  Passing Score: 70%                                    │
│  Max Attempts: 3                                       │
│  Time Limit: 30 minutes                                │
│                                                        │
│  ┌────────────────────────────────────────────────┐  │
│  │           Start Quiz                            │  │
│  └────────────────────────────────────────────────┘  │
│                                                        │
└────────────────────────────────────────────────────────┘

After starting:

┌────────────────────────────────────────────────────────┐
│ LMS Platform                     Time Remaining: 29:45 │
├────────────────────────────────────────────────────────┤
│                                                        │
│  Python Basics Quiz                                    │
│                                                        │
│  1. What is the correct way to declare a variable?     │
│                                                        │
│  ○ var x = 5                                          │
│  ○ int x = 5                                          │
│  ● x = 5                                              │
│  ○ declare x = 5                                      │
│                                                        │
│  2. True or False: Python is case-sensitive            │
│                                                        │
│  ● True                                               │
│  ○ False                                              │
│                                                        │
│  3. What does the len() function do?                   │
│                                                        │
│  ┌────────────────────────────────────────────────┐  │
│  │ [Text input area]                               │  │
│  └────────────────────────────────────────────────┘  │
│                                                        │
│  ┌────────────────────────────────────────────────┐  │
│  │           Submit Quiz                           │  │
│  └────────────────────────────────────────────────┘  │
│                                                        │
└────────────────────────────────────────────────────────┘
```

**Features:**
- Quiz info screen with requirements
- Timer countdown during quiz
- Multiple question types (radio, text input)
- Selected answers highlighted
- Submit confirmation dialog
- Results page with score and feedback

---

## Instructor Pages

### 8. Instructor Dashboard (`/instructor/dashboard`)

**Layout:**
```
┌────────────────────────────────────────────────────────┐
│ LMS Platform    [Dashboard] [My Courses] [Create]      │
├────────────────────────────────────────────────────────┤
│                                                        │
│  Instructor Dashboard                                  │
│                                                        │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐│
│  │Total     │ │Total     │ │Pending   │ │Avg       ││
│  │Courses   │ │Students  │ │Grading   │ │Completion││
│  │    3     │ │   125    │ │    8     │ │   67%    ││
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘│
│                                                        │
│  My Courses                                            │
│  ┌────────────────────────────────────────────────┐  │
│  │ Introduction to Python                          │  │
│  │ 45 students • 5 modules          [Published]   │  │
│  └────────────────────────────────────────────────┘  │
│  ┌────────────────────────────────────────────────┐  │
│  │ Web Development Fundamentals                    │  │
│  │ 32 students • 8 modules          [Published]   │  │
│  └────────────────────────────────────────────────┘  │
│  ┌────────────────────────────────────────────────┐  │
│  │ Advanced Python Techniques                      │  │
│  │ 0 students • 3 modules           [Draft]       │  │
│  └────────────────────────────────────────────────┘  │
│                                                        │
└────────────────────────────────────────────────────────┘
```

**Features:**
- Four stat cards with key metrics
- Course list with student counts
- Published/Draft status badges
- Quick access to course management
- Pending grading indicator

---

## Admin Pages

### 9. Admin Dashboard (`/admin/dashboard`)

**Layout:**
```
┌────────────────────────────────────────────────────────┐
│ LMS Platform    [Dashboard] [Users] [Courses]          │
├────────────────────────────────────────────────────────┤
│                                                        │
│  Admin Dashboard                                       │
│                                                        │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐│
│  │Total     │ │Total     │ │Total     │ │Published ││
│  │Users     │ │Courses   │ │Enrollments│ │Courses  ││
│  │   248    │ │    15    │ │   1,234   │ │    12   ││
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘│
│                                                        │
│  ┌────────────────────┐  ┌──────────────────────────┐│
│  │ Role Distribution  │  │ Top Courses              ││
│  │                    │  │                          ││
│  │ Students:    198   │  │ Python 101               ││
│  │ Instructors:  45   │  │ 125 students             ││
│  │ Admins:        5   │  │                          ││
│  │                    │  │ Web Development          ││
│  │                    │  │ 98 students              ││
│  │                    │  │                          ││
│  │                    │  │ Data Science             ││
│  │                    │  │ 87 students              ││
│  └────────────────────┘  └──────────────────────────┘│
│                                                        │
│  System Stats                                          │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐             │
│  │Lessons   │ │Quizzes   │ │Assignments│            │
│  │   156    │ │    48    │ │    32     │            │
│  └──────────┘ └──────────┘ └──────────┘             │
│                                                        │
└────────────────────────────────────────────────────────┘
```

**Features:**
- System-wide statistics
- Role distribution chart
- Top courses by enrollment
- Content statistics (lessons, quizzes, assignments)
- Clean, organized layout

---

## Common UI Components

### Navigation Bar (All Pages)

```
┌────────────────────────────────────────────────────────┐
│ 🎓 LMS Platform   [Nav Links]          User  [Avatar] ▼│
└────────────────────────────────────────────────────────┘
```

**Features:**
- Logo and platform name
- Role-specific navigation links
- User profile with Discord avatar
- User role badges
- Logout button in dropdown

### Loading States

```
        ┌────────────────┐
        │   [Spinner]    │
        │   Loading...   │
        └────────────────┘
```

### Empty States

```
    ┌──────────────────────────┐
    │                          │
    │      [Empty Icon]        │
    │   No items to display    │
    │   [Action Button]        │
    │                          │
    └──────────────────────────┘
```

### Notification Toasts

```
┌────────────────────────────┐
│ ✓ Success!                 │
│ Course enrolled successfully│
└────────────────────────────┘
```

---

## Color Scheme

### Primary Colors
- **Primary Blue**: #0ea5e9 (Tailwind Sky-500)
- **Primary Dark**: #0369a1 (Tailwind Sky-700)
- **Success Green**: #10b981 (Tailwind Emerald-500)
- **Warning Yellow**: #f59e0b (Tailwind Amber-500)
- **Error Red**: #ef4444 (Tailwind Red-500)

### Backgrounds
- **Page Background**: #f9fafb (Tailwind Gray-50)
- **Card Background**: #ffffff (White)
- **Hover State**: #f3f4f6 (Tailwind Gray-100)

### Text Colors
- **Primary Text**: #111827 (Tailwind Gray-900)
- **Secondary Text**: #6b7280 (Tailwind Gray-500)
- **Muted Text**: #9ca3af (Tailwind Gray-400)

---

## Responsive Design

### Desktop (1280px+)
- 3-column course grids
- Full navigation bar
- Expanded sidebar (if applicable)
- Large stat cards

### Tablet (768px - 1279px)
- 2-column course grids
- Condensed navigation
- Adjusted padding

### Mobile (< 768px)
- Single column layout
- Hamburger menu
- Stacked stat cards
- Full-width cards
- Touch-optimized buttons

---

## Accessibility Features

- **Keyboard Navigation**: All interactive elements accessible via keyboard
- **ARIA Labels**: Screen reader support
- **Focus Indicators**: Clear focus states for navigation
- **Color Contrast**: WCAG AA compliant
- **Alt Text**: All images have descriptive alt text
- **Form Labels**: All inputs properly labeled

---

## Animation & Transitions

- **Page Transitions**: Smooth fade-in (0.3s)
- **Hover Effects**: Scale up slightly (1.02x)
- **Loading Spinners**: Rotating animation
- **Progress Bars**: Animated fill
- **Dropdowns**: Slide down with fade

---

## Icons Used

- **FontAwesome** or **Heroicons** for UI icons
- **Document Icon**: 📄 for lessons
- **Video Icon**: 📹 for video content
- **Book Icon**: 📚 for courses
- **Star Icon**: ⭐ for grades
- **Check Icon**: ✓ for completion

---

## Notes

All pages follow a consistent design system with:
- Clean, modern aesthetics
- Card-based layouts
- Ample white space
- Clear visual hierarchy
- Responsive design
- Accessible components
- Smooth animations

The actual implementation uses Tailwind CSS for styling, providing:
- Utility-first approach
- Consistent spacing and sizing
- Built-in responsive utilities
- Dark mode support (can be enabled)
- Customizable theme
