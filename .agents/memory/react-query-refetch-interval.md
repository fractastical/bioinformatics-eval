---
name: React Query refetchInterval typing
description: How to pass a dynamic refetchInterval callback to Orval-generated React Query hooks without TS errors
---

Orval generates hooks with `UseQueryOptions<..., readonly unknown[]>` where `queryKey` is a required field.
Passing a plain `{ refetchInterval: fn }` object causes TS2741 (missing `queryKey`).

**Fix:** Cast the `query` option as `any`:

```typescript
const { data } = useGetSomething(id, {
  query: {
    refetchInterval: (query: any) => {
      return query?.state?.data?.status === 'pending' ? 3000 : false;
    }
  } as any,
});
```

**Why:** The generated `UseQueryOptions` type inherits the strict TanStack Query v5 shape which requires `queryKey`. The orval scaffold is designed for full options objects, not partials. Using `as any` is the pragmatic escape hatch here.

**How to apply:** Whenever polling is needed on any Orval-generated `useGet*` hook in this project.
