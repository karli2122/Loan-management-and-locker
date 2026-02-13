# API Domain Migration Documentation

## Overview
This document describes the migration of API endpoints from the old domain to the new domain.

## Migration Details

### Old Domain
```
https://apkdebug.preview.emergentagent.com
```

### New Domain
```
https://api-token-migration.preview.emergentagent.com
```

## Files Modified

### 1. Frontend Configuration

#### `frontend/src/constants/api.ts`
**Purpose**: Primary API configuration file

**Change**:
```typescript
// Before
export const FALLBACK_BACKEND = 'https://apkdebug.preview.emergentagent.com';

// After
export const FALLBACK_BACKEND = 'https://api-token-migration.preview.emergentagent.com';
```

**Impact**: All API calls throughout the frontend application will now use the new domain as fallback.

#### `frontend/app.config.js`
**Purpose**: Expo application configuration

**Change**:
```javascript
// Before
backendUrl: process.env.EXPO_PUBLIC_BACKEND_URL || "https://apkdebug.preview.emergentagent.com",

// After
backendUrl: process.env.EXPO_PUBLIC_BACKEND_URL || "https://api-token-migration.preview.emergentagent.com",
```

**Impact**: Expo builds will use the new domain when `EXPO_PUBLIC_BACKEND_URL` is not set.

#### `frontend/app/admin/(tabs)/index.tsx`
**Purpose**: Admin dashboard component

**Change**:
```typescript
// Before
const baseUrl = API_URL || 'https://apkdebug.preview.emergentagent.com';

// After
const baseUrl = API_URL || 'https://api-token-migration.preview.emergentagent.com';
```

**Impact**: Dashboard statistics API calls will use the new domain as fallback.

### 2. Backend Testing

#### `backend_test.py`
**Purpose**: Backend API test suite

**Changes** (2 locations):
```python
# Before
return "https://apkdebug.preview.emergentagent.com"  # fallback

# After
return "https://api-token-migration.preview.emergentagent.com"  # fallback
```

**Impact**: Test scripts will connect to the new API domain.

## Configuration Priority

The application uses the following priority order for API URLs:

1. **Environment Variable** (Highest Priority)
   - `EXPO_PUBLIC_BACKEND_URL` in `.env` file or build environment
   - Use this for custom deployments

2. **Expo Config Extra**
   - `backendUrl` in `app.config.js`
   - Uses env variable or fallback

3. **Fallback Constants** (Lowest Priority)
   - `FALLBACK_BACKEND` in `api.ts`
   - Used when no other configuration is available

## Environment Variable Configuration

To override the default API domain, set the environment variable:

### For Development (`.env.local`):
```bash
EXPO_PUBLIC_BACKEND_URL=https://your-custom-api.com
```

### For EAS Builds:
```bash
eas secret:create --scope project --name EXPO_PUBLIC_BACKEND_URL --value "https://your-api.com"
```

### For Local Testing:
```bash
export EXPO_PUBLIC_BACKEND_URL=https://localhost:8000
```

## Testing the Migration

### 1. Verify Configuration
Check that the new domain is used:
```bash
# Search for old domain (should return nothing)
grep -r "apkdebug.preview.emergentagent.com" frontend/ backend_test.py

# Search for new domain (should find 4 locations)
grep -r "api-token-migration.preview.emergentagent.com" frontend/ backend_test.py
```

### 2. Test API Connectivity

#### Test Health Endpoint
```bash
curl https://api-token-migration.preview.emergentagent.com/api/health
```

Expected response:
```json
{
  "status": "healthy",
  "message": "EMI Phone Lock API is running"
}
```

#### Test Backend Test Suite
```bash
python3 backend_test.py
```

### 3. Test Frontend Application

#### Admin App
1. Launch admin application
2. Login with credentials
3. Verify dashboard loads statistics
4. Check network requests in dev tools

#### Client App
1. Launch client application
2. Test device registration
3. Verify API connectivity

### 4. Monitor Network Requests

In React Native/Expo:
1. Enable debug mode
2. Check console logs for API_URL
3. Verify requests go to new domain

## Rollback Procedure

If issues occur, rollback by:

1. **Immediate Rollback** (using env variable):
```bash
# Set environment variable to old domain
export EXPO_PUBLIC_BACKEND_URL=https://apkdebug.preview.emergentagent.com
```

2. **Code Rollback**:
```bash
git revert <commit-hash>
```

3. **Rebuild Applications**:
```bash
npm run build
# or
eas build
```

## Security Considerations

1. **HTTPS**: Both domains use HTTPS for secure communication
2. **CORS**: Ensure new domain is configured in backend CORS settings
3. **Certificates**: Verify SSL certificates are valid for new domain
4. **Authentication**: No changes to authentication mechanism

## Deployment Checklist

- [x] Update frontend configuration files
- [x] Update backend test files
- [x] Verify no old domain references remain
- [x] Document changes
- [ ] Deploy backend to new domain
- [ ] Update DNS records (if applicable)
- [ ] Configure CORS for new domain
- [ ] Test API connectivity
- [ ] Build and test admin app
- [ ] Build and test client app
- [ ] Update documentation
- [ ] Notify team of migration

## Support

If you encounter issues after migration:

1. Check environment variables are not overriding the new domain
2. Verify network connectivity to new domain
3. Check backend logs for CORS or connectivity issues
4. Verify SSL certificates are valid
5. Review console logs for API URL being used

## Additional Notes

- This is a backward-compatible change
- Environment variables take precedence over hardcoded domains
- All fallback values have been updated
- No changes to API endpoints or authentication required
- Works with existing mobile builds (if env variables are set correctly)

## Migration Date
February 13, 2026

## Updated By
Automated migration process

## Related Documentation
- See `API_DOCUMENTATION.md` for API endpoint details
- See `DEPLOYMENT.md` for deployment procedures
- See `frontend/.env.template` for environment configuration examples
