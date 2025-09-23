# Utopia User Flow Diagram

This document contains the complete user flow from account creation to module
completion in the Utopia research platform.

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
    P -->|Valid| R[Generate JWT Token]
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
    AA --> BB[Check Module Access]
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
    JJ -->|GET /:moduleName| KK[Get Module Data for User]
    KK --> LL[Return Module + Progress Info]

    %% Start Module
    JJ -->|POST /:moduleName/start| MM[Check if Already Started]
    MM -->|Already Started| NN[Return Error]
    MM -->|Not Started| OO[Create Progress Record]
    OO --> PP[Log Audit Event]
    PP --> QQ[Set as Active Module]
    QQ --> RR[Return Success]

    %% Save Progress
    JJ -->|POST /:moduleName/save| SS[Validate Request Data]
    SS --> TT[Update Response Data]
    TT --> UU[Return Save Confirmation]

    %% Complete Module
    JJ -->|POST /:moduleName/complete| VV[Module Completion Middleware]
    VV --> WW{Module Started?}
    WW -->|No| XX[Return Error: Not Started]
    WW -->|Yes| YY{Already Completed?}
    YY -->|Yes| ZZ[Return Error: Already Complete]
    YY -->|No| AAA[Validate Submission Data]
    AAA --> BBB[Mark Module Complete]
    BBB --> CCC[Log Completion Event]
    CCC --> DDD[Find Next Available Module]
    DDD --> EEE[Update Active Module]
    EEE --> FFF[Return Completion + Next Module]

    %% Review Flow
    JJ -->|GET /:moduleName/responses| GGG[Get Module Responses]
    GGG --> HHH{Has Response Data?}
    HHH -->|No| III[Return No Responses Found]
    HHH -->|Yes| JJJ[Return Response Data]

    %% Module Progression
    FFF --> KKK{More Modules Available?}
    KKK -->|Yes| LLL[User Can Access Next Module]
    LLL --> Y
    KKK -->|No| MMM[All Modules Completed]

    %% Overview Routes
    X --> NNN[GET /api/modules - Overview]
    NNN --> OOO[Get All Modules with Progress]
    OOO --> PPP[Get Navigation State]
    PPP --> QQQ[Get Progress Statistics]
    QQQ --> RRR[Return Complete Overview]

    X --> SSS[GET /api/modules/current]
    SSS --> TTT[Get Current Module for User]
    TTT --> UUU{Has Current Module?}
    UUU -->|No| VVV[Return All Complete]
    UUU -->|Yes| WWW[Return Current Module Info]

    %% Error States
    O --> XXX[User Retries Login]
    V --> XXX
    DD --> YYY[User Completes Previous Modules]
    HH --> YYY

    %% Styling
    classDef userAction fill:#e1f5fe
    classDef middleware fill:#f3e5f5
    classDef database fill:#e8f5e8
    classDef decision fill:#fff3e0
    classDef error fill:#ffebee
    classDef success fill:#e8f5e8

    class A,L,T,Y userAction
    class U,Z,FF,VV middleware
    class I,AA,KK,OO,BBB database
    class N,P,GG,WW,YY,HHH,KKK,UUU decision
    class O,Q,V,CC,DD,HH,NN,XX,ZZ error
    class K,S,RR,FFF,MMM success
```

## Flow Description

### 🔑 Key Components

#### 1. User Registration Flow

- **Anonymous Account Creation**: Users get unique aliases and temporary
  passwords
- **Firebase Integration**: Secure user management with custom claims
- **Module Initialization**: Automatic setup with consent module

#### 2. Authentication & Authorization

- **JWT-based Authentication**: Secure token-based system
- **Middleware Validation**: Multi-layer security checks
- **Context Management**: User state throughout request lifecycle

#### 3. Sequential Module Access

- **Enforced Progression**: Users must complete modules in order
- **Access Control**: Middleware ensures proper module access
- **Audit Logging**: Complete tracking of user actions and access attempts

#### 4. Module Operations

- **View Module**: Get module details and current progress
- **Start Module**: Initialize module progress tracking
- **Save Progress**: Periodic saving of user responses
- **Complete Module**: Final submission and progression to next module

#### 5. Review Capabilities

- **Access Previous Work**: Users can review completed modules
- **Read-only Access**: Completed modules become viewable but not editable

#### 6. Error Handling & Security

- **Comprehensive Error States**: Clear feedback for various failure scenarios
- **Security Enforcement**: Multiple validation layers
- **User Guidance**: Helpful messages for next steps

### 🎯 Research-Specific Features

- **Anonymous User System**: Protects participant privacy
- **Sequential Access Control**: Ensures research protocol compliance
- **Comprehensive Audit Trail**: Tracks all user interactions for research
  validity
- **Module State Management**: Prevents data loss and ensures research integrity

### 🔄 State Transitions

The diagram shows how users progress through the system:

1. **Registration** → **Authentication** → **Module Access**
2. **Sequential Module Completion** with state validation
3. **Error Recovery Paths** for various failure scenarios
4. **Review Access** for completed modules

This flow ensures research participants follow the intended protocol while
providing a secure and user-friendly experience.
