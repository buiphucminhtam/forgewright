# Phase 4: Pages, Routes & API Client Layer

## Objective

Build actual pages with routing, state management, data fetching, and auth guards. Generate typed API clients from OpenAPI specifications. This phase ties together the design system and component library into a working application with full data flow.

## 4.1 Route Structure

Generate routes based on the Page Inventory from Phase 1:

```
pages/                          # Next.js App Router (or equivalent)
├── (auth)/                     # Auth layout group
│   ├── login/page.tsx
│   ├── signup/page.tsx
│   ├── forgot-password/page.tsx
│   └── reset-password/page.tsx
├── (dashboard)/                # Dashboard layout group
│   ├── layout.tsx              # DashboardLayout with sidebar
│   ├── page.tsx                # Dashboard home
│   ├── [resource]/             # Dynamic CRUD routes
│   │   ├── page.tsx            # List view
│   │   ├── [id]/page.tsx       # Detail view
│   │   ├── [id]/edit/page.tsx  # Edit view
│   │   └── new/page.tsx        # Create view
│   ├── settings/
│   │   ├── page.tsx            # General settings
│   │   ├── profile/page.tsx
│   │   ├── billing/page.tsx
│   │   └── team/page.tsx
│   └── admin/                  # Admin-only routes
│       ├── users/page.tsx
│       └── analytics/page.tsx
├── (marketing)/                # Public pages
│   ├── page.tsx                # Landing page
│   ├── pricing/page.tsx
│   └── docs/page.tsx
├── error.tsx                   # Global error boundary
├── not-found.tsx               # 404 page
├── loading.tsx                 # Global loading state
└── layout.tsx                  # Root layout (providers, fonts, metadata)
```

## 4.2 State Management Setup

Create `frontend/app/stores/`:

```
stores/
├── auth-store.ts              # Auth state: user, tokens, login/logout
├── ui-store.ts                # UI state: sidebar open, theme, modals
├── notification-store.ts      # Toast/notification queue
└── index.ts                   # Store initialization
```

For React Query + Zustand (recommended):
- **Zustand** for client-only state (UI state, theme, sidebar toggle, form drafts)
- **React Query** for all server state (API data, caching, optimistic updates, refetch)
- Query keys follow convention: `[resource, action, params]` e.g., `['users', 'list', { page: 1 }]`
- Mutations with optimistic updates for better UX
- Stale time: 5 minutes default, 30 seconds for frequently changing data
- Global error handler for 401 -> redirect to login

## 4.3 Auth Implementation

Create `frontend/app/hooks/use-auth.ts` and auth utilities:

```
hooks/
├── use-auth.ts                # Login, logout, signup, user state
├── use-permissions.ts         # Role-based permission checks
├── use-require-auth.ts        # Redirect if unauthenticated
├── use-debounce.ts            # Debounce input values
├── use-media-query.ts         # Responsive breakpoint detection
├── use-local-storage.ts       # Persistent local storage state
├── use-clipboard.ts           # Copy to clipboard
├── use-pagination.ts          # Pagination state management
├── use-infinite-scroll.ts     # Infinite scroll with intersection observer
├── use-form.ts                # Form state with validation (or integrate react-hook-form)
└── use-keyboard-shortcut.ts   # Global keyboard shortcut registration
```

Auth flow implementation:
- JWT access/refresh token handling with automatic refresh
- Secure token storage (httpOnly cookies for SSR, in-memory for SPA)
- Auth middleware/guard on protected routes (Next.js middleware or route guards)
- OAuth integration stubs for configured providers
- Session expiry detection with re-auth prompt
- Role-based route protection with redirect to unauthorized page

## 4.4 Page Standards

Every page MUST implement:
- **Loading state** — Skeleton screens matching final layout (not generic spinners)
- **Error state** — Contextual error message with retry action
- **Empty state** — Helpful message with primary action CTA
- **SEO metadata** — Title, description, Open Graph, canonical URL
- **Responsive design** — Mobile-first, tested at all breakpoints
- **Breadcrumbs** — Contextual navigation trail
- **Page transitions** — Smooth transitions between routes (optional, respect reduced-motion)

## 4.5 API Client Layer

Auto-generate typed API clients from OpenAPI specifications in `frontend/app/services/`.

### Client Generation

Read `api/openapi/*.yaml` and generate:

```
services/
├── api-client.ts              # Base HTTP client (axios/fetch wrapper)
├── interceptors.ts            # Request/response interceptors (auth, error, logging)
├── generated/                 # Auto-generated from OpenAPI specs
│   ├── types.ts               # Request/response TypeScript types
│   ├── schemas.ts             # Zod validation schemas (generated from OpenAPI)
│   └── endpoints.ts           # Endpoint URL constants
├── auth-service.ts            # Auth API calls (login, signup, refresh, logout)
├── user-service.ts            # User CRUD operations
├── [resource]-service.ts      # Per-resource service files (from OpenAPI paths)
├── query-keys.ts              # React Query key factory
├── queries/                   # React Query hooks per resource
│   ├── use-users.ts           # useUsers, useUser, useCreateUser, useUpdateUser, useDeleteUser
│   └── use-[resource].ts      # Generated per API resource
└── index.ts                   # Barrel export
```

### HTTP Client Standards

Base client (`api-client.ts`) MUST include:
- **Base URL** from environment variable (`NEXT_PUBLIC_API_URL`)
- **Request interceptors** — Attach auth token, set `Content-Type`, add `X-Request-ID`
- **Response interceptors** — Handle 401 (refresh token), 403 (redirect to unauthorized), 429 (retry with backoff), 500 (error boundary)
- **Timeout** — 30 second default, configurable per request
- **Retry logic** — Exponential backoff for 5xx errors (max 3 retries), no retry on 4xx
- **Request deduplication** — Cancel duplicate in-flight requests
- **AbortController** — Cancel requests on component unmount

### React Query Integration

Generated query hooks MUST follow:

```typescript
// Pattern for every resource
export function useUsers(params?: ListParams) {
  return useQuery({
    queryKey: queryKeys.users.list(params),
    queryFn: () => userService.list(params),
    staleTime: 5 * 60 * 1000,
  });
}

export function useUser(id: string) {
  return useQuery({
    queryKey: queryKeys.users.detail(id),
    queryFn: () => userService.get(id),
    enabled: !!id,
  });
}

export function useCreateUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: userService.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.users.all });
    },
  });
}

export function useUpdateUser(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: UpdateUserInput) => userService.update(id, data),
    onMutate: async (data) => {
      // Optimistic update
      await queryClient.cancelQueries({ queryKey: queryKeys.users.detail(id) });
      const previous = queryClient.getQueryData(queryKeys.users.detail(id));
      queryClient.setQueryData(queryKeys.users.detail(id), (old) => ({ ...old, ...data }));
      return { previous };
    },
    onError: (err, data, context) => {
      queryClient.setQueryData(queryKeys.users.detail(id), context?.previous);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.users.all });
    },
  });
}
```

### Runtime Validation

- Validate all API responses at runtime using Zod schemas generated from OpenAPI specs
- Log validation errors to monitoring (do not crash the UI)
- Type-narrow response data after validation for full type safety
- Validate request payloads before sending to catch errors early

### Error Handling Strategy

```typescript
// Centralized error handling
type ApiError = {
  code: string;
  message: string;
  details?: Record<string, string[]>;
  trace_id?: string;
};

// Map API errors to user-facing messages
const errorMessages: Record<string, string> = {
  VALIDATION_ERROR: 'Please check the form for errors.',
  NOT_FOUND: 'The requested resource was not found.',
  UNAUTHORIZED: 'Your session has expired. Please log in again.',
  FORBIDDEN: 'You do not have permission to perform this action.',
  RATE_LIMITED: 'Too many requests. Please wait a moment.',
  INTERNAL_ERROR: 'Something went wrong. Please try again.',
};
```

## Validation Loop

Before moving to Phase 5:
- All routes render with correct layouts
- Auth guards redirect unauthenticated users
- Role-based route protection works correctly
- API client generates typed requests and validates responses
- React Query hooks handle loading, error, and success states
- Optimistic updates work for mutation operations
- State management stores are wired and functional
- All pages implement loading/error/empty states

**Present key pages to user via notify_user for approval before proceeding.**

## Quality Bar

- Every page has loading, error, and empty states
- API types are auto-generated, not hand-written
- Auth flow handles token refresh seamlessly
- All pages have SEO metadata
- Mobile-first responsive design at all breakpoints
- No `useEffect` for data fetching (React Query used instead)
