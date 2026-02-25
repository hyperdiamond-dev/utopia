# Utopia User Flow Diagram

This document contains the complete user flow and architecture documentation for
the Utopia research platform, including modules, submodules, questions, and
branching logic.

## Table of Contents

1. [System Architecture Overview](#system-architecture-overview)
2. [Complete User Journey Flow](#complete-user-journey-flow)
3. [Module & Submodule Flow](#module--submodule-flow)
4. [Question & Response Flow](#question--response-flow)
5. [Branching Rules Flow](#branching-rules-flow)
6. [API Endpoints Reference](#api-endpoints-reference)
7. [Middleware Chain](#middleware-chain)
8. [State Transitions](#state-transitions)

---

## System Architecture Overview

### Core Concepts

The Utopia platform implements a hierarchical survey system with adaptive
branching:

```text
Modules (Sequential)
  └─> Submodules (Sequential + Branching)
        └─> Questions (4 Types)
              └─> Responses
                    └─> Trigger Branching Rules
```

### Key Features

1. **Sequential Module Progression** - Users must complete modules in order
2. **Submodule Branching** - Conditional unlocking based on user responses
3. **Question System** - 4 question types with validation
4. **Branching Rules Engine** - Adaptive content paths based on answers
5. **Read-Only Enforcement** - Completed content becomes immutable
6. **Comprehensive Audit Trail** - All actions logged for research compliance

---

## Complete User Journey Flow

```mermaid
flowchart TD
    %% User Registration Flow
    A[User Wants to Participate] --> B[POST /api/auth/create-anonymous]
    B --> C[Generate Unique Alias]
    C --> D[Generate Secure Password]
    D --> E[Create UUID: user_xxxxx]
    E --> F[Hash Password with bcrypt]
    F --> G[Create Firebase User]
    G --> H[Set Firebase Custom Claims]
    H --> I[Create Database User Record]
    I --> J[Initialize Consent Module]
    J --> K[Return Credentials to User]

    %% Authentication Flow
    K --> L[User Receives Username/Password]
    L --> M[POST /api/auth/login]
    M --> N{Valid Credentials?}
    N -->|No| O[Return 401 Error]
    N -->|Yes| P[Check Account Expiry]
    P -->|Expired| Q[Disable Account, Return 401]
    P -->|Valid| R[Generate JWT Token - 30 day expiry]
    R --> S[Return Token + User Data]

    %% Protected Route Access
    S --> T[User Makes Protected Request]
    T --> U[Auth Middleware: Validate JWT]
    U -->|Invalid| V[Return 401 Unauthorized]
    U -->|Valid| W[Extract User from Token]
    W --> X[Set User Context]

    %% Module Flow Starts
    X --> Y[User Requests Module]
    Y --> Z[Module Access Middleware]
    Z --> AA[Get User Record from DB]
    AA --> BB[Check Module Sequential Access]
    BB -->|Not Accessible| CC[Log Access Denied]
    CC --> DD[Return 403 + Next Module Info]
    BB -->|Accessible| EE[Set Module Context]
    EE --> FF[Module Review Middleware]
    FF --> GG{Module Accessible or Completed?}
    GG -->|No| HH[Return 403 Access Denied]
    GG -->|Yes| II[Route Handler Processes Request]

    %% Module Operations
    II --> JJ{What Operation?}

    %% View Module
    JJ -->|GET /:moduleName| KK[Get Module + Submodules Data]
    KK --> LL[Check Submodule Accessibility]
    LL --> MM[Return Module + Submodules + Progress]

    %% Start Module
    JJ -->|POST /:moduleName/start| NN[Check if Already Started]
    NN -->|Already Started| OO[Return Error]
    NN -->|Not Started| PP[Create Progress Record - IN_PROGRESS]
    PP --> QQ[Log Audit Event]
    QQ --> RR[Set as Active Module]
    RR --> SS[Return Success]

    %% Complete Module
    JJ -->|POST /:moduleName/complete| TT[Module Completion Middleware]
    TT --> UU{Module Started?}
    UU -->|No| VV[Return Error: Not Started]
    UU -->|Yes| WW{Already Completed?}
    WW -->|Yes| XX[Return Error: Already Complete]
    WW -->|No| YY[Validate All Required Submodules Complete]
    YY -->|Not Complete| ZZ[Return Error: Complete Submodules First]
    YY -->|Complete| AAA[Mark Module COMPLETED - Read-Only]
    AAA --> BBB[Log Completion Event]
    BBB --> CCC[Find Next Available Module]
    CCC --> DDD[Update Active Module]
    DDD --> EEE[Return Completion + Next Module]

    %% Submodule Flow
    II --> FFF{Submodule Operation?}
    FFF -->|GET /submodules/:name| GGG[Get Submodule with Progress]
    GGG --> HHH[Check Sequential + Branching Access]
    HHH -->|Not Accessible| III[Return 403]
    HHH -->|Accessible| JJJ[Return Submodule + Questions]

    FFF -->|POST /submodules/:name/start| KKK[Check Parent Module Access]
    KKK --> LLL[Check Submodule Sequential Access]
    LLL --> MMM[Check Branching Rules]
    MMM -->|Not Accessible| NNN[Return Error]
    MMM -->|Accessible| OOO{Already Completed?}
    OOO -->|Yes| PPP[Return Error: Read-Only]
    OOO -->|No| QQQ[Create Submodule Progress - IN_PROGRESS]
    QQQ --> RRR[Log Start Event]
    RRR --> SSS[Return Success]

    FFF -->|POST /submodules/:name/complete| TTT[Validate Submodule Access]
    TTT --> UUU{All Required Questions Answered?}
    UUU -->|No| VVV[Return Error: Answer All Questions]
    UUU -->|Yes| WWW[Mark Submodule COMPLETED - Read-Only]
    WWW --> XXX[Log Completion Event]
    XXX --> YYY[Evaluate Branching Rules]
    YYY --> ZZZ[Unlock New Submodules if Rules Met]
    ZZZ --> AAAA[Check if All Module Submodules Complete]
    AAAA -->|Yes| BBBB[Auto-Complete Parent Module]
    AAAA -->|No| CCCC[Return Completion + Unlocked Submodules]

    %% Module Progression
    EEE --> DDDD{More Modules Available?}
    DDDD -->|Yes| EEEE[User Can Access Next Module]
    EEEE --> Y
    DDDD -->|No| FFFF[All Modules Completed]

    %% Overview Routes
    X --> GGGG[GET /api/modules]
    GGGG --> HHHH[Get All Modules with Progress]
    HHHH --> IIII[Get Navigation State]
    IIII --> JJJJ[Get Progress Statistics]
    JJJJ --> KKKK[Return Complete Overview]

    X --> LLLL[GET /api/modules/current]
    LLLL --> MMMM[Get Current Module for User]
    MMMM --> NNNN{Has Current Module?}
    NNNN -->|No| OOOO[Return All Complete]
    NNNN -->|Yes| PPPP[Return Current Module Info]

    %% Error States
    O --> QQQQ[User Retries Login]
    V --> QQQQ
    DD --> RRRR[User Completes Previous Modules]
    HH --> RRRR

    %% Styling
    classDef userAction fill:#e1f5fe
    classDef middleware fill:#f3e5f5
    classDef database fill:#e8f5e8
    classDef decision fill:#fff3e0
    classDef error fill:#ffebee
    classDef success fill:#e8f5e8

    class A,L,T,Y userAction
    class U,Z,FF,TT middleware
    class I,AA,KK,PP,QQQ,WWW,AAA database
    class N,P,GG,UU,WW,OOO,UUU,NNNN,DDDD decision
    class O,Q,V,CC,DD,HH,OO,VV,XX,III,NNN,PPP,VVV error
    class K,S,SS,EEE,CCCC,FFFF success
```

---

## Module & Submodule Flow

### Module System Architecture

**Module States:**

- `NOT_STARTED` - Module not yet accessed
- `IN_PROGRESS` - Module started, submodules being completed
- `COMPLETED` - All required submodules completed, module is read-only

**Access Control:**

1. Modules must be completed sequentially (based on `sequence_order`)
2. Previous module must be `COMPLETED` before next is accessible
3. Completed modules become read-only but viewable

**Module Progression Flow:**

```mermaid
flowchart LR
    A[Module NOT_STARTED] --> B[Check Previous Module]
    B -->|Previous Complete| C[Module Accessible]
    B -->|Previous Incomplete| D[403 Access Denied]
    C --> E[User Starts Module]
    E --> F[Module IN_PROGRESS]
    F --> G[Complete Submodules]
    G --> H{All Required Submodules Done?}
    H -->|No| G
    H -->|Yes| I[Auto-Complete Module]
    I --> J[Module COMPLETED - Read-Only]
```

### Submodule System Architecture

**Submodule States:**

- `NOT_STARTED` - Submodule not yet accessed
- `IN_PROGRESS` - Submodule started, questions being answered
- `COMPLETED` - All required questions answered, submodule is read-only

**Access Control (Two-Layer):**

1. **Sequential Access** - Previous submodules in same module must be completed
2. **Branching Rules** - May require specific answers to unlock

**Submodule Completion Flow:**

```mermaid
flowchart TD
    A[User Completes Submodule] --> B[Validate All Required Questions Answered]
    B -->|Invalid| C[Return Error]
    B -->|Valid| D[Mark COMPLETED - Read-Only]
    D --> E[Evaluate Branching Rules]
    E --> F{Rules Match?}
    F -->|Yes| G[Unlock Target Submodules]
    F -->|No| H[No New Unlocks]
    G --> I[Log Unlocked Submodules]
    H --> I
    I --> J[Check All Module Submodules Complete]
    J -->|All Complete| K[Auto-Complete Parent Module]
    J -->|Some Incomplete| L[Return Success]
```

---

## Question & Response Flow

### Question Types

1. **true_false** - Boolean responses
2. **multiple_choice** - Single selection from options
3. **fill_blank** - Short text input
4. **free_form** - Long text input

### Question Organization

- Questions belong to either a **Module** OR a **Submodule** (not both)
- Questions have `sequence_order` for display ordering
- Questions can be `is_required` (must be answered before completion)
- Questions have `metadata` JSONB for type-specific configuration

### Response Submission Flow

```mermaid
flowchart TD
    A[User Submits Response] --> B{Module/Submodule Completed?}
    B -->|Yes| C[Return Error: Read-Only]
    B -->|No| D[Get Question]
    D --> E[Validate Response Type]
    E -->|Invalid| F[Return Validation Error]
    E -->|Valid| G[Upsert Response to DB]
    G --> H[Log Audit Event]
    H --> I[Return Success]
    I --> J{Branching Rule Question?}
    J -->|Yes| K[May Unlock New Submodules]
    J -->|No| L[No Branching Impact]
```

### Batch Response Submission

Users can submit multiple responses at once:

```mermaid
flowchart LR
    A[Batch Response Request] --> B[Validate All Questions]
    B -->|Any Invalid| C[Return All Errors]
    B -->|All Valid| D[Loop: Upsert Each Response]
    D --> E[Log Batch Audit Event]
    E --> F[Return All Responses]
```

---

## Branching Rules Flow

### Branching Rule Types

1. **question_answer** - Unlock based on specific answer to a question
   - Config: `question_id`, `expected_value`, `operator`
   - Operators: `equals`, `not_equals`, `contains`, `greater_than`, `less_than`

2. **all_complete** - Unlock when ALL specified submodules are complete
   - Config: `submodule_ids[]`

3. **any_complete** - Unlock when ANY specified submodule is complete
   - Config: `submodule_ids[]`

4. **always** - Always unlock (no conditions)
   - Config: `{}` (empty)

### Branching Rule Structure

```typescript
BranchingRule {
  source_module_id: number        // Module this rule belongs to
  source_submodule_id: number?    // Submodule that triggers (null = module-level)
  target_submodule_id: number     // Submodule to unlock
  condition_type: ConditionType   // One of 4 types above
  condition_config: object        // Type-specific configuration
  priority: number                // Higher priority evaluated first
}
```

### Rule Evaluation Flow

```mermaid
flowchart TD
    A[Submodule Completed] --> B[Get Rules with source_submodule_id]
    B --> C[Sort by Priority DESC]
    C --> D{For Each Rule}
    D --> E{Condition Type?}

    E -->|always| F[Return TRUE]

    E -->|question_answer| G[Get User Response]
    G --> H{Response Exists?}
    H -->|No| I[Return FALSE]
    H -->|Yes| J[Compare with Operator]
    J --> K{Match?}
    K -->|Yes| F
    K -->|No| I

    E -->|all_complete| L[Query Submodule Progress]
    L --> M{All in List Complete?}
    M -->|Yes| F
    M -->|No| I

    E -->|any_complete| N[Query Submodule Progress]
    N --> O{Any in List Complete?}
    O -->|Yes| F
    O -->|No| I

    F --> P[Unlock Target Submodule]
    I --> Q[Target Remains Locked]

    P --> R[Log Unlock Event]
    Q --> R
    R --> S{More Rules?}
    S -->|Yes| D
    S -->|No| T[Return Unlocked IDs]
```

### Example Branching Scenario

**Scenario**: Educational assessment with remedial path

```text
Module: Math Assessment
├─ Submodule 1: Diagnostic Test (always accessible)
│   └─ Question: "What is 2+2?" (multiple_choice)
│       ├─ Answer "4" → Unlock "Advanced Topics"
│       └─ Answer "3" → Unlock "Fundamentals Review"
├─ Submodule 2: Fundamentals Review (branching)
├─ Submodule 3: Advanced Topics (branching)
└─ Submodule 4: Final Assessment (requires 2 OR 3 complete)
```

**Rules:**

```javascript
// Rule 1: Correct answer unlocks advanced
{
  source_submodule_id: 1,
  target_submodule_id: 3,
  condition_type: "question_answer",
  condition_config: {
    question_id: 42,
    expected_value: "4",
    operator: "equals"
  },
  priority: 10
}

// Rule 2: Wrong answer unlocks review
{
  source_submodule_id: 1,
  target_submodule_id: 2,
  condition_type: "question_answer",
  condition_config: {
    question_id: 42,
    expected_value: "4",
    operator: "not_equals"
  },
  priority: 5
}

// Rule 3: Any path unlocks final
{
  source_module_id: 1,
  target_submodule_id: 4,
  condition_type: "any_complete",
  condition_config: {
    submodule_ids: [2, 3]
  },
  priority: 1
}
```

---

## API Endpoints Reference

### Authentication Endpoints

| Method | Endpoint                     | Description                   | Auth Required |
| ------ | ---------------------------- | ----------------------------- | ------------- |
| POST   | `/api/auth/create-anonymous` | Create anonymous user account | No            |
| POST   | `/api/auth/login`            | Login and get JWT token       | No            |
| POST   | `/api/auth/refresh`          | Refresh JWT token             | Yes           |
| GET    | `/api/auth/user`             | Get current user profile      | Yes           |

### Module Endpoints

| Method | Endpoint                             | Description                   | Auth Required |
| ------ | ------------------------------------ | ----------------------------- | ------------- |
| GET    | `/api/modules`                       | Get all modules with progress | Yes           |
| GET    | `/api/modules/current`               | Get current active module     | Yes           |
| GET    | `/api/modules/:moduleName`           | Get specific module details   | Yes           |
| POST   | `/api/modules/:moduleName/start`     | Start a module                | Yes           |
| POST   | `/api/modules/:moduleName/save`      | Save module progress          | Yes           |
| POST   | `/api/modules/:moduleName/complete`  | Complete a module             | Yes           |
| GET    | `/api/modules/:moduleName/responses` | Get module responses (review) | Yes           |

### Submodule Endpoints

| Method | Endpoint                                               | Description             | Auth Required |
| ------ | ------------------------------------------------------ | ----------------------- | ------------- |
| GET    | `/api/submodules/:moduleName/:submoduleName`           | Get submodule details   | Yes           |
| POST   | `/api/submodules/:moduleName/:submoduleName/start`     | Start a submodule       | Yes           |
| POST   | `/api/submodules/:moduleName/:submoduleName/save`      | Save submodule progress | Yes           |
| POST   | `/api/submodules/:moduleName/:submoduleName/complete`  | Complete submodule      | Yes           |
| GET    | `/api/submodules/:moduleName/:submoduleName/responses` | Get submodule responses | Yes           |

### Question Endpoints

| Method | Endpoint                                             | Description                     | Auth Required |
| ------ | ---------------------------------------------------- | ------------------------------- | ------------- |
| GET    | `/api/questions/modules/:moduleName/questions`       | Get all questions for module    | Yes           |
| GET    | `/api/questions/submodules/:submoduleName/questions` | Get all questions for submodule | Yes           |
| GET    | `/api/questions/:questionId`                         | Get specific question           | Yes           |
| POST   | `/api/questions/:questionId/respond`                 | Submit response to question     | Yes           |
| POST   | `/api/questions/respond/batch`                       | Submit multiple responses       | Yes           |
| GET    | `/api/questions/:questionId/response`                | Get user's response             | Yes           |
| DELETE | `/api/questions/:questionId/response`                | Delete response (testing)       | Yes           |

### Admin Endpoints (Not shown in flows)

Additional endpoints exist for administrative operations like creating/updating
modules, submodules, questions, and branching rules.

---

## Middleware Chain

Requests pass through middleware in this order:

### 1. CORS Middleware

- **Purpose**: Handle cross-origin requests
- **File**: [middleware/cors.ts](utopia/middleware/cors.ts:1)
- **Applied**: Globally on all routes

### 2. Logger Middleware

- **Purpose**: Log all incoming requests
- **File**: [middleware/logger.ts](utopia/middleware/logger.ts:1)
- **Applied**: Globally on all routes

### 3. Auth Middleware

- **Purpose**: Validate JWT token, extract user
- **File**: [middleware/auth.ts](utopia/middleware/auth.ts:1)
- **Applied**: All protected routes
- **Sets**: `c.get("user")` with user data

### 4. Module Access Middleware

- **Purpose**: Check sequential module access
- **File**: [middleware/moduleAccess.ts](utopia/middleware/moduleAccess.ts:1)
- **Applied**: Module-specific routes
- **Checks**: Previous modules completed
- **Sets**: `c.get("module")` with module data

### 5. Module Review Middleware

- **Purpose**: Allow access to completed modules for review
- **File**: [middleware/moduleReview.ts](utopia/middleware/moduleReview.ts:1)
- **Applied**: Module read operations
- **Allows**: Access if module is accessible OR completed

### 6. Module Completion Middleware

- **Purpose**: Validate module can be completed
- **File**:
  [middleware/moduleCompletion.ts](utopia/middleware/moduleCompletion.ts:1)
- **Applied**: Module completion endpoint
- **Checks**: Module started, not already completed

### 7. Submodule Access Middleware

- **Purpose**: Check submodule accessibility (sequential + branching)
- **File**:
  [middleware/submoduleAccess.ts](utopia/middleware/submoduleAccess.ts:1)
- **Applied**: Submodule-specific routes
- **Checks**: Parent module accessible, sequential access, branching rules
- **Sets**: `c.get("submodule")` with submodule data

### 8. Submodule Completion Middleware

- **Purpose**: Validate submodule can be completed
- **File**:
  [middleware/submoduleCompletion.ts](utopia/middleware/submoduleCompletion.ts:1)
- **Applied**: Submodule completion endpoint
- **Checks**: Submodule started, not completed, all required questions answered

### Middleware Chain Example

```text
Request: POST /api/submodules/onboarding/consent/complete
    ↓
[CORS Middleware] → Handle preflight, set headers
    ↓
[Logger Middleware] → Log request details
    ↓
[Auth Middleware] → Validate JWT, set user context
    ↓
[Submodule Access Middleware] → Check parent module, sequential access, branching
    ↓
[Submodule Completion Middleware] → Validate can complete, check questions
    ↓
[Route Handler] → Execute completion logic
    ↓
Response: { progress, unlockedSubmodules, moduleCompleted }
```

---

## State Transitions

### Module State Machine

```mermaid
stateDiagram-v2
    [*] --> NOT_STARTED: Module Created
    NOT_STARTED --> IN_PROGRESS: User Starts Module
    IN_PROGRESS --> IN_PROGRESS: Complete Submodules
    IN_PROGRESS --> COMPLETED: All Required Submodules Done
    COMPLETED --> [*]: Module Finished (Read-Only)

    note right of COMPLETED
        Read-only state:
        - Can view responses
        - Cannot modify
        - Cannot restart
    end note
```

### Submodule State Machine

```mermaid
stateDiagram-v2
    [*] --> NOT_STARTED: Submodule Created
    NOT_STARTED --> LOCKED: Not Sequentially Accessible
    NOT_STARTED --> LOCKED: Branching Rules Not Met
    NOT_STARTED --> ACCESSIBLE: Sequential + Branching OK
    ACCESSIBLE --> IN_PROGRESS: User Starts Submodule
    IN_PROGRESS --> IN_PROGRESS: Answer Questions
    IN_PROGRESS --> COMPLETED: All Required Questions Answered
    COMPLETED --> [*]: Submodule Finished (Read-Only)
    COMPLETED --> UNLOCK_OTHERS: Evaluate Branching Rules
    UNLOCK_OTHERS --> [*]: Other Submodules Unlocked

    note right of LOCKED
        Two unlock conditions:
        1. Sequential: Previous submodules complete
        2. Branching: Rules evaluate to true
    end note

    note right of COMPLETED
        Read-only state:
        - Can view responses
        - Cannot modify
        - Cannot restart
        - May trigger rule evaluation
    end note
```

### User Progress State Machine

```mermaid
stateDiagram-v2
    [*] --> ACCOUNT_CREATED: Anonymous Registration
    ACCOUNT_CREATED --> CONSENT_MODULE: Initialized with Consent
    CONSENT_MODULE --> MODULE_1: Complete Consent
    MODULE_1 --> MODULE_2: Complete Module 1
    MODULE_2 --> MODULE_N: Continue Sequential
    MODULE_N --> ALL_COMPLETE: Complete All Modules
    ALL_COMPLETE --> [*]: Research Participation Complete

    state MODULE_1 {
        [*] --> SUBMODULE_1_1
        SUBMODULE_1_1 --> SUBMODULE_1_2: Sequential
        SUBMODULE_1_2 --> BRANCHING_CHECK: Complete
        BRANCHING_CHECK --> SUBMODULE_1_3A: Rule A Met
        BRANCHING_CHECK --> SUBMODULE_1_3B: Rule B Met
        SUBMODULE_1_3A --> [*]
        SUBMODULE_1_3B --> [*]
    }
```

---

## Flow Descriptions

### Complete Module Completion Flow

When a user completes a module with submodules:

1. **User submits completion** via POST `/api/modules/:moduleName/complete`
2. **Module Completion Middleware** validates:
   - Module is started
   - Module not already completed
3. **Module Service checks**:
   - All required submodules are completed
   - If not, returns error with incomplete list
4. **Mark module COMPLETED**:
   - Sets status to COMPLETED
   - Sets completed_at timestamp
   - Module becomes read-only
5. **Log audit event** for completion
6. **Find next accessible module** based on sequence_order
7. **Return response** with:
   - Completion confirmation
   - Next module information
   - Progress statistics

### Complete Submodule Completion Flow with Branching

When a user completes a submodule:

1. **User submits completion** via POST
   `/api/submodules/:moduleName/:submoduleName/complete`
2. **Submodule Completion Middleware** validates:
   - Submodule is started
   - Submodule not already completed
   - All required questions answered
3. **Mark submodule COMPLETED**:
   - Sets status to COMPLETED
   - Sets completed_at timestamp
   - Submodule becomes read-only
4. **Log completion audit event**
5. **Evaluate branching rules**:
   - Get all rules with source_submodule_id matching completed submodule
   - For each rule (sorted by priority):
     - Evaluate condition based on type
     - If condition met, add target_submodule_id to unlocked list
6. **Log unlocked submodules** if any
7. **Check parent module completion**:
   - If all required submodules for parent module are complete
   - Auto-complete the parent module
   - Log module completion event
8. **Return response** with:
   - Submodule completion confirmation
   - List of newly unlocked submodule IDs
   - Whether parent module was auto-completed

### Question Answer with Branching Impact

When a user answers a question that affects branching:

1. **User submits response** via POST `/api/questions/:questionId/respond`
2. **Question Service validates**:
   - Question exists
   - Module/submodule not completed (read-only check)
   - Response value matches question type
3. **Save response** to database (upsert)
4. **Log audit event**
5. **Branching impact** (happens on submodule completion):
   - Response is saved but doesn't immediately unlock
   - When submodule completes, rules are evaluated
   - Rules check this saved response
   - May unlock new submodules based on answer

### Sequential Access Check

When a user tries to access a submodule:

1. **Submodule Access Middleware** checks:
   - Parent module is accessible (previous modules complete)
   - Previous submodules in same module are complete
2. **Branching Rules Check**:
   - Get all rules targeting this submodule
   - If no rules exist, submodule is accessible
   - If rules exist, evaluate each:
     - ANY rule evaluating to TRUE unlocks submodule
     - ALL rules must be FALSE to keep locked
3. **Combined result**:
   - Both sequential AND branching must pass
   - If either fails, return 403 Access Denied

---

## Research-Specific Features

### Anonymous User System

- Unique aliases generated (adjective-noun pattern)
- Temporary passwords (expires after 30 days)
- UUID-based identification
- Firebase integration for auth

### Sequential Access Control

- Enforced module progression
- Prevents skipping ahead
- Ensures research protocol compliance

### Comprehensive Audit Trail

- All user actions logged
- Module start/completion events
- Question responses timestamped
- Access attempts tracked

### Module State Management

- Prevents data loss with progress tracking
- Read-only completed content ensures data integrity
- Progress can be saved incrementally

### Branching Logic for Research

- Adaptive content paths based on responses
- Complex conditional logic support
- Priority-based rule evaluation
- Multiple condition types for flexibility

---

## Error Handling & Security

### Common Error Responses

| Status | Scenario                 | Response                                                 |
| ------ | ------------------------ | -------------------------------------------------------- |
| 401    | Invalid/expired JWT      | `{ error: "Unauthorized" }`                              |
| 403    | Module not accessible    | `{ error: "Module not accessible", next_module: {...} }` |
| 403    | Submodule locked         | `{ error: "Submodule not accessible" }`                  |
| 400    | Module already completed | `{ error: "Module already completed - read-only" }`      |
| 400    | Invalid response type    | `{ error: "Invalid response", details: {...} }`          |
| 404    | Resource not found       | `{ error: "Not found" }`                                 |
| 500    | Server error             | `{ error: "Internal server error" }`                     |

### Security Features

1. **JWT Authentication** - 30-day token expiration
2. **Password Hashing** - bcrypt with salt rounds
3. **Firebase Integration** - Custom claims for role-based access
4. **Middleware Validation** - Multi-layer access checks
5. **SQL Injection Prevention** - Parameterized queries with Neon
6. **Type Validation** - Zod schemas for request validation
7. **Read-Only Enforcement** - Completed content immutable
8. **Audit Logging** - All actions tracked

---

## Summary

The Utopia platform implements a sophisticated hierarchical survey system with:

- **Sequential module progression** ensuring research protocol compliance
- **Adaptive submodule branching** based on user responses
- **Comprehensive question system** with 4 types and validation
- **Flexible branching rules engine** with 4 condition types
- **Multi-layer middleware security** ensuring proper access control
- **Complete audit trail** for research integrity
- **Read-only enforcement** preventing data tampering
- **Anonymous user system** protecting participant privacy

This architecture supports complex research protocols while maintaining
security, data integrity, and a user-friendly experience.
