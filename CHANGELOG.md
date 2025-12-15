# Changelog

All notable changes to the EMI Phone Lock System will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- APK deployment preparation and configuration
- Comprehensive deployment documentation
- Release checklist for production builds
- Build scripts for easier APK generation
- Environment variable templates
- Enhanced Android permissions configuration

### Changed
- Updated app.config.js with proper Android permissions
- Enhanced EAS build profiles with production settings
- Improved gitignore for deployment files

### Documentation
- Added DEPLOYMENT.md - Complete deployment guide
- Added RELEASE_CHECKLIST.md - Pre-release checklist
- Added QUICK_START.md - Quick APK building guide
- Added .env.template - Environment variables template

## [1.0.0] - YYYY-MM-DD

### Added
- Initial release
- Admin app for EMI company administrators
- Client app for EMI customers
- Device Owner mode for uninstall protection
- Lock/unlock device functionality
- GPS location tracking
- Warning message system
- Multi-language support (Estonian/English)
- Real-time device status monitoring

### Admin App Features
- Client management dashboard
- Device registration
- Remote lock/unlock controls
- Location tracking map
- Warning message dispatch
- Client EMI status monitoring

### Client App Features
- Device registration flow
- EMI status display
- Lock screen enforcement
- Location sharing
- Warning notifications
- Device Owner protection
- Boot protection
- Uninstall protection

### Security
- Device Owner mode implementation
- Tamper detection service
- Secure API communication
- Admin authentication

---

## Version History Template

Use this template for new releases:

```markdown
## [X.Y.Z] - YYYY-MM-DD

### Added
- New features

### Changed
- Changes to existing features

### Deprecated
- Features marked for removal

### Removed
- Removed features

### Fixed
- Bug fixes

### Security
- Security updates and fixes
```

---

## Release Types

- **Major (X.0.0)**: Breaking changes, major new features
- **Minor (1.X.0)**: New features, backwards compatible
- **Patch (1.0.X)**: Bug fixes, minor improvements

---

## Notes

- Keep entries brief but descriptive
- Group similar changes together
- Link to relevant issues/PRs when applicable
- Update this file before each release
- Move items from [Unreleased] to version sections when releasing
