# EMI Phone Lock System - Security & Bug Fix Release (kimi_v1)

## Overview
This fork contains critical security patches and bug fixes for the EMI Phone Lock System.

## Critical Fixes Implemented

### 1. SECURITY: Password Hashing (CRITICAL)
**Issue**: SHA-256 password hashing vulnerable to rainbow table attacks  
**Fix**: Replaced with bcrypt (adaptive hashing with salt)
- Minimum 12 rounds of hashing
- Unique salt per password
- Updated `verify_password()` to use bcrypt comparison

### 2. SECURITY: CORS Configuration (CRITICAL)
**Issue**: `allow_origins=["*"]` allowed any domain in production  
**Fix**: Environment-based CORS restriction
- Production: Only allows configured origins
- Development: Allows localhost origins
- Removed credentials support for wildcard origins

### 3. BUG: Async Auto-Lock Function (CRITICAL)
**Issue**: `check_and_auto_lock_overdue_payments()` was broken async code  
**Fix**: Proper async implementation with scheduled tasks
- Fixed fire-and-forget pattern
- Proper error handling
- Runs every hour via asyncio

### 4. BUG: Race Condition in Payments (HIGH)
**Issue**: Non-atomic read-modify-write on payment recording  
**Fix**: MongoDB atomic `$inc` operator
- Prevents lost updates in concurrent scenarios
- Uses `find_one_and_update` for atomicity

### 5. BUG: Late Fee Calculation (MEDIUM)
**Issue**: Fees accumulated exponentially on each run  
**Fix**: Calculate fees once per day per client
- Tracks `last_late_fee_calculation` timestamp
- Only applies new fees for current period

### 6. SECURITY: Rate Limiting (HIGH)
**Issue**: No protection against brute force attacks  
**Fix**: Implemented rate limiting
- Login attempts: 5 per 5 minutes
- General API: 5-60 requests per minute
- In-memory storage (use Redis in production)

### 7. BUG: Registration Code Collision (MEDIUM)
**Issue**: 8-char hex code could collide  
**Fix**: Collision detection with retry logic
- Checks database before assigning
- 10 attempts before failing

### 8. PERFORMANCE: Database Indexes (MEDIUM)
**Issue**: Missing indexes on frequently queried fields  
**Fix**: Added comprehensive indexes
- `admin_id` for tenant isolation
- `registration_code` unique index
- Compound indexes for common queries
- TTL index on tokens for auto-cleanup

### 9. SECURITY: Error Information Disclosure (LOW)
**Issue**: Raw exceptions exposed to client  
**Fix**: Generic error messages with error IDs
- Logs full details server-side
- Returns error ID for support tracking

### 10. FRONTEND: Device Admin Activation (CRITICAL)
**Issue**: Client app asked for admin mode but didn't enable it  
**Root Cause**: 
- Native module didn't properly launch `ACTION_ADD_DEVICE_ADMIN` intent
- Missing `FLAG_ACTIVITY_NEW_TASK` when context wasn't Activity
- No proper promise resolution

**Fix**:
- Fixed Kotlin native module to properly launch system dialog
- Added proper error handling and promise resolution
- Created proper DeviceAdminReceiver
- Added explanation text for user

## Device Admin Setup Instructions

### For Device Admin (Client App Protection):
1. Install Client APK
2. App will prompt for Device Admin activation
3. User taps "Activate"
4. System shows dialog explaining permissions
5. User must explicitly enable

### For Device Owner (Full Control - Requires ADB):
```bash
# Factory reset device first
# Skip Google account setup
# Enable USB debugging
adb shell dpm set-device-owner com.emi.client/.EmiDeviceAdminReceiver
```

## Deployment Checklist

### Backend Deployment:
1. Update `ALLOWED_ORIGINS` environment variable with production domains
2. Set `ENVIRONMENT=production`
3. Ensure MongoDB connection string is secure
4. Run database migrations for new indexes
5. Test bcrypt password hashing with existing users (requires password reset)

### Frontend Deployment:
1. Set `EXPO_PUBLIC_BACKEND_URL` to production API
2. Configure EAS Secrets (don't commit .env files)
3. Test Device Admin flow on physical device
4. Verify CORS origins match deployed domains

### Security Verification:
- [ ] Passwords hashed with bcrypt
- [ ] CORS restricts origins in production
- [ ] Rate limiting active
- [ ] No stack traces in API responses
- [ ] Database indexes created
- [ ] Device Admin activates properly

## API Changes

### New Endpoints:
- `POST /api/device/report-admin-status` - Report admin mode status

### Modified Endpoints:
- `POST /api/admin/login` - Now has rate limiting
- `POST /api/admin/register` - Password min 8 chars, bcrypt hashing
- `POST /api/loans/{id}/payments` - Atomic updates
- All endpoints - Improved error handling

## Migration Notes

### Database:
Existing SHA-256 passwords will need to be reset. Implement password reset flow or force password update on next login.

### Client Devices:
Existing Device Admin activations remain valid. New activations use fixed flow.

## Testing

### Security Tests:
```bash
# Test rate limiting
for i in {1..10}; do curl -X POST /api/admin/login; done

# Test CORS
curl -H "Origin: https://evil.com" /api/clients

# Test password hashing
# Verify bcrypt hashes start with $2b$
```

### Device Admin Tests:
1. Fresh install → Should prompt for activation
2. Tap Activate → Should show system dialog
3. Deny → App should handle gracefully
4. Accept → `isDeviceAdminActive()` should return true
5. Reboot → Should persist

## Credits
- Original: karli2122/Loan-management-and-locker
- Security Audit & Fixes: kimi_v1 fork
