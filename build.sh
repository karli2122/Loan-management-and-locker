#!/bin/bash

# ============================================
# APK Build Script for EMI Phone Lock System
# ============================================
# 
# This script simplifies the process of building
# Admin and Client APKs for testing and production.
#
# Usage:
#   ./build.sh [profile] [app-mode]
#
# Examples:
#   ./build.sh preview admin      # Build admin preview APK
#   ./build.sh production client  # Build client production APK
#   ./build.sh preview all        # Build both preview APKs
#   ./build.sh                    # Interactive mode
# ============================================

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Change to frontend directory
cd "$(dirname "$0")/frontend" 2>/dev/null || cd ./frontend 2>/dev/null || {
    echo -e "${RED}Error: Could not find frontend directory${NC}"
    exit 1
}

# Function to print colored messages
print_info() {
    echo -e "${BLUE}ℹ${NC} $1"
}

print_success() {
    echo -e "${GREEN}✓${NC} $1"
}

print_error() {
    echo -e "${RED}✗${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}⚠${NC} $1"
}

print_header() {
    echo ""
    echo -e "${BLUE}========================================${NC}"
    echo -e "${BLUE}$1${NC}"
    echo -e "${BLUE}========================================${NC}"
    echo ""
}

# Check if EAS CLI is installed
check_eas_cli() {
    if ! command -v eas &> /dev/null; then
        print_error "EAS CLI is not installed"
        echo "Install it with: npm install -g eas-cli"
        exit 1
    fi
    print_success "EAS CLI found"
}

# Check if user is logged in to EAS
check_eas_login() {
    if ! eas whoami &> /dev/null; then
        print_warning "Not logged in to EAS"
        echo "Please login:"
        eas login
    else
        local user=$(eas whoami 2>&1)
        print_success "Logged in as: $user"
    fi
}

# Build function
build_apk() {
    local profile=$1
    local app_mode=$2
    local build_type="${app_mode}-${profile}"
    
    print_header "Building $app_mode APK ($profile)"
    
    print_info "Profile: $profile"
    print_info "App Mode: $app_mode"
    print_info "Build Type: $build_type"
    echo ""
    
    # Build command
    print_info "Starting build..."
    APP_MODE=$app_mode eas build --profile $build_type --platform android --non-interactive
    
    if [ $? -eq 0 ]; then
        print_success "$app_mode APK ($profile) built successfully!"
        echo ""
    else
        print_error "$app_mode APK ($profile) build failed!"
        exit 1
    fi
}

# Interactive mode
interactive_mode() {
    print_header "EMI Phone Lock APK Builder"
    
    # Select profile
    echo "Select build profile:"
    echo "  1) Preview (internal testing)"
    echo "  2) Production (release)"
    echo "  3) Development (dev build)"
    read -p "Enter choice [1-3]: " profile_choice
    
    case $profile_choice in
        1) profile="preview" ;;
        2) profile="production" ;;
        3) profile="development" ;;
        *) 
            print_error "Invalid choice"
            exit 1
            ;;
    esac
    
    # Select app mode
    echo ""
    echo "Select app to build:"
    echo "  1) Admin App"
    echo "  2) Client App"
    echo "  3) Both Apps"
    read -p "Enter choice [1-3]: " app_choice
    
    case $app_choice in
        1) app_mode="admin" ;;
        2) app_mode="client" ;;
        3) app_mode="all" ;;
        *) 
            print_error "Invalid choice"
            exit 1
            ;;
    esac
    
    # Confirm
    echo ""
    print_warning "You are about to build:"
    echo "  Profile: $profile"
    echo "  App(s): $app_mode"
    echo ""
    read -p "Continue? [y/N]: " confirm
    
    if [[ ! $confirm =~ ^[Yy]$ ]]; then
        print_info "Build cancelled"
        exit 0
    fi
    
    # Perform build
    if [ "$app_mode" == "all" ]; then
        build_apk $profile "admin"
        build_apk $profile "client"
    else
        build_apk $profile $app_mode
    fi
}

# Main script
print_header "EMI Phone Lock APK Builder"

# Check prerequisites
check_eas_cli
check_eas_login

# Parse arguments
if [ $# -eq 0 ]; then
    # No arguments - interactive mode
    interactive_mode
elif [ $# -eq 2 ]; then
    # Arguments provided
    profile=$1
    app_mode=$2
    
    # Validate profile
    if [[ ! "$profile" =~ ^(preview|production|development)$ ]]; then
        print_error "Invalid profile: $profile"
        echo "Valid profiles: preview, production, development"
        exit 1
    fi
    
    # Validate app mode
    if [[ ! "$app_mode" =~ ^(admin|client|all)$ ]]; then
        print_error "Invalid app mode: $app_mode"
        echo "Valid modes: admin, client, all"
        exit 1
    fi
    
    # Build
    if [ "$app_mode" == "all" ]; then
        build_apk $profile "admin"
        build_apk $profile "client"
    else
        build_apk $profile $app_mode
    fi
else
    print_error "Invalid arguments"
    echo ""
    echo "Usage: $0 [profile] [app-mode]"
    echo ""
    echo "Profiles: preview, production, development"
    echo "App Modes: admin, client, all"
    echo ""
    echo "Examples:"
    echo "  $0                        # Interactive mode"
    echo "  $0 preview admin          # Build admin preview"
    echo "  $0 production client      # Build client production"
    echo "  $0 preview all            # Build both preview APKs"
    exit 1
fi

# Final message
print_header "Build Complete!"
print_success "All builds completed successfully"
echo ""
print_info "Download your APKs from the EAS build page:"
echo "  https://expo.dev/accounts/[your-account]/projects/emi-admin-or-client/builds"
echo ""
print_info "Or check build status with:"
echo "  eas build:list"
