# Debugging Guide: Add Client/Loan Errors and Loan Plan Deletion Issues

## Overview
This guide documents the investigation and debugging approach for two reported issues:
1. Errors when adding loans or clients
2. Deleted loan plans not disappearing from the list

## Changes Made for Debugging

### 1. Enhanced Logging in Add Client (`add-client.tsx`)

**What was added:**
```typescript
// Before sending request
console.log('Creating client with data:', requestBody);

// After receiving response
console.log('Create client response status:', response.status);

// On error
console.error('Create client error:', error);
```

**What to check in console:**
- Request payload structure
- Response status codes (200 = success, 4xx = client error, 5xx = server error)
- Error details from backend

### 2. Enhanced Logging in Add Loan (`add-loan.tsx`)

**What was added:**
```typescript
// Client creation (if new client)
console.log('Creating new client for loan:', newClientData);
console.log('Client creation response status:', clientResponse.status);
console.log('New client created successfully:', newClient.id);

// Loan setup
console.log('Setting up loan for client:', clientId, loanData);
console.log('Loan setup response status:', loanResponse.status);
console.log('Loan setup successful:', loanResponseData);
```

**What to check in console:**
- Client creation flow for new clients
- Loan setup request data
- Response statuses at each step
- Generated client IDs

### 3. Enhanced Logging in Loan Plans Deletion (`loan-plans.tsx`)

**What was added:**
```typescript
// Before deletion
console.log('Attempting to delete plan:', plan.id, plan.name);
console.log('Delete plan response status:', response.status);

// During state update
console.log('Deleting plan from local state:', plan.id, 'Current plans count:', prevPlans.length);
console.log('Filtering out plan:', p.id, p.name);
console.log('After filter, plans count:', filtered.length, 'Filtered out:', prevPlans.length - filtered.length);

// After completion
console.log('Plan deletion completed successfully');
```

**What to check in console:**
- Plan ID being deleted
- HTTP response status (200 = success)
- State before deletion (plan count)
- Filtering operation (should show 1 plan filtered out)
- State after deletion (plan count should decrease by 1)

## How to Use This Debugging Information

### For Add Client/Loan Errors:

1. **Open Developer Console** (in browser/Expo)
2. **Attempt to add a client or loan**
3. **Check console output for:**
   - Request data being sent
   - HTTP status codes
   - Error messages from backend
   - Any network failures

**Common Issues to Look For:**
- **400 Bad Request**: Invalid data format or missing required fields
- **401 Unauthorized**: Admin token expired or invalid
- **404 Not Found**: Wrong API endpoint
- **500 Server Error**: Backend crash or database issue
- **Network Error**: Backend server not running or CORS issue

### For Deleted Loan Plans Not Disappearing:

1. **Open Developer Console**
2. **Navigate to Loan Plans page**
3. **Note the initial plan count in console**
4. **Click delete on a plan**
5. **Check console output for:**
   - "Attempting to delete plan: [id] [name]"
   - "Delete plan response status: 200" (should be 200 for success)
   - "Deleting plan from local state: [id]"
   - "Filtering out plan: [id] [name]"
   - "After filter, plans count: [new count]"
   - "Plan deletion completed successfully"

**Expected Console Flow:**
```
Attempting to delete plan: abc123 Standard Plan
Delete plan response status: 200
Deleting plan from local state: abc123 Current plans count: 5
Filtering out plan: abc123 Standard Plan
After filter, plans count: 4 Filtered out: 1
Plan deletion completed successfully
```

**If Plan Doesn't Disappear, Check:**
- Does response status = 200? If not, deletion failed on backend
- Does "Filtering out plan" appear? If not, plan ID didn't match
- Does plan count decrease? If not, state update didn't work
- Does page re-render after state update? Check React DevTools

## Code Structure Analysis

### State Management in Loan Plans
```typescript
// State declaration
const [plans, setPlans] = useState<LoanPlan[]>([]);

// Deletion logic
setPlans(prevPlans => {
  const filtered = prevPlans.filter(p => p.id !== plan.id);
  return filtered;
});

// Rendering
{plans.map((plan) => (
  <View key={plan.id}>...</View>
))}
```

**This should work correctly because:**
1. `setPlans` triggers a re-render
2. `filter` creates a new array reference
3. Component re-renders with updated plans array
4. Each plan has unique `key={plan.id}`

### Backend Deletion Endpoint
```python
@api_router.delete("/loan-plans/{plan_id}")
async def delete_loan_plan(plan_id: str, admin_token: str = Query(...), force: bool = Query(default=False)):
    # ... validation ...
    result = await db.loan_plans.delete_one({"id": plan_id})
    return {
        "message": "Loan plan deleted successfully",
        "clients_affected": clients_using_plan if force else 0
    }
```

**Backend returns 200 if:**
- Admin token is valid
- Plan exists
- Plan belongs to admin
- No clients using plan (or force=true)

## Potential Root Causes

### For Add Client/Loan Errors:

1. **Backend Not Running**
   - Check if backend server is up
   - Verify API_URL in frontend/src/constants/api.ts

2. **Validation Failures**
   - Email format invalid
   - Phone number format issues
   - Missing required fields

3. **Database Connection Issues**
   - MongoDB not running
   - Connection string incorrect

4. **Token Expiration**
   - Admin token expired (24-hour TTL)
   - User needs to log in again

### For Loan Plan Deletion:

1. **Backend Deletion Failing**
   - Check response status in console
   - Clients might be using the plan
   - Permission issues

2. **Frontend State Not Updating**
   - React not detecting state change
   - Component not re-rendering
   - Key prop issues

3. **Race Conditions**
   - Multiple deletions happening simultaneously
   - State updates out of order

4. **ID Mismatch**
   - Plan ID in state doesn't match backend ID
   - String vs number type issues

## Next Steps

1. **Run the application** with developer console open
2. **Reproduce the issues** while watching console output
3. **Document the actual error messages** seen in console
4. **Share the console logs** for further analysis
5. **Fix the root cause** based on the specific error found

## Testing Checklist

- [ ] Test add client with valid data
- [ ] Test add client with invalid email
- [ ] Test add loan with existing client
- [ ] Test add loan with new client
- [ ] Test delete loan plan (unused)
- [ ] Test delete loan plan (in use) - should prompt for force delete
- [ ] Test force delete loan plan
- [ ] Verify plans list refreshes after deletion
- [ ] Check console for any errors
- [ ] Verify backend logs for API calls

## Contact
If issues persist after reviewing console logs, provide:
1. Complete console log output
2. Steps to reproduce
3. Expected vs actual behavior
4. Screenshots if applicable
